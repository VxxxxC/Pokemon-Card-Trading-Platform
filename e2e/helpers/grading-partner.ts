import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  ensureListingAcceptsAuthentication,
  getProfileIdByEmail,
  resolveE2eMarketplaceFixture,
} from "../fixtures/supabase-admin";

function createE2eAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env for grading partner E2E");
  }
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

export function hasGradingPartnerE2eEnv(): boolean {
  return Boolean(
    readEnv("NEXT_PUBLIC_SUPABASE_URL") &&
      readEnv("SUPABASE_SERVICE_ROLE_KEY") &&
      readEnv("E2E_BUYER_EMAIL") &&
      readEnv("E2E_ADMIN_EMAIL") &&
      readEnv("E2E_ADMIN_PASSWORD"),
  );
}

export type MemberAuthAwaitingOutboundSeed = {
  orderId: string;
  orderNumber: string;
  sellerId: string;
  buyerId: string;
};

export async function seedMemberAuthAwaitingOutbound(params?: {
  suffix?: string;
}): Promise<MemberAuthAwaitingOutboundSeed> {
  const buyerEmail = readEnv("E2E_BUYER_EMAIL");
  if (!buyerEmail) {
    throw new Error("Missing E2E_BUYER_EMAIL");
  }

  const buyerId = await getProfileIdByEmail(buyerEmail);
  if (!buyerId) {
    throw new Error(`Buyer profile not found for ${buyerEmail}`);
  }

  const fixtureResult = await resolveE2eMarketplaceFixture({
    requiredSellerPersona: "member",
  });
  if (!fixtureResult.ok) {
    throw new Error(fixtureResult.skipReason);
  }

  const { listingId, sellerId } = fixtureResult.fixture;
  if (sellerId === buyerId) {
    throw new Error("Member auth grading seed requires buyer !== seller");
  }

  await ensureListingAcceptsAuthentication(listingId);

  const suffix = params?.suffix ?? `gw1-${Date.now()}`;
  const admin = createE2eAdminClient();
  const { data: orderId, error: seedError } = await admin.rpc(
    "rpc_e2e_seed_member_auth_pending_payment_order",
    {
      p_listing_id: listingId,
      p_buyer_id: buyerId,
    },
  );

  if (seedError || !orderId) {
    throw new Error(
      `[seedMemberAuthAwaitingOutbound] ${seedError?.message ?? "missing order id"}`,
    );
  }

  const itemSubtotal = 100;
  const authFee = 150;
  const inbound = 30;
  const outbound = 30;
  const buyerTotal = itemSubtotal + authFee + inbound + outbound;
  const paymentIntentId = `pi_gw1_${suffix}`;

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
      use_authentication: true,
    })
    .eq("id", orderId);

  if (amountsError) {
    throw new Error(`[seedMemberAuthAwaitingOutbound] amounts: ${amountsError.message}`);
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
    throw new Error(`[seedMemberAuthAwaitingOutbound] authorize: ${authError.message}`);
  }

  const { error: stateError } = await admin
    .from("member_orders")
    .update({
      status: "pending",
      escrow_status: "shipped",
      auth_result: "passed",
      payment_capture_status: "fully_captured",
      outbound_tracking_no: null,
      platform_received_at: new Date().toISOString(),
      inbound_tracking_no: `SF-IN-${suffix}`,
    })
    .eq("id", orderId);

  if (stateError) {
    throw new Error(`[seedMemberAuthAwaitingOutbound] state: ${stateError.message}`);
  }

  const { data: orderRow, error: readError } = await admin
    .from("member_orders")
    .select("order_number")
    .eq("id", orderId)
    .maybeSingle();

  if (readError || !orderRow?.order_number) {
    throw new Error(
      `[seedMemberAuthAwaitingOutbound] order_number: ${readError?.message ?? "missing"}`,
    );
  }

  return {
    orderId,
    orderNumber: orderRow.order_number,
    sellerId,
    buyerId,
  };
}

export async function seedMemberAuthConfirmGuardNegative(params?: {
  suffix?: string;
}): Promise<MemberAuthAwaitingOutboundSeed> {
  const seed = await seedMemberAuthAwaitingOutbound(params);
  const admin = createE2eAdminClient();
  const suffix = params?.suffix ?? `conf1-${Date.now()}`;

  const { error } = await admin
    .from("member_orders")
    .update({
      payment_capture_status: "authorized",
      outbound_tracking_no: `SF-CONF1-${suffix}`,
    })
    .eq("id", seed.orderId);

  if (error) {
    throw new Error(`[seedMemberAuthConfirmGuardNegative] ${error.message}`);
  }

  return seed;
}

export async function seedMemberAuthAwaitingBuyerConfirm(params?: {
  suffix?: string;
}): Promise<MemberAuthAwaitingOutboundSeed> {
  const seed = await seedMemberAuthAwaitingOutbound(params);
  const admin = createE2eAdminClient();
  const suffix = params?.suffix ?? `conf-${Date.now()}`;

  const { error } = await admin
    .from("member_orders")
    .update({
      outbound_tracking_no: `SF-OUT-${suffix}`,
    })
    .eq("id", seed.orderId);

  if (error) {
    throw new Error(`[seedMemberAuthAwaitingBuyerConfirm] ${error.message}`);
  }

  return seed;
}

export async function pollMemberOrderAwaitingOutboundSeed(
  orderId: string,
  timeoutMs = 30_000,
): Promise<void> {
  const admin = createE2eAdminClient();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data, error } = await admin
      .from("member_orders")
      .select("escrow_status, auth_result, outbound_tracking_no")
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      throw new Error(`[pollMemberOrderAwaitingOutboundSeed] ${error.message}`);
    }

    if (
      data?.escrow_status === "shipped" &&
      data.auth_result === "passed" &&
      (data.outbound_tracking_no == null || data.outbound_tracking_no === "")
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `[pollMemberOrderAwaitingOutboundSeed] order ${orderId} not awaiting outbound`,
  );
}

export async function getMemberOrderOutboundTracking(
  orderId: string,
): Promise<string | null> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("member_orders")
    .select("outbound_tracking_no")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getMemberOrderOutboundTracking] ${error.message}`);
  }

  return data?.outbound_tracking_no ?? null;
}
