import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createServiceRoleClient } from "../../shared/supabase-admin";

export type ReportAuditRow = {
  id: string;
  reporter_id: string;
  target_id: string;
  target_type: string;
  reason: string;
  status: string | null;
  category: string | null;
  case_id: string | null;
  contribution_score: number | null;
};

export async function getLatestReport(params: {
  reporterId: string;
  targetId: string;
}): Promise<ReportAuditRow | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("reports")
    .select(
      "id, reporter_id, target_id, target_type, reason, status, category, case_id, contribution_score",
    )
    .eq("reporter_id", params.reporterId)
    .eq("target_id", params.targetId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[getLatestReport] ${error.message}`);
  }

  return (data as ReportAuditRow | null) ?? null;
}

export async function countPendingReports(params: {
  reporterId: string;
  targetId: string;
}): Promise<number> {
  const admin = createServiceRoleClient();
  const { count, error } = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("reporter_id", params.reporterId)
    .eq("target_id", params.targetId)
    .eq("status", "pending");

  if (error) {
    throw new Error(`[countPendingReports] ${error.message}`);
  }

  return count ?? 0;
}

export async function getModerationCaseStatus(
  caseId: string,
): Promise<{ status: string; resolution: string | null } | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("moderation_cases")
    .select("status, resolution")
    .eq("id", caseId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getModerationCaseStatus] ${error.message}`);
  }

  return (data as { status: string; resolution: string | null } | null) ?? null;
}

export async function getModerationCaseScores(caseId: string): Promise<{
  autoScore: number;
  adminAdjustment: number;
  finalScore: number;
} | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("moderation_cases")
    .select("auto_score, admin_adjustment, final_score")
    .eq("id", caseId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getModerationCaseScores] ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    autoScore: Number(data.auto_score ?? 0),
    adminAdjustment: Number(data.admin_adjustment ?? 0),
    finalScore: Number(data.final_score ?? 0),
  };
}

export async function countModerationAuditLogsForCase(
  caseId: string,
  action?: string,
): Promise<number> {
  const admin = createServiceRoleClient();
  let query = admin
    .from("moderation_audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId);

  if (action) {
    query = query.eq("action", action);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`[countModerationAuditLogsForCase] ${error.message}`);
  }

  return count ?? 0;
}

export async function getActiveAccountSanctionsForUser(userId: string) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("account_sanctions")
    .select("id, user_id, scope, type, ends_at, reason, case_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`[getActiveAccountSanctionsForUser] ${error.message}`);
  }

  return data ?? [];
}

export async function getOutcomeAckState(
  reportId: string,
): Promise<{ outcomeAcknowledgedAt: string | null } | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("reports")
    .select("outcome_acknowledged_at")
    .eq("id", reportId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getOutcomeAckState] ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    outcomeAcknowledgedAt: data.outcome_acknowledged_at ?? null,
  };
}

export async function getModerationCaseResolution(
  caseId: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("moderation_cases")
    .select("resolution")
    .eq("id", caseId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getModerationCaseResolution] ${error.message}`);
  }

  return data?.resolution ?? null;
}

export async function insertLegacyResolvedReportFixture(params: {
  reporterId: string;
  subjectId: string;
  adminId: string;
  runId: string;
  suffix: string;
}): Promise<{ reportId: string; caseId: string }> {
  const admin = createServiceRoleClient();
  const caseNumber = `VT-LEGACY-${params.runId}-${params.suffix}`;
  const ackAt = new Date(Date.now() - 86_400_000).toISOString();
  const resolvedAt = ackAt;

  const { data: moderationCase, error: caseError } = await admin
    .from("moderation_cases")
    .insert({
      case_number: caseNumber,
      subject_user_id: params.subjectId,
      status: "dismissed",
      resolution: "dismissed",
      resolved_at: resolvedAt,
      resolved_by: params.adminId,
      primary_category: "other",
      auto_score: 10,
      admin_adjustment: 0,
    })
    .select("id")
    .single();

  if (caseError) {
    throw new Error(`[insertLegacyResolvedReportFixture:case] ${caseError.message}`);
  }

  const { data: report, error: reportError } = await admin
    .from("reports")
    .insert({
      reporter_id: params.reporterId,
      target_id: params.subjectId,
      target_type: "user",
      reason: `Legacy fixture ${params.suffix}`,
      status: "dismissed",
      category: "other",
      case_id: moderationCase.id,
      outcome_acknowledged_at: ackAt,
      contribution_score: 10,
    })
    .select("id")
    .single();

  if (reportError) {
    await admin.from("moderation_cases").delete().eq("id", moderationCase.id);
    throw new Error(
      `[insertLegacyResolvedReportFixture:report] ${reportError.message}`,
    );
  }

  return { reportId: report.id, caseId: moderationCase.id };
}

export async function getListingStatus(
  listingId: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("listings")
    .select("status")
    .eq("id", listingId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getListingStatus] ${error.message}`);
  }

  return data?.status ?? null;
}

export async function getMemberOrderPayoutStatus(
  orderId: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("member_orders")
    .select("seller_payout_status")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getMemberOrderPayoutStatus] ${error.message}`);
  }

  return data?.seller_payout_status ?? null;
}

export type AccountAccessRestriction = {
  blocked: boolean;
  type?: string;
  endsAt?: string | null;
  reason?: string | null;
};

export async function getAccountAccessRestriction(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<AccountAccessRestriction> {
  const { data, error } = await client.rpc(
    "moderation_get_account_access_restriction",
    { p_user_id: userId },
  );

  if (error) {
    throw new Error(`[getAccountAccessRestriction] ${error.message}`);
  }

  const payload = data as AccountAccessRestriction | null;
  return {
    blocked: payload?.blocked === true,
    type: payload?.type,
    endsAt: payload?.endsAt ?? null,
    reason: payload?.reason ?? null,
  };
}

export async function getResolveAuditPayload(
  caseId: string,
): Promise<Record<string, unknown> | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("moderation_audit_logs")
    .select("payload")
    .eq("case_id", caseId)
    .eq("action", "resolve")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[getResolveAuditPayload] ${error.message}`);
  }

  return (data?.payload as Record<string, unknown> | null) ?? null;
}
