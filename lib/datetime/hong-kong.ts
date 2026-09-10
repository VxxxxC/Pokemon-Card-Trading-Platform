export const HONG_KONG_TIME_ZONE = "Asia/Hong_Kong";

const HONG_KONG_DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: HONG_KONG_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/**
 * Stable HK wall-clock formatting for SSR + client (avoids hydration mismatch).
 */
export function formatHongKongDateTime(
  iso: string | null | undefined,
): string {
  if (!iso) {
    return "—";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const formatter = new Intl.DateTimeFormat("zh-HK", HONG_KONG_DATE_TIME_FORMAT);
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";

  return `${year}/${month}/${day} ${hour}:${minute}`;
}

/**
 * Locale-style HK datetime (slash separators) for moderation / admin tables.
 */
export function formatHongKongDateTimeSlash(
  iso: string | null | undefined,
): string {
  if (!iso) {
    return "—";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("zh-HK", HONG_KONG_DATE_TIME_FORMAT).format(date);
}
