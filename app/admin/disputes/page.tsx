import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { searchAdminModerationCases } from "@/app/actions/admin-moderation";
import { AdminDisputesClient } from "@/app/admin/disputes/AdminDisputesClient";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import type { AdminModerationSearchStatus } from "@/lib/moderation/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "舉報與爭議仲裁 — HKCardVault Admin",
  description: "全平台舉報與風控案件仲裁工作台",
};

type PageProps = {
  searchParams: Promise<{ status?: string }>;
};

function resolveInitialStatus(status?: string): AdminModerationSearchStatus {
  if (status === "pending") {
    return "pending";
  }
  if (status === "completed" || status === "resolved") {
    return "completed";
  }
  return "all";
}

export default async function AdminDisputesPage({ searchParams }: PageProps) {
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

  const params = await searchParams;
  const initialStatus = resolveInitialStatus(params.status);

  const result = await searchAdminModerationCases({
    status: initialStatus,
    page: 1,
    pageSize: 10,
  });

  return (
    <AdminDisputesClient
      initialData={
        result.success
          ? result.data
          : { rows: [], total: 0, pendingCount: 0 }
      }
      initialStatus={initialStatus}
      loadError={result.success ? null : result.error}
    />
  );
}
