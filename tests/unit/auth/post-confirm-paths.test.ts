import { describe, expect, it } from "vitest";
import {
  MERCHANT_APPLY_ONBOARDING_INTENT,
  MERCHANT_APPLY_POST_CONFIRM_PATH,
  MEMBER_POST_CONFIRM_PATH,
  resolvePostConfirmPathFromAuth,
} from "@/lib/auth/post-confirm-paths";

describe("resolvePostConfirmPathFromAuth", () => {
  it("prefers merchant-apply when onboarding intent is set even if next is member home", () => {
    expect(
      resolvePostConfirmPathFromAuth(
        {
          user_metadata: {
            onboarding_intent: MERCHANT_APPLY_ONBOARDING_INTENT,
          },
        },
        MEMBER_POST_CONFIRM_PATH,
        "member",
      ),
    ).toBe(MERCHANT_APPLY_POST_CONFIRM_PATH);
  });

  it("keeps explicit merchant-apply next path", () => {
    expect(
      resolvePostConfirmPathFromAuth(
        { user_metadata: {} },
        MERCHANT_APPLY_POST_CONFIRM_PATH,
        "member",
      ),
    ).toBe(MERCHANT_APPLY_POST_CONFIRM_PATH);
  });

  it("falls back to member home for regular signups", () => {
    expect(
      resolvePostConfirmPathFromAuth(
        { user_metadata: {} },
        MEMBER_POST_CONFIRM_PATH,
        "member",
      ),
    ).toBe(MEMBER_POST_CONFIRM_PATH);
  });
});
