import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminCheckInProgram } from "@/app/actions/admin-check-in-program";
import {
  getAdminRewardActivityStatusCounts,
  listAdminRewardActivities,
} from "@/app/actions/admin-reward-activities";
import { resolveCampaignTab } from "@/app/admin/campaigns/campaign-tabs";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { REWARD_ACTIVITY_PAGE_SIZE } from "@/lib/admin-rewards/template-form";
import { CampaignsPageShell } from "./CampaignsPageShell";

export const metadata: Metadata = {
  title: "積分與獎勵活動 — HKCardVault Admin",
  description: "管理獎勵活動、簽到計劃與積分任務",
};

type AdminCampaignsPageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function AdminCampaignsPage({
  searchParams,
}: AdminCampaignsPageProps) {
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
  const initialTab = resolveCampaignTab(params.tab);

  const [activitiesResult, programResult, statusCountsResult] =
    await Promise.all([
      listAdminRewardActivities({
        status: "all",
        page: 1,
        pageSize: REWARD_ACTIVITY_PAGE_SIZE,
      }),
      getAdminCheckInProgram(),
      getAdminRewardActivityStatusCounts(),
    ]);

  return (
    <CampaignsPageShell
      initialActivities={
        activitiesResult.success ? activitiesResult.data.rows : []
      }
      activitiesTotal={
        activitiesResult.success ? activitiesResult.data.total : 0
      }
      activitiesLoadError={
        activitiesResult.success ? null : activitiesResult.error
      }
      initialStatusCounts={
        statusCountsResult.success ? statusCountsResult.data : null
      }
      initialCheckInProgram={
        programResult.success ? programResult.data : null
      }
      checkInLoadError={programResult.success ? null : programResult.error}
      initialTab={initialTab}
    />
  );
}
