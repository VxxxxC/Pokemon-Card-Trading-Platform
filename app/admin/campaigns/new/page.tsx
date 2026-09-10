import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { RewardActivityForm } from "@/app/admin/campaigns/RewardActivityForm";
import { FORM_PAGE_BACK_LINK_CLASS } from "@/app/admin/campaigns/campaigns-ui";
import {
  buildDefaultPointsMallActivityForm,
  type AdminRewardFormFlow,
} from "@/lib/admin-rewards/template-form";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "新增獎勵活動 — HKCardVault Admin",
  description: "建立平台獎勵活動",
};

type AdminNewRewardActivityPageProps = {
  searchParams: Promise<{ flow?: string }>;
};

function resolveInitialFlow(flow?: string): AdminRewardFormFlow | undefined {
  if (flow === "points_mall") {
    return "points_mall";
  }
  return undefined;
}

export default async function AdminNewRewardActivityPage({
  searchParams,
}: AdminNewRewardActivityPageProps) {
  const { flow: flowParam } = await searchParams;
  const initialFlow = resolveInitialFlow(flowParam);
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
            <span className="text-text-disabled"> / 新增活動</span>
          </div>
        <h1 className="mt-2 font-sans text-[24px] font-bold text-text-primary">
          {initialFlow === "points_mall" ? "新增積分商城商品" : "新增獎勵活動"}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {initialFlow === "points_mall"
            ? "設定可兌換的折扣券或免運券、積分成本與商城庫存。"
            : "一次設定獎勵內容、發放方式與檔期（如適用）。"}
        </p>
        </div>
      </div>

      <RewardActivityForm
        initialFlow={initialFlow}
        initialForm={
          initialFlow === "points_mall"
            ? buildDefaultPointsMallActivityForm()
            : undefined
        }
      />
    </div>
  );
}
