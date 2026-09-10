import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueCouponExpiringReminderEmail } from "@/lib/notifications/rewards-emails";
import {
  COUPON_EXPIRING_REMINDER_WITHIN_DAYS,
  ORDER_REMINDER_CRON_BATCH_LIMIT,
} from "@/lib/notifications/order-reminder-config";
import { buildDailyReminderIdempotencySuffix } from "@/lib/notifications/reminder-idempotency";

export async function processCouponExpiringReminders(): Promise<{
  reminders: number;
  errors: string[];
}> {
  const admin = createAdminClient();
  const now = new Date();
  const until = new Date();
  until.setDate(until.getDate() + COUPON_EXPIRING_REMINDER_WITHIN_DAYS);
  const dateSuffix = buildDailyReminderIdempotencySuffix();

  const { data: rows, error } = await admin
    .from("user_rewards")
    .select("id, user_id, calculated_expiry")
    .eq("is_used", false)
    .is("used_at", null)
    .is("reserved_at", null)
    .not("calculated_expiry", "is", null)
    .gte("calculated_expiry", now.toISOString())
    .lte("calculated_expiry", until.toISOString())
    .limit(ORDER_REMINDER_CRON_BATCH_LIMIT);

  if (error) {
    return { reminders: 0, errors: [error.message] };
  }

  let reminders = 0;
  for (const row of rows ?? []) {
    if (!row.calculated_expiry) continue;
    const expiryLabel = new Date(row.calculated_expiry).toLocaleDateString(
      "zh-HK",
      { dateStyle: "medium" },
    );
    await enqueueCouponExpiringReminderEmail({
      userId: row.user_id,
      userRewardId: row.id,
      expiryLabel,
      idempotencyDateSuffix: dateSuffix,
    });
    reminders += 1;
  }

  return { reminders, errors: [] };
}
