import type { SubmitUserReportInput } from "@/app/actions/reports";
import { createServiceRoleClient } from "../../shared/supabase-admin";

export const MATRIX_PREFIX = "Vitest Moderation";

export function uniqueDetails(caseId: string, runId: string): string {
  return `${MATRIX_PREFIX} ${runId} ${caseId}`;
}

export function buildProfileReportInput(params: {
  sellerId: string;
  details: string;
  category?: string;
}): SubmitUserReportInput {
  return {
    reportedUserId: params.sellerId,
    category: params.category ?? "fraud",
    details: params.details,
  };
}

export function buildChatReportInput(params: {
  sellerId: string;
  chatRoomId: string;
  details: string;
  category?: string;
}): SubmitUserReportInput {
  return {
    reportedUserId: params.sellerId,
    category: params.category ?? "fraud",
    details: params.details,
    chatRoomId: params.chatRoomId,
  };
}

export async function ensureDbChatRoom(
  buyerId: string,
  sellerId: string,
): Promise<string> {
  const admin = createServiceRoleClient();

  const { data: existingRows, error: selectError } = await admin
    .from("chat_rooms")
    .select("id")
    .eq("buyer_id", buyerId)
    .eq("seller_id", sellerId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (selectError) {
    throw new Error(`[ensureDbChatRoom] ${selectError.message}`);
  }

  const existing = existingRows?.[0];

  if (existing?.id) {
    return existing.id;
  }

  const { data: created, error: insertError } = await admin
    .from("chat_rooms")
    .insert({ buyer_id: buyerId, seller_id: sellerId })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(`[ensureDbChatRoom] ${insertError.message}`);
  }

  return created.id;
}

export async function insertChatMessageProbe(params: {
  roomId: string;
  senderId: string;
  content: string;
}): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.from("chat_messages").insert({
    room_id: params.roomId,
    sender_id: params.senderId,
    content: params.content,
    is_system_warning: false,
  });

  if (error) {
    throw new Error(`[insertChatMessageProbe] ${error.message}`);
  }
}
