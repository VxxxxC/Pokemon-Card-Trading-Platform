import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { hasStripeWebhookRouteEnv } from "../shared/env";

const adminRpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: adminRpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

import { POST } from "@/app/api/stripe/webhook/route";
import { stripe } from "@/lib/stripe";

const WEBHOOK_SECRET = "whsec_c1_route_integration_test_secret";

function buildStripeEvent(
  type: Stripe.Event.Type,
  object: Stripe.Event.Data.Object,
): Stripe.Event {
  return {
    id: `evt_${type.replace(/\./g, "_")}_${Date.now()}`,
    object: "event",
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type,
    data: { object },
  } as Stripe.Event;
}

async function postSignedWebhook(
  event: Stripe.Event,
  options?: { signature?: string },
): Promise<Response> {
  const payload = JSON.stringify(event);
  const signature =
    options?.signature ??
    stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });

  return POST(
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": signature,
        "content-type": "application/json",
      },
      body: payload,
    }),
  );
}

describe.skipIf(!hasStripeWebhookRouteEnv())(
  "stripe webhook HTTP route (C1)",
  () => {
    beforeAll(() => {
      process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    });

    beforeEach(() => {
      adminRpc.mockReset();
      adminRpc.mockResolvedValue({ data: { success: true }, error: null });
    });

    it("C1-1: payment_intent.amount_capturable_updated authorizes member_auth", async () => {
      const orderId = "00000000-0000-4000-8000-00000000c101";
      const paymentIntent = {
        id: "pi_c1_member_auth",
        object: "payment_intent",
        status: "requires_capture",
        amount_capturable: 50_000,
        metadata: {
          order_kind: "member_auth",
          order_id: orderId,
          item_subtotal: "100",
          auth_fee: "150",
        },
      } as Stripe.PaymentIntent;

      const response = await postSignedWebhook(
        buildStripeEvent(
          "payment_intent.amount_capturable_updated",
          paymentIntent,
        ),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ received: true });
      expect(adminRpc).toHaveBeenCalledWith(
        "rpc_mark_member_auth_order_authorized",
        expect.objectContaining({
          p_order_id: orderId,
          p_payment_intent_id: "pi_c1_member_auth",
        }),
      );
    });

    it("C1-2: payment_intent.succeeded marks merchant direct order paid", async () => {
      const orderId = "00000000-0000-4000-8000-00000000c102";
      const paymentIntent = {
        id: "pi_c1_merchant_direct",
        object: "payment_intent",
        status: "succeeded",
        amount: 11_500,
        amount_received: 11_500,
        metadata: {
          order_kind: "merchant",
          order_id: orderId,
          buyer_total_amount: "115",
          total_amount: "145",
        },
      } as Stripe.PaymentIntent;

      const response = await postSignedWebhook(
        buildStripeEvent("payment_intent.succeeded", paymentIntent),
      );

      expect(response.status).toBe(200);
      expect(adminRpc).toHaveBeenCalledWith("rpc_mark_merchant_order_paid", {
        p_order_id: orderId,
        p_payment_intent_id: "pi_c1_merchant_direct",
        p_amounts: {
          buyer_total_amount: "115",
          total_amount: "145",
        },
      });
    });

    it("C1-3: refund.created finalizes auth grading refund", async () => {
      const orderId = "00000000-0000-4000-8000-00000000c103";
      const refund = {
        id: "re_c1_auth_grading",
        object: "refund",
        amount: 8_000,
        metadata: {
          order_kind: "auth_grading_member",
          order_id: orderId,
        },
      } as Stripe.Refund;

      const response = await postSignedWebhook(
        buildStripeEvent("refund.created", refund),
      );

      expect(response.status).toBe(200);
      expect(adminRpc).toHaveBeenCalledWith("rpc_finalize_auth_refund", {
        p_order_kind: "member",
        p_order_id: orderId,
        p_refund_id: "re_c1_auth_grading",
        p_refund_amount_cents: 8_000,
      });
    });

    it("C1-4: payment_intent.canceled voids member_auth authorization", async () => {
      const orderId = "00000000-0000-4000-8000-00000000c105";
      const paymentIntent = {
        id: "pi_c1_member_auth_cancel",
        object: "payment_intent",
        status: "canceled",
        metadata: {
          order_kind: "member_auth",
          order_id: orderId,
        },
      } as Stripe.PaymentIntent;

      const response = await postSignedWebhook(
        buildStripeEvent("payment_intent.canceled", paymentIntent),
      );

      expect(response.status).toBe(200);
      expect(adminRpc).toHaveBeenCalledWith("rpc_mark_auth_order_payment_voided", {
        p_order_kind: "member",
        p_order_id: orderId,
        p_payment_intent_id: "pi_c1_member_auth_cancel",
      });
    });

    it("C1-6: payment_intent.canceled releases merchant direct coupon (TC-P01)", async () => {
      const orderId = "00000000-0000-4000-8000-00000000c107";
      const paymentIntent = {
        id: "pi_c1_merchant_cancel",
        object: "payment_intent",
        status: "canceled",
        amount: 11_500,
        metadata: {
          order_kind: "merchant",
          order_id: orderId,
          buyer_total_amount: "115",
        },
      } as Stripe.PaymentIntent;

      const response = await postSignedWebhook(
        buildStripeEvent("payment_intent.canceled", paymentIntent),
      );

      expect(response.status).toBe(200);
      expect(adminRpc).toHaveBeenCalledWith("fn_release_merchant_order_coupon", {
        p_order_id: orderId,
      });
    });

    it("C1-7: payment_intent.succeeded finalizes auth grading fail capture (TC-P02)", async () => {
      const orderId = "00000000-0000-4000-8000-00000000c108";
      const paymentIntent = {
        id: "pi_c1_auth_grading_fail",
        object: "payment_intent",
        status: "succeeded",
        amount: 5_000,
        metadata: {
          order_kind: "auth_grading_member",
          order_id: orderId,
          capture_stage: "auth_grading_fail",
        },
      } as Stripe.PaymentIntent;

      const response = await postSignedWebhook(
        buildStripeEvent("payment_intent.succeeded", paymentIntent),
      );

      expect(response.status).toBe(200);
      expect(adminRpc).toHaveBeenCalledWith("rpc_finalize_auth_grading_fail", {
        p_order_kind: "member",
        p_order_id: orderId,
        p_payment_intent_id: "pi_c1_auth_grading_fail",
      });
    });

    it("C1-5: payment_intent.payment_failed returns 200 without RPC", async () => {
      const paymentIntent = {
        id: "pi_c1_payment_failed",
        object: "payment_intent",
        status: "requires_payment_method",
        metadata: {
          order_kind: "member_auth",
          order_id: "00000000-0000-4000-8000-00000000c106",
        },
        last_payment_error: { message: "card declined" },
      } as Stripe.PaymentIntent;

      const response = await postSignedWebhook(
        buildStripeEvent("payment_intent.payment_failed", paymentIntent),
      );

      expect(response.status).toBe(200);
      expect(adminRpc).not.toHaveBeenCalled();
    });

    it("rejects missing stripe-signature with 400", async () => {
      const event = buildStripeEvent("account.updated", {
        id: "acct_c1",
        object: "account",
      } as Stripe.Account);

      const response = await POST(
        new Request("http://localhost/api/stripe/webhook", {
          method: "POST",
          body: JSON.stringify(event),
        }),
      );

      expect(response.status).toBe(400);
    });

    it("rejects invalid signature with 400", async () => {
      const event = buildStripeEvent("account.updated", {
        id: "acct_c1_invalid",
        object: "account",
      } as Stripe.Account);

      const response = await postSignedWebhook(event, {
        signature: "t=0,v1=invalid",
      });

      expect(response.status).toBe(400);
    });

    it("replay of the same signed event returns 200", async () => {
      const orderId = "00000000-0000-4000-8000-00000000c104";
      const event = buildStripeEvent("payment_intent.amount_capturable_updated", {
        id: "pi_c1_replay",
        object: "payment_intent",
        status: "requires_capture",
        amount_capturable: 10_000,
        metadata: {
          order_kind: "member_auth",
          order_id: orderId,
        },
      } as Stripe.PaymentIntent);

      const payload = JSON.stringify(event);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      });
      const request = new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      });

      const first = await POST(request.clone());
      const second = await POST(request.clone());

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    });
  },
);
