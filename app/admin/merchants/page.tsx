import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listKycApplications } from "@/app/actions/admin-kyc";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { AdminMerchantsClient } from "./AdminMerchantsClient";

export const metadata: Metadata = {
  title: "商戶 KYC 審核 — HKCardVault Admin",
  description: "審核商戶入駐申請、查閱 KYC 文件、批准後自動開通 Stripe Connect",
};

type AdminMerchantsPageProps = {
  searchParams: Promise<{ applicationId?: string }>;
};

export default async function AdminMerchantsPage({
  searchParams,
}: AdminMerchantsPageProps) {
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
  const result = await listKycApplications({});
  const applications = result.success ? result.data : [];

  return (
    <AdminMerchantsClient
      initialApplications={applications}
      loadError={result.success ? null : result.error}
      highlightApplicationId={params.applicationId ?? null}
    />
  );
}
