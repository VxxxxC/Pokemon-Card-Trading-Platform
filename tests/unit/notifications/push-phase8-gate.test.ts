import { describe, expect, it } from "vitest";
import {
  PHASE8_EVENT_IDS,
  PHASE8_PUSH_CATALOG,
  PHASE8_TEMPLATE_KEYS,
} from "@/lib/notifications/push-phase8-registry";
import {
  buildChatUnreadDigestPushCopy,
  isChatDigestCooldownActive,
  shouldSendChatUnreadDigest,
  shouldSkipChatDigestForRecentActivity,
} from "@/lib/notifications/chat-push";

describe("Phase 8 push gate (chat digest)", () => {
  it("catalog has unique event ids and template keys", () => {
    expect(PHASE8_PUSH_CATALOG.length).toBe(1);
    expect(new Set(PHASE8_EVENT_IDS).size).toBe(PHASE8_EVENT_IDS.length);
    expect(new Set(PHASE8_TEMPLATE_KEYS).size).toBe(PHASE8_TEMPLATE_KEYS.length);
  });

  it("renders P-CHT-01 copy", () => {
    const copy = buildChatUnreadDigestPushCopy(3);
    expect(copy.heading).toBe("你有未讀訊息");
    expect(copy.body).toContain("3");
  });

  it("shouldSendChatUnreadDigest requires positive unread count", () => {
    expect(shouldSendChatUnreadDigest(1)).toBe(true);
    expect(shouldSendChatUnreadDigest(0)).toBe(false);
  });

  it("isChatDigestCooldownActive enforces 24h window", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    expect(isChatDigestCooldownActive(null, now, 24)).toBe(false);
    expect(isChatDigestCooldownActive("2026-09-02T10:00:00.000Z", now, 24)).toBe(
      true,
    );
    expect(isChatDigestCooldownActive("2026-09-01T10:00:00.000Z", now, 24)).toBe(
      false,
    );
  });

  it("shouldSkipChatDigestForRecentActivity enforces 15m window", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    expect(shouldSkipChatDigestForRecentActivity(null, now, 15)).toBe(false);
    expect(
      shouldSkipChatDigestForRecentActivity("2026-09-02T11:50:00.000Z", now, 15),
    ).toBe(true);
    expect(
      shouldSkipChatDigestForRecentActivity("2026-09-02T11:40:00.000Z", now, 15),
    ).toBe(false);
  });
});
