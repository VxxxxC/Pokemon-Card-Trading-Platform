/**
 * Preflight: merchant grading integration E2E env alignment.
 * Run: bun run verify:merchant-grading-e2e
 */
import { assertMerchantGradingEnvReady, hasMerchantGradingEnvVars } from "../tests/integration/grading/helpers/grading-merchant-env";
import { clearSessionCache } from "../tests/integration/shared/auth-context";

async function main(): Promise<void> {
  if (!hasMerchantGradingEnvVars()) {
    console.error(
      JSON.stringify({
        ok: false,
        error:
          "Missing env: requires hasBaseIntegrationEnv + E2E_SELLER_ID + E2E_LISTING_ID + E2E_SELLER_EMAIL/PASSWORD",
      }),
    );
    process.exit(1);
  }

  try {
    const result = await assertMerchantGradingEnvReady();
    console.log(
      JSON.stringify({
        ok: true,
        listingId: result.listingId,
        sellerId: result.sellerId,
        message:
          "E2E_SELLER_EMAIL session, E2E_SELLER_ID, and E2E_LISTING_ID are aligned for merchant grading tests",
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  } finally {
    await clearSessionCache();
  }
}

main();
