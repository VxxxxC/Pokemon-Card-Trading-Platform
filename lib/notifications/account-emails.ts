import { getSiteUrl } from "@/lib/auth/site-url";
import { enqueueTransactionalEmail } from "@/lib/notifications/enqueue-email";
import { buildMemberTradingUrl } from "@/lib/notifications/email-urls";
import { resolveAuthUserEmails } from "@/lib/notifications/resolve-auth-user-email";
import { resolveEmailLogoUrl } from "@/lib/email/layout";

async function enqueueAccountEmailSafely(
  input: Parameters<typeof enqueueTransactionalEmail>[0],
): Promise<void> {
  try {
    await enqueueTransactionalEmail(input);
  } catch (error) {
    console.warn("[account-emails] enqueue failed", input.eventId, error);
  }
}

export async function enqueueAccountSuspendedEmail(args: {
  userId: string;
  caseId: string;
  endsAt?: string | null;
  reason?: string | null;
}): Promise<void> {
  const toEmail = await resolveAuthUserEmails([args.userId]).then(
    (map) => map.get(args.userId),
  );
  if (!toEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildMemberTradingUrl(siteUrl);

  await enqueueAccountEmailSafely({
    eventId: "E-ACC-06",
    templateKey: "acc.suspended",
    toEmail,
    idempotencyKey: `E-ACC-06:${args.caseId}:subject`,
    payload: {
      endsAt: args.endsAt ?? undefined,
      reason: args.reason?.trim() || undefined,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueAccountEmailVerifiedEmail(userId: string): Promise<void> {
  const toEmail = await resolveAuthUserEmails([userId]).then(
    (map) => map.get(userId),
  );
  if (!toEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildMemberTradingUrl(siteUrl);

  await enqueueAccountEmailSafely({
    eventId: "E-ACC-02",
    templateKey: "acc.email_verified",
    toEmail,
    idempotencyKey: `E-ACC-02:${userId}:verified`,
    payload: { actionUrl, logoUrl },
  });
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
    default:
      return "帳戶限制";
  }
}

export async function enqueueAccountSanctionAppliedEmail(args: {
  userId: string;
  caseId: string;
  sanctionType: string;
  reason?: string | null;
  endsAt?: string | null;
}): Promise<void> {
  const toEmail = await resolveAuthUserEmails([args.userId]).then(
    (map) => map.get(args.userId),
  );
  if (!toEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildMemberTradingUrl(siteUrl);

  await enqueueAccountEmailSafely({
    eventId: "E-ACC-09",
    templateKey: "acc.sanction_applied",
    toEmail,
    idempotencyKey: `E-ACC-09:${args.caseId}:${args.sanctionType}`,
    payload: {
      sanctionType: args.sanctionType,
      sanctionLabel: sanctionTypeLabel(args.sanctionType),
      endsAt: args.endsAt ?? undefined,
      reason: args.reason?.trim() || undefined,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueAccountSanctionLiftedEmail(args: {
  userId: string;
  sanctionId: string;
  sanctionType: string;
}): Promise<void> {
  const toEmail = await resolveAuthUserEmails([args.userId]).then(
    (map) => map.get(args.userId),
  );
  if (!toEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildMemberTradingUrl(siteUrl);

  await enqueueAccountEmailSafely({
    eventId: "E-ACC-08",
    templateKey: "acc.sanction_lifted",
    toEmail,
    idempotencyKey: `E-ACC-08:${args.sanctionId}:lifted`,
    payload: {
      sanctionType: args.sanctionType,
      sanctionLabel: sanctionTypeLabel(args.sanctionType),
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueAccountBannedEmail(args: {
  userId: string;
  caseId: string;
  reason?: string | null;
}): Promise<void> {
  const toEmail = await resolveAuthUserEmails([args.userId]).then(
    (map) => map.get(args.userId),
  );
  if (!toEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildMemberTradingUrl(siteUrl);

  await enqueueAccountEmailSafely({
    eventId: "E-ACC-07",
    templateKey: "acc.banned",
    toEmail,
    idempotencyKey: `E-ACC-07:${args.caseId}:subject`,
    payload: {
      reason: args.reason?.trim() || undefined,
      actionUrl,
      logoUrl,
    },
  });
}
