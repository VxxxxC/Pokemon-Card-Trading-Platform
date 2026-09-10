import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  invokeAuthPreparePayment,
  seedPendingMerchantOrders,
} from "../../rewards/helpers/checkout-fixture";
import { createServiceRoleClient } from "../../shared/supabase-admin";

export type MerchantListingForSeller = {
  listingId: string;
  sellerId: string;
  price: number;
};

export async function findMerchantListingForSellerIntegration(
  sellerId: string,
): Promise<MerchantListingForSeller> {
  const admin = createServiceRoleClient();

  const { data: kycRow, error: kycError } = await admin
    .from("kyc_records")
    .select("merchant_id, kyc_status, stripe_charges_enabled, stripe_payouts_enabled")
    .eq("merchant_id", sellerId)
    .maybeSingle();

  if (kycError) {
    throw new Error(`[findMerchantListingForSellerIntegration] kyc: ${kycError.message}`);
  }

  if (
    !kycRow ||
    kycRow.kyc_status !== "verified" ||
    !kycRow.stripe_charges_enabled ||
    !kycRow.stripe_payouts_enabled
  ) {
    throw new Error(
      "[findMerchantListingForSellerIntegration] E2E seller is not a payout-ready merchant",
    );
  }

  const { data: listings, error: listingError } = await admin
    .from("listings")
    .select("id, seller_id, price, seller_persona, status")
    .eq("seller_persona", "merchant")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (listingError) {
    throw new Error(`[findMerchantListingForSellerIntegration] listings: ${listingError.message}`);
  }

  const match = (listings ?? []).find((row) => row.seller_id === sellerId);
  if (!match?.id || !match.seller_id) {
    throw new Error(
      "[findMerchantListingForSellerIntegration] no merchant listing for warmed seller session",
    );
  }

  if (match.status !== "active") {
    const { error: activateError } = await admin
      .from("listings")
      .update({ status: "active" })
      .eq("id", match.id);
    if (activateError) {
      throw new Error(
        `[findMerchantListingForSellerIntegration] reactivate: ${activateError.message}`,
      );
    }
  }

  return {
    listingId: match.id,
    sellerId: match.seller_id,
    price: Number(match.price ?? 0),
  };
}

export async function submitMerchantAuthInboundForPipeline(
  orderId: string,
  merchantId: string,
  params: { trackingNo: string; courierName: string },
  sellerClient: SupabaseClient<Database>,
): Promise<void> {
  const { error } = await sellerClient.rpc("rpc_submit_merchant_auth_inbound_tracking", {
    p_order_id: orderId,
    p_merchant_id: merchantId,
    p_tracking_no: params.trackingNo,
    p_courier_name: params.courierName,
  });
  if (error) {
    throw new Error(`[submitMerchantAuthInboundForPipeline] rpc: ${error.message}`);
  }
}

export type MerchantAuthPipelineAmounts = {
  itemSubtotal: number;
  authFee: number;
  inbound: number;
  outbound: number;
  buyerTotal: number;
  buyerTotalCents: number;
};

export async function readMerchantAuthPipelineAmounts(
  orderId: string,
): Promise<MerchantAuthPipelineAmounts> {
  const admin = createServiceRoleClient();
  const { data: existing, error: readError } = await admin
    .from("merchant_orders")
    .select("final_price, item_subtotal, auth_fee, inbound_shipping_fee, outbound_shipping_fee, buyer_total_amount, total_amount")
    .eq("id", orderId)
    .maybeSingle();

  if (readError || !existing) {
    throw new Error(
      `[readMerchantAuthPipelineAmounts] read: ${readError?.message ?? "missing order"}`,
    );
  }

  const itemSubtotal = Number(existing.item_subtotal ?? existing.final_price ?? 0);
  const authFee = Number(existing.auth_fee) > 0 ? Number(existing.auth_fee) : 150;
  const inbound =
    Number(existing.inbound_shipping_fee) > 0
      ? Number(existing.inbound_shipping_fee)
      : 30;
  const outbound =
    Number(existing.outbound_shipping_fee) > 0
      ? Number(existing.outbound_shipping_fee)
      : 30;
  const buyerTotal = Number(
    existing.buyer_total_amount ?? existing.total_amount ?? itemSubtotal + authFee + inbound + outbound,
  );

  return {
    itemSubtotal,
    authFee,
    inbound,
    outbound,
    buyerTotal,
    buyerTotalCents: Math.round(buyerTotal * 100),
  };
}

export async function prepareMerchantAuthOrderPayment(
  client: SupabaseClient<Database>,
  orderId: string,
): Promise<void> {
  const { error } = await client.rpc("rpc_prepare_merchant_order_payment", {
    p_order_id: orderId,
    p_shipping_method: "meetup",
    p_use_auth: true,
    p_sf_locker_code: null,
    p_sf_address: null,
    p_buyer_phone: "91234567",
    p_meetup_detail: "Grading merchant happy path",
    p_buyer_remark: null,
    p_user_reward_id: null,
  });

  if (error) {
    throw new Error(`[prepareMerchantAuthOrderPayment] ${error.message}`);
  }
}

export async function authorizeMerchantAuthOrderForPipeline(
  client: SupabaseClient<Database>,
  orderId: string,
  paymentIntentId: string,
): Promise<MerchantAuthPipelineAmounts> {
  await prepareMerchantAuthOrderPayment(client, orderId);

  const admin = createServiceRoleClient();
  const amounts = await readMerchantAuthPipelineAmounts(orderId);

  const { data: prepared, error: readError } = await admin
    .from("merchant_orders")
    .select("escrow_capture_model, requires_authentication")
    .eq("id", orderId)
    .maybeSingle();

  if (readError || !prepared) {
    throw new Error(
      `[authorizeMerchantAuthOrderForPipeline] read: ${readError?.message ?? "missing order"}`,
    );
  }

  if (prepared.escrow_capture_model !== "single") {
    throw new Error(
      `[authorizeMerchantAuthOrderForPipeline] expected escrow_capture_model=single, got ${String(prepared.escrow_capture_model)}`,
    );
  }

  if (!prepared.requires_authentication) {
    throw new Error("[authorizeMerchantAuthOrderForPipeline] requires_authentication must be true");
  }

  const { error: authError } = await admin.rpc("rpc_mark_merchant_order_authorized", {
    p_order_id: orderId,
    p_payment_intent_id: paymentIntentId,
    p_amounts: {},
  });

  if (authError) {
    throw new Error(`[authorizeMerchantAuthOrderForPipeline] authorize: ${authError.message}`);
  }

  return amounts;
}

export async function getMerchantOrderMerchantId(orderId: string): Promise<string> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("merchant_orders")
    .select("merchant_id")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data?.merchant_id) {
    throw new Error(`[getMerchantOrderMerchantId] ${error?.message ?? "missing merchant"}`);
  }

  return data.merchant_id;
}

export type MerchantAuthAuthenticatingOrder = {
  orderId: string;
  paymentIntentId: string;
  authFeeCents: number;
  buyerTotal: number;
};

export async function seedMerchantAuthOrderAtAuthenticating(params: {
  listingId: string;
  buyerId: string;
  sellerId: string;
  suffix: string;
  buyerClient: SupabaseClient<Database>;
  sellerClient: SupabaseClient<Database>;
  adminClient: SupabaseClient<Database>;
}): Promise<MerchantAuthAuthenticatingOrder> {
  const [orderId] = await seedPendingMerchantOrders(params.buyerId, params.listingId, 1);
  const paymentIntentId = `pi_mauth_${params.suffix}_${orderId.slice(0, 8)}`;

  const amounts = await authorizeMerchantAuthOrderForPipeline(
    params.buyerClient,
    orderId,
    paymentIntentId,
  );

  const inbound = {
    trackingNo: `SF-IN-${params.suffix}`,
    courierName: "SF Express",
  };

  await submitMerchantAuthInboundForPipeline(
    orderId,
    params.sellerId,
    inbound,
    params.sellerClient,
  );

  await finalizeMerchantAuthOrderIntake({
    orderId,
    paymentIntentId,
    adminClient: params.adminClient,
  });

  return {
    orderId,
    paymentIntentId,
    authFeeCents: Math.round(amounts.authFee * 100),
    buyerTotal: amounts.buyerTotal,
  };
}

export async function seedMerchantAuthOrderAtAuthenticatingWithCoupon(params: {
  listingId: string;
  buyerId: string;
  sellerId: string;
  suffix: string;
  couponId: string;
  buyerClient: SupabaseClient<Database>;
  sellerClient: SupabaseClient<Database>;
  adminClient: SupabaseClient<Database>;
}): Promise<MerchantAuthAuthenticatingOrder> {
  const [orderId] = await seedPendingMerchantOrders(
    params.buyerId,
    params.listingId,
    1,
  );
  const paymentIntentId = `pi_mcoup_${params.suffix}_${orderId.slice(0, 8)}`;

  const prepared = await invokeAuthPreparePayment(
    params.buyerClient,
    orderId,
    params.couponId,
  );
  if (!prepared.success) {
    throw new Error(
      `[seedMerchantAuthOrderAtAuthenticatingWithCoupon] prepare: ${prepared.error}`,
    );
  }

  const admin = createServiceRoleClient();
  const amounts = await readMerchantAuthPipelineAmounts(orderId);

  const { error: authError } = await admin.rpc("rpc_mark_merchant_order_authorized", {
    p_order_id: orderId,
    p_payment_intent_id: paymentIntentId,
    p_amounts: {},
  });
  if (authError) {
    throw new Error(
      `[seedMerchantAuthOrderAtAuthenticatingWithCoupon] authorize: ${authError.message}`,
    );
  }

  await submitMerchantAuthInboundForPipeline(
    orderId,
    params.sellerId,
    {
      trackingNo: `SF-IN-COUP-${params.suffix}`,
      courierName: "SF Express",
    },
    params.sellerClient,
  );

  await finalizeMerchantAuthOrderIntake({
    orderId,
    paymentIntentId,
    adminClient: params.adminClient,
  });

  return {
    orderId,
    paymentIntentId,
    authFeeCents: Math.round(amounts.authFee * 100),
    buyerTotal: amounts.buyerTotal,
  };
}

export async function finalizeMerchantAuthOrderIntake(params: {
  orderId: string;
  paymentIntentId: string;
  adminClient: SupabaseClient<Database>;
}): Promise<void> {
  const { error: prepareError } = await params.adminClient.rpc(
    "rpc_prepare_auth_intake_confirm",
    {
      p_order_kind: "merchant",
      p_order_id: params.orderId,
    },
  );
  if (prepareError) {
    throw new Error(`[finalizeMerchantAuthOrderIntake] prepare: ${prepareError.message}`);
  }

  const { error: finalizeError } = await params.adminClient.rpc(
    "rpc_finalize_auth_intake_confirm",
    {
      p_order_kind: "merchant",
      p_order_id: params.orderId,
      p_payment_intent_id: params.paymentIntentId,
    },
  );
  if (finalizeError) {
    throw new Error(`[finalizeMerchantAuthOrderIntake] finalize: ${finalizeError.message}`);
  }
}

export async function promoteMerchantAuthOrderThroughIntake(params: {
  orderId: string;
  paymentIntentId: string;
  merchantId: string;
  inbound: { trackingNo: string; courierName: string };
  sellerClient: SupabaseClient<Database>;
  adminClient: SupabaseClient<Database>;
}): Promise<void> {
  await submitMerchantAuthInboundForPipeline(
    params.orderId,
    params.merchantId,
    params.inbound,
    params.sellerClient,
  );

  await finalizeMerchantAuthOrderIntake({
    orderId: params.orderId,
    paymentIntentId: params.paymentIntentId,
    adminClient: params.adminClient,
  });
}

export async function getMerchantOrderGradingFailRow(orderId: string) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("merchant_orders")
    .select(
      "id, auth_result, payment_capture_status, fault_party, escrow_status, merchant_id, buyer_total_amount, total_amount, escrow_capture_model",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getMerchantOrderGradingFailRow] ${error.message}`);
  }

  return data;
}

export async function getMerchantLedgerGradingFailRecovery(orderId: string) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("merchant_ledgers")
    .select("order_id, merchant_id, amount, transaction_type")
    .eq("order_id", orderId)
    .eq("transaction_type", "grading_fail_recovery")
    .maybeSingle();

  if (error) {
    throw new Error(`[getMerchantLedgerGradingFailRecovery] ${error.message}`);
  }

  return data;
}
