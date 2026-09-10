import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueAccountSanctionLiftedEmail } from "@/lib/notifications/account-emails";
import { ORDER_REMINDER_CRON_BATCH_LIMIT } from "@/lib/notifications/order-reminder-config";

const SANCTION_EXPIRY_LOOKBACK_MS = 25 * 60 * 60 * 1000;

export async function processSanctionExpiryNotifications(): Promise<{
  notifications: number;
  errors: string[];
}> {
  const admin = createAdminClient();
  const now = Date.now();
  const sinceIso = new Date(now - SANCTION_EXPIRY_LOOKBACK_MS).toISOString();

  const { data: rows, error } = await admin
    .from("account_sanctions")
    .select("id, user_id, type, ends_at")
    .is("revoked_at", null)
    .not("ends_at", "is", null)
    .lte("ends_at", new Date(now).toISOString())
    .gte("ends_at", sinceIso)
    .neq("type", "ban")
    .limit(ORDER_REMINDER_CRON_BATCH_LIMIT);

  if (error) {
    return { notifications: 0, errors: [error.message] };
  }

  let notifications = 0;
  for (const row of rows ?? []) {
    await enqueueAccountSanctionLiftedEmail({
      userId: row.user_id,
      sanctionId: row.id,
      sanctionType: row.type,
    });
    notifications += 1;
  }

  return { notifications, errors: [] };
}
