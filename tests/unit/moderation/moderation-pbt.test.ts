import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MODERATION_RESOLUTION_OPTIONS,
  mapResolutionOptionToInput,
} from "@/lib/moderation/resolution-config";
import { reportOutcomeMessage } from "@/lib/moderation/report-outcome-copy";
import type { ModerationResolution } from "@/lib/moderation/types";

const PBT_NUM_RUNS = Number(process.env.MODERATION_PBT_NUM_RUNS ?? 1000);

const resolutionArb: fc.Arbitrary<ModerationResolution | null> = fc.constantFrom(
  "upheld",
  "dismissed",
  "insufficient_evidence",
  null,
);

describe("moderation pure helpers PBT", () => {
  it("reportOutcomeMessage is a total function", () => {
    fc.assert(
      fc.property(resolutionArb, (resolution) => {
        const message = reportOutcomeMessage(resolution);
        expect(typeof message).toBe("string");
        expect(message.length).toBeGreaterThan(0);
      }),
      { numRuns: PBT_NUM_RUNS },
    );
  });

  it("insufficient_evidence and dismissed produce distinct copy", () => {
    const insufficient = reportOutcomeMessage("insufficient_evidence");
    const dismissed = reportOutcomeMessage("dismissed");
    expect(insufficient).not.toBe(dismissed);
    expect(insufficient).toMatch(/證據不足/);
  });

  it("requiresUpheld options always map to upheld resolution", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MODERATION_RESOLUTION_OPTIONS),
        (option) => {
          const input = mapResolutionOptionToInput(
            option.value,
            option.requiresUpheld ? "member" : undefined,
          );
          if (option.requiresUpheld) {
            expect(input.resolution).toBe("upheld");
          } else {
            expect(input.resolution).toBe(option.value);
          }
        },
      ),
      { numRuns: MODERATION_RESOLUTION_OPTIONS.length },
    );
  });
});
