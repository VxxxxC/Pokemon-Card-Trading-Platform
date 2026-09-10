import { describe, expect, it } from "vitest";
import {
  isSealedGradingOptionId,
  isValidListingGradingOptionId,
} from "@/lib/listings/validation";

describe("sealed grading option validation", () => {
  it("accepts sealed product grading option ids", () => {
    expect(isSealedGradingOptionId("sealed:SEALED")).toBe(true);
    expect(isSealedGradingOptionId("sealed:UNSEALED")).toBe(true);
    expect(isValidListingGradingOptionId("sealed:SEALED")).toBe(true);
  });

  it("rejects unknown sealed grading option ids", () => {
    expect(isSealedGradingOptionId("sealed:FOO")).toBe(false);
    expect(isValidListingGradingOptionId("sealed:FOO")).toBe(false);
  });
});
