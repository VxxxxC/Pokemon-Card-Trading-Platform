import type { ModerationResolution } from "@/lib/moderation/types";

export function reportOutcomeMessage(
  resolution: ModerationResolution | null | undefined,
): string {
  switch (resolution) {
    case "upheld":
      return "您舉報的案件已處理。平台已採取適當措施。";
    case "insufficient_evidence":
      return "您舉報的案件因證據不足已結案。";
    case "dismissed":
    default:
      return "您舉報的案件經審核後已結案。";
  }
}
