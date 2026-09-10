import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getAdminModerationCase,
  getAdminSubjectModerationHistory,
} from "@/app/actions/admin-moderation";
import DisputeDetailClient from "@/app/admin/disputes/[id]/DisputeDetailClient";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "案件詳情 — HKCardVault Admin",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DisputeDetailPage({ params }: PageProps) {
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
  const result = await getAdminModerationCase(id);

  if (!result.success) {
    notFound();
  }

  const historyResult = await getAdminSubjectModerationHistory({
    subjectUserId: result.data.case.subject.id,
    excludeCaseId: id,
  });

  return (
    <DisputeDetailClient
      bundle={result.data}
      subjectHistory={historyResult.success ? historyResult.data : null}
    />
  );
}
