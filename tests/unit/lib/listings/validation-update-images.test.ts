import { describe, expect, it } from "vitest";
import { validateUpdateListingImageCount } from "@/lib/listings/validation";

describe("validateUpdateListingImageCount", () => {
  it("requires 6 images for single-card edits", () => {
    expect(validateUpdateListingImageCount(5, "card")).toMatch(/6 張/);
    expect(validateUpdateListingImageCount(6, "card")).toBeNull();
  });

  it("requires at least 1 image for box/set edits", () => {
    expect(validateUpdateListingImageCount(0, "box_set")).toMatch(/至少 1 張/);
    expect(validateUpdateListingImageCount(1, "box_set")).toBeNull();
    expect(validateUpdateListingImageCount(3, "box_set")).toBeNull();
  });
});
