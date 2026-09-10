import { createServiceRoleClient } from "../../shared/supabase-admin";
import { MATRIX_PREFIX } from "./fixtures";

export async function deleteAccountSanctionsForUser(userId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.from("account_sanctions").delete().eq("user_id", userId);
  if (error) {
    throw new Error(`[deleteAccountSanctionsForUser] ${error.message}`);
  }
}

export async function deleteReportAttachmentsForReporter(
  reporterId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("report_attachments")
    .delete()
    .eq("reporter_id", reporterId);
  if (error) {
    throw new Error(`[deleteReportAttachmentsForReporter] ${error.message}`);
  }
}

export async function deleteReportsForPair(params: {
  reporterId: string;
  subjectId: string;
}): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("reports")
    .delete()
    .eq("reporter_id", params.reporterId)
    .eq("target_id", params.subjectId);
  if (error) {
    throw new Error(`[deleteReportsForPair] ${error.message}`);
  }
}

export async function deleteModerationCasesForSubject(
  subjectId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("moderation_cases")
    .delete()
    .eq("subject_user_id", subjectId);
  if (error) {
    throw new Error(`[deleteModerationCasesForSubject] ${error.message}`);
  }
}

export async function deleteMatrixProbeChatMessages(
  roomId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("chat_messages")
    .delete()
    .eq("room_id", roomId)
    .like("content", `${MATRIX_PREFIX}%`);

  if (error?.message.includes("permission denied")) {
    return;
  }

  if (error) {
    throw new Error(`[deleteMatrixProbeChatMessages] ${error.message}`);
  }
}

export async function deleteMatrixTestListingsForSeller(
  sellerId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("listings")
    .delete()
    .eq("seller_id", sellerId)
    .like("seller_description", `${MATRIX_PREFIX}%`);

  if (error) {
    if (
      error.message.includes("permission denied") ||
      error.message.includes("foreign key")
    ) {
      const { error: deactivateError } = await admin
        .from("listings")
        .update({ status: "inactive" })
        .eq("seller_id", sellerId)
        .like("seller_description", `${MATRIX_PREFIX}%`);

      if (deactivateError && !deactivateError.message.includes("permission denied")) {
        throw new Error(
          `[deleteMatrixTestListingsForSeller:deactivate] ${deactivateError.message}`,
        );
      }
      return;
    }
    throw new Error(`[deleteMatrixTestListingsForSeller] ${error.message}`);
  }
}

export async function deleteMatrixTestOrdersForSeller(
  sellerId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { data: listingRows, error: listingError } = await admin
    .from("listings")
    .select("id")
    .eq("seller_id", sellerId)
    .like("seller_description", `${MATRIX_PREFIX}%`);

  if (listingError) {
    throw new Error(`[deleteMatrixTestOrdersForSeller:listings] ${listingError.message}`);
  }

  const listingIds = (listingRows ?? []).map((row) => row.id);
  if (listingIds.length === 0) {
    return;
  }

  const { error: orderError } = await admin
    .from("member_orders")
    .delete()
    .in("listing_id", listingIds);

  if (orderError) {
    if (orderError.message.includes("permission denied")) {
      return;
    }
    throw new Error(`[deleteMatrixTestOrdersForSeller:orders] ${orderError.message}`);
  }
}

export async function releasePhaseHStripeRefundIds(): Promise<void> {
  const admin = createServiceRoleClient();
  const pattern = "re_phase_h_%";

  for (const table of ["member_orders", "merchant_orders"] as const) {
    const { error } = await admin
      .from(table)
      .update({ stripe_refund_id: null })
      .like("stripe_refund_id", pattern);

    if (error && !error.message.includes("permission denied")) {
      throw new Error(`[releasePhaseHStripeRefundIds:${table}] ${error.message}`);
    }
  }
}

export async function wipeModerationMatrixPair(params: {
  reporterId: string;
  subjectId: string;
  chatRoomId?: string;
  additionalReporterIds?: string[];
}): Promise<void> {
  await deleteMatrixTestOrdersForSeller(params.subjectId);
  await deleteMatrixTestListingsForSeller(params.subjectId);

  const reporterIds = new Set([
    params.reporterId,
    ...(params.additionalReporterIds ?? []),
  ]);

  for (const reporterId of reporterIds) {
    await deleteReportAttachmentsForReporter(reporterId);
    await deleteReportsForPair({
      reporterId,
      subjectId: params.subjectId,
    });
  }

  await deleteAccountSanctionsForUser(params.subjectId);
  await deleteModerationCasesForSubject(params.subjectId);
  if (params.chatRoomId) {
    await deleteMatrixProbeChatMessages(params.chatRoomId);
  }
}
