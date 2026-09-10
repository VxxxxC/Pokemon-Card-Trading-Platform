import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useListingGradingAuthFields } from "@/lib/listings/use-listing-grading-auth-fields";

describe("useListingGradingAuthFields", () => {
  it("auto-enables auth when raw grading is selected in create flow", () => {
    const { result } = renderHook(() =>
      useListingGradingAuthFields({ enableAuthOnRawGradingSelect: true }),
    );

    act(() => {
      result.current.setGradingOptionId("raw:A");
    });

    expect(result.current.showListingAuthToggle).toBe(true);
    expect(result.current.acceptsBuyerAuth).toBe(true);
    expect(result.current.resolvedUseAuthentication).toBe(true);
  });

  it("does not auto-enable auth when editing graded to raw without create policy", () => {
    const { result } = renderHook(() =>
      useListingGradingAuthFields({
        initialAcceptsBuyerAuth: false,
      }),
    );

    act(() => {
      result.current.setGradingOptionId("raw:A");
    });

    expect(result.current.showListingAuthToggle).toBe(true);
    expect(result.current.acceptsBuyerAuth).toBe(false);
  });
});
