import { afterAll, describe, expect, it } from "vitest";
import { getMyKycApplication } from "@/app/actions/merchant-kyc";
import { clearSessionCache, runAsBuyer, warmSession } from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";

describe.skipIf(!hasBaseIntegrationEnv())("Merchant KYC actions (TC-M11)", () => {
  afterAll(async () => {
    await clearSessionCache();
  });

  it("buyer can load KYC application state without throwing", async () => {
    await warmSession("buyer");

    const result = await runAsBuyer(async () => getMyKycApplication());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data === null || typeof result.data?.status === "string").toBe(
        true,
      );
    }
  });
});
