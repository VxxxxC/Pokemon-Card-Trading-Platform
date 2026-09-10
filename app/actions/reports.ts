"use server";

import { isDbChatRoomId } from "@/app/lib/chat/constants";
import {
  isChatEvidenceRequiredForCategory,
  resolveReportCategoryInput,
} from "@/lib/moderation/category-config";
import { REPORT_EVIDENCE_MAX_COUNT } from "@/lib/moderation/report-evidence-files";
import type {
  ModerationResolution,
  ReportOutcomeNotification,
  SubmitUserReportRpcResult,
} from "@/lib/moderation/types";
import { reportOutcomeMessage } from "@/lib/moderation/report-outcome-copy";
import { enqueueModerationReportReceivedEmail } from "@/lib/notifications/moderation-emails";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAuthUser } from "@/lib/auth/mutation-guard";
import type { Database, Tables } from "@/types/supabase";

const MAX_REPORT_DETAILS_LENGTH = 2000;

const PROFILE_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SubmitUserReportInput = {
  reportedUserId: string;
  category: string;
  details?: string;
  chatRoomId?: string;
  attachmentIds?: string[];
};

export type SubmitUserReportResult =
  | {
      success: true;
      data: { reportId: string; caseId: string; caseNumber: string };
    }
  | { success: false; error: string };

type SubmitReportRpcArgs =
  Database["public"]["Functions"]["rpc_submit_user_report_v2"]["Args"];

type SubmitReportRpcClient = {
  rpc(
    fn: "rpc_submit_user_report_v2",
    args: SubmitReportRpcArgs,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function asSubmitReportRpcClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
): SubmitReportRpcClient {
  return supabase as unknown as SubmitReportRpcClient;
}

type ChatRoomPartyRow = Pick<Tables<"chat_rooms">, "buyer_id" | "seller_id">;

function isValidProfileId(value: string): boolean {
  return PROFILE_ID_UUID_RE.test(value.trim());
}

function mapReportRpcError(message: string): string {
  if (message.includes("您已在此對話提交過待審核的舉報")) {
    return "您已在此對話提交過待審核的舉報，請等待處理結果";
  }

  if (message.includes("您已在此用戶公開資料提交過同類別的待審核舉報")) {
    return "您已在此用戶公開資料提交過同類別的待審核舉報，請等待處理結果";
  }

  if (
    message.includes("idx_reports_pending_reporter_target_profile_category")
  ) {
    return "您已在此用戶公開資料提交過同類別的待審核舉報，請等待處理結果";
  }

  if (message.includes("idx_reports_pending_reporter_target_chat_room")) {
    return "您已在此對話提交過待審核的舉報，請等待處理結果";
  }

  if (message.includes("idx_reports_pending_reporter_target")) {
    return "您已對該用戶提交過待審核的舉報，請等待處理結果";
  }

  if (message.includes("請在對話內使用舉報功能")) {
    return "請在對話內使用舉報功能";
  }

  if (message.includes("請先登入")) {
    return "請先登入";
  }

  if (message.includes("無效的舉報對象")) {
    return "無效的舉報對象";
  }

  if (message.includes("無法舉報此對話中的用戶")) {
    return "無法舉報此對話中的用戶";
  }

  if (message.includes("無法驗證聊天室")) {
    return "無法驗證聊天室，請稍後再試";
  }

  if (message.includes("找不到被舉報的用戶")) {
    return "找不到被舉報的用戶";
  }

  if (
    message.includes("無效的證據附件") ||
    message.includes("證據圖片不可超過")
  ) {
    return message.includes("證據圖片不可超過")
      ? "證據圖片不可超過 3 張"
      : "無效的證據附件";
  }

  if (message.includes("violates row-level security")) {
    return "無法提交舉報，請確認登入狀態後再試";
  }

  return "提交舉報時發生錯誤，請稍後再試";
}

export async function submitUserReport(
  input: SubmitUserReportInput,
): Promise<SubmitUserReportResult> {
  const reportedUserId = input.reportedUserId.trim();
  const categoryInput = input.category.trim();
  const details = input.details?.trim() ?? "";
  const chatRoomId = input.chatRoomId?.trim() ?? "";
  const attachmentIds = input.attachmentIds ?? [];

  if (!categoryInput) {
    return { success: false, error: "請選擇舉報事項類別" };
  }

  const categorySlug = resolveReportCategoryInput(categoryInput);
  if (!categorySlug) {
    return { success: false, error: "無效的舉報類別" };
  }

  if (!isValidProfileId(reportedUserId)) {
    return { success: false, error: "無效的舉報對象" };
  }

  if (details.length > MAX_REPORT_DETAILS_LENGTH) {
    return {
      success: false,
      error: `詳細說明不可超過 ${MAX_REPORT_DETAILS_LENGTH} 字`,
    };
  }

  if (attachmentIds.length > REPORT_EVIDENCE_MAX_COUNT) {
    return {
      success: false,
      error: `證據圖片不可超過 ${REPORT_EVIDENCE_MAX_COUNT} 張`,
    };
  }

  const uniqueAttachmentIds = [...new Set(attachmentIds.map((id) => id.trim()))];
  if (uniqueAttachmentIds.length !== attachmentIds.length) {
    return { success: false, error: "無效的證據附件" };
  }

  for (const attachmentId of uniqueAttachmentIds) {
    if (!isValidProfileId(attachmentId)) {
      return { success: false, error: "無效的證據附件" };
    }
  }

  if (isChatEvidenceRequiredForCategory(categorySlug) && !chatRoomId) {
    return { success: false, error: "請在對話內使用舉報功能" };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: "服務尚未設定" };
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { user, supabase } = auth;

    if (reportedUserId === user.id) {
      return { success: false, error: "無法舉報自己" };
    }

    if (chatRoomId) {
      if (!isDbChatRoomId(chatRoomId)) {
        return { success: false, error: "對話尚未建立，無法舉報" };
      }

      const { data: room, error: roomError } = await supabase
        .from("chat_rooms")
        .select("buyer_id, seller_id")
        .eq("id", chatRoomId)
        .maybeSingle<ChatRoomPartyRow>();

      if (roomError || !room) {
        return { success: false, error: "無法驗證聊天室，請稍後再試" };
      }

      const isParty =
        room.buyer_id === user.id || room.seller_id === user.id;
      const counterpartyId =
        room.buyer_id === user.id ? room.seller_id : room.buyer_id;

      if (!isParty || counterpartyId !== reportedUserId) {
        return { success: false, error: "無法舉報此對話中的用戶" };
      }
    } else {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", reportedUserId)
        .maybeSingle<{ id: string }>();

      if (profileError || !profile) {
        return { success: false, error: "找不到被舉報的用戶" };
      }
    }

    const rpcArgs: SubmitReportRpcArgs = {
      p_target_id: reportedUserId,
      p_category: categorySlug,
      p_details: details,
    };

    if (chatRoomId) {
      rpcArgs.p_chat_room_id = chatRoomId;
    }

    if (uniqueAttachmentIds.length > 0) {
      rpcArgs.p_attachment_ids = uniqueAttachmentIds;
    }

    const { data, error } = await asSubmitReportRpcClient(supabase).rpc(
      "rpc_submit_user_report_v2",
      rpcArgs,
    );

    if (error) {
      console.error("[submitUserReport]", error.message);
      return { success: false, error: mapReportRpcError(error.message) };
    }

    const payload = data as SubmitUserReportRpcResult | null;
    if (
      !payload?.report_id ||
      !payload.case_id ||
      !payload.case_number
    ) {
      return { success: false, error: "提交舉報回傳資料格式異常" };
    }

    await enqueueModerationReportReceivedEmail({
      reporterId: user.id,
      reportId: payload.report_id,
      caseNumber: payload.case_number,
    });

    return {
      success: true,
      data: {
        reportId: payload.report_id,
        caseId: payload.case_id,
        caseNumber: payload.case_number,
      },
    };
  } catch (error) {
    console.error("[submitUserReport]", error);
    return { success: false, error: "提交舉報時發生錯誤" };
  }
}

export type GetUnacknowledgedReportOutcomesResult =
  | { success: true; data: ReportOutcomeNotification[] }
  | { success: false; error: string };

type ReportOutcomeRpcClient = {
  rpc(
    fn: "get_unacknowledged_report_outcomes_for_me",
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "acknowledge_report_outcomes",
    args: { p_report_ids: string[] },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function asReportOutcomeRpcClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
): ReportOutcomeRpcClient {
  return supabase as unknown as ReportOutcomeRpcClient;
}

function parseReportOutcomeNotifications(
  data: unknown,
): ReportOutcomeNotification[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const row = entry as Record<string, unknown>;
    const reportId = typeof row.reportId === "string" ? row.reportId : null;
    const caseId = typeof row.caseId === "string" ? row.caseId : null;
    const caseNumber = typeof row.caseNumber === "string" ? row.caseNumber : null;
    if (!reportId || !caseId || !caseNumber) {
      return [];
    }
    const resolution =
      typeof row.resolution === "string"
        ? (row.resolution as ModerationResolution)
        : null;
    return [
      {
        reportId,
        caseId,
        caseNumber,
        resolution,
        resolvedAt:
          typeof row.resolvedAt === "string" ? row.resolvedAt : null,
        message: reportOutcomeMessage(resolution),
      },
    ];
  });
}

export async function getUnacknowledgedReportOutcomes(): Promise<GetUnacknowledgedReportOutcomesResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "請先登入" };
  }

  try {
    const { data, error } = await asReportOutcomeRpcClient(supabase).rpc(
      "get_unacknowledged_report_outcomes_for_me",
    );

    if (error) {
      console.error("[getUnacknowledgedReportOutcomes]", error.message);
      return { success: false, error: "無法載入舉報結果通知" };
    }

    return { success: true, data: parseReportOutcomeNotifications(data) };
  } catch (error) {
    console.error("[getUnacknowledgedReportOutcomes]", error);
    return { success: false, error: "無法載入舉報結果通知" };
  }
}

export async function acknowledgeReportOutcomes(
  reportIds: string[],
): Promise<{ success: true; updated: number } | { success: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  const uniqueIds = [...new Set(reportIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { success: true, updated: 0 };
  }

  const auth = await requireActiveAuthUser();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const { supabase } = auth;

  try {
    const { data, error } = await asReportOutcomeRpcClient(supabase).rpc(
      "acknowledge_report_outcomes",
      { p_report_ids: uniqueIds },
    );

    if (error) {
      console.error("[acknowledgeReportOutcomes]", error.message);
      return { success: false, error: "無法確認通知" };
    }

    const payload = data as Record<string, unknown> | null;
    return {
      success: true,
      updated: Number(payload?.updated ?? 0),
    };
  } catch (error) {
    console.error("[acknowledgeReportOutcomes]", error);
    return { success: false, error: "無法確認通知" };
  }
}
