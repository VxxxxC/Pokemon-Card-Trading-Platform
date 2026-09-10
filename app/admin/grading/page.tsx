import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getAdminGradingTabCounts,
  searchAdminGradingOrders,
  type AdminGradingTab,
} from "@/app/actions/admin-grading";
import { isAdminGradingTab } from "@/lib/admin-grading/tabs";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { AdminGradingClient } from "./AdminGradingClient";

export const metadata: Metadata = {
  title: "鑑定工作台 — HKCardVault Admin",
  description: "統一處理 Member C2C 與 Merchant B2C 鑑定訂單入庫、鑑定、出庫與退款",
};

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function AdminGradingPage({ searchParams }: PageProps) {
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

  const query = await searchParams;
  const initialTab: AdminGradingTab =
    query.tab === "recovery_tracking"
      ? "awaiting_settlement"
      : isAdminGradingTab(query.tab)
        ? query.tab
        : "awaiting_intake";

  const result = await searchAdminGradingOrders({
    tab: initialTab,
    page: 1,
    pageSize: 20,
  });

  const countsResult = await getAdminGradingTabCounts();

  return (
    <AdminGradingClient
      initialTab={initialTab}
      initialRows={result.success ? result.data.rows : []}
      initialTotal={result.success ? result.data.total : 0}
      initialTabCounts={
        countsResult.success
          ? countsResult.data
          : {
              awaiting_intake: result.success ? result.data.total : 0,
              grading: 0,
              awaiting_outbound: 0,
              awaiting_settlement: 0,
              closed: 0,
            }
      }
      loadError={result.success ? null : result.error}
    />
  );
}
