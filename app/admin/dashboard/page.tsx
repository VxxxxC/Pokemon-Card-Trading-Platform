import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminDashboardMetrics, getAdminSystemHealthStatus } from "@/app/actions/admin-dashboard";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import AdminDashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "數據總覽 — HKCardVault 後台",
  description: "全平台用戶生態、交易量、營收及系統健康度實時監控",
};

export default async function AdminDashboardPage() {
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

  const [metricsResult, healthResult] = await Promise.all([
    getAdminDashboardMetrics(),
    getAdminSystemHealthStatus(),
  ]);

  return (
    <AdminDashboardClient
      metrics={metricsResult.success ? metricsResult.data : null}
      loadError={metricsResult.success ? null : metricsResult.error}
      initialServices={healthResult.success ? healthResult.data.services : []}
      healthLoadError={healthResult.success ? null : healthResult.error}
    />
  );
}
