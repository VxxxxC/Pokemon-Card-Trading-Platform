const HKT_TIME_ZONE = "Asia/Hong_Kong";

export function getHktTodayDateString(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: HKT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

export function isAnnouncementInActiveWindow(
  startDate: string,
  endDate: string,
  now: Date = new Date(),
): boolean {
  const today = getHktTodayDateString(now);
  return today >= startDate && today <= endDate;
}

export function compareHktDateStrings(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
