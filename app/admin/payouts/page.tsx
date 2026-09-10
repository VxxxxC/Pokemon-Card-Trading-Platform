import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getAdminFpsBatchSchedule,
  getAdminPayoutsPageData,
  listAdminMerchantTransfers,
  listAdminPayoutRequests,
} from "@/app/actions/admin-payouts";
import {
  EMPTY_FPS_PAYOUT_STATUS_COUNTS,
  EMPTY_MERCHANT_TRANSFER_STATUS_COUNTS,
  FPS_PAYOUT_REQUESTS_PAGE_SIZE,
  MERCHANT_TRANSFERS_PAGE_SIZE,
} from "@/lib/admin-payouts/types";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import AdminPayoutsClient from "./AdminPayoutsClient";

export const metadata: Metadata = {
  title: "財務與結算 — HKCardVault 後台",
  description: "人手 FPS 批處理與 Stripe Connect 商戶撥款監控",
};

export default async function AdminPayoutsPage() {
  if (!isSupabaseConfigured()) {
    redirect("/auth");
  }

  const user = await getOptionalAuthUser();
  if (!user) {
    redirect("/auth");
  }

  const supabase = await createClient();
  const isAdmin = await isCurrentUserAdmin(supabase, user.id);
  if (!isAdmin) {
    redirect("/");
  }

  const [result, fpsBatchSchedule, merchantPageResult, fpsPageResult] =
    await Promise.all([
      getAdminPayoutsPageData(),
      getAdminFpsBatchSchedule(),
      listAdminMerchantTransfers({
        page: 1,
        pageSize: MERCHANT_TRANSFERS_PAGE_SIZE,
      }),
      listAdminPayoutRequests({
        page: 1,
        pageSize: FPS_PAYOUT_REQUESTS_PAGE_SIZE,
        statusFilter: "incomplete",
      }),
    ]);

  const emptyMerchantPage = {
    rows: [],
    total: 0,
    page: 1,
    pageSize: MERCHANT_TRANSFERS_PAGE_SIZE,
    totalPages: 0,
    statusCounts: { ...EMPTY_MERCHANT_TRANSFER_STATUS_COUNTS },
  };

  const emptyFpsPage = {
    rows: [],
    total: 0,
    page: 1,
    pageSize: FPS_PAYOUT_REQUESTS_PAGE_SIZE,
    totalPages: 0,
    statusCounts: { ...EMPTY_FPS_PAYOUT_STATUS_COUNTS },
  };

  return (
    <AdminPayoutsClient
      data={result.success ? result.data : null}
      loadError={result.success ? null : result.error}
      fpsBatchSchedule={fpsBatchSchedule}
      initialMerchantPage={
        merchantPageResult.success ? merchantPageResult.data : emptyMerchantPage
      }
      merchantLoadError={
        merchantPageResult.success ? null : merchantPageResult.error
      }
      initialFpsPage={
        fpsPageResult.success ? fpsPageResult.data : emptyFpsPage
      }
      fpsLoadError={fpsPageResult.success ? null : fpsPageResult.error}
    />
  );
}
