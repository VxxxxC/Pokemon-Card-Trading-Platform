/**
 * Opt-in: real Stripe terminal refund for merchant_auth / member_auth moderation orders.
 * Requires live auth checkout + STRIPE_SECRET_KEY (not seeded fake PI).
 * Run: MODERATION_AUTH_STRIPE_SMOKE=1 bunx playwright test e2e/moderation-auth-stripe-refund-smoke.spec.ts
 */
import { test } from "@playwright/test";
import { hasModerationStripeSmokeEnv } from "./helpers/moderation-stripe-smoke";

test.describe("I-H14b moderation auth Stripe refund smoke (opt-in)", () => {
  test("merchant_auth + member_auth real Stripe refund — env not wired", () => {
    test.skip(
      process.env.MODERATION_AUTH_STRIPE_SMOKE !== "1",
      "Set MODERATION_AUTH_STRIPE_SMOKE=1 to enable opt-in auth Stripe smoke",
    );
    test.skip(
      !hasModerationStripeSmokeEnv(),
      "Missing moderation Stripe smoke env (I-H14 parity)",
    );
    test.skip(
      true,
      "Opt-in placeholder: requires auth checkout → held → dispute UI → Stripe terminal (follow I-H14)",
    );
  });
});
