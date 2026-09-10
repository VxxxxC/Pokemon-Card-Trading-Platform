import { NextResponse } from "next/server";
import { handleCronRoute } from "@/lib/cron/request";
import { enqueueMerchantOrderPaymentExpiredEmails } from "@/lib/notifications/order-emails";
import { getStripeClient } from "@/lib/stripe/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH_LIMIT = 50;

type ExpiryCandidate = {
  order_id: string;
  stripe_payment_intent_id: string | null;
  listing_id: string;
};

type ExpiryRpcClient = {
  rpc(
    fn: "rpc_list_merchant_pending_payment_expiry_candidates",
    args: { p_limit: number },
  ): Promise<{ data: ExpiryCandidate[] | null; error: { message: string } | null }>;
  rpc(
    fn: "rpc_finalize_merchant_pending_payment_expiry",
    args: { p_order_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronRoute(
    request,
    async () => {
      const admin = createAdminClient() as unknown as ExpiryRpcClient;

      const { data: candidates, error: listError } = await admin.rpc(
        "rpc_list_merchant_pending_payment_expiry_candidates",
        { p_limit: BATCH_LIMIT },
      );

      if (listError) {
        return NextResponse.json(
          { success: false, error: listError.message },
          { status: 500 },
        );
      }

      const rows = candidates ?? [];
      let expired = 0;
      let piCanceled = 0;
      const errors: string[] = [];

      const stripe = await getStripeClient();

      for (const row of rows) {
        const paymentIntentId = row.stripe_payment_intent_id?.trim();
        if (paymentIntentId && stripe) {
          try {
            const existing = await stripe.paymentIntents.retrieve(paymentIntentId);
            if (
              existing.status !== "succeeded" &&
              existing.status !== "canceled"
            ) {
              await stripe.paymentIntents.cancel(paymentIntentId);
              piCanceled += 1;
            }
          } catch (cancelError) {
            const message =
              cancelError instanceof Error
                ? cancelError.message
                : "Stripe PI cancel failed";
            console.warn(
              "[cron/expire-merchant-pending-payment] cancel",
              paymentIntentId,
              message,
            );
          }
        }

        const { error: finalizeError } = await admin.rpc(
          "rpc_finalize_merchant_pending_payment_expiry",
          { p_order_id: row.order_id },
        );

        if (finalizeError) {
          errors.push(`${row.order_id}: ${finalizeError.message}`);
          continue;
        }

        await enqueueMerchantOrderPaymentExpiredEmails(row.order_id);
        expired += 1;
      }

      return NextResponse.json({
        success: true,
        scanned: rows.length,
        expired,
        piCanceled,
        errors,
      });
    },
    "[cron/expire-merchant-pending-payment]",
    "Merchant pending payment expiry failed",
  );
}
