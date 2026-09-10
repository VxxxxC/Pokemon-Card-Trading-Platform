import { createAdminClient } from "@/lib/supabase/admin";
import {
  enqueueOrderConfirmReminderBuyerEmail,
  enqueueOrderShipReminderSellerEmail,
} from "@/lib/notifications/order-emails";
import {
  ORDER_FULFILLMENT_REMINDER_AFTER_DAYS,
  ORDER_REMINDER_CRON_BATCH_LIMIT,
} from "@/lib/notifications/order-reminder-config";
import { buildDailyReminderIdempotencySuffix } from "@/lib/notifications/reminder-idempotency";

function reminderCutoffIso(): string {
  const cutoff = new Date();
  cutoff.setDate(
    cutoff.getDate() - ORDER_FULFILLMENT_REMINDER_AFTER_DAYS,
  );
  return cutoff.toISOString();
}

export async function processOrderFulfillmentReminders(): Promise<{
  confirmReminders: number;
  shipReminders: number;
  errors: string[];
}> {
  const admin = createAdminClient();
  const cutoffIso = reminderCutoffIso();
  const dateSuffix = buildDailyReminderIdempotencySuffix();
  const errors: string[] = [];
  let confirmReminders = 0;
  let shipReminders = 0;

  const { data: merchantConfirm, error: merchantConfirmError } = await admin
    .from("merchant_orders")
    .select("id")
    .eq("escrow_status", "shipped")
    .is("buyer_confirmed_at", null)
    .lt("updated_at", cutoffIso)
    .limit(ORDER_REMINDER_CRON_BATCH_LIMIT);

  if (merchantConfirmError) {
    errors.push(`merchant confirm list: ${merchantConfirmError.message}`);
  } else {
    for (const row of merchantConfirm ?? []) {
      await enqueueOrderConfirmReminderBuyerEmail({
        orderId: row.id,
        orderKind: "merchant",
        idempotencyDateSuffix: dateSuffix,
      });
      confirmReminders += 1;
    }
  }

  const { data: memberConfirm, error: memberConfirmError } = await admin
    .from("member_orders")
    .select("id")
    .eq("escrow_status", "shipped")
    .is("buyer_confirmed_at", null)
    .lt("updated_at", cutoffIso)
    .limit(ORDER_REMINDER_CRON_BATCH_LIMIT);

  if (memberConfirmError) {
    errors.push(`member confirm list: ${memberConfirmError.message}`);
  } else {
    for (const row of memberConfirm ?? []) {
      await enqueueOrderConfirmReminderBuyerEmail({
        orderId: row.id,
        orderKind: "member",
        idempotencyDateSuffix: dateSuffix,
      });
      confirmReminders += 1;
    }
  }

  const { data: merchantShip, error: merchantShipError } = await admin
    .from("merchant_orders")
    .select("id")
    .eq("escrow_status", "payment_held")
    .not("paid_at", "is", null)
    .lt("paid_at", cutoffIso)
    .limit(ORDER_REMINDER_CRON_BATCH_LIMIT);

  if (merchantShipError) {
    errors.push(`merchant ship list: ${merchantShipError.message}`);
  } else {
    for (const row of merchantShip ?? []) {
      await enqueueOrderShipReminderSellerEmail({
        orderId: row.id,
        orderKind: "merchant",
        idempotencyDateSuffix: dateSuffix,
      });
      shipReminders += 1;
    }
  }

  const { data: memberShip, error: memberShipError } = await admin
    .from("member_orders")
    .select("id")
    .eq("use_authentication", true)
    .eq("escrow_status", "custody")
    .is("inbound_tracking_no", null)
    .not("payment_confirmed_at", "is", null)
    .lt("payment_confirmed_at", cutoffIso)
    .limit(ORDER_REMINDER_CRON_BATCH_LIMIT);

  if (memberShipError) {
    errors.push(`member ship list: ${memberShipError.message}`);
  } else {
    for (const row of memberShip ?? []) {
      await enqueueOrderShipReminderSellerEmail({
        orderId: row.id,
        orderKind: "member",
        idempotencyDateSuffix: dateSuffix,
      });
      shipReminders += 1;
    }
  }

  return { confirmReminders, shipReminders, errors };
}
