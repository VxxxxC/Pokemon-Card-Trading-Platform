import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueMerchantConnectOnboardingReminderEmail } from "@/lib/notifications/merchant-onboarding-emails";
import {
  CONNECT_ONBOARDING_REMINDER_AFTER_HOURS,
  ORDER_REMINDER_CRON_BATCH_LIMIT,
} from "@/lib/notifications/order-reminder-config";
import { buildDailyReminderIdempotencySuffix } from "@/lib/notifications/reminder-idempotency";

export async function processConnectOnboardingReminders(): Promise<{
  reminders: number;
  errors: string[];
}> {
  const admin = createAdminClient();
  const cutoff = new Date();
  cutoff.setHours(
    cutoff.getHours() - CONNECT_ONBOARDING_REMINDER_AFTER_HOURS,
  );
  const cutoffIso = cutoff.toISOString();
  const dateSuffix = buildDailyReminderIdempotencySuffix();
  const errors: string[] = [];

  const { data: rows, error } = await admin
    .from("kyc_records")
    .select("merchant_id, stripe_charges_enabled, stripe_payouts_enabled, verified_at")
    .eq("kyc_status", "verified")
    .not("stripe_account_id", "is", null)
    .or("stripe_charges_enabled.eq.false,stripe_payouts_enabled.eq.false")
    .lt("verified_at", cutoffIso)
    .limit(ORDER_REMINDER_CRON_BATCH_LIMIT);

  if (error) {
    return { reminders: 0, errors: [error.message] };
  }

  let reminders = 0;
  for (const row of rows ?? []) {
    if (row.stripe_charges_enabled && row.stripe_payouts_enabled) {
      continue;
    }
    await enqueueMerchantConnectOnboardingReminderEmail({
      userId: row.merchant_id,
      idempotencyDateSuffix: dateSuffix,
    });
    reminders += 1;
  }

  return { reminders, errors };
}
