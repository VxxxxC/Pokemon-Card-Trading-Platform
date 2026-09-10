"use server";

import { enqueueModerationReportOutcomeEmails, enqueueModerationResolveFollowUpEmails, enqueueModerationEvidenceRequestEmail } from "@/lib/notifications/moderation-emails";
import { enqueueRefundApprovedEmail, enqueueRefundFailedEmail } from "@/lib/notifications/refund-emails";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isReportCategorySlug } from "@/lib/moderation/category-config";
import { applySupabaseAuthBan } from "@/lib/moderation/apply-auth-ban";
import type {
  AdminAccountSanctionRow,
  AdminModerationAuditRow,
  AdminModerationCaseBundle,
  AdminModerationCaseDetail,
  AdminModerationCaseRow,
  AdminModerationChatAccess,
  AdminModerationChatMessage,
  AdminModerationChatThread,
  AdminModerationOrderSummary,
  AdminModerationReportRow,
  AdminModerationReporterSummary,
  AdminModerationSearchResult,
  AdminModerationSearchStatus,
  AdminReportAttachmentRow,
  AdminSubjectModerationHistory,
  AdminSubjectModerationPriorCase,
  AdminSubjectSanctionHistoryRow,
  ModerationResolution,
  ReportCategorySlug,
  ModerationRefundBreakdownPreview,
  ResolveAdminModerationCaseInput,
  SanctionScope,
  SanctionType,
  SearchAdminModerationCasesInput,
  ViolationPersona,
} from "@/lib/moderation/types";
import { parseModerationRefundBreakdownPreview } from "@/lib/moderation/refund-breakdown-preview";
import { enrichModerationSubjectPreviews } from "@/lib/moderation/resolve-subject-presentation";
import {
  buildListingCdnUrl,
  getBunnyStorageConfig,
} from "@/lib/storage/bunny";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import {
  isGradingFaultParty,
  type GradingFaultParty,
} from "@/lib/payments/auth-grading-fail-void-saga";
import {
  parsePrepareModerationOrderRefundPayload,
  runModerationOrderRefundRetry,
  runModerationOrderRefundSaga,
} from "@/lib/payments/moderation-order-refund-saga";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type AdminModerationRpcClient = {
  rpc(
    fn: "search_admin_moderation_cases",
    args: Database["public"]["Functions"]["search_admin_moderation_cases"]["Args"],
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "admin_get_moderation_case_bundle",
    args: Database["public"]["Functions"]["admin_get_moderation_case_bundle"]["Args"],
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "admin_get_moderation_chat_thread",
    args: Database["public"]["Functions"]["admin_get_moderation_chat_thread"]["Args"],
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_adjust_moderation_case_score",
    args: Database["public"]["Functions"]["rpc_adjust_moderation_case_score"]["Args"],
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_resolve_moderation_case",
    args: Database["public"]["Functions"]["rpc_resolve_moderation_case"]["Args"],
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "fn_preview_moderation_order_refund_breakdown",
    args: Database["public"]["Functions"]["fn_preview_moderation_order_refund_breakdown"]["Args"],
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "admin_get_subject_moderation_history",
    args: Database["public"]["Functions"]["admin_get_subject_moderation_history"]["Args"],
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function asAdminModerationRpcClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
): AdminModerationRpcClient {
  return supabase as unknown as AdminModerationRpcClient;
}

async function requireAdmin(): Promise<
  { ok: true; adminId: string } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "未登入" };
  }

  const user = await getOptionalAuthUser();
  if (!user) {
    return { ok: false, error: "請先登入" };
  }

  const supabase = await createClient();
  const isAdmin = await isCurrentUserAdmin(supabase, user.id);
  if (!isAdmin) {
    return { ok: false, error: "無管理員權限" };
  }

  return { ok: true, adminId: user.id };
}

function mapRpcError(message: string): string {
  if (message.includes("無管理員權限")) {
    return "無管理員權限";
  }
  if (message.includes("找不到案件")) {
    return "找不到案件";
  }
  if (message.includes("無法調閱此聊天室") || message.includes("無效的聊天室")) {
    return "無法調閱此聊天室";
  }
  if (message.includes("調整分數時必須填寫原因")) {
    return "調整分數時必須填寫原因";
  }
  if (message.includes("案件已結案")) {
    return "案件已結案";
  }
  if (message.includes("證據不足")) {
    return message;
  }
  if (message.includes("裁定成立時必須指定違規身分")) {
    return "裁定成立時必須指定違規身分";
  }
  return message || "操作失敗，請稍後再試";
}

function toCategorySlug(value: unknown): ReportCategorySlug | null {
  if (typeof value !== "string" || !isReportCategorySlug(value)) {
    return null;
  }
  return value;
}

function parseSubjectPreview(value: unknown): AdminModerationCaseRow["subject"] {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    displayName:
      typeof row.displayName === "string" ? row.displayName : null,
    username: typeof row.username === "string" ? row.username : null,
  };
}

function parseReporterPreview(
  value: unknown,
): AdminModerationCaseRow["reporterPreview"] {
  const row = value as Record<string, unknown>;
  return {
    displayName:
      typeof row.displayName === "string" ? row.displayName : "未知舉報人",
    extraCount:
      typeof row.extraCount === "number" ? row.extraCount : Number(row.extraCount ?? 0),
  };
}

function parseSearchRow(value: unknown): AdminModerationCaseRow | null {
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  const caseNumber = typeof row.caseNumber === "string" ? row.caseNumber : null;
  const status = row.status;
  if (
    !id ||
    !caseNumber ||
    typeof status !== "string" ||
    typeof row.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id,
    caseNumber,
    status: status as AdminModerationCaseRow["status"],
    primaryCategory: toCategorySlug(row.primaryCategory),
    autoScore: Number(row.autoScore ?? 0),
    adminAdjustment: Number(row.adminAdjustment ?? 0),
    finalScore:
      row.finalScore === null || row.finalScore === undefined
        ? null
        : Number(row.finalScore),
    createdAt: row.createdAt,
    subject: parseSubjectPreview(row.subject),
    reporterPreview: parseReporterPreview(row.reporterPreview),
    previewDetails:
      typeof row.previewDetails === "string" ? row.previewDetails : null,
    subjectPriorUpheldCount:
      row.subjectPriorUpheldCount === null ||
      row.subjectPriorUpheldCount === undefined
        ? 0
        : Number(row.subjectPriorUpheldCount),
  };
}

function parseSubjectHistory(
  data: unknown,
): AdminSubjectModerationHistory | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;
  const subjectUserId =
    typeof payload.subjectUserId === "string" ? payload.subjectUserId : null;
  if (!subjectUserId) {
    return null;
  }

  const statsRaw =
    payload.stats && typeof payload.stats === "object"
      ? (payload.stats as Record<string, unknown>)
      : {};
  const distinctTypes = Array.isArray(statsRaw.distinctSanctionTypes)
    ? statsRaw.distinctSanctionTypes.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  const priorCasesRaw = Array.isArray(payload.priorCases)
    ? payload.priorCases
    : [];
  const priorCases = priorCasesRaw.flatMap((entry): AdminSubjectModerationPriorCase[] => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    const caseNumber = typeof row.caseNumber === "string" ? row.caseNumber : null;
    const status = typeof row.status === "string" ? row.status : null;
    const createdAt = typeof row.createdAt === "string" ? row.createdAt : null;
    if (!id || !caseNumber || !status || !createdAt) {
      return [];
    }
    return [
      {
        id,
        caseNumber,
        status: status as AdminSubjectModerationPriorCase["status"],
        primaryCategory: toCategorySlug(row.primaryCategory),
        finalScore:
          row.finalScore === null || row.finalScore === undefined
            ? null
            : Number(row.finalScore),
        resolution:
          typeof row.resolution === "string"
            ? (row.resolution as ModerationResolution)
            : null,
        createdAt,
        resolvedAt:
          typeof row.resolvedAt === "string" ? row.resolvedAt : null,
      },
    ];
  });

  const sanctionHistoryRaw = Array.isArray(payload.sanctionHistory)
    ? payload.sanctionHistory
    : [];
  const sanctionHistory = sanctionHistoryRaw.flatMap(
    (entry): AdminSubjectSanctionHistoryRow[] => {
      if (!entry || typeof entry !== "object") {
        return [];
      }
      const row = entry as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : null;
      const scope = typeof row.scope === "string" ? row.scope : null;
      const type = typeof row.type === "string" ? row.type : null;
      const startsAt = typeof row.startsAt === "string" ? row.startsAt : null;
      const status = row.status === "expired" ? "expired" : "active";
      if (!id || !scope || !type || !startsAt) {
        return [];
      }
      return [
        {
          id,
          scope: scope as AdminSubjectSanctionHistoryRow["scope"],
          type: type as AdminSubjectSanctionHistoryRow["type"],
          caseId: typeof row.caseId === "string" ? row.caseId : null,
          caseNumber:
            typeof row.caseNumber === "string" ? row.caseNumber : null,
          startsAt,
          endsAt: typeof row.endsAt === "string" ? row.endsAt : null,
          revokedAt:
            typeof row.revokedAt === "string" ? row.revokedAt : null,
          reason: typeof row.reason === "string" ? row.reason : null,
          status,
        },
      ];
    },
  );

  return {
    subjectUserId,
    stats: {
      priorCaseCount: Number(statsRaw.priorCaseCount ?? 0),
      upheldCount: Number(statsRaw.upheldCount ?? 0),
      dismissedCount: Number(statsRaw.dismissedCount ?? 0),
      reportsLast90Days: Number(statsRaw.reportsLast90Days ?? 0),
      distinctSanctionTypes: distinctTypes,
    },
    priorCases,
    sanctionHistory,
  };
}

function parseSearchPayload(data: unknown): AdminModerationSearchResult | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;
  const rowsRaw = Array.isArray(payload.rows) ? payload.rows : [];
  const rows = rowsRaw
    .map(parseSearchRow)
    .filter((row): row is AdminModerationCaseRow => row !== null);

  return {
    rows,
    total: Number(payload.total ?? rows.length),
    pendingCount: Number(payload.pendingCount ?? 0),
  };
}

function resolveAttachmentPublicUrl(storagePath: string): string | null {
  const config = getBunnyStorageConfig();
  if (!config || !storagePath.trim()) {
    return null;
  }
  return buildListingCdnUrl(config, storagePath);
}

function parseReportRow(value: unknown): AdminModerationReportRow | null {
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  const reporterId = typeof row.reporterId === "string" ? row.reporterId : null;
  const reason = typeof row.reason === "string" ? row.reason : null;
  if (!id || !reporterId || !reason) {
    return null;
  }

  return {
    id,
    reporterId,
    reporterDisplayName:
      typeof row.reporterDisplayName === "string"
        ? row.reporterDisplayName
        : null,
    reporterUsername:
      typeof row.reporterUsername === "string" ? row.reporterUsername : null,
    category: toCategorySlug(row.category),
    source:
      typeof row.source === "string"
        ? (row.source as AdminModerationReportRow["source"])
        : null,
    status:
      typeof row.status === "string"
        ? (row.status as AdminModerationReportRow["status"])
        : null,
    details: typeof row.details === "string" ? row.details : null,
    reason,
    contributionScore:
      row.contributionScore === null || row.contributionScore === undefined
        ? null
        : Number(row.contributionScore),
    contextType: typeof row.contextType === "string" ? row.contextType : null,
    contextId: typeof row.contextId === "string" ? row.contextId : null,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
  };
}

function parseAttachmentRow(value: unknown): AdminReportAttachmentRow | null {
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  const reporterId = typeof row.reporterId === "string" ? row.reporterId : null;
  const storagePath = typeof row.storagePath === "string" ? row.storagePath : null;
  const mimeType = typeof row.mimeType === "string" ? row.mimeType : null;
  if (!id || !reporterId || !storagePath || !mimeType) {
    return null;
  }

  return {
    id,
    reportId: typeof row.reportId === "string" ? row.reportId : null,
    reporterId,
    storagePath,
    mimeType,
    byteSize: Number(row.byteSize ?? 0),
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    publicUrl: resolveAttachmentPublicUrl(storagePath),
  };
}

function parseReporterSummary(
  value: unknown,
): AdminModerationReporterSummary | null {
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) {
    return null;
  }

  return {
    id,
    displayName: typeof row.displayName === "string" ? row.displayName : null,
    reportCount: Number(row.reportCount ?? 0),
  };
}

function parseChatAccess(value: unknown): AdminModerationChatAccess {
  const row = (value ?? {}) as Record<string, unknown>;
  const roomIds = Array.isArray(row.roomIds)
    ? row.roomIds.filter((id): id is string => typeof id === "string")
    : [];
  const roomId =
    typeof row.roomId === "string"
      ? row.roomId
      : roomIds.length > 0
        ? roomIds[0]
        : null;

  return {
    available: row.available === true || roomIds.length > 0,
    roomId,
    roomIds,
    requiredForCategory: row.requiredForCategory === true,
    evidenceSufficient: row.evidenceSufficient !== false,
  };
}

function parseAuditRow(value: unknown): AdminModerationAuditRow | null {
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  const action = typeof row.action === "string" ? row.action : null;
  const adminId = typeof row.adminId === "string" ? row.adminId : null;
  const createdAt = typeof row.createdAt === "string" ? row.createdAt : null;
  if (!id || !action || !adminId || !createdAt) {
    return null;
  }

  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};

  return {
    id,
    action,
    adminId,
    adminDisplayName:
      typeof row.adminDisplayName === "string" ? row.adminDisplayName : null,
    payload,
    createdAt,
  };
}

function parseChatMessageRow(value: unknown): AdminModerationChatMessage | null {
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  const senderId = typeof row.senderId === "string" ? row.senderId : null;
  const content = typeof row.content === "string" ? row.content : null;
  const createdAt = typeof row.createdAt === "string" ? row.createdAt : null;
  if (!id || !senderId || content === null || !createdAt) {
    return null;
  }

  return {
    id,
    senderId,
    senderDisplayName:
      typeof row.senderDisplayName === "string" ? row.senderDisplayName : null,
    content,
    createdAt,
    isSystemWarning: row.isSystemWarning === true,
    offerId: typeof row.offerId === "string" ? row.offerId : null,
    memberOrderId:
      typeof row.memberOrderId === "string" ? row.memberOrderId : null,
    merchantOrderId:
      typeof row.merchantOrderId === "string" ? row.merchantOrderId : null,
  };
}

function parseChatThreadPayload(data: unknown): AdminModerationChatThread | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;
  const roomId = typeof payload.roomId === "string" ? payload.roomId : null;
  if (!roomId) {
    return null;
  }

  const messages = (Array.isArray(payload.messages) ? payload.messages : [])
    .map(parseChatMessageRow)
    .filter((row): row is AdminModerationChatMessage => row !== null);

  return {
    roomId,
    messages,
    hasMore: payload.hasMore === true,
    nextBefore:
      typeof payload.nextBefore === "string" ? payload.nextBefore : null,
  };
}

function parseOrderSummaryRow(
  value: unknown,
): AdminModerationOrderSummary | null {
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  const persona = row.persona;
  if (!id || (persona !== "member" && persona !== "merchant")) {
    return null;
  }

  return {
    id,
    persona,
    orderNumber: typeof row.orderNumber === "string" ? row.orderNumber : null,
    finalPrice: Number(row.finalPrice ?? 0),
    totalAmount:
      row.totalAmount === null || row.totalAmount === undefined
        ? null
        : Number(row.totalAmount),
    status: typeof row.status === "string" ? row.status : null,
    escrowStatus:
      typeof row.escrowStatus === "string" ? row.escrowStatus : null,
    inboundTrackingNo:
      typeof row.inboundTrackingNo === "string" ? row.inboundTrackingNo : null,
    outboundTrackingNo:
      typeof row.outboundTrackingNo === "string" ? row.outboundTrackingNo : null,
    paidAt: typeof row.paidAt === "string" ? row.paidAt : null,
    buyerConfirmedAt:
      typeof row.buyerConfirmedAt === "string" ? row.buyerConfirmedAt : null,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
    source: typeof row.source === "string" ? row.source : null,
    useAuthentication: row.useAuthentication === true,
    requiresAuthentication: row.requiresAuthentication === true,
    payoutHoldUntil:
      typeof row.payoutHoldUntil === "string" ? row.payoutHoldUntil : null,
    payoutStatus: typeof row.payoutStatus === "string" ? row.payoutStatus : null,
    sellerPayoutStatus:
      typeof row.sellerPayoutStatus === "string" ? row.sellerPayoutStatus : null,
    authResult: typeof row.authResult === "string" ? row.authResult : null,
    refundStatus: typeof row.refundStatus === "string" ? row.refundStatus : null,
    orderKind: typeof row.orderKind === "string" ? row.orderKind : null,
    refundEligible: row.refundEligible === true,
    refundIneligibleReason:
      typeof row.refundIneligibleReason === "string"
        ? row.refundIneligibleReason
        : null,
    refundWindowEndsAt:
      typeof row.refundWindowEndsAt === "string" ? row.refundWindowEndsAt : null,
  };
}

function parseSanctionRow(value: unknown): AdminAccountSanctionRow | null {
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  const scope = row.scope;
  const type = row.type;
  const startsAt = typeof row.startsAt === "string" ? row.startsAt : null;
  if (!id || typeof scope !== "string" || typeof type !== "string" || !startsAt) {
    return null;
  }

  return {
    id,
    scope: scope as SanctionScope,
    type: type as SanctionType,
    startsAt,
    endsAt: typeof row.endsAt === "string" ? row.endsAt : null,
    reason: typeof row.reason === "string" ? row.reason : null,
    caseId: typeof row.caseId === "string" ? row.caseId : null,
  };
}

function parseCaseDetail(value: unknown): AdminModerationCaseDetail | null {
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  const caseNumber = typeof row.caseNumber === "string" ? row.caseNumber : null;
  const status = row.status;
  if (
    !id ||
    !caseNumber ||
    typeof status !== "string" ||
    typeof row.createdAt !== "string" ||
    typeof row.updatedAt !== "string"
  ) {
    return null;
  }

  const subjectRaw = (row.subject ?? {}) as Record<string, unknown>;
  return {
    id,
    caseNumber,
    status: status as AdminModerationCaseDetail["status"],
    primaryCategory: toCategorySlug(row.primaryCategory),
    autoScore: Number(row.autoScore ?? 0),
    adminAdjustment: Number(row.adminAdjustment ?? 0),
    finalScore:
      row.finalScore === null || row.finalScore === undefined
        ? null
        : Number(row.finalScore),
    adjustmentReason:
      typeof row.adjustmentReason === "string" ? row.adjustmentReason : null,
    resolution:
      typeof row.resolution === "string"
        ? (row.resolution as ModerationResolution)
        : null,
    violationPersona:
      typeof row.violationPersona === "string"
        ? (row.violationPersona as ViolationPersona)
        : null,
    resolvedAt: typeof row.resolvedAt === "string" ? row.resolvedAt : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    subject: {
      id: String(subjectRaw.id ?? ""),
      displayName:
        typeof subjectRaw.displayName === "string"
          ? subjectRaw.displayName
          : null,
      username:
        typeof subjectRaw.username === "string" ? subjectRaw.username : null,
      role: typeof subjectRaw.role === "string" ? subjectRaw.role : null,
    },
  };
}

function parseBundlePayload(data: unknown): AdminModerationCaseBundle | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;
  const caseDetail = parseCaseDetail(payload.case);
  if (!caseDetail) {
    return null;
  }

  const reports = (Array.isArray(payload.reports) ? payload.reports : [])
    .map(parseReportRow)
    .filter((row): row is AdminModerationReportRow => row !== null);

  const attachments = (Array.isArray(payload.attachments) ? payload.attachments : [])
    .map(parseAttachmentRow)
    .filter((row): row is AdminReportAttachmentRow => row !== null);

  const reporterSummaries = (
    Array.isArray(payload.reporterSummaries) ? payload.reporterSummaries : []
  )
    .map(parseReporterSummary)
    .filter((row): row is AdminModerationReporterSummary => row !== null);

  const auditLog = (Array.isArray(payload.auditLog) ? payload.auditLog : [])
    .map(parseAuditRow)
    .filter((row): row is AdminModerationAuditRow => row !== null);

  const activeSanctions = (
    Array.isArray(payload.activeSanctions) ? payload.activeSanctions : []
  )
    .map(parseSanctionRow)
    .filter((row): row is AdminAccountSanctionRow => row !== null);

  const relatedOrders = (
    Array.isArray(payload.relatedOrders) ? payload.relatedOrders : []
  )
    .map(parseOrderSummaryRow)
    .filter((row): row is AdminModerationOrderSummary => row !== null);

  return {
    case: caseDetail,
    reports,
    attachments,
    reporterSummaries,
    chatAccess: parseChatAccess(payload.chatAccess),
    relatedOrders,
    activeSanctions,
    auditLog,
  };
}

function normalizeSearchStatus(
  status: AdminModerationSearchStatus | undefined,
): string {
  if (!status || status === "all") {
    return "all";
  }
  return status;
}

export async function searchAdminModerationCases(
  input: SearchAdminModerationCasesInput = {},
): Promise<ActionResult<AdminModerationSearchResult>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const supabase = await createClient();
    const rpcClient = asAdminModerationRpcClient(supabase);
    const { data, error } = await rpcClient.rpc("search_admin_moderation_cases", {
      p_status: normalizeSearchStatus(input.status),
      p_category: input.category ?? undefined,
      p_min_score: input.minScore ?? undefined,
      p_search: input.search?.trim() || undefined,
      p_page: input.page ?? 1,
      p_page_size: input.pageSize ?? 20,
    });

    if (error) {
      console.error("[searchAdminModerationCases]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const parsed = parseSearchPayload(data);
    if (!parsed) {
      return { success: false, error: "無法載入仲裁佇列" };
    }

    await enrichModerationSubjectPreviews(
      supabase,
      parsed.rows.map((row) => ({ subject: row.subject })),
    );

    return { success: true, data: parsed };
  } catch (error) {
    console.error("[searchAdminModerationCases]", error);
    return { success: false, error: "無法載入仲裁佇列" };
  }
}

export async function getAdminModerationCase(
  caseId: string,
): Promise<ActionResult<AdminModerationCaseBundle>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const trimmedCaseId = caseId.trim();
  if (!trimmedCaseId) {
    return { success: false, error: "找不到案件" };
  }

  try {
    const supabase = await createClient();
    const rpcClient = asAdminModerationRpcClient(supabase);
    const { data, error } = await rpcClient.rpc(
      "admin_get_moderation_case_bundle",
      { p_case_id: trimmedCaseId },
    );

    if (error) {
      console.error("[getAdminModerationCase]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const parsed = parseBundlePayload(data);
    if (!parsed) {
      return { success: false, error: "找不到案件" };
    }

    await enrichModerationSubjectPreviews(supabase, [
      {
        subject: parsed.case.subject,
        violationPersona: parsed.case.violationPersona,
        profileRole: parsed.case.subject.role,
      },
    ]);

    return { success: true, data: parsed };
  } catch (error) {
    console.error("[getAdminModerationCase]", error);
    return { success: false, error: "無法載入案件詳情" };
  }
}

export async function getAdminSubjectModerationHistory(input: {
  subjectUserId: string;
  excludeCaseId?: string;
}): Promise<ActionResult<AdminSubjectModerationHistory>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const subjectUserId = input.subjectUserId.trim();
  if (!subjectUserId) {
    return { success: false, error: "無效的被舉報人" };
  }

  try {
    const supabase = asAdminModerationRpcClient(await createClient());
    const { data, error } = await supabase.rpc(
      "admin_get_subject_moderation_history",
      {
        p_subject_user_id: subjectUserId,
        p_exclude_case_id: input.excludeCaseId?.trim() || undefined,
        p_case_limit: 10,
        p_sanction_limit: 20,
      },
    );

    if (error) {
      console.error("[getAdminSubjectModerationHistory]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const parsed = parseSubjectHistory(data);
    if (!parsed) {
      return { success: false, error: "無法載入歷史檔案" };
    }

    return { success: true, data: parsed };
  } catch (error) {
    console.error("[getAdminSubjectModerationHistory]", error);
    return { success: false, error: "無法載入歷史檔案" };
  }
}

export async function getAdminModerationChatThread(input: {
  caseId: string;
  roomId: string;
  before?: string;
  limit?: number;
}): Promise<ActionResult<AdminModerationChatThread>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const caseId = input.caseId.trim();
  const roomId = input.roomId.trim();
  if (!caseId || !roomId) {
    return { success: false, error: "無法調閱此聊天室" };
  }

  try {
    const supabase = asAdminModerationRpcClient(await createClient());
    const { data, error } = await supabase.rpc("admin_get_moderation_chat_thread", {
      p_case_id: caseId,
      p_room_id: roomId,
      p_limit: input.limit ?? 50,
      p_before: input.before?.trim() || undefined,
    });

    if (error) {
      console.error("[getAdminModerationChatThread]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const parsed = parseChatThreadPayload(data);
    if (!parsed) {
      return { success: false, error: "無法載入聊天紀錄" };
    }

    return { success: true, data: parsed };
  } catch (error) {
    console.error("[getAdminModerationChatThread]", error);
    return { success: false, error: "無法載入聊天紀錄" };
  }
}

function buildResolvePayload(
  input: ResolveAdminModerationCaseInput,
): Database["public"]["Functions"]["rpc_resolve_moderation_case"]["Args"]["p_payload"] {
  const payload: Record<string, unknown> = {
    resolution: input.resolution,
  };

  if (input.violationPersona) {
    payload.violationPersona = input.violationPersona;
  }
  if (input.adjustment !== undefined && input.adjustment !== 0) {
    payload.adjustment = input.adjustment;
    payload.adjustmentReason = input.adjustmentReason ?? "";
  }
  if (input.evidenceOverrideReason?.trim()) {
    payload.evidenceOverrideReason = input.evidenceOverrideReason.trim();
  }
  if (input.sanction) {
    payload.sanction = {
      scope: input.sanction.scope,
      type: input.sanction.type,
      endsAt: input.sanction.endsAt,
      reason: input.sanction.reason,
    };
  }
  payload.notifyReporter = input.notifyReporter !== false;

  if (input.orderRefund?.enabled) {
    const { orderRefund } = input;
    if (!isGradingFaultParty(orderRefund.faultParty)) {
      throw new Error("無效的退款責任方");
    }
    if (
      orderRefund.faultParty === "carrier" &&
      orderRefund.carrierLiabilityParty !== "seller" &&
      orderRefund.carrierLiabilityParty !== "platform"
    ) {
      throw new Error("物流責任必須指定承擔方");
    }

    payload.orderRefund = {
      enabled: true,
      orderId: orderRefund.orderId,
      faultParty: orderRefund.faultParty,
      ...(orderRefund.platformFaultReason?.trim()
        ? { platformFaultReason: orderRefund.platformFaultReason.trim() }
        : {}),
      ...(orderRefund.faultParty === "carrier" && orderRefund.carrierLiabilityParty
        ? { carrierLiabilityParty: orderRefund.carrierLiabilityParty }
        : {}),
    };
  }

  return payload as Database["public"]["Functions"]["rpc_resolve_moderation_case"]["Args"]["p_payload"];
}

export async function adjustAdminModerationCaseScore(input: {
  caseId: string;
  adjustment: number;
  reason?: string;
}): Promise<ActionResult<{ caseId: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const caseId = input.caseId.trim();
  if (!caseId) {
    return { success: false, error: "找不到案件" };
  }

  try {
    const supabase = asAdminModerationRpcClient(await createClient());
    const { data, error } = await supabase.rpc("rpc_adjust_moderation_case_score", {
      p_case_id: caseId,
      p_adjustment: input.adjustment,
      p_reason: input.reason?.trim() || undefined,
    });

    if (error) {
      console.error("[adjustAdminModerationCaseScore]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const payload = data as Record<string, unknown> | null;
    if (!payload || payload.success !== true) {
      return { success: false, error: "無法調整分數" };
    }

    return {
      success: true,
      data: { caseId: typeof payload.caseId === "string" ? payload.caseId : caseId },
    };
  } catch (error) {
    console.error("[adjustAdminModerationCaseScore]", error);
    return { success: false, error: "無法調整分數" };
  }
}

export async function requestAdminModerationEvidence(input: {
  caseId: string;
  targetRole: "subject" | "reporter";
  message?: string;
}): Promise<ActionResult<{ caseId: string; targetUserId: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const caseId = input.caseId.trim();
  if (!caseId) {
    return { success: false, error: "找不到案件" };
  }

  if (input.targetRole !== "subject" && input.targetRole !== "reporter") {
    return { success: false, error: "無效的通知對象" };
  }

  try {
    const supabase = await createClient();
    const { data: caseRow, error: caseError } = await supabase
      .from("moderation_cases")
      .select("case_number, subject_user_id")
      .eq("id", caseId)
      .maybeSingle<{ case_number: string | null; subject_user_id: string }>();

    if (caseError) {
      console.error("[requestAdminModerationEvidence] case lookup", caseError.message);
      return { success: false, error: "無法載入案件" };
    }

    if (!caseRow?.subject_user_id) {
      return { success: false, error: "找不到案件" };
    }

    let targetUserId = caseRow.subject_user_id;
    if (input.targetRole === "reporter") {
      const { data: reportRow, error: reportError } = await supabase
        .from("reports")
        .select("reporter_id")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<{ reporter_id: string }>();

      if (reportError || !reportRow?.reporter_id) {
        console.error(
          "[requestAdminModerationEvidence] reporter lookup",
          reportError?.message,
        );
        return { success: false, error: "找不到舉報人" };
      }
      targetUserId = reportRow.reporter_id;
    }

    await enqueueModerationEvidenceRequestEmail({
      caseId,
      targetUserId,
      caseNumber: caseRow.case_number,
      message: input.message,
    });

    return {
      success: true,
      data: { caseId, targetUserId },
    };
  } catch (error) {
    console.error("[requestAdminModerationEvidence]", error);
    return { success: false, error: "無法發送證據補充通知" };
  }
}

export async function resolveAdminModerationCase(input: {
  caseId: string;
} & ResolveAdminModerationCaseInput): Promise<
  ActionResult<{
    caseId: string;
    status: string;
    resolution: string;
    authBanWarning?: string;
    refundWarning?: string;
  }>
> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const caseId = input.caseId.trim();
  if (!caseId) {
    return { success: false, error: "找不到案件" };
  }

  try {
    const supabase = asAdminModerationRpcClient(await createClient());
    const { data, error } = await supabase.rpc("rpc_resolve_moderation_case", {
      p_case_id: caseId,
      p_payload: buildResolvePayload(input),
    });

    if (error) {
      console.error("[resolveAdminModerationCase]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const payload = data as Record<string, unknown> | null;
    if (!payload || payload.success !== true) {
      return { success: false, error: "無法完成裁定" };
    }

    let authBanWarning: string | undefined;
    let refundWarning: string | undefined;

    if (payload.orderRefundPrepared === true) {
      const prepared = parsePrepareModerationOrderRefundPayload({
        success: true,
        orderKind: payload.orderKind,
        orderId: payload.orderId,
        paymentIntentId: payload.paymentIntentId,
        refundCents: payload.refundCents,
        settlementRequired: payload.settlementRequired,
        feeRecoveryMode: payload.feeRecoveryMode,
        faultParty: payload.faultParty,
      });

      if (prepared) {
        const orderKind =
          prepared.orderKind === "member_auth" ? "member" : "merchant";
        await enqueueRefundApprovedEmail({
          orderKind,
          orderId: prepared.orderId,
          caseId,
          refundCents: prepared.refundCents,
        });

        const sagaResult = await runModerationOrderRefundSaga({
          caseId,
          prepared,
        });
        if (!sagaResult.ok) {
          refundWarning = `案件已裁定，但售後退款失敗：${sagaResult.error}`;
          await enqueueRefundFailedEmail({
            orderKind,
            orderId: prepared.orderId,
            caseId,
            errorMessage: sagaResult.error,
          });
        }
      } else {
        refundWarning = "案件已裁定，但售後退款準備資料無效";
      }
    }

    if (input.sanction?.type === "ban" && input.sanction.scope === "account") {
      const subjectClient = await createClient();
      const { data: caseRow, error: caseError } = await subjectClient
        .from("moderation_cases")
        .select("subject_user_id")
        .eq("id", caseId)
        .maybeSingle<{ subject_user_id: string }>();

      if (caseError) {
        console.error("[resolveAdminModerationCase] subject lookup", caseError.message);
      } else if (caseRow?.subject_user_id) {
        const banResult = await applySupabaseAuthBan(caseRow.subject_user_id);
        if (!banResult.ok) {
          console.error("[resolveAdminModerationCase] auth ban", banResult.error);
          authBanWarning = "案件已裁定，但 Auth 永久封禁未能完成";
        }
      }
    }

    const resolution =
      typeof payload.resolution === "string" ? payload.resolution : input.resolution;

    await enqueueModerationReportOutcomeEmails({
      caseId,
      resolution,
      notifyReporter: input.notifyReporter,
    });

    await enqueueModerationResolveFollowUpEmails({
      caseId,
      resolution,
      sanction: input.sanction,
    });

    return {
      success: true,
      data: {
        caseId: typeof payload.caseId === "string" ? payload.caseId : caseId,
        status: typeof payload.status === "string" ? payload.status : "",
        resolution,
        ...(authBanWarning ? { authBanWarning } : {}),
        ...(refundWarning ? { refundWarning } : {}),
      },
    };
  } catch (error) {
    console.error("[resolveAdminModerationCase]", error);
    return { success: false, error: "無法完成裁定" };
  }
}

export async function previewModerationOrderRefund(input: {
  orderId: string;
  faultParty: GradingFaultParty;
  platformFaultReason?: string;
  carrierLiabilityParty?: "seller" | "platform";
}): Promise<ActionResult<ModerationRefundBreakdownPreview>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const orderId = input.orderId.trim();
  if (!orderId) {
    return { success: false, error: "請選擇退款訂單" };
  }

  if (!isGradingFaultParty(input.faultParty)) {
    return { success: false, error: "無效的退款責任方" };
  }

  if (
    input.faultParty === "carrier" &&
    input.carrierLiabilityParty !== "seller" &&
    input.carrierLiabilityParty !== "platform"
  ) {
    return { success: false, error: "物流責任必須指定承擔方" };
  }

  if (
    input.faultParty === "platform" &&
    !input.platformFaultReason?.trim()
  ) {
    return { success: false, error: "平台責任退款必須填寫原因" };
  }

  try {
    const supabase = asAdminModerationRpcClient(await createClient());
    const { data, error } = await supabase.rpc(
      "fn_preview_moderation_order_refund_breakdown",
      {
        p_order_id: orderId,
        p_fault_party: input.faultParty,
        p_platform_fault_reason: input.platformFaultReason?.trim() || undefined,
        p_carrier_liability_party:
          input.faultParty === "carrier"
            ? input.carrierLiabilityParty
            : undefined,
      },
    );

    if (error) {
      console.error("[previewModerationOrderRefund]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const preview = parseModerationRefundBreakdownPreview(data);
    if (!preview) {
      return { success: false, error: "無法解析退款預覽" };
    }

    return { success: true, data: preview };
  } catch (error) {
    console.error("[previewModerationOrderRefund]", error);
    return { success: false, error: "無法載入退款預覽" };
  }
}

export async function retryModerationOrderRefund(input: {
  caseId: string;
  orderId: string;
}): Promise<ActionResult<{ caseId: string; orderId: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const caseId = input.caseId.trim();
  const orderId = input.orderId.trim();
  if (!caseId || !orderId) {
    return { success: false, error: "參數無效" };
  }

  try {
    const sagaResult = await runModerationOrderRefundRetry({ caseId, orderId });
    if (!sagaResult.ok) {
      return { success: false, error: sagaResult.error };
    }

    return { success: true, data: { caseId, orderId } };
  } catch (error) {
    console.error("[retryModerationOrderRefund]", error);
    return { success: false, error: "重試退款失敗" };
  }
}
