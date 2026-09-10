import { describe, expect, it } from "vitest";
import { reportOutcomeMessage } from "@/lib/moderation/report-outcome-copy";

describe("reportOutcomeMessage", () => {
  it("returns upheld copy without sanction details", () => {
    expect(reportOutcomeMessage("upheld")).toBe(
      "您舉報的案件已處理。平台已採取適當措施。",
    );
  });

  it("returns insufficient_evidence copy", () => {
    expect(reportOutcomeMessage("insufficient_evidence")).toBe(
      "您舉報的案件因證據不足已結案。",
    );
  });

  it("returns dismissed copy for dismissed resolution", () => {
    expect(reportOutcomeMessage("dismissed")).toBe(
      "您舉報的案件經審核後已結案。",
    );
  });

  it("falls back to dismissed copy for null resolution", () => {
    expect(reportOutcomeMessage(null)).toBe("您舉報的案件經審核後已結案。");
  });
});
