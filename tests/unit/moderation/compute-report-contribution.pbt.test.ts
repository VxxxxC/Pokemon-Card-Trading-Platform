import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeReportContribution } from "@/lib/moderation/compute-report-contribution";

const PBT_NUM_RUNS = Number(process.env.MODERATION_PBT_NUM_RUNS ?? 1000);

const weightArb = fc.integer({ min: 0, max: 100 });
const multiplierArb = fc.double({ min: 0, max: 3, noNaN: true });
const dampeningArb = fc.double({ min: 0, max: 1, noNaN: true });
const hasChatArb = fc.boolean();

describe("computeReportContribution PBT", () => {
  it("contribution is never negative", () => {
    fc.assert(
      fc.property(
        weightArb,
        hasChatArb,
        multiplierArb,
        dampeningArb,
        (categoryWeight, hasValidatedChatRoom, reporterTrustMultiplier, duplicateDampening) => {
          const contribution = computeReportContribution({
            categoryWeight,
            hasValidatedChatRoom,
            reporterTrustMultiplier,
            duplicateDampening,
          });
          expect(contribution).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: PBT_NUM_RUNS },
    );
  });

  it("chat context multiplier is 1 or 1.1 only", () => {
    fc.assert(
      fc.property(weightArb, hasChatArb, (categoryWeight, _hasValidatedChatRoom) => {
        const withChat = computeReportContribution({
          categoryWeight,
          hasValidatedChatRoom: true,
        });
        const withoutChat = computeReportContribution({
          categoryWeight,
          hasValidatedChatRoom: false,
        });

        if (categoryWeight === 0) {
          expect(withChat).toBe(0);
          expect(withoutChat).toBe(0);
          return;
        }

        const ratio = withChat / withoutChat;
        expect(ratio).toBeCloseTo(1.1, 5);
      }),
      { numRuns: PBT_NUM_RUNS },
    );
  });

  it("rounding is stable to two decimal places", () => {
    fc.assert(
      fc.property(
        weightArb,
        hasChatArb,
        multiplierArb,
        dampeningArb,
        (categoryWeight, hasValidatedChatRoom, reporterTrustMultiplier, duplicateDampening) => {
          const contribution = computeReportContribution({
            categoryWeight,
            hasValidatedChatRoom,
            reporterTrustMultiplier,
            duplicateDampening,
          });
          expect(contribution).toBe(
            Math.round(contribution * 100) / 100,
          );
        },
      ),
      { numRuns: PBT_NUM_RUNS },
    );
  });
});

describe("computeReportContribution exact (mutation killers)", () => {
  it("defaults trust multiplier and dampening to 1", () => {
    expect(
      computeReportContribution({
        categoryWeight: 10,
        hasValidatedChatRoom: false,
      }),
    ).toBe(10);
  });

  it("applies chat bonus", () => {
    expect(
      computeReportContribution({
        categoryWeight: 10,
        hasValidatedChatRoom: true,
      }),
    ).toBe(11);
  });
});
