import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import type { Database } from "@/types/supabase";
import type { GradingCaptureOrderKind } from "@/lib/payments/stripe-capture-policy";
import {
  buildAuthFeeOnlyCaptureParams,
  buildAuthGradingFailIdempotencyKey,
  buildCaptureZeroParams,
  buildGoodsCaptureIdempotencyKey,
  buildGoodsCaptureParams,
  resolveGoodsCaptureStage,
} from "@/lib/payments/stripe-capture-policy";
import { createServiceRoleClient } from "../../shared/supabase-admin";
import {
  ensureMemberListingAcceptsAuthentication,
  findMemberListingForIntegration,
  seedPendingMemberAuthOrders,
  seedPendingMerchantOrders,
} from "../../rewards/helpers/checkout-fixture";
import { getBuyerUserId } from "../../shared/auth-context";
import {
  prepareMerchantAuthOrderPayment,
  promoteMerchantAuthOrderThroughIntake,
  readMerchantAuthPipelineAmounts,
} from "./grading-merchant-fixture";

export type GradingFailStripeSmokeContext = {
  orderId: string;
  paymentIntentId: string;
  authFeeCents: number;
  buyerTotalCents: number;
};

export type PrepareGradingFailPayload = {
  success?: boolean;
  void_mode?: string;
  capture_cents?: number;
  payment_intent_id?: string;
  admin_id?: string;
  escrow_capture_model?: string;
};

export type PrepareGradingPassPayload = {
  success?: boolean;
  already_applied?: boolean;
  order_kind?: string;
  order_id?: string;
  payment_intent_id?: string;
  goods_cents?: number;
  capture_cents?: number;
  admin_id?: string;
  escrow_capture_model?: string;
};

function createStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY for grading Stripe smoke");
  }

  return new Stripe(secretKey, {
    apiVersion: "2023-10-16" as Stripe.LatestApiVersion,
  });
}

export async function seedGradingFailStripeSmokeOrder(): Promise<GradingFailStripeSmokeContext> {
  const listing = await findMemberListingForIntegration();
  await ensureMemberListingAcceptsAuthentication(listing.listingId);

  const buyerId = getBuyerUserId();
  const [orderId] = await seedPendingMemberAuthOrders(
    buyerId,
    listing.listingId,
    1,
  );

  const admin = createServiceRoleClient();
  const { data: existing, error: readError } = await admin
    .from("member_orders")
    .select("final_price, item_subtotal, auth_fee")
    .eq("id", orderId)
    .maybeSingle();

  if (readError || !existing) {
    throw new Error(
      `[seedGradingFailStripeSmokeOrder] read: ${readError?.message ?? "missing order"}`,
    );
  }

  const itemSubtotal = Number(existing.item_subtotal ?? existing.final_price ?? 0);
  const authFee = Number(existing.auth_fee) > 0 ? Number(existing.auth_fee) : 150;
  const inbound = 30;
  const outbound = 30;
  const buyerTotal = itemSubtotal + authFee + inbound + outbound;
  const buyerTotalCents = Math.round(buyerTotal * 100);
  const authFeeCents = Math.round(authFee * 100);

  const stripe = createStripeClient();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: buyerTotalCents,
    currency: "hkd",
    capture_method: "manual",
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: "never",
    },
    payment_method_options: {
      card: {
        request_multicapture: "if_available",
      },
    },
    payment_method: "pm_card_visa",
    confirm: true,
    metadata: {
      order_kind: "member_auth",
      order_id: orderId,
      integration_smoke: "grading_fail_stripe",
    },
  });

  if (paymentIntent.status !== "requires_capture") {
    throw new Error(
      `[seedGradingFailStripeSmokeOrder] expected requires_capture, got ${paymentIntent.status}`,
    );
  }

  const { error: authError } = await admin.rpc(
    "rpc_mark_member_auth_order_authorized",
    {
      p_order_id: orderId,
      p_payment_intent_id: paymentIntent.id,
      p_amounts: {
        item_subtotal: itemSubtotal,
        auth_fee: authFee,
        inbound_shipping_fee: inbound,
        outbound_shipping_fee: outbound,
        total_amount: buyerTotal,
        buyer_total_amount: buyerTotal,
        platform_subsidy_amount: 0,
      },
    },
  );

  if (authError) {
    throw new Error(`[seedGradingFailStripeSmokeOrder] authorize: ${authError.message}`);
  }

  const { error: gradingError } = await admin
    .from("member_orders")
    .update({
      escrow_status: "grading",
      platform_received_at: new Date().toISOString(),
      inbound_tracking_no: `SF-STRIPE-${orderId.slice(0, 8)}`,
      payment_capture_status: "authorized",
      escrow_capture_model: "single",
      refund_status: "none",
      refund_error: null,
      auth_result: null,
      fault_party: null,
      item_subtotal: itemSubtotal,
      auth_fee: authFee,
      inbound_shipping_fee: inbound,
      outbound_shipping_fee: outbound,
      total_amount: buyerTotal,
      buyer_total_amount: buyerTotal,
    })
    .eq("id", orderId);

  if (gradingError) {
    throw new Error(`[seedGradingFailStripeSmokeOrder] grading: ${gradingError.message}`);
  }

  return {
    orderId,
    paymentIntentId: paymentIntent.id,
    authFeeCents,
    buyerTotalCents,
  };
}

/** Same seed path as fail smoke — authorized single-capture order in grading. */
export const seedGradingPassStripeSmokeOrder = seedGradingFailStripeSmokeOrder;

export async function seedMerchantGradingPassStripeSmokeOrder(params: {
  listingId: string;
  buyerId: string;
  sellerId: string;
  buyerClient: SupabaseClient<Database>;
  sellerClient: SupabaseClient<Database>;
  adminClient: SupabaseClient<Database>;
}): Promise<GradingFailStripeSmokeContext> {
  const [orderId] = await seedPendingMerchantOrders(
    params.buyerId,
    params.listingId,
    1,
  );

  await prepareMerchantAuthOrderPayment(params.buyerClient, orderId);
  const amounts = await readMerchantAuthPipelineAmounts(orderId);

  const stripe = createStripeClient();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amounts.buyerTotalCents,
    currency: "hkd",
    capture_method: "manual",
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: "never",
    },
    payment_method_options: {
      card: {
        request_multicapture: "if_available",
      },
    },
    payment_method: "pm_card_visa",
    confirm: true,
    metadata: {
      order_kind: "merchant_auth",
      order_id: orderId,
      integration_smoke: "grading_pass_stripe_merchant",
    },
  });

  if (paymentIntent.status !== "requires_capture") {
    throw new Error(
      `[seedMerchantGradingPassStripeSmokeOrder] expected requires_capture, got ${paymentIntent.status}`,
    );
  }

  const admin = createServiceRoleClient();
  const { error: authError } = await admin.rpc("rpc_mark_merchant_order_authorized", {
    p_order_id: orderId,
    p_payment_intent_id: paymentIntent.id,
    p_amounts: {},
  });

  if (authError) {
    throw new Error(
      `[seedMerchantGradingPassStripeSmokeOrder] authorize: ${authError.message}`,
    );
  }

  await promoteMerchantAuthOrderThroughIntake({
    orderId,
    paymentIntentId: paymentIntent.id,
    merchantId: params.sellerId,
    inbound: {
      trackingNo: `SF-MPASS-${orderId.slice(0, 8)}`,
      courierName: "SF Express",
    },
    sellerClient: params.sellerClient,
    adminClient: params.adminClient,
  });

  return {
    orderId,
    paymentIntentId: paymentIntent.id,
    authFeeCents: Math.round(amounts.authFee * 100),
    buyerTotalCents: amounts.buyerTotalCents,
  };
}

export async function promoteStripeSmokeOrderToLegacyGrading(
  ctx: GradingFailStripeSmokeContext,
): Promise<void> {
  const stripe = createStripeClient();
  const admin = createServiceRoleClient();

  await stripe.paymentIntents.capture(ctx.paymentIntentId, {
    amount_to_capture: ctx.authFeeCents,
    final_capture: false,
    metadata: {
      capture_stage: "auth_fee",
      order_kind: "auth_grading_member",
      order_id: ctx.orderId,
      integration_smoke: "legacy_intake",
    },
  });

  const { error } = await admin
    .from("member_orders")
    .update({
      escrow_capture_model: null,
      payment_capture_status: "auth_fee_captured",
    })
    .eq("id", ctx.orderId);

  if (error) {
    throw new Error(`[promoteStripeSmokeOrderToLegacyGrading] ${error.message}`);
  }
}

export async function prepareAuthGradingFail(
  client: SupabaseClient<Database>,
  params: {
    orderId: string;
    faultParty: "buyer" | "seller";
    reason: string;
  },
): Promise<PrepareGradingFailPayload> {
  const { data, error } = await client.rpc("rpc_prepare_auth_grading_fail", {
    p_order_kind: "member",
    p_order_id: params.orderId,
    p_fault_party: params.faultParty,
    p_reason: params.reason,
  });

  if (error) {
    throw new Error(`[prepareAuthGradingFail] ${error.message}`);
  }

  return data as PrepareGradingFailPayload;
}

export async function finalizeAuthGradingFail(
  client: SupabaseClient<Database>,
  params: { orderId: string; paymentIntentId: string },
): Promise<void> {
  const { error } = await client.rpc("rpc_finalize_auth_grading_fail", {
    p_order_kind: "member",
    p_order_id: params.orderId,
    p_payment_intent_id: params.paymentIntentId,
  });

  if (error) {
    throw new Error(`[finalizeAuthGradingFail] ${error.message}`);
  }
}

export async function executeGradingFailStripeLeg(
  prepared: PrepareGradingFailPayload,
  orderId: string,
): Promise<void> {
  const voidMode = (prepared.void_mode ?? "capture_zero") as
    | "cancel"
    | "capture_zero"
    | "capture_auth_fee_only";
  const paymentIntentId = prepared.payment_intent_id;
  const adminId = prepared.admin_id;

  if (!paymentIntentId || !adminId) {
    throw new Error("[executeGradingFailStripeLeg] missing payment_intent_id or admin_id");
  }

  const stripe = createStripeClient();
  const idempotencyKey = buildAuthGradingFailIdempotencyKey({
    voidMode,
    orderKind: "member",
    orderId,
    escrowCaptureModel: prepared.escrow_capture_model,
    suffix: "stripe-smoke",
  });

  if (voidMode === "capture_auth_fee_only") {
    const captureCents = prepared.capture_cents ?? 0;
    if (captureCents <= 0) {
      throw new Error("[executeGradingFailStripeLeg] invalid capture_cents");
    }

    await stripe.paymentIntents.capture(
      paymentIntentId,
      buildAuthFeeOnlyCaptureParams({
        escrowCaptureModel: prepared.escrow_capture_model,
        amountCents: captureCents,
        metadata: {
          capture_stage: "auth_grading_fail",
          order_kind: "auth_grading_member",
          order_id: orderId,
          admin_id: adminId,
          ...(prepared.escrow_capture_model
            ? { escrow_capture_model: prepared.escrow_capture_model }
            : {}),
        },
      }),
      { idempotencyKey },
    );
    return;
  }

  if (voidMode === "cancel") {
    await stripe.paymentIntents.cancel(paymentIntentId, undefined, {
      idempotencyKey,
    });
    return;
  }

  await stripe.paymentIntents.capture(
    paymentIntentId,
    buildCaptureZeroParams({
      capture_stage: "auth_grading_fail",
      order_kind: "auth_grading_member",
      order_id: orderId,
      admin_id: adminId,
    }),
    { idempotencyKey },
  );
}

export async function retrievePaymentIntent(
  paymentIntentId: string,
): Promise<Stripe.PaymentIntent> {
  const stripe = createStripeClient();
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

export async function prepareAuthGradingPass(
  client: SupabaseClient<Database>,
  params: {
    orderId: string;
    gradingCompany: string;
    gradingScore: string | null;
    notes?: string;
  },
): Promise<PrepareGradingPassPayload> {
  const { data, error } = await client.rpc("rpc_prepare_goods_capture", {
    p_order_kind: "member",
    p_order_id: params.orderId,
    p_notes: params.notes,
    p_auth_grading_company: params.gradingCompany,
    p_auth_grading_score: params.gradingScore ?? undefined,
  });

  if (error) {
    throw new Error(`[prepareAuthGradingPass] ${error.message}`);
  }

  return data as PrepareGradingPassPayload;
}

export async function prepareMerchantAuthGradingPass(
  client: SupabaseClient<Database>,
  params: {
    orderId: string;
    gradingCompany: string;
    gradingScore: string | null;
    notes?: string;
  },
): Promise<PrepareGradingPassPayload> {
  const { data, error } = await client.rpc("rpc_prepare_goods_capture", {
    p_order_kind: "merchant",
    p_order_id: params.orderId,
    p_notes: params.notes,
    p_auth_grading_company: params.gradingCompany,
    p_auth_grading_score: params.gradingScore ?? undefined,
  });

  if (error) {
    throw new Error(`[prepareMerchantAuthGradingPass] ${error.message}`);
  }

  return data as PrepareGradingPassPayload;
}

export async function finalizeMerchantAuthGradingPass(
  client: SupabaseClient<Database>,
  params: {
    orderId: string;
    paymentIntentId: string;
    capturedAmountCents: number;
    adminId: string;
    gradingCompany: string;
    gradingScore: string | null;
    notes?: string;
  },
): Promise<void> {
  const { error } = await client.rpc("rpc_finalize_goods_capture", {
    p_order_kind: "merchant",
    p_order_id: params.orderId,
    p_payment_intent_id: params.paymentIntentId,
    p_captured_amount_cents: params.capturedAmountCents,
    p_admin_id: params.adminId,
    p_notes: params.notes,
    p_auth_grading_company: params.gradingCompany,
    p_auth_grading_score: params.gradingScore ?? undefined,
  });

  if (error) {
    throw new Error(`[finalizeMerchantAuthGradingPass] ${error.message}`);
  }
}

export async function executeGradingPassStripeLeg(
  prepared: PrepareGradingPassPayload,
  orderId: string,
  grading: { company: string; score: string | null },
  options: {
    orderKind?: GradingCaptureOrderKind;
    stripeMetadataOrderKind?: "member_auth" | "merchant_auth";
  } = {},
): Promise<Stripe.PaymentIntent> {
  const orderKind = options.orderKind ?? "member";
  const stripeMetadataOrderKind =
    options.stripeMetadataOrderKind ??
    (orderKind === "merchant" ? "merchant_auth" : "member_auth");
  const paymentIntentId = prepared.payment_intent_id;
  const adminId = prepared.admin_id;
  const captureCents = prepared.capture_cents ?? prepared.goods_cents ?? 0;

  if (!paymentIntentId || !adminId) {
    throw new Error(
      "[executeGradingPassStripeLeg] missing payment_intent_id or admin_id",
    );
  }

  if (captureCents <= 0) {
    throw new Error("[executeGradingPassStripeLeg] invalid capture_cents");
  }

  const captureStage = resolveGoodsCaptureStage(prepared.escrow_capture_model);
  const idempotencyKey = buildGoodsCaptureIdempotencyKey({
    escrowCaptureModel: prepared.escrow_capture_model,
    orderKind,
    orderId,
    suffix: "stripe-smoke",
  });

  const stripe = createStripeClient();
  return stripe.paymentIntents.capture(
    paymentIntentId,
    buildGoodsCaptureParams({
      escrowCaptureModel: prepared.escrow_capture_model,
      amountCents: captureCents,
      metadata: {
        capture_stage: captureStage,
        admin_id: adminId,
        order_kind: stripeMetadataOrderKind,
        order_id: orderId,
        auth_grading_company: grading.company,
        ...(grading.score ? { auth_grading_score: grading.score } : {}),
        ...(prepared.escrow_capture_model
          ? { escrow_capture_model: prepared.escrow_capture_model }
          : {}),
      },
    }),
    { idempotencyKey },
  );
}

export async function finalizeAuthGradingPass(
  client: SupabaseClient<Database>,
  params: {
    orderId: string;
    paymentIntentId: string;
    capturedAmountCents: number;
    adminId: string;
    gradingCompany: string;
    gradingScore: string | null;
    notes?: string;
  },
): Promise<void> {
  const { error } = await client.rpc("rpc_finalize_goods_capture", {
    p_order_kind: "member",
    p_order_id: params.orderId,
    p_payment_intent_id: params.paymentIntentId,
    p_captured_amount_cents: params.capturedAmountCents,
    p_admin_id: params.adminId,
    p_notes: params.notes,
    p_auth_grading_company: params.gradingCompany,
    p_auth_grading_score: params.gradingScore ?? undefined,
  });

  if (error) {
    throw new Error(`[finalizeAuthGradingPass] ${error.message}`);
  }
}
