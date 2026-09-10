/**
 * Generates types/supabase.md from types/supabase.ts (CLI output).
 * Run: bun run scripts/generate-supabase-md.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES_PATH = join(ROOT, "types/supabase.ts");
const MD_PATH = join(ROOT, "types/supabase.md");

const source = readFileSync(TYPES_PATH, "utf8");

const postgrestVersion =
  source.match(/PostgrestVersion:\s*"([^"]+)"/)?.[1] ?? "unknown";

function extractPublicBlock(text: string): string {
  const marker = "  public: {\n    Tables: {\n      account_sanctions:";
  const start = text.indexOf(marker);
  if (start === -1) {
    throw new Error("Could not find public schema in supabase.ts");
  }
  const braceStart = text.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(braceStart, i + 1);
    }
  }
  throw new Error("Could not parse public schema block");
}

const publicBlock = extractPublicBlock(source);

function parseEnums(block: string): Record<string, string[]> {
  const match = block.match(
    /Enums:\s*\{([\s\S]*?)\n\s*\}\s*\n\s*CompositeTypes:/,
  );
  if (!match) return {};

  const enums: Record<string, string[]> = {};
  let current: string | null = null;

  for (const line of match[1]!.split("\n")) {
    const singleLine = line.match(/^\s+(\w+):\s+(.+)$/);
    if (singleLine && singleLine[2]!.includes('"')) {
      enums[singleLine[1]!] = [
        ...singleLine[2]!.matchAll(/"([^"]+)"/g),
      ].map((v) => v[1]!);
      current = null;
      continue;
    }

    const nameOnly = line.match(/^\s+(\w+):\s*$/);
    if (nameOnly) {
      current = nameOnly[1]!;
      enums[current] = [];
      continue;
    }

    const value = line.match(/^\s*\|\s*"([^"]+)"/);
    if (value && current) {
      enums[current].push(value[1]!);
    }
  }

  return enums;
}

type Column = { name: string; type: string; optional: boolean };
type Relationship = { column: string; table: string };

function normalizeType(raw: string): string {
  return raw
    .replace(/Database\["public"\]\["Enums"\]\["(\w+)"\]/g, "`$1`")
    .replace(/\s*\|\s*null/g, " | null")
    .trim();
}

function parseRowColumns(rowBlock: string): Column[] {
  const cols: Column[] = [];
  const lineRe = /^\s+(\w+)(\?)?:\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(rowBlock))) {
    cols.push({
      name: m[1]!,
      optional: m[2] === "?",
      type: normalizeType(m[3]!.replace(/,$/, "")),
    });
  }
  return cols;
}

function parseRelationships(relBlock: string): Relationship[] {
  const rels: Relationship[] = [];
  const re =
    /columns:\s*\["(\w+)"\][\s\S]*?referencedRelation:\s*"(\w+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(relBlock))) {
    rels.push({ column: m[1]!, table: m[2]! });
  }
  return rels;
}

type TableDoc = {
  name: string;
  columns: Column[];
  relationships: Relationship[];
};

function parseTables(block: string): TableDoc[] {
  const tablesMatch = block.match(/Tables:\s*\{([\s\S]*)\n\s*\}\s*\n\s*Views:/);
  if (!tablesMatch) return [];

  const tablesBody = tablesMatch[1]!;
  const tables: TableDoc[] = [];
  const tableRe =
    /(\w+):\s*\{\s*Row:\s*\{([\s\S]*?)\}\s*Insert:[\s\S]*?Relationships:\s*\[([\s\S]*?)\]\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(tablesBody))) {
    tables.push({
      name: m[1]!,
      columns: parseRowColumns(m[2]!),
      relationships: parseRelationships(m[3] ?? ""),
    });
  }
  return tables;
}

type FunctionDoc = { name: string; args: string; returns: string };

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function parseFunctionBody(body: string): { args: string; returns: string } {
  const argsStart = body.indexOf("Args:");
  const returnsStart = body.indexOf("Returns:");
  if (argsStart === -1 || returnsStart === -1) {
    return { args: "unknown", returns: "unknown" };
  }
  const args = body
    .slice(argsStart + 5, returnsStart)
    .trim()
    .replace(/\s+/g, " ");
  const returns = body.slice(returnsStart + 8).trim().replace(/\s+/g, " ");
  return { args, returns };
}

function parseFunctions(block: string): FunctionDoc[] {
  const match = block.match(/Functions:\s*\{([\s\S]*)\n    \}\s*\n    Enums:/);
  if (!match) return [];

  const body = match[1]!;
  const fns: FunctionDoc[] = [];

  const entries: { name: string; index: number }[] = [];
  const first = body.match(/^(\w+):/);
  if (first) {
    entries.push({ name: first[1]!, index: 0 });
  }
  for (const hit of body.matchAll(/\n      (\w+):/g)) {
    entries.push({ name: hit[1]!, index: hit.index! + 1 });
  }

  for (let i = 0; i < entries.length; i++) {
    const start = entries[i]!.index;
    const end = entries[i + 1]?.index ?? body.length;
    const chunk = body.slice(start, end).trim().replace(/,$/, "");
    const braceStart = chunk.indexOf("{");
    if (braceStart === -1) continue;
    const inner = chunk.slice(braceStart + 1, chunk.lastIndexOf("}"));
    const { args, returns } = parseFunctionBody(inner);
    fns.push({ name: entries[i]!.name, args, returns });
  }

  return fns;
}

const enums = parseEnums(publicBlock);
const tables = parseTables(publicBlock);
const functions = parseFunctions(publicBlock);

const TABLE_DOMAIN: Record<string, string> = {
  profiles: "Users & auth",
  product_catalog: "Catalog",
  product_price_snapshots: "Catalog / pricing",
  product_watchlists: "User watchlist",
  user_collections: "User portfolio",
  listings: "Marketplace",
  listing_stats: "Marketplace analytics",
  listing_bookmarks: "Marketplace bookmarks",
  member_orders: "P2P orders",
  merchant_orders: "Escrow orders",
  merchant_shops: "Merchant storefront",
  merchant_ledgers: "Merchant finance",
  kyc_records: "Merchant KYC",
  chat_rooms: "Messaging",
  chat_messages: "Messaging",
  offers: "Negotiation",
  transaction_reviews: "Reputation",
  reports: "Moderation",
  gamification_stats: "Gamification",
  reward_templates: "Rewards",
  user_rewards: "Rewards",
};

function formatNullable(col: Column): string {
  if (col.type.includes("| null")) return "Yes";
  if (col.optional) return "Yes (insert/update)";
  return "No";
}

function formatType(col: Column): string {
  return `\`${col.type.replace(/`/g, "")}\``;
}

const lines: string[] = [
  "# Supabase Database Types Reference",
  "",
  "> **Auto-generated** from `types/supabase.ts` — do not edit by hand.",
  ">",
  "> **PostgREST version:** " + postgrestVersion,
  "> **Schema:** `public`",
  "",
  "Regenerate TypeScript + this doc:",
  "",
  "```bash",
  "bun run supabase:types",
  "```",
  "",
  "---",
  "",
  "## TypeScript Usage",
  "",
  "```typescript",
  'import type { Tables, TablesInsert, TablesUpdate, Enums } from "@/types/supabase";',
  "",
  "// Row type (SELECT)",
  'type Profile = Tables<"profiles">;',
  'type Listing = Tables<"listings">;',
  "",
  "// Insert / Update payloads",
  'type NewListing = TablesInsert<"listings">;',
  'type ListingPatch = TablesUpdate<"listings">;',
  "",
  "// Enum union",
  'type UserRole = Enums<"user_role">;',
  "```",
  "",
  "---",
  "",
  "## Enums",
  "",
  "| Enum | Values |",
  "|------|--------|",
];

for (const [name, values] of Object.entries(enums).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  lines.push(`| \`${name}\` | ${values.map((v) => `\`${v}\``).join(", ")} |`);
}

lines.push(
  "",
  "---",
  "",
  "## RPC Functions",
  "",
  "| Function | Args | Returns |",
  "|----------|------|---------|",
);

for (const fn of functions) {
  lines.push(
    `| \`${fn.name}\` | \`${truncate(fn.args, 100)}\` | \`${truncate(fn.returns, 100)}\` |`,
  );
}

lines.push("", "---", "", "## Tables", "");

for (const table of tables.sort((a, b) => a.name.localeCompare(b.name))) {
  lines.push("", `### \`${table.name}\``, "");
  if (TABLE_DOMAIN[table.name]) {
    lines.push(`*Domain:* ${TABLE_DOMAIN[table.name]}`, "");
  }
  lines.push("| Column | Type | Nullable |", "|--------|------|----------|");
  for (const col of table.columns) {
    lines.push(
      `| \`${col.name}\` | ${formatType(col)} | ${formatNullable(col)} |`,
    );
  }
  if (table.relationships.length > 0) {
    lines.push("");
    lines.push(
      "**Foreign keys:** " +
        table.relationships
          .map((r) => `\`${r.column}\` → \`${r.table}\``)
          .join(", "),
    );
  }
  lines.push("");
  lines.push("---");
}

lines.push(
  "",
  "## Table Index",
  "",
  `**${tables.length} tables**`,
  "",
  "| Table | Domain |",
  "|-------|--------|",
);

for (const table of tables.sort((a, b) => a.name.localeCompare(b.name))) {
  lines.push(`| \`${table.name}\` | ${TABLE_DOMAIN[table.name] ?? "—"} |`);
}

lines.push(
  "",
  "---",
  "",
  "## Notes",
  "",
  "- **Single source of truth for code:** import from `types/supabase.ts` only.",
  "- **This markdown file** is a human-readable companion. Regenerate via `bun run supabase:types`.",
  "- **`Json` columns** have flexible structure — document shapes in Server Actions / API handoff docs.",
  "",
);

writeFileSync(MD_PATH, lines.join("\n"));
console.log(
  `Wrote ${MD_PATH} (${tables.length} tables, ${Object.keys(enums).length} enums, ${functions.length} functions)`,
);
