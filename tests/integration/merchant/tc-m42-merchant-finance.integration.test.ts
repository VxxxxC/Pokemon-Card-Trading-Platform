import { afterAll, describe, expect, it } from "vitest";
import { getMerchantDashboardOverview } from "@/app/actions/merchant-dashboard";
import { getMerchantFinanceSummary, listMerchantFinanceSettlements } from "@/app/actions/merchant-finance";
import {
  clearSessionCache,
  runAsSeller,
  warmSession,
} from "../shared/auth-context";
import { setGuestServerClient } from "../shared/guest-auth";
import { hasBaseIntegrationEnv } from "../shared/env";

describe("TC-M42 merchant finance & dashboard — contract", () => {
  it("getMerchantFinanceSummary requires login", async () => {
    setGuestServerClient();

    const result = await getMerchantFinanceSummary();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("請先登入");
    }
  });

  it("getMerchantDashboardOverview requires login", async () => {
    setGuestServerClient();

    const result = await getMerchantDashboardOverview();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("請先登入");
    }
  });
});

describe.skipIf(!hasBaseIntegrationEnv())(
  "TC-M42 merchant finance & dashboard — smoke",
  () => {
    afterAll(async () => {
      await clearSessionCache();
    });

    it("seller can load finance summary", async () => {
      await warmSession("seller");

      const result = await runAsSeller(async () => getMerchantFinanceSummary());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.monthEarned).toBe("number");
        expect(Array.isArray(result.data.recentSettlements)).toBe(true);
      }
    });

    it("seller can load paginated settlements via RPC", async () => {
      await warmSession("seller");

      const result = await runAsSeller(async () =>
        listMerchantFinanceSettlements({
          page: 1,
          pageSize: 10,
          statusFilter: "all",
          sort: "transferred_at-desc",
        }),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBeGreaterThanOrEqual(1);
        expect(result.data.pageSize).toBe(10);
        expect(result.data.totalPages).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(result.data.rows)).toBe(true);
      }
    });

    it("seller can load dashboard overview", async () => {
      await warmSession("seller");

      const result = await runAsSeller(async () =>
        getMerchantDashboardOverview(),
      );

      if (result.success) {
        expect(result.data.shop).toBeTruthy();
        expect(result.data.performance).toBeTruthy();
      } else {
        expect(result.error.length).toBeGreaterThan(0);
      }
    });
  },
);
