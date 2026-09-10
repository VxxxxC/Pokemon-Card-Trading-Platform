import { describe, expect, it } from "vitest";
import {
  PHASE7_EVENT_IDS,
  PHASE7_PUSH_CATALOG,
  PHASE7_TEMPLATE_KEYS,
} from "@/lib/notifications/push-phase7-registry";
import {
  buildModerationReportOutcomePushCopy,
  buildModerationSanctionPushCopy,
  moderationResolutionLabel,
} from "@/lib/notifications/moderation-push";

describe("Phase 7 push gate (moderation)", () => {
  it("catalog has unique event ids and template keys", () => {
    expect(PHASE7_PUSH_CATALOG.length).toBe(2);
    expect(new Set(PHASE7_EVENT_IDS).size).toBe(PHASE7_EVENT_IDS.length);
    expect(new Set(PHASE7_TEMPLATE_KEYS).size).toBe(PHASE7_TEMPLATE_KEYS.length);
  });

  it("renders P-MOD-01 copy", () => {
    const copy = buildModerationReportOutcomePushCopy({
      resolutionLabel: moderationResolutionLabel("upheld"),
      caseNumber: "MOD-001",
    });
    expect(copy.heading).toBe("舉報案件已結案");
    expect(copy.body).toContain("舉報成立");
    expect(copy.body).toContain("MOD-001");
  });

  it("renders P-MOD-02 copy", () => {
    const copy = buildModerationSanctionPushCopy({
      sanctionLabel: "帳戶暫停",
      caseNumber: "MOD-001",
    });
    expect(copy.heading).toBe("帳戶收到平台制裁");
    expect(copy.body).toContain("帳戶暫停");
  });
});
