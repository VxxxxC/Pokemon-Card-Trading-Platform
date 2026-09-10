import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getAdminGradingOrder,
  type AdminGradingOrderKind,
} from "@/app/actions/admin-grading";
import { AdminGradingOrderDetailLoader } from "@/app/admin/grading/AdminGradingOrderDetailLoader";
import { inferAdminGradingTab, isAdminGradingTab } from "@/lib/admin-grading/tabs";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "鑑定訂單詳情 — HKCardVault Admin",
};

interface PageProps {
  params: Promise<{ orderKind: string; orderId: string }>;
  searchParams: Promise<{ tab?: string }>;
}

function parseOrderKind(value: string): AdminGradingOrderKind | null {
  if (value === "member" || value === "merchant") {
    return value;
  }
  return null;
}

export default async function AdminGradingOrderDetailPage({
  params,
  searchParams,
}: PageProps) {
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

  const { orderKind: orderKindParam, orderId } = await params;
  const orderKind = parseOrderKind(orderKindParam);
  if (!orderKind) {
    notFound();
  }

  const result = await getAdminGradingOrder({ orderKind, orderId });

  const query = await searchParams;
  const tab = isAdminGradingTab(query.tab)
    ? query.tab
    : result.success
      ? inferAdminGradingTab(result.data)
      : "awaiting_intake";
  const backHref = `/admin/grading?tab=${tab}`;

  return (
    <AdminGradingOrderDetailLoader
      orderKind={orderKind}
      orderId={orderId}
      initialRow={result.success ? result.data : null}
      tab={tab}
      backHref={backHref}
    />
  );
}
