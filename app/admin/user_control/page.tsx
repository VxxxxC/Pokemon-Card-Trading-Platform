import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listAdminPlatformUsers } from "@/app/actions/admin-user-control";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import AdminUserControlClient from "./AdminUserControlClient";

export const metadata: Metadata = {
  title: "用戶管理 — HKCardVault 後台",
  description: "管理全平台會員與認證商戶帳號、Stripe KYC 認證狀態",
};

export default async function AdminUserControlPage() {
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

  const result = await listAdminPlatformUsers({
    page: 1,
    kycFilter: "pending",
  });

  return (
    <AdminUserControlClient
      initialPage={result.success ? result.data : {
        rows: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        kycCounts: { all: 0, pending: 0, verified: 0, rejected: 0 },
        typeCounts: { member: 0, merchant: 0 },
      }}
      loadError={result.success ? null : result.error}
    />
  );
}
