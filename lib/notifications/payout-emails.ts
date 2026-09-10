import { getSiteUrl } from "@/lib/auth/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/supabase";
import {
  buildMerchantFinanceUrl,
  buildMerchantOrderDetailUrl,
} from "@/lib/notifications/email-urls";
import { enqueueTransactionalEmail } from "@/lib/notifications/enqueue-email";
import { enqueueB2cCompletedMerchantEmail } from "@/lib/notifications/order-emails";
import { enqueueB2cGradingPayoutCompletedEmail } from "@/lib/notifications/grading-emails";
import { resolveAuthUserEmails } from "@/lib/notifications/resolve-auth-user-email";
import { resolveEmailLogoUrl } from "@/lib/email/layout";

type MerchantPayoutOrderRow = Pick<
  Tables<"merchant_orders">,
  "id" | "merchant_id" | "order_number"
>;

function formatHkd(amount: number): string {
  return `HK$${amount.toLocaleString("en-HK", { maximumFractionDigits: 0 })}`;
}

async function enqueuePayoutEmailSafely(
  input: Parameters<typeof enqueueTransactionalEmail>[0],
): Promise<void> {
  try {
    await enqueueTransactionalEmail(input);
  } catch (error) {
    console.warn("[payout-emails] enqueue failed", input.eventId, error);
  }
}

export async function enqueueConnectPayoutProcessingEmail(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, merchant_id, order_number")
    .eq("id", orderId)
    .maybeSingle<MerchantPayoutOrderRow>();

  if (error || !order) {
    console.warn(
      "[payout-emails] merchant order lookup (processing)",
      orderId,
      error?.message,
    );
    return;
  }

  const merchantEmail = await resolveAuthUserEmails([order.merchant_id]).then(
    (map) => map.get(order.merchant_id),
  );
  if (!merchantEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildMerchantFinanceUrl(siteUrl);

  await enqueuePayoutEmailSafely({
    eventId: "E-PAY-01",
    templateKey: "payout.processing",
    toEmail: merchantEmail,
    idempotencyKey: `E-PAY-01:${order.id}:processing`,
    payload: {
      orderId: order.id,
      orderNumber: order.order_number,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueConnectPayoutCompletedEmail(args: {
  orderId: string;
  merchantPayoutAmount: number;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, merchant_id, order_number, requires_authentication")
    .eq("id", args.orderId)
    .maybeSingle<
      MerchantPayoutOrderRow & { requires_authentication: boolean | null }
    >();

  if (error || !order) {
    console.warn(
      "[payout-emails] merchant order lookup",
      args.orderId,
      error?.message,
    );
    return;
  }

  const merchantEmail = await resolveAuthUserEmails([order.merchant_id]).then(
    (map) => map.get(order.merchant_id),
  );
  if (!merchantEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildMerchantFinanceUrl(siteUrl);

  await enqueuePayoutEmailSafely({
    eventId: "E-PAY-02",
    templateKey: "payout.completed",
    toEmail: merchantEmail,
    idempotencyKey: `E-PAY-02:${order.id}:completed`,
    payload: {
      orderId: order.id,
      orderNumber: order.order_number,
      amountLabel: formatHkd(args.merchantPayoutAmount),
      actionUrl,
      logoUrl,
    },
  });

  if (order.requires_authentication) {
    await enqueueB2cGradingPayoutCompletedEmail({
      orderId: order.id,
      merchantPayoutAmount: args.merchantPayoutAmount,
    });
  } else {
    await enqueueB2cCompletedMerchantEmail(args.orderId);
  }
}

export async function enqueueConnectPayoutFailedEmail(args: {
  orderId: string;
  errorMessage?: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, merchant_id, order_number")
    .eq("id", args.orderId)
    .maybeSingle<MerchantPayoutOrderRow>();

  if (error || !order) {
    console.warn(
      "[payout-emails] merchant order lookup (failed)",
      args.orderId,
      error?.message,
    );
    return;
  }

  const merchantEmail = await resolveAuthUserEmails([order.merchant_id]).then(
    (map) => map.get(order.merchant_id),
  );
  if (!merchantEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildMerchantFinanceUrl(siteUrl);

  await enqueuePayoutEmailSafely({
    eventId: "E-PAY-03",
    templateKey: "payout.failed",
    toEmail: merchantEmail,
    idempotencyKey: `E-PAY-03:${order.id}:failed`,
    payload: {
      orderId: order.id,
      orderNumber: order.order_number,
      errorMessage: args.errorMessage?.trim() || undefined,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueMemberFpsPayoutCompletedEmail(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("member_orders")
    .select("id, seller_id, order_number, final_price, buyer_total_amount, total_amount")
    .eq("id", orderId)
    .maybeSingle<{
      id: string;
      seller_id: string;
      order_number: string | null;
      final_price: number;
      buyer_total_amount: number | null;
      total_amount: number | null;
    }>();

  if (error || !order) {
    console.warn(
      "[payout-emails] member order lookup (fps)",
      orderId,
      error?.message,
    );
    return;
  }

  const sellerEmail = await resolveAuthUserEmails([order.seller_id]).then(
    (map) => map.get(order.seller_id),
  );
  if (!sellerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const amount =
    order.buyer_total_amount ?? order.total_amount ?? order.final_price;

  await enqueuePayoutEmailSafely({
    eventId: "E-PAY-04",
    templateKey: "payout.fps_completed",
    toEmail: sellerEmail,
    idempotencyKey: `E-PAY-04:${order.id}:fps`,
    payload: {
      orderId: order.id,
      orderNumber: order.order_number,
      amountLabel: formatHkd(Number(amount)),
      logoUrl,
    },
  });
}

export async function enqueueMerchantRecoveryDueEmail(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, merchant_id, order_number")
    .eq("id", orderId)
    .maybeSingle<MerchantPayoutOrderRow>();

  if (error || !order) {
    console.warn(
      "[payout-emails] merchant order lookup (recovery)",
      orderId,
      error?.message,
    );
    return;
  }

  const { data: receivable } = await admin
    .from("seller_receivables")
    .select("amount_hkd")
    .eq("order_id", orderId)
    .maybeSingle<{ amount_hkd: number }>();

  if (!receivable?.amount_hkd) return;

  const merchantEmail = await resolveAuthUserEmails([order.merchant_id]).then(
    (map) => map.get(order.merchant_id),
  );
  if (!merchantEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildMerchantOrderDetailUrl(siteUrl, order.id);

  await enqueuePayoutEmailSafely({
    eventId: "E-PAY-05",
    templateKey: "payout.recovery_due",
    toEmail: merchantEmail,
    idempotencyKey: `E-PAY-05:${order.id}:recovery`,
    payload: {
      orderId: order.id,
      orderNumber: order.order_number,
      amountLabel: formatHkd(Number(receivable.amount_hkd)),
      actionUrl,
      logoUrl,
    },
  });
}
