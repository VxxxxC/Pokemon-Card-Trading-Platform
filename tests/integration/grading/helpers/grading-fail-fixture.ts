import { createServiceRoleClient } from "../../shared/supabase-admin";

export type MemberAuthPipelineAmounts = {
  itemSubtotal: number;
  authFee: number;
  inbound: number;
  outbound: number;
  buyerTotal: number;
  buyerTotalCents: number;
};

export async function readMemberAuthPipelineAmounts(
  orderId: string,
): Promise<MemberAuthPipelineAmounts> {
  const admin = createServiceRoleClient();
  const { data: existing, error: readError } = await admin
    .from("member_orders")
    .select("final_price, item_subtotal, auth_fee")
    .eq("id", orderId)
    .maybeSingle();

  if (readError || !existing) {
    throw new Error(
      `[readMemberAuthPipelineAmounts] read: ${readError?.message ?? "missing order"}`,
    );
  }

  const itemSubtotal = Number(existing.item_subtotal ?? existing.final_price ?? 0);
  const authFee = Number(existing.auth_fee) > 0 ? Number(existing.auth_fee) : 150;
  const inbound = 30;
  const outbound = 30;
  const buyerTotal = itemSubtotal + authFee + inbound + outbound;

  return {
    itemSubtotal,
    authFee,
    inbound,
    outbound,
    buyerTotal,
    buyerTotalCents: Math.round(buyerTotal * 100),
  };
}

export async function authorizeMemberAuthOrderForPipeline(
  orderId: string,
  paymentIntentId: string,
): Promise<MemberAuthPipelineAmounts> {
  const admin = createServiceRoleClient();
  const amounts = await readMemberAuthPipelineAmounts(orderId);

  const { error: amountsError } = await admin
    .from("member_orders")
    .update({
      item_subtotal: amounts.itemSubtotal,
      auth_fee: amounts.authFee,
      inbound_shipping_fee: amounts.inbound,
      outbound_shipping_fee: amounts.outbound,
      total_amount: amounts.buyerTotal,
      buyer_total_amount: amounts.buyerTotal,
      escrow_capture_model: "single",
      use_authentication: true,
    })
    .eq("id", orderId);

  if (amountsError) {
    throw new Error(`[authorizeMemberAuthOrderForPipeline] amounts: ${amountsError.message}`);
  }

  const { error: authError } = await admin.rpc(
    "rpc_mark_member_auth_order_authorized",
    {
      p_order_id: orderId,
      p_payment_intent_id: paymentIntentId,
      p_amounts: {},
    },
  );
  if (authError) {
    throw new Error(`[authorizeMemberAuthOrderForPipeline] authorize: ${authError.message}`);
  }

  return amounts;
}

export async function getMemberOrderSellerId(orderId: string): Promise<string> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("member_orders")
    .select("seller_id")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data?.seller_id) {
    throw new Error(`[getMemberOrderSellerId] ${error?.message ?? "missing seller"}`);
  }

  return data.seller_id;
}

export async function promoteMemberAuthOrderToGradingLegacy(
  orderId: string,
  paymentIntentId: string,
): Promise<MemberAuthPipelineAmounts> {
  const admin = createServiceRoleClient();
  const amounts = await readMemberAuthPipelineAmounts(orderId);

  const { error: amountsError } = await admin
    .from("member_orders")
    .update({
      item_subtotal: amounts.itemSubtotal,
      auth_fee: amounts.authFee,
      inbound_shipping_fee: amounts.inbound,
      outbound_shipping_fee: amounts.outbound,
      total_amount: amounts.buyerTotal,
      buyer_total_amount: amounts.buyerTotal,
      escrow_capture_model: null,
      use_authentication: true,
    })
    .eq("id", orderId);

  if (amountsError) {
    throw new Error(`[promoteMemberAuthOrderToGradingLegacy] amounts: ${amountsError.message}`);
  }

  const { error: authError } = await admin.rpc(
    "rpc_mark_member_auth_order_authorized",
    {
      p_order_id: orderId,
      p_payment_intent_id: paymentIntentId,
      p_amounts: {},
    },
  );
  if (authError) {
    throw new Error(`[promoteMemberAuthOrderToGradingLegacy] authorize: ${authError.message}`);
  }

  const { error } = await admin
    .from("member_orders")
    .update({
      escrow_status: "grading",
      platform_received_at: new Date().toISOString(),
      inbound_tracking_no: `SF-LEGACY-${orderId.slice(0, 8)}`,
      payment_capture_status: "auth_fee_captured",
      escrow_capture_model: null,
      refund_status: "none",
      refund_error: null,
      auth_result: null,
      fault_party: null,
    })
    .eq("id", orderId);

  if (error) {
    throw new Error(`[promoteMemberAuthOrderToGradingLegacy] update: ${error.message}`);
  }

  return amounts;
}

export async function promoteMemberAuthOrderToGrading(
  orderId: string,
  paymentIntentId: string,
): Promise<void> {
  const admin = createServiceRoleClient();

  const amounts = await readMemberAuthPipelineAmounts(orderId);
  const itemSubtotal = amounts.itemSubtotal;
  const authFee = amounts.authFee;
  const inbound = amounts.inbound;
  const outbound = amounts.outbound;
  const buyerTotal = amounts.buyerTotal;

  const { error: amountsError } = await admin
    .from("member_orders")
    .update({
      item_subtotal: itemSubtotal,
      auth_fee: authFee,
      inbound_shipping_fee: inbound,
      outbound_shipping_fee: outbound,
      total_amount: buyerTotal,
      buyer_total_amount: buyerTotal,
      escrow_capture_model: "single",
    })
    .eq("id", orderId);

  if (amountsError) {
    throw new Error(`[promoteMemberAuthOrderToGrading] amounts: ${amountsError.message}`);
  }

  const { error: authError } = await admin.rpc(
    "rpc_mark_member_auth_order_authorized",
    {
      p_order_id: orderId,
      p_payment_intent_id: paymentIntentId,
      p_amounts: {},
    },
  );
  if (authError) {
    throw new Error(`[promoteMemberAuthOrderToGrading] authorize: ${authError.message}`);
  }

  const { error } = await admin
    .from("member_orders")
    .update({
      escrow_status: "grading",
      platform_received_at: new Date().toISOString(),
      inbound_tracking_no: `SF-GRADING-${orderId.slice(0, 8)}`,
      payment_capture_status: "authorized",
      escrow_capture_model: "single",
      refund_status: "none",
      refund_error: null,
      auth_result: null,
      fault_party: null,
    })
    .eq("id", orderId);

  if (error) {
    throw new Error(`[promoteMemberAuthOrderToGrading] update: ${error.message}`);
  }
}

export async function resetMemberAuthOrderGradingFailState(
  orderId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("member_orders")
    .update({
      escrow_status: "grading",
      status: "pending",
      auth_result: null,
      fault_party: null,
      refund_status: "none",
      refund_error: null,
      payment_capture_status: "authorized",
      seller_settlement_status: "none",
    })
    .eq("id", orderId);

  if (error) {
    throw new Error(`[resetMemberAuthOrderGradingFailState] ${error.message}`);
  }

  await admin.from("seller_receivables").delete().eq("order_id", orderId);
}

export async function getMemberOrderGradingFailRow(orderId: string) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("member_orders")
    .select(
      "id, auth_fee, buyer_total_amount, payment_capture_status, auth_result, fault_party, refund_status, escrow_capture_model, seller_id",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getMemberOrderGradingFailRow] ${error.message}`);
  }

  return data;
}

export async function getSellerReceivableForOrder(orderId: string) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("seller_receivables")
    .select("order_id, amount_hkd, status")
    .eq("order_kind", "member")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getSellerReceivableForOrder] ${error.message}`);
  }

  return data;
}

export async function promoteMemberAuthOrderToShippedPassed(
  orderId: string,
  paymentIntentId: string,
): Promise<void> {
  await promoteMemberAuthOrderToGrading(orderId, paymentIntentId);

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("member_orders")
    .update({
      use_authentication: true,
      status: "pending",
      escrow_status: "shipped",
      auth_result: "passed",
      payment_capture_status: "fully_captured",
    })
    .eq("id", orderId);

  if (error) {
    throw new Error(`[promoteMemberAuthOrderToShippedPassed] ${error.message}`);
  }
}
