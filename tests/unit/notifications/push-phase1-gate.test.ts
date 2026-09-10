import { describe, expect, it } from "vitest";
import { buildOneSignalLocalizedContent, parseOneSignalCreateResponse } from "@/lib/notifications/onesignal/send";
import {
  PHASE1_EVENT_IDS,
  PHASE1_PUSH_CATALOG,
  PHASE1_TEMPLATE_KEYS,
} from "@/lib/notifications/push-phase1-registry";
import {
  buildWishlistPriceAlertCopy,
  isWishlistAlertCooldownActive,
  shouldSendWishlistPriceAlert,
} from "@/lib/notifications/wishlist-push";

describe("Phase 1 push gate", () => {
  it("catalog has unique event ids and template keys", () => {
    expect(PHASE1_PUSH_CATALOG.length).toBeGreaterThan(0);
    expect(new Set(PHASE1_EVENT_IDS).size).toBe(PHASE1_EVENT_IDS.length);
    expect(new Set(PHASE1_TEMPLATE_KEYS).size).toBe(PHASE1_TEMPLATE_KEYS.length);
  });

  it("renders P-WIS-01 copy with product, grade, and prices", () => {
    const copy = buildWishlistPriceAlertCopy({
      productName: "皮卡丘 VMAX",
      gradeLabel: "PSA 10",
      lowestPrice: 1200,
      targetPrice: 1500,
    });

    expect(copy.heading).toBe("願望清單價格提醒");
    expect(copy.body).toContain("皮卡丘 VMAX");
    expect(copy.body).toContain("PSA 10");
    expect(copy.body).toContain("HK$1,200");
    expect(copy.body).toContain("HK$1,500");
  });

  it("shouldSendWishlistPriceAlert respects target threshold", () => {
    expect(shouldSendWishlistPriceAlert(1200, 1500)).toBe(true);
    expect(shouldSendWishlistPriceAlert(1500, 1500)).toBe(true);
    expect(shouldSendWishlistPriceAlert(1501, 1500)).toBe(false);
    expect(shouldSendWishlistPriceAlert(null, 1500)).toBe(false);
  });

  it("buildOneSignalLocalizedContent includes required en locale", () => {
    const localized = buildOneSignalLocalizedContent("測試");
    expect(localized.en).toBe("測試");
    expect(localized["zh-Hant"]).toBe("測試");
  });

  it("parseOneSignalCreateResponse rejects empty notification id", () => {
    expect(
      parseOneSignalCreateResponse({ id: "" }, true),
    ).toEqual({
      notificationId: null,
      error: expect.stringContaining("empty notification id"),
    });
    expect(
      parseOneSignalCreateResponse({ id: "abc-123" }, true),
    ).toEqual({
      notificationId: "abc-123",
      error: null,
    });
  });

  it("isWishlistAlertCooldownActive enforces 24h window", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    const recent = "2026-09-02T10:00:00.000Z";
    const old = "2026-09-01T10:00:00.000Z";

    expect(isWishlistAlertCooldownActive(null, now, 24)).toBe(false);
    expect(isWishlistAlertCooldownActive(recent, now, 24)).toBe(true);
    expect(isWishlistAlertCooldownActive(old, now, 24)).toBe(false);
  });
});
