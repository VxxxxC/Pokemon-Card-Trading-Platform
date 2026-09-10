import { describe, expect, it } from "vitest";
import { hasBaseIntegrationEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";
import {
  P2P_MEETUP_MAX_NEW_ACCOUNT_HKD,
  P2P_MEETUP_MAX_NO_MARKET_PRICE_HKD,
  P2P_NEW_ACCOUNT_GRACE_DAYS,
} from "@/lib/platform/p2p-aml-config";

describe.skipIf(!hasBaseIntegrationEnv())(
  "P2P AML limits SSOT integration",
  () => {
    it("SQL mirror functions match TS constants", async () => {
      const admin = createServiceRoleClient();

      const { data: graceDays, error: graceError } = await admin.rpc(
        "fn_p2p_aml_new_account_grace_days",
      );
      expect(graceError).toBeNull();
      expect(Number(graceDays)).toBe(P2P_NEW_ACCOUNT_GRACE_DAYS);

      const { data: newAccountMax, error: newAccountError } = await admin.rpc(
        "fn_p2p_aml_meetup_max_new_account_hkd",
      );
      expect(newAccountError).toBeNull();
      expect(Number(newAccountMax)).toBe(P2P_MEETUP_MAX_NEW_ACCOUNT_HKD);

      const { data: noMarketMax, error: noMarketError } = await admin.rpc(
        "fn_p2p_aml_meetup_max_no_market_hkd",
      );
      expect(noMarketError).toBeNull();
      expect(Number(noMarketMax)).toBe(P2P_MEETUP_MAX_NO_MARKET_PRICE_HKD);
    });

    it("grace-days and caps are positive integers for rpc_make_offer guards", async () => {
      const admin = createServiceRoleClient();

      const { data: graceDays } = await admin.rpc("fn_p2p_aml_new_account_grace_days");
      const { data: newAccountMax } = await admin.rpc(
        "fn_p2p_aml_meetup_max_new_account_hkd",
      );
      const { data: noMarketMax } = await admin.rpc(
        "fn_p2p_aml_meetup_max_no_market_hkd",
      );

      expect(Number(graceDays)).toBeGreaterThan(0);
      expect(Number(newAccountMax)).toBeGreaterThan(0);
      expect(Number(noMarketMax)).toBeGreaterThan(0);
      expect(Number(newAccountMax)).toBeLessThanOrEqual(Number(noMarketMax));
    });
  },
);
