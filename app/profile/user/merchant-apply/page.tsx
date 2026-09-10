import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMyKycApplication } from "@/app/actions/merchant-kyc";
import { getOptionalAuthUser, resolveCurrentAuthRole } from "@/lib/auth/session";
import { MerchantApplyClient } from "./MerchantApplyClient";

export const metadata: Metadata = {
  title: "商戶入駐申請 — HKCardVault",
  description: "提交香港公司商業登記證及銀行資料，成為認證商戶",
};

/**
 * Merchant KYC 申請頁（member 升級商戶入口）。
 * - Guest → /auth?role=merchant 先註冊
 * - 已係 merchant → merchant dashboard
 * - 有 pending / rejected 申請 → 顯示狀態（rejected 可重交）
 */
export default async function MerchantApplyPage() {
  const user = await getOptionalAuthUser();
  if (!user) {
    redirect("/auth?role=merchant");
  }

  const role = await resolveCurrentAuthRole();
  if (role === "MERCHANT") {
    redirect("/profile/merchant");
  }
  if (role === "ADMIN") {
    redirect("/admin/dashboard");
  }

  const applicationResult = await getMyKycApplication();
  const application = applicationResult.success
    ? applicationResult.data
    : null;

  return <MerchantApplyClient initialApplication={application} />;
}
