import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const UiAssertionSchema = z.object({
  type: z.enum(["heading", "text", "locator"]),
  name: z.string().optional(),
  pattern: z.string().optional(),
  level: z.number().optional(),
});

const UiRequiredElementSchema = z.object({
  id: z.string(),
  role: z.enum([
    "button",
    "link",
    "textbox",
    "checkbox",
    "heading",
    "tab",
    "text",
    "columnheader",
    "searchbox",
    "switch",
  ]),
  name: z.string().optional(),
  pattern: z.string().optional(),
  locator: z.string().optional(),
  optional: z.boolean().default(false),
});

const UiStateSetupSchema = z.object({
  action: z.enum(["click"]),
  role: z.enum(["button", "tab", "link"]).optional(),
  name: z.string().optional(),
  pattern: z.string().optional(),
  locator: z.string().optional(),
});

const UiStateVariantSchema = z.object({
  id: z.string(),
  setup: z.array(UiStateSetupSchema).min(1),
  requiredElements: z.array(UiRequiredElementSchema).min(1),
});

const UiSurfaceSchema = z.object({
  id: z.string(),
  path: z.string(),
  role: z.enum(["guest", "buyer", "seller", "admin"]),
  assertions: z.array(UiAssertionSchema).min(1),
  requiredElements: z.array(UiRequiredElementSchema).optional(),
  stateVariants: z.array(UiStateVariantSchema).optional(),
  l2: z.boolean().default(true),
});

const UiFeatureSchema = z.object({
  id: z.string().regex(/^F-(M|C|A|S)-/),
  name: z.string(),
  kind: z.enum(["page", "embedded", "headless"]),
  component: z.string().optional(),
  action: z.string().optional(),
  partnerSpecs: z.array(z.string()).optional(),
  note: z.string().optional(),
  surfaces: z.array(UiSurfaceSchema).optional(),
});

const UiFeatureMapFileSchema = z.object({
  version: z.number(),
  features: z.array(UiFeatureSchema).min(1),
});

export type UiAssertion = z.infer<typeof UiAssertionSchema>;
export type UiRequiredElement = z.infer<typeof UiRequiredElementSchema>;
export type UiStateSetup = z.infer<typeof UiStateSetupSchema>;
export type UiStateVariant = z.infer<typeof UiStateVariantSchema>;
export type UiSurface = z.infer<typeof UiSurfaceSchema>;
export type UiFeature = z.infer<typeof UiFeatureSchema>;
export type UiFeatureMapFile = z.infer<typeof UiFeatureMapFileSchema>;

const MAP_PATH = path.join(process.cwd(), "docs/dev/ui-feature-map.json");

let cachedMap: UiFeatureMapFile | null = null;

export function loadUiFeatureMap(): UiFeatureMapFile {
  if (cachedMap) return cachedMap;
  if (!existsSync(MAP_PATH)) {
    throw new Error(`Missing ${MAP_PATH}`);
  }
  cachedMap = UiFeatureMapFileSchema.parse(
    JSON.parse(readFileSync(MAP_PATH, "utf8")),
  );
  return cachedMap;
}

export function normalizeAppRouteFromPageFile(filePath: string): string {
  const routePath = filePath.replace(/^app/, "").replace(/\/page\.tsx$/, "");
  if (!routePath) {
    return "/";
  }
  const segments = routePath.split("/").filter((segment) => {
    if (!segment) return false;
    if (segment.startsWith("(") && segment.endsWith(")")) return false;
    return true;
  });
  return `/${segments.join("/")}`;
}

let routeIndex: Map<string, string> | null = null;

function collectPageFiles(dir: string, root: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const absolute = path.join(dir, entry);
    const relative = path.relative(root, absolute);
    if (statSync(absolute).isDirectory()) {
      collectPageFiles(absolute, root, files);
      continue;
    }
    if (entry === "page.tsx") {
      files.push(relative.split(path.sep).join("/"));
    }
  }
  return files;
}

export function buildAppRouteIndex(root = process.cwd()): Map<string, string> {
  if (routeIndex) return routeIndex;
  const index = new Map<string, string>();
  const appDir = path.join(root, "app");
  if (!existsSync(appDir)) {
    routeIndex = index;
    return index;
  }
  for (const pageFile of collectPageFiles(appDir, root)) {
    const route = normalizeAppRouteFromPageFile(pageFile);
    index.set(route, pageFile);
  }
  routeIndex = index;
  return index;
}

export function isDynamicPath(routePath: string): boolean {
  return routePath.includes("{");
}

export function resolveSurfacePath(
  template: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const replacements: Record<string, string | undefined> = {
    sellerId: env.E2E_SELLER_ID?.trim(),
    productId: env.E2E_LISTING_PRODUCT_ID?.trim(),
    listingId: env.E2E_LISTING_ID?.trim(),
    orderId: env.E2E_CHECKOUT_ORDER_ID?.trim(),
  };

  let resolved = template.split("?")[0] ?? template;
  for (const [key, value] of Object.entries(replacements)) {
    if (resolved.includes(`{${key}}`) && !value) {
      return null;
    }
    resolved = resolved.replaceAll(`{${key}}`, value ?? "");
  }
  if (resolved.includes("{")) {
    return null;
  }
  const query = template.includes("?") ? `?${template.split("?")[1]}` : "";
  return `${resolved}${query}`;
}

export function routeExistsForPath(routePath: string, root = process.cwd()): boolean {
  const clean = routePath.split("?")[0] ?? routePath;
  if (isDynamicPath(clean)) {
    const prefix = clean.split("/{")[0];
    const index = buildAppRouteIndex(root);
    for (const route of index.keys()) {
      if (route === prefix || route.startsWith(`${prefix}/`)) {
        return true;
      }
    }
    return false;
  }
  return buildAppRouteIndex(root).has(clean);
}

export function getL2Surfaces(features: UiFeature[]): UiSurface[] {
  const seen = new Set<string>();
  const surfaces: UiSurface[] = [];
  for (const feature of features) {
    for (const surface of feature.surfaces ?? []) {
      if (!surface.l2) continue;
      const key = `${surface.role}::${surface.path}::${surface.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      surfaces.push(surface);
    }
  }
  return surfaces;
}

export function extractRegistryFeatureIds(registryMarkdown: string): string[] {
  const ids: string[] = [];
  const re = /\*\*(F-(?:M|C|A|S)-[^*]+)\*\*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(registryMarkdown)) !== null) {
    ids.push(match[1]!);
  }
  return [...new Set(ids)];
}

export type UiMapValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validateUiFeatureMap(root = process.cwd()): UiMapValidationResult {
  const errors: string[] = [];
  const map = loadUiFeatureMap();
  const registryPath = path.join(root, "docs/dev/system-feature-registry.md");
  if (!existsSync(registryPath)) {
    errors.push(`Missing ${registryPath}`);
    return { ok: false, errors };
  }
  const registryIds = extractRegistryFeatureIds(
    readFileSync(registryPath, "utf8"),
  );
  const mapIds = map.features.map((f) => f.id);
  const mapIdSet = new Set(mapIds);

  if (mapIds.length !== mapIdSet.size) {
    errors.push("Duplicate feature ids in ui-feature-map.json");
  }

  for (const id of registryIds) {
    if (!mapIdSet.has(id)) {
      errors.push(`Missing UI map entry for ${id}`);
    }
  }

  for (const id of mapIds) {
    if (!registryIds.includes(id)) {
      errors.push(`Unknown UI map id ${id} (not in system-feature-registry)`);
    }
  }

  if (map.features.length !== registryIds.length) {
    errors.push(
      `Feature count mismatch: map=${map.features.length} registry=${registryIds.length}`,
    );
  }

  for (const feature of map.features) {
    if (feature.kind === "headless") {
      if (!feature.note) {
        errors.push(`${feature.id}: headless entries require note`);
      }
      continue;
    }
    if (!feature.surfaces?.length) {
      errors.push(`${feature.id}: page/embedded requires surfaces`);
      continue;
    }
    for (const surface of feature.surfaces) {
      const pathOnly = surface.path.split("?")[0] ?? surface.path;
      if (!isDynamicPath(pathOnly) && !routeExistsForPath(surface.path, root)) {
        errors.push(
          `${feature.id} surface ${surface.id}: no app route for ${surface.path}`,
        );
      }
      if (!surface.assertions.length) {
        errors.push(`${feature.id} surface ${surface.id}: missing assertions`);
      }
      for (const element of surface.requiredElements ?? []) {
        if (!element.locator && !element.name && !element.pattern) {
          errors.push(
            `${feature.id} surface ${surface.id} element ${element.id}: requires name, pattern, or locator`,
          );
        }
      }
      for (const variant of surface.stateVariants ?? []) {
        for (const step of variant.setup) {
          if (!step.locator && !step.name && !step.pattern) {
            errors.push(
              `${feature.id} surface ${surface.id} variant ${variant.id}: setup step requires name, pattern, or locator`,
            );
          }
        }
        for (const element of variant.requiredElements) {
          if (!element.locator && !element.name && !element.pattern) {
            errors.push(
              `${feature.id} surface ${surface.id} variant ${variant.id} element ${element.id}: requires name, pattern, or locator`,
            );
          }
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
