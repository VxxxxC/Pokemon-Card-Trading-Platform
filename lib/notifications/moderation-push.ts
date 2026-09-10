import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/notifications/push-delivery";

export function moderationResolutionLabel(resolution: string): string {
  switch (resolution) {
    case "upheld":
      return "舉報成立";
    case "dismissed":
      return "舉報不成立";
    case "insufficient_evidence":
      return "證據不足";
    default:
      return "已結案";
  }
}

function sanctionTypeLabel(type: string): string {
  switch (type) {
    case "warn":
      return "警告";
    case "restrict_listing":
      return "限制刊登";
    case "restrict_chat":
      return "限制聊天";
    case "freeze_payout":
      return "凍結出款";
    case "suspend":
      return "帳戶暫停";
    case "ban":
      return "永久封禁";
    default:
      return "帳戶限制";
  }
}

export function buildModerationReportOutcomePushCopy(input: {
  resolutionLabel: string;
  caseNumber?: string | null;
}): { heading: string; body: string } {
  const caseSuffix = input.caseNumber?.trim()
    ? `（${input.caseNumber.trim()}）`
    : "";

  return {
    heading: "舉報案件已結案",
    body: `裁定結果：${input.resolutionLabel}${caseSuffix}`,
  };
}

export function buildModerationSanctionPushCopy(input: {
  sanctionLabel: string;
  caseNumber?: string | null;
}): { heading: string; body: string } {
  const caseSuffix = input.caseNumber?.trim()
    ? `（${input.caseNumber.trim()}）`
    : "";

  return {
    heading: "帳戶收到平台制裁",
    body: `已套用：${input.sanctionLabel}${caseSuffix}`,
  };
}

export async function sendModerationReportOutcomePushes(args: {
  caseId: string;
  resolution: string;
  notifyReporter?: boolean;
}): Promise<void> {
  if (args.notifyReporter === false) {
    return;
  }

  const admin = createAdminClient();
  const { data: caseRow, error: caseError } = await admin
    .from("moderation_cases")
    .select("case_number")
    .eq("id", args.caseId)
    .maybeSingle<{ case_number: string | null }>();

  if (caseError) {
    console.warn("[moderation-push] case lookup", args.caseId, caseError.message);
    return;
  }

  const { data: reports, error: reportsError } = await admin
    .from("reports")
    .select("reporter_id")
    .eq("case_id", args.caseId);

  if (reportsError || !reports?.length) {
    if (reportsError) {
      console.warn(
        "[moderation-push] reports lookup",
        args.caseId,
        reportsError.message,
      );
    }
    return;
  }

  const resolutionLabel = moderationResolutionLabel(args.resolution);
  const copy = buildModerationReportOutcomePushCopy({
    resolutionLabel,
    caseNumber: caseRow?.case_number,
  });

  const reporterIds = [
    ...new Set(reports.map((row) => row.reporter_id).filter(Boolean)),
  ];

  await Promise.all(
    reporterIds.map((reporterId) =>
      sendPushToUser({
        eventId: "P-MOD-01",
        userId: reporterId,
        heading: copy.heading,
        body: copy.body,
        path: "/profile/user/trading",
      }),
    ),
  );
}

export async function sendModerationSanctionPush(args: {
  caseId: string;
  subjectUserId: string;
  sanctionType: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: caseRow, error } = await admin
    .from("moderation_cases")
    .select("case_number")
    .eq("id", args.caseId)
    .maybeSingle<{ case_number: string | null }>();

  if (error) {
    console.warn("[moderation-push] case lookup", args.caseId, error.message);
    return;
  }

  const copy = buildModerationSanctionPushCopy({
    sanctionLabel: sanctionTypeLabel(args.sanctionType),
    caseNumber: caseRow?.case_number,
  });

  await sendPushToUser({
    eventId: "P-MOD-02",
    userId: args.subjectUserId,
    heading: copy.heading,
    body: copy.body,
    path: "/profile/user/settings",
  });
}
