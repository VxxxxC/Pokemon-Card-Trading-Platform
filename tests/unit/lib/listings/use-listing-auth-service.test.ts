import { describe, expect, it } from "vitest";
import { DEFAULT_GRADING_OPTION_ID } from "@/lib/grading/options";
import { resolveUseAuthenticationForGrading } from "@/lib/listings/use-listing-auth-service";

describe("resolveUseAuthenticationForGrading", () => {
  it("returns false for graded cards regardless of toggle", () => {
    expect(
      resolveUseAuthenticationForGrading({
        gradingOptionId: DEFAULT_GRADING_OPTION_ID,
        acceptsBuyerAuth: true,
      }),
    ).toBe(false);
  });

  it("returns toggle value for raw cards", () => {
    expect(
      resolveUseAuthenticationForGrading({
        gradingOptionId: "raw:A",
        acceptsBuyerAuth: true,
      }),
    ).toBe(true);
  });
});
