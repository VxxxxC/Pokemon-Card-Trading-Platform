import type Stripe from "stripe";
import { getSiteUrl } from "@/lib/auth/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBuyerOrderDetailUrl } from "@/lib/notifications/email-urls";
import { enqueueTransactionalEmail } from "@/lib/notifications/enqueue-email";
import { resolveAuthUserEmails } from "@/lib/notifications/resolve-auth-user-email";
import { resolveEmailLogoUrl } from "@/lib/email/layout";

function formatHkdFromCents(cents: number): string {
  return `HK$${(cents / 100).toLocaleString("en-HK", { maximumFractionDigits: 0 })}`;
}

async function enqueueRefundEmailSafely(
  input: Parameters<typeof enqueueTransactionalEmail>[0],
): Promise<void> {
  try {
    await enqueueTransactionalEmail(input);
  } catch (error) {
    console.warn("[refund-emails] enqueue failed", input.eventId, error);
  }
}

async function resolveBuyerIdForOrder(
  orderKind: "member" | "merchant",
  orderId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  if (orderKind === "member") {
    const { data } = await admin
      .from("member_orders")
      .select("buyer_id")
      .eq("id", orderId)
      .maybeSingle<{ buyer_id: string }>();
    return data?.buyer_id ?? null;
  }

  const { data } = await admin
    .from("merchant_orders")
    .select("buyer_id")
    .eq("id", orderId)
    .maybeSingle<{ buyer_id: string }>();
  return data?.buyer_id ?? null;
}

export async function enqueueRefundApprovedEmail(args: {
  orderKind: "member" | "merchant";
  orderId: string;
  caseId: string;
  refundCents?: number;
}): Promise<void> {
  const buyerId = await resolveBuyerIdForOrder(args.orderKind, args.orderId);
  if (!buyerId) return;

  const buyerEmail = await resolveAuthUserEmails([buyerId]).then(
    (map) => map.get(buyerId),
  );
  if (!buyerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildBuyerOrderDetailUrl(siteUrl, args.orderId);
  const amountLabel =
    args.refundCents && args.refundCents > 0
      ? formatHkdFromCents(args.refundCents)
      : undefined;

  await enqueueRefundEmailSafely({
    eventId: "E-REF-01",
    templateKey: "refund.approved",
    toEmail: buyerEmail,
    idempotencyKey: `E-REF-01:${args.caseId}:buyer`,
    payload: {
      orderId: args.orderId,
      orderKind: args.orderKind,
      amountLabel,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueRefundCompletedFromStripeRefund(
  refund: Stripe.Refund,
): Promise<void> {
  if (refund.status !== "succeeded") {
    return;
  }

  const metadata = refund.metadata ?? {};
  const rawKind = metadata.order_kind?.trim();
  const orderId = metadata.order_id?.trim();
  if (!orderId) return;

  if (
    rawKind === "auth_grading_member" ||
    rawKind === "auth_grading_merchant"
  ) {
    return;
  }

  const orderKind: "member" | "merchant" =
    rawKind === "merchant" ? "merchant" : "member";

  const buyerId = await resolveBuyerIdForOrder(orderKind, orderId);
  if (!buyerId) return;

  const buyerEmail = await resolveAuthUserEmails([buyerId]).then(
    (map) => map.get(buyerId),
  );
  if (!buyerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildBuyerOrderDetailUrl(siteUrl, orderId);

  await enqueueRefundEmailSafely({
    eventId: "E-REF-02",
    templateKey: "refund.completed",
    toEmail: buyerEmail,
    idempotencyKey: `E-REF-02:${refund.id}`,
    payload: {
      orderId,
      orderKind,
      amountLabel: formatHkdFromCents(refund.amount),
      refundId: refund.id,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueRefundFailedEmail(args: {
  orderKind: "member" | "merchant";
  orderId: string;
  caseId?: string | null;
  refundId?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const buyerId = await resolveBuyerIdForOrder(args.orderKind, args.orderId);
  if (!buyerId) return;

  const buyerEmail = await resolveAuthUserEmails([buyerId]).then(
    (map) => map.get(buyerId),
  );
  if (!buyerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildBuyerOrderDetailUrl(siteUrl, args.orderId);
  const idempotencyKey = args.refundId
    ? `E-REF-03:${args.refundId}`
    : args.caseId
      ? `E-REF-03:${args.caseId}:failed`
      : `E-REF-03:${args.orderId}:failed`;

  await enqueueRefundEmailSafely({
    eventId: "E-REF-03",
    templateKey: "refund.failed",
    toEmail: buyerEmail,
    idempotencyKey,
    payload: {
      orderId: args.orderId,
      orderKind: args.orderKind,
      errorMessage: args.errorMessage?.trim() || undefined,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueRefundFailedFromStripeRefund(
  refund: Stripe.Refund,
): Promise<void> {
  if (refund.status !== "failed") {
    return;
  }

  const metadata = refund.metadata ?? {};
  const rawKind = metadata.order_kind?.trim();
  const orderId = metadata.order_id?.trim();
  if (!orderId) return;

  if (
    rawKind === "auth_grading_member" ||
    rawKind === "auth_grading_merchant"
  ) {
    return;
  }

  const orderKind: "member" | "merchant" =
    rawKind === "merchant" ? "merchant" : "member";

  await enqueueRefundFailedEmail({
    orderKind,
    orderId,
    caseId: metadata.case_id?.trim() || null,
    refundId: refund.id,
    errorMessage: refund.failure_reason,
  });
}
