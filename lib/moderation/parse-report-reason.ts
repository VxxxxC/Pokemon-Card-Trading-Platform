export type ParsedReportReason = {
  category: string | null;
  source: string | null;
  roomId: string | null;
  details: string | null;
  raw: string;
  isStructured: boolean;
};

const STRUCTURED_FIELD_RE =
  /^\[(CATEGORY|SOURCE|ROOM_ID|DETAILS)\]\s*(.*)$/;

export function parseStructuredReportReason(text: string): ParsedReportReason {
  const raw = text.trim();
  if (!raw.includes("[CATEGORY]") && !raw.includes("[SOURCE]")) {
    return {
      category: null,
      source: null,
      roomId: null,
      details: raw || null,
      raw,
      isStructured: false,
    };
  }

  let category: string | null = null;
  let source: string | null = null;
  let roomId: string | null = null;
  let details: string | null = null;

  for (const line of raw.split("\n")) {
    const match = line.match(STRUCTURED_FIELD_RE);
    if (!match) {
      continue;
    }
    const [, key, value] = match;
    const trimmed = value.trim();
    if (key === "CATEGORY") {
      category = trimmed;
    } else if (key === "SOURCE") {
      source = trimmed;
    } else if (key === "ROOM_ID") {
      roomId = trimmed;
    } else if (key === "DETAILS") {
      details = trimmed;
    }
  }

  return {
    category,
    source,
    roomId,
    details,
    raw,
    isStructured: true,
  };
}

export function getReportDisplayText(
  details: string | null | undefined,
  reason: string | null | undefined,
): string {
  const primary = details?.trim() || reason?.trim() || "";
  if (!primary) {
    return "";
  }
  const parsed = parseStructuredReportReason(primary);
  if (parsed.isStructured) {
    return parsed.details ?? "";
  }
  return primary;
}

export function formatParsedReportSource(source: string | null): string {
  if (source === "profile") {
    return "公開資料";
  }
  if (source === "chat_room") {
    return "對話";
  }
  return source ?? "未知來源";
}
