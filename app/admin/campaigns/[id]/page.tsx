import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getAdminRewardActivity } from "@/app/actions/admin-reward-activities";
import { RewardActivityForm } from "@/app/admin/campaigns/RewardActivityForm";
import { FORM_PAGE_BACK_LINK_CLASS } from "@/app/admin/campaigns/campaigns-ui";
import { activityRowToForm } from "@/lib/admin-rewards/template-form";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type AdminEditRewardActivityPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: AdminEditRewardActivityPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `編輯獎勵活動 ${id.slice(0, 8)} — HKCardVault Admin`,
    description: "編輯平台獎勵活動",
  };
}

export default async function AdminEditRewardActivityPage({
  params,
}: AdminEditRewardActivityPageProps) {
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

  const { id } = await params;
  const result = await getAdminRewardActivity(id);

  if (!result.success) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <Link href="/admin/campaigns" className={FORM_PAGE_BACK_LINK_CLASS}>
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          返回列表
        </Link>
        <div>
          <div className="font-mono text-[11px] text-text-secondary">
            <span className="text-text-disabled">積分與獎勵活動</span>
            <span className="text-text-disabled"> / 編輯活動</span>
          </div>
        <h1 className="mt-2 font-sans text-[24px] font-bold text-text-primary">
          編輯獎勵活動
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{result.data.title}</p>
        </div>
      </div>

      <RewardActivityForm initialForm={activityRowToForm(result.data)} />
    </div>
  );
}
