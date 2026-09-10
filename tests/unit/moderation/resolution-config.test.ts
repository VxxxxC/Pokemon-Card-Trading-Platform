import { describe, expect, it } from "vitest";
import {
  MODERATION_RESOLUTION_OPTIONS,
  VIOLATION_PERSONA_OPTIONS,
  isUpheldResolutionOption,
  mapResolutionOptionToInput,
} from "@/lib/moderation/resolution-config";

describe("mapResolutionOptionToInput", () => {
  it("maps dismissed without sanction", () => {
    expect(mapResolutionOptionToInput("dismissed")).toEqual({
      resolution: "dismissed",
    });
  });

  it("maps insufficient_evidence without sanction", () => {
    expect(mapResolutionOptionToInput("insufficient_evidence")).toEqual({
      resolution: "insufficient_evidence",
    });
  });

  it("maps suspend_7d to upheld with account suspend sanction", () => {
    const input = mapResolutionOptionToInput("suspend_7d", "member");
    expect(input.resolution).toBe("upheld");
    expect(input.violationPersona).toBe("member");
    expect(input.sanction?.scope).toBe("account");
    expect(input.sanction?.type).toBe("suspend");
    expect(input.sanction?.endsAt).toBeTruthy();
    expect(input.sanction?.reason).toBe("管理員裁定：帳戶暫停 7 日");
  });

  it("maps ban_permanent to upheld ban without endsAt", () => {
    const input = mapResolutionOptionToInput("ban_permanent", "merchant");
    expect(input.resolution).toBe("upheld");
    expect(input.sanction?.type).toBe("ban");
    expect(input.sanction?.endsAt).toBeNull();
    expect(input.sanction?.reason).toBe("管理員裁定：永久封禁");
  });

  it("maps restrict_member_listing sanction", () => {
    const input = mapResolutionOptionToInput("restrict_member_listing", "member");
    expect(input.sanction?.scope).toBe("member_persona");
    expect(input.sanction?.type).toBe("restrict_listing");
    expect(input.sanction?.reason).toBe("管理員裁定：限制 Member 上架");
  });

  it("maps restrict_merchant_listing sanction", () => {
    const input = mapResolutionOptionToInput("restrict_merchant_listing", "merchant");
    expect(input.sanction?.scope).toBe("merchant_persona");
    expect(input.sanction?.reason).toBe("管理員裁定：限制 Merchant 上架");
  });

  it("maps upheld_warn_only to upheld without sanction", () => {
    const input = mapResolutionOptionToInput("upheld_warn_only", "member");
    expect(input.resolution).toBe("upheld");
    expect(input.violationPersona).toBe("member");
    expect(input.sanction).toBeUndefined();
  });

  it("maps freeze_payout sanction", () => {
    const input = mapResolutionOptionToInput("freeze_payout", "both");
    expect(input.sanction?.type).toBe("freeze_payout");
    expect(input.sanction?.scope).toBe("account");
    expect(input.sanction?.reason).toBe("管理員裁定：凍結出款");
  });
});

describe("isUpheldResolutionOption", () => {
  it("returns false for dismissed and insufficient_evidence", () => {
    expect(isUpheldResolutionOption("dismissed")).toBe(false);
    expect(isUpheldResolutionOption("insufficient_evidence")).toBe(false);
  });

  it("returns true for sanction options", () => {
    expect(isUpheldResolutionOption("upheld_warn_only")).toBe(true);
    expect(isUpheldResolutionOption("suspend_7d")).toBe(true);
    expect(isUpheldResolutionOption("ban_permanent")).toBe(true);
    expect(isUpheldResolutionOption("freeze_payout")).toBe(true);
  });
});

describe("MODERATION_RESOLUTION_OPTIONS invariants", () => {
  it("requiresUpheld options always map to upheld resolution", () => {
    for (const option of MODERATION_RESOLUTION_OPTIONS) {
      const input = mapResolutionOptionToInput(
        option.value,
        option.requiresUpheld ? "member" : undefined,
      );
      if (option.requiresUpheld) {
        expect(input.resolution).toBe("upheld");
        if (option.value !== "upheld_warn_only") {
          expect(input.sanction).toBeTruthy();
        }
      } else {
        expect(input.resolution).toBe(option.value);
        expect(input.sanction).toBeUndefined();
      }
    }
  });

  it("sanction options are disabled when evidence insufficient", () => {
    const sanctionOptions = MODERATION_RESOLUTION_OPTIONS.filter(
      (option) => option.requiresUpheld,
    );
    expect(sanctionOptions.length).toBeGreaterThan(0);
    for (const option of sanctionOptions) {
      expect(option.disabledWhenEvidenceInsufficient).toBe(true);
    }
  });

  it("exposes stable labels for admin UI options", () => {
    expect(MODERATION_RESOLUTION_OPTIONS.map((option) => option.label)).toEqual([
      "駁回舉報",
      "證據不足",
      "裁定成立（僅警告／可選退款）",
      "凍結帳戶 7 日",
      "永久封禁",
      "限制 Member 上架",
      "限制 Merchant 店鋪上架",
      "凍結出款",
    ]);
  });
});

describe("VIOLATION_PERSONA_OPTIONS", () => {
  it("lists all persona values with labels", () => {
    expect(VIOLATION_PERSONA_OPTIONS).toEqual([
      { value: "member", label: "Member" },
      { value: "merchant", label: "Merchant" },
      { value: "both", label: "兩者" },
      { value: "unknown", label: "未知" },
    ]);
  });
});
