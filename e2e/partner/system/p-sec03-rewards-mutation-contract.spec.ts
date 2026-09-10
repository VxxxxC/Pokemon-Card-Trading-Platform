// @partner-id P-SEC03
// @features F-S-12
// @path Partner — SEC-03 rewards mutation contract (certify guard)

import { test, expect } from "@playwright/test";
import { verifyRewardsMutationContract } from "../../../lib/rewards/mutation-contract";

function isCertifyContractMode(): boolean {
  return (
    process.env.STAGING_CERTIFY === "1" ||
    process.env.CERTIFY_CONTRACT === "1" ||
    process.env.PRODUCTION_GATE === "1"
  );
}

test.describe("P-SEC03 rewards mutation contract", () => {
  test("SEC-03 stryker mutate targets and test:rewards:mutation are wired", () => {
    if (!isCertifyContractMode()) {
      test.skip(true, "Only enforced in certify / production gate contract mode");
    }

    const result = verifyRewardsMutationContract();
    expect(result.ok, result.ok ? "" : result.errors.join("; ")).toBe(true);
  });
});
