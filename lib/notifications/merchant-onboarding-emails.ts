import { getSiteUrl } from "@/lib/auth/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildAbsoluteUrl,
  buildMerchantFinanceUrl,
} from "@/lib/notifications/email-urls";
import { enqueueTransactionalEmail } from "@/lib/notifications/enqueue-email";
import { resolveAuthUserEmails } from "@/lib/notifications/resolve-auth-user-email";
import { resolveEmailLogoUrl } from "@/lib/email/layout";

async function enqueueMerchantOnboardingEmailSafely(
  input: Parameters<typeof enqueueTransactionalEmail>[0],
): Promise<void> {
  try {
    await enqueueTransactionalEmail(input);
  } catch (error) {
    console.warn("[merchant-onboarding-emails] enqueue failed", input.eventId, error);
  }
}

export async function enqueueMerchantKycApplicationSubmittedEmail(
  userId: string,
): Promise<void> {
  const merchantEmail = await resolveAuthUserEmails([userId]).then(
    (map) => map.get(userId),
  );
  if (!merchantEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildAbsoluteUrl(siteUrl, "/profile/user/merchant-apply");

  await enqueueMerchantOnboardingEmailSafely({
    eventId: "E-MCH-01",
    templateKey: "mch.application_submitted",
    toEmail: merchantEmail,
    idempotencyKey: `E-MCH-01:${userId}:submitted`,
    payload: { actionUrl, logoUrl },
  });
}

export async function enqueueMerchantKycApprovedEmail(userId: string): Promise<void> {
  const merchantEmail = await resolveAuthUserEmails([userId]).then(
    (map) => map.get(userId),
  );
  if (!merchantEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildAbsoluteUrl(siteUrl, "/profile/merchant");

  await enqueueMerchantOnboardingEmailSafely({
    eventId: "E-MCH-02",
    templateKey: "mch.kyc_approved",
    toEmail: merchantEmail,
    idempotencyKey: `E-MCH-02:${userId}:approved`,
    payload: { actionUrl, logoUrl },
  });
}

export async function enqueueMerchantKycRejectedEmail(args: {
  userId: string;
  rejectReason?: string | null;
}): Promise<void> {
  const merchantEmail = await resolveAuthUserEmails([args.userId]).then(
    (map) => map.get(args.userId),
  );
  if (!merchantEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildAbsoluteUrl(siteUrl, "/profile/user/merchant-apply");

  await enqueueMerchantOnboardingEmailSafely({
    eventId: "E-MCH-03",
    templateKey: "mch.kyc_rejected",
    toEmail: merchantEmail,
    idempotencyKey: `E-MCH-03:${args.userId}:rejected`,
    payload: {
      rejectReason: args.rejectReason?.trim() || undefined,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueMerchantConnectEnabledEmail(
  stripeAccountId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: kycRow } = await admin
    .from("kyc_records")
    .select("merchant_id, stripe_charges_enabled, stripe_payouts_enabled")
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle<{
      merchant_id: string;
      stripe_charges_enabled: boolean | null;
      stripe_payouts_enabled: boolean | null;
    }>();

  if (
    !kycRow?.merchant_id ||
    !kycRow.stripe_charges_enabled ||
    !kycRow.stripe_payouts_enabled
  ) {
    return;
  }

  const merchantEmail = await resolveAuthUserEmails([kycRow.merchant_id]).then(
    (map) => map.get(kycRow.merchant_id),
  );
  if (!merchantEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildMerchantFinanceUrl(siteUrl);

  await enqueueMerchantOnboardingEmailSafely({
    eventId: "E-MCH-05",
    templateKey: "mch.connect_enabled",
    toEmail: merchantEmail,
    idempotencyKey: `E-MCH-05:${kycRow.merchant_id}:connect_enabled`,
    payload: { actionUrl, logoUrl },
  });
}

export async function enqueueMerchantConnectActionRequiredEmail(args: {
  stripeAccountId: string;
  actionReason?: string | null;
  idempotencyDateSuffix: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: kycRow } = await admin
    .from("kyc_records")
    .select("merchant_id")
    .eq("stripe_account_id", args.stripeAccountId)
    .maybeSingle<{ merchant_id: string }>();

  if (!kycRow?.merchant_id) return;

  const merchantEmail = await resolveAuthUserEmails([kycRow.merchant_id]).then(
    (map) => map.get(kycRow.merchant_id),
  );
  if (!merchantEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildMerchantFinanceUrl(siteUrl);

  await enqueueMerchantOnboardingEmailSafely({
    eventId: "E-MCH-06",
    templateKey: "mch.connect_action_required",
    toEmail: merchantEmail,
    idempotencyKey: `E-MCH-06:${kycRow.merchant_id}:action:${args.idempotencyDateSuffix}`,
    payload: {
      actionReason: args.actionReason?.trim() || undefined,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueMerchantConnectOnboardingReminderEmail(args: {
  userId: string;
  idempotencyDateSuffix: string;
}): Promise<void> {
  const merchantEmail = await resolveAuthUserEmails([args.userId]).then(
    (map) => map.get(args.userId),
  );
  if (!merchantEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildMerchantFinanceUrl(siteUrl);

  await enqueueMerchantOnboardingEmailSafely({
    eventId: "E-MCH-04",
    templateKey: "mch.connect_onboarding_reminder",
    toEmail: merchantEmail,
    idempotencyKey: `E-MCH-04:${args.userId}:reminder:${args.idempotencyDateSuffix}`,
    payload: { actionUrl, logoUrl },
  });
}
