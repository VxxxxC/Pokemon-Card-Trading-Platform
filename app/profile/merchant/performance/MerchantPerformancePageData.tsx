import { redirect } from "next/navigation";
import { getMerchantPerformanceAnalytics } from "@/app/actions/merchant-performance";
import { MERCHANT_PERF_DEFAULT_RANGE } from "@/lib/dashboard/merchant-performance-ranges";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MerchantPerformanceClient } from "./MerchantPerformanceClient";

export async function MerchantPerformancePageData() {
  if (!isSupabaseConfigured()) {
    redirect("/auth");
  }

  const user = await getOptionalAuthUser();
  if (!user) {
    redirect("/auth?redirect=/profile/merchant/performance");
  }

  const analyticsResult = await getMerchantPerformanceAnalytics(
    MERCHANT_PERF_DEFAULT_RANGE,
  );

  if (!analyticsResult.success && analyticsResult.error === "無商戶權限") {
    redirect("/profile/user");
  }

  return (
    <MerchantPerformanceClient
      initialData={analyticsResult.success ? analyticsResult.data : null}
      bootstrapError={analyticsResult.success ? undefined : analyticsResult.error}
    />
  );
}
