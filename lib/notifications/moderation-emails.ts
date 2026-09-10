import {
  enqueueAccountBannedEmail,
  enqueueAccountSanctionAppliedEmail,
  enqueueAccountSuspendedEmail,
} from "@/lib/notifications/account-emails";
import { getSiteUrl } from "@/lib/auth/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueTransactionalEmail } from "@/lib/notifications/enqueue-email";
import { buildMemberTradingUrl } from "@/lib/notifications/email-urls";
import { resolveAuthUserEmails } from "@/lib/notifications/resolve-auth-user-email";
import { resolveEmailLogoUrl } from "@/lib/email/layout";
import {
  sendModerationReportOutcomePushes,
  sendModerationSanctionPush,
} from "@/lib/notifications/moderation-push";

function moderationResolutionLabel(resolution: string): string {
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

async function enqueueModerationEmailSafely(
  input: Parameters<typeof enqueueTransactionalEmail>[0],
): Promise<void> {
  try {
    await enqueueTransactionalEmail(input);
  } catch (error) {
    console.warn("[moderation-emails] enqueue failed", input.eventId, error);
  }
}

export async function enqueueModerationReportOutcomeEmails(args: {
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
    console.warn(
      "[moderation-emails] case lookup",
      args.caseId,
      caseError.message,
    );
    return;
  }

  const { data: reports, error: reportsError } = await admin
    .from("reports")
    .select("id, reporter_id")
    .eq("case_id", args.caseId);

  if (reportsError || !reports?.length) {
    if (reportsError) {
      console.warn(
        "[moderation-emails] reports lookup",
        args.caseId,
        reportsError.message,
      );
    }
    return;
  }

  const reporterIds = reports.map((row) => row.reporter_id);
  const emails = await resolveAuthUserEmails(reporterIds);
  const siteUrl = await getSiteUrl();
  const actionUrl = buildMemberTradingUrl(siteUrl);
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const resolutionLabel = moderationResolutionLabel(args.resolution);

  for (const report of reports) {
    const toEmail = emails.get(report.reporter_id);
    if (!toEmail) continue;

    await enqueueModerationEmailSafely({
      eventId: "E-MOD-02",
      templateKey: "mod.report_outcome",
      toEmail,
      idempotencyKey: `E-MOD-02:${report.id}:outcome`,
      payload: {
        caseNumber: caseRow?.case_number,
        resolution: args.resolution,
        resolutionLabel,
        actionUrl,
        logoUrl,
      },
    });
  }

  await sendModerationReportOutcomePushes({
    caseId: args.caseId,
    resolution: args.resolution,
    notifyReporter: args.notifyReporter,
  });
}

export async function enqueueModerationReportReceivedEmail(args: {
  reporterId: string;
  reportId: string;
  caseNumber?: string | null;
}): Promise<void> {
  const reporterEmail = await resolveAuthUserEmails([args.reporterId]).then(
    (map) => map.get(args.reporterId),
  );
  if (!reporterEmail) return;

  const siteUrl = await getSiteUrl();
  const actionUrl = buildMemberTradingUrl(siteUrl);
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueModerationEmailSafely({
    eventId: "E-MOD-01",
    templateKey: "mod.report_received",
    toEmail: reporterEmail,
    idempotencyKey: `E-MOD-01:${args.reportId}:received`,
    payload: {
      caseNumber: args.caseNumber,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueModerationReportUpheldSubjectEmail(args: {
  caseId: string;
  subjectUserId: string;
  caseNumber?: string | null;
}): Promise<void> {
  const subjectEmail = await resolveAuthUserEmails([args.subjectUserId]).then(
    (map) => map.get(args.subjectUserId),
  );
  if (!subjectEmail) return;

  const siteUrl = await getSiteUrl();
  const actionUrl = buildMemberTradingUrl(siteUrl);
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueModerationEmailSafely({
    eventId: "E-MOD-03",
    templateKey: "mod.report_upheld_subject",
    toEmail: subjectEmail,
    idempotencyKey: `E-MOD-03:${args.caseId}:subject`,
    payload: {
      caseNumber: args.caseNumber,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueModerationPayoutFrozenEmail(args: {
  caseId: string;
  subjectUserId: string;
  caseNumber?: string | null;
}): Promise<void> {
  const subjectEmail = await resolveAuthUserEmails([args.subjectUserId]).then(
    (map) => map.get(args.subjectUserId),
  );
  if (!subjectEmail) return;

  const siteUrl = await getSiteUrl();
  const actionUrl = buildMemberTradingUrl(siteUrl);
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueModerationEmailSafely({
    eventId: "E-MOD-04",
    templateKey: "mod.payout_frozen",
    toEmail: subjectEmail,
    idempotencyKey: `E-MOD-04:${args.caseId}:subject`,
    payload: {
      caseNumber: args.caseNumber,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueModerationEvidenceRequestEmail(args: {
  caseId: string;
  targetUserId: string;
  caseNumber?: string | null;
  message?: string | null;
}): Promise<void> {
  const targetEmail = await resolveAuthUserEmails([args.targetUserId]).then(
    (map) => map.get(args.targetUserId),
  );
  if (!targetEmail) return;

  const siteUrl = await getSiteUrl();
  const actionUrl = buildMemberTradingUrl(siteUrl);
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueModerationEmailSafely({
    eventId: "E-MOD-06",
    templateKey: "mod.evidence_request",
    toEmail: targetEmail,
    idempotencyKey: `E-MOD-06:${args.caseId}:${args.targetUserId}`,
    payload: {
      caseNumber: args.caseNumber,
      message: args.message?.trim() || undefined,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueModerationPayoutUnfrozenEmail(args: {
  caseId: string;
  subjectUserId: string;
  caseNumber?: string | null;
}): Promise<void> {
  const subjectEmail = await resolveAuthUserEmails([args.subjectUserId]).then(
    (map) => map.get(args.subjectUserId),
  );
  if (!subjectEmail) return;

  const siteUrl = await getSiteUrl();
  const actionUrl = buildMemberTradingUrl(siteUrl);
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueModerationEmailSafely({
    eventId: "E-MOD-05",
    templateKey: "mod.payout_unfrozen",
    toEmail: subjectEmail,
    idempotencyKey: `E-MOD-05:${args.caseId}:subject`,
    payload: {
      caseNumber: args.caseNumber,
      actionUrl,
      logoUrl,
    },
  });
}

async function subjectHasActiveFreezePayoutSanction(
  userId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("account_sanctions")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "freeze_payout")
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle<{ id: string }>();

  return Boolean(data?.id);
}

type ModerationSanctionInput = {
  type?: string;
  scope?: string;
  endsAt?: string | null;
  reason?: string | null;
};

export async function enqueueModerationResolveFollowUpEmails(args: {
  caseId: string;
  resolution: string;
  sanction?: ModerationSanctionInput | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: caseRow } = await admin
    .from("moderation_cases")
    .select("case_number, subject_user_id")
    .eq("id", args.caseId)
    .maybeSingle<{ case_number: string | null; subject_user_id: string }>();

  if (!caseRow?.subject_user_id) return;

  const caseNumber = caseRow.case_number;
  const subjectId = caseRow.subject_user_id;

  if (args.resolution === "upheld") {
    await enqueueModerationReportUpheldSubjectEmail({
      caseId: args.caseId,
      subjectUserId: subjectId,
      caseNumber,
    });
  }

  if (
    args.resolution === "dismissed" ||
    args.resolution === "insufficient_evidence"
  ) {
    const hadFreeze = await subjectHasActiveFreezePayoutSanction(subjectId);
    if (hadFreeze) {
      await enqueueModerationPayoutUnfrozenEmail({
        caseId: args.caseId,
        subjectUserId: subjectId,
        caseNumber,
      });
    }
  }

  const sanction = args.sanction;
  if (!sanction?.type) {
    return;
  }

  const reason = sanction.reason;
  const endsAt = sanction.endsAt;

  switch (sanction.type) {
    case "freeze_payout":
      await enqueueModerationPayoutFrozenEmail({
        caseId: args.caseId,
        subjectUserId: subjectId,
        caseNumber,
      });
      break;
    case "suspend":
      await enqueueAccountSuspendedEmail({
        userId: subjectId,
        caseId: args.caseId,
        endsAt,
        reason,
      });
      break;
    case "ban":
      await enqueueAccountBannedEmail({
        userId: subjectId,
        caseId: args.caseId,
        reason,
      });
      break;
    case "warn":
    case "restrict_listing":
    case "restrict_chat":
      await enqueueAccountSanctionAppliedEmail({
        userId: subjectId,
        caseId: args.caseId,
        sanctionType: sanction.type,
        reason,
        endsAt,
      });
      break;
    default:
      break;
  }

  if (
    sanction.type === "freeze_payout" ||
    sanction.type === "suspend" ||
    sanction.type === "ban" ||
    sanction.type === "warn" ||
    sanction.type === "restrict_listing" ||
    sanction.type === "restrict_chat"
  ) {
    await sendModerationSanctionPush({
      caseId: args.caseId,
      subjectUserId: subjectId,
      sanctionType: sanction.type,
    });
  }
}
