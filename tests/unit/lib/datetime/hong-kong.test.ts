import { describe, expect, it } from "vitest";
import {
  formatHongKongDateTime,
  formatHongKongDateTimeSlash,
} from "@/lib/datetime/hong-kong";

describe("hong-kong datetime formatting", () => {
  it("formats UTC instant as Hong Kong wall clock", () => {
    const iso = "2026-08-22T08:54:00.000Z";
    expect(formatHongKongDateTime(iso)).toBe("2026/08/22 16:54");
    expect(formatHongKongDateTimeSlash(iso)).toContain("2026");
    expect(formatHongKongDateTimeSlash(iso)).toContain("16:54");
  });

  it("matches across process timezones", () => {
    const iso = "2026-01-15T12:00:00.000Z";
    const utc = formatHongKongDateTime(iso);
    const shifted = formatHongKongDateTime(
      iso,
    );
    expect(utc).toBe(shifted);
    expect(utc).toBe("2026/01/15 20:00");
  });
});
