// @partner-id P-SEC06
// @features F-S-12
// @path Partner — SEC-06 TC-E13 fail-if-env-missing gate contract

import { test, expect } from "@playwright/test";
import {
  assertTcE13EnvOrThrow,
  getMissingEnvKeys,
  hasTcE13Env,
  isFailIfEnvMissingMode,
} from "../../helpers/env-guard";

test.describe("P-SEC06 TC-E13 env guard", () => {
  test("SEC-06 gate mode requires TC-E13 env (no silent skip)", () => {
    if (!isFailIfEnvMissingMode()) {
      test.skip(true, "Only enforced when PRODUCTION_GATE / REWARDS_GATE / E2E_FAIL_IF_ENV_MISSING=1");
    }

    const missing = getMissingEnvKeys();
    expect(
      missing,
      `[SEC-06] TC-E13 missing env: ${missing.join(", ")}`,
    ).toEqual([]);

    expect(() => assertTcE13EnvOrThrow()).not.toThrow();
    expect(hasTcE13Env()).toBe(true);
  });
});
