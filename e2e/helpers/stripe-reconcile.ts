import { expect } from "@playwright/test";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { executeMerchantConnectPayout } from "@/lib/merchant-order/execute-connect-payout";
import type { Database } from "@/types/supabase";
import { getProfileEmailById, getProfileIdByEmail } from "../fixtures/supabase-admin";
import { getChatRealtimeFixtures } from "../fixtures/chat-test-data";
import {
  assertListingIsActiveMerchant,
  findActiveMerchantListingForE2e,
  reactivateListingForE2e,
  trySyncMerchantOrderPaymentFromStripe,
} from "./platform-rewards";
import {
  DEFAULT_COMMISSION_RATE,
  parseCommissionRateFromSettings,
  PLATFORM_FINANCIAL_CONFIG_KEY,
} from "@/lib/platform/financial-config";

export type MerchantOrderReconcileSnapshot = {
  id: string;
  merchant_id: string | null;
  buyer_id: string | null;
  total_amount: number | null;
  buyer_total_amount: number | null;
  platform_subsidy_amount: number | null;
  item_subtotal: number | null;
  shipping_fee: number | null;
  commission_amount: number | null;
  merchant_payout_amount: number | null;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  escrow_status: string | null;
  payout_status: string | null;
  buyer_confirmed_at: string | null;
  payout_hold_until: string | null;
};

function createE2eAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env for E2E admin client");
  }
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createE2eStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY for Stripe reconcile E2E");
  }
  return new Stripe(secretKey, {
    apiVersion: "2023-10-16" as Stripe.LatestApiVersion,
  });
}

export function hasStripeReconcileEnv(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
  );
}

export async function assertSellerListingAlignment(): Promise<void> {
  const fixtures = getChatRealtimeFixtures();
  const sellerId = fixtures.sellerId?.trim();
  const sellerEmail = fixtures.sellerEmail?.trim();

  if (!sellerId || !sellerEmail) {
    throw new Error(
      "Missing E2E_SELLER_ID or E2E_SELLER_EMAIL for seller alignment",
    );
  }

  const profileId = await getProfileIdByEmail(sellerEmail);
  if (profileId !== sellerId) {
    throw new Error(
      `Seller mismatch: E2E_SELLER_EMAIL maps to ${profileId} but E2E_SELLER_ID is ${sellerId}`,
    );
  }
}

export async function resolveReconcileMerchantListing(params?: {
  excludeSellerId?: string;
  preferListingId?: string;
}): Promise<{
  listingId: string;
  sellerId: string;
}> {
  if (params?.preferListingId) {
    try {
      await reactivateListingForE2e(params.preferListingId);
      const listing = await assertListingIsActiveMerchant(params.preferListingId);
      if (
        !params.excludeSellerId ||
        listing.sellerId !== params.excludeSellerId
      ) {
        return {
          listingId: params.preferListingId,
          sellerId: listing.sellerId,
        };
      }
    } catch {
      // Fall through to seller-owned merchant listing discovery.
    }
  }

  const fixtures = getChatRealtimeFixtures();
  const sellerId = fixtures.sellerId?.trim();
  const preferredListingId = fixtures.listingId?.trim();

  if (sellerId) {
    if (preferredListingId) {
      try {
        await reactivateListingForE2e(preferredListingId);
        const listing = await assertListingIsActiveMerchant(preferredListingId);
        if (listing.sellerId === sellerId) {
          return { listingId: preferredListingId, sellerId };
        }
      } catch {
        // Fall through to seller-owned merchant listing discovery.
      }
    }

    const admin = createE2eAdminClient();
    const { data, error } = await admin
      .from("listings")
      .select("id, seller_id, status, seller_persona")
      .eq("seller_id", sellerId)
      .eq("seller_persona", "merchant")
      .in("status", ["active", "inactive", "sold"])
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(`[resolveReconcileMerchantListing] ${error.message}`);
    }

    for (const row of data ?? []) {
      if (!row.id) {
        continue;
      }

      await reactivateListingForE2e(row.id);
      try {
        const listing = await assertListingIsActiveMerchant(row.id);
        return { listingId: row.id, sellerId: listing.sellerId };
      } catch {
        continue;
      }
    }
  }

  const discovered = await findActiveMerchantListingForE2e({
    excludeSellerId: params?.excludeSellerId,
    preferListingId: params?.preferListingId,
  });
  return {
    listingId: discovered.listingId,
    sellerId: discovered.sellerId,
  };
}

export async function getMerchantOrderReconcileSnapshot(
  orderId: string,
): Promise<MerchantOrderReconcileSnapshot | null> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("merchant_orders")
    .select(
      `
      id,
      merchant_id,
      buyer_id,
      total_amount,
      buyer_total_amount,
      platform_subsidy_amount,
      item_subtotal,
      shipping_fee,
      commission_amount,
      merchant_payout_amount,
      stripe_payment_intent_id,
      stripe_transfer_id,
      escrow_status,
      payout_status,
      buyer_confirmed_at,
      payout_hold_until
    `,
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getMerchantOrderReconcileSnapshot] ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    merchant_id: data.merchant_id,
    buyer_id: data.buyer_id,
    total_amount: data.total_amount == null ? null : Number(data.total_amount),
    buyer_total_amount:
      data.buyer_total_amount == null ? null : Number(data.buyer_total_amount),
    platform_subsidy_amount:
      data.platform_subsidy_amount == null
        ? null
        : Number(data.platform_subsidy_amount),
    item_subtotal:
      data.item_subtotal == null ? null : Number(data.item_subtotal),
    shipping_fee: data.shipping_fee == null ? null : Number(data.shipping_fee),
    commission_amount:
      data.commission_amount == null ? null : Number(data.commission_amount),
    merchant_payout_amount:
      data.merchant_payout_amount == null
        ? null
        : Number(data.merchant_payout_amount),
    stripe_payment_intent_id: data.stripe_payment_intent_id,
    stripe_transfer_id: data.stripe_transfer_id,
    escrow_status: data.escrow_status,
    payout_status: data.payout_status,
    buyer_confirmed_at: data.buyer_confirmed_at,
    payout_hold_until: data.payout_hold_until,
  };
}

export async function waitForMerchantOrderPaymentHeld(
  orderId: string,
  timeoutMs = process.env.PRODUCTION_GATE === "1" ? 180_000 : 60_000,
): Promise<MerchantOrderReconcileSnapshot> {
  let last: MerchantOrderReconcileSnapshot | null = null;

  await expect
    .poll(
      async () => {
        last = await getMerchantOrderReconcileSnapshot(orderId);
        if (!last) {
          return false;
        }
        if (
          last.escrow_status === "payment_held" &&
          Boolean(last.stripe_payment_intent_id?.trim()) &&
          last.buyer_total_amount != null &&
          last.buyer_total_amount > 0
        ) {
          return true;
        }
        await trySyncMerchantOrderPaymentFromStripe(orderId);
        last = await getMerchantOrderReconcileSnapshot(orderId);
        if (!last) {
          return false;
        }
        return (
          last.escrow_status === "payment_held" &&
          Boolean(last.stripe_payment_intent_id?.trim()) &&
          last.buyer_total_amount != null &&
          last.buyer_total_amount > 0
        );
      },
      { timeout: timeoutMs },
    )
    .toBe(true);

  return last!;
}

async function createSignedSupabaseClient(email: string, password: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing Supabase public env for signed RPC client");
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`[createSignedSupabaseClient] ${error.message}`);
  }

  return client;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function getPlatformCommissionRate(): Promise<number> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", PLATFORM_FINANCIAL_CONFIG_KEY)
    .maybeSingle();

  if (error || !data?.value) {
    return DEFAULT_COMMISSION_RATE;
  }

  return parseCommissionRateFromSettings(data.value);
}

export async function expectedMerchantPayoutFromGross(params: {
  itemSubtotal: number;
  shippingFee: number;
  commissionRate?: number;
}): Promise<number> {
  const commissionRate = params.commissionRate ?? (await getPlatformCommissionRate());
  const commission = roundMoney(params.itemSubtotal * commissionRate);
  return roundMoney(params.itemSubtotal - commission + params.shippingFee);
}

export async function assertMerchantPayoutGross(
  snapshot: MerchantOrderReconcileSnapshot,
): Promise<void> {
  const itemSubtotal = snapshot.item_subtotal ?? 0;
  const shippingFee = snapshot.shipping_fee ?? 0;
  const payout = snapshot.merchant_payout_amount;
  const buyerTotal = snapshot.buyer_total_amount ?? 0;
  const subsidy = snapshot.platform_subsidy_amount ?? 0;

  expect(payout).not.toBeNull();
  const expected = await expectedMerchantPayoutFromGross({
    itemSubtotal,
    shippingFee,
  });
  expect(Math.abs(Number(payout) - expected)).toBeLessThanOrEqual(0.02);

  // Subsidized orders may still have merchant_payout <= buyer_total when subsidy < commission;
  // execute-connect-payout binds source_transaction in that case (see assertTransferPayoutRule).
  void buyerTotal;
  void subsidy;
}

export async function assertPaymentIntentMatchesBuyerTotal(
  orderId: string,
): Promise<void> {
  const snapshot = await waitForMerchantOrderPaymentHeld(orderId);
  const piId = snapshot.stripe_payment_intent_id;
  expect(piId).toBeTruthy();

  const buyerTotal = snapshot.buyer_total_amount!;
  const expectedCents = Math.round(buyerTotal * 100);

  const stripe = createE2eStripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(piId!);

  expect(paymentIntent.currency).toBe("hkd");
  expect(paymentIntent.amount).toBe(expectedCents);
  expect(paymentIntent.metadata?.order_id).toBe(orderId);

  if (paymentIntent.status === "succeeded") {
    expect(paymentIntent.amount_received).toBeGreaterThanOrEqual(expectedCents);
  }
}

export async function submitMerchantDirectFulfillment(params: {
  orderId: string;
  sellerId: string;
  trackingNo?: string;
  courierName?: string;
}): Promise<void> {
  const fixtures = getChatRealtimeFixtures();
  const sellerPassword =
    fixtures.sellerPassword?.trim() ??
    process.env.E2E_MERCHANT_CHECKOUT_PASSWORD?.trim();

  if (!sellerPassword) {
    throw new Error(
      "Missing E2E_SELLER_PASSWORD or E2E_MERCHANT_CHECKOUT_PASSWORD for fulfillment",
    );
  }

  const configuredSellerId = fixtures.sellerId?.trim();
  const sellerEmail =
    configuredSellerId && params.sellerId === configuredSellerId
      ? fixtures.sellerEmail?.trim()
      : await getProfileEmailById(params.sellerId);

  if (!sellerEmail) {
    throw new Error(
      `[submitMerchantDirectFulfillment] no email found for seller ${params.sellerId}`,
    );
  }

  const client = await createSignedSupabaseClient(sellerEmail, sellerPassword);
  const { error } = await client.rpc("rpc_submit_merchant_direct_fulfillment", {
    p_order_id: params.orderId,
    p_merchant_id: params.sellerId,
    p_tracking_no: params.trackingNo ?? "E2E1234567890",
    p_courier_name: params.courierName ?? "順豐速運",
  });

  if (error) {
    throw new Error(`[submitMerchantDirectFulfillment] ${error.message}`);
  }
}

export async function confirmMerchantBuyerReceipt(params: {
  orderId: string;
  buyerEmail: string;
  buyerPassword: string;
}): Promise<void> {
  const client = await createSignedSupabaseClient(
    params.buyerEmail,
    params.buyerPassword,
  );
  const { error } = await client.rpc("rpc_confirm_merchant_buyer_receipt", {
    p_order_id: params.orderId,
  });

  if (error) {
    throw new Error(`[confirmMerchantBuyerReceipt] ${error.message}`);
  }
}

export async function getUnsettledGradingRecoveryTotal(
  sellerId: string,
): Promise<number> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin.rpc(
    "fn_merchant_unsettled_grading_recovery",
    { p_merchant_id: sellerId },
  );

  if (error) {
    throw new Error(`[getUnsettledGradingRecoveryTotal] ${error.message}`);
  }

  return (data ?? []).reduce(
    (sum, row) => sum + Number(row.remaining_hkd ?? 0),
    0,
  );
}

/** Settles grading_fail_recovery debt left by integration grading on E2E_SELLER_ID. */
export async function clearUnsettledGradingRecoveryForE2e(
  sellerId: string,
): Promise<void> {
  const admin = createE2eAdminClient();
  const { error } = await (
    admin as unknown as {
      rpc: (
        fn: "rpc_e2e_clear_unsettled_grading_recovery",
        args: { p_merchant_id: string },
      ) => Promise<{ error: { message: string } | null }>;
    }
  ).rpc("rpc_e2e_clear_unsettled_grading_recovery", {
    p_merchant_id: sellerId,
  });

  if (error) {
    throw new Error(`[clearUnsettledGradingRecoveryForE2e] ${error.message}`);
  }
}

export async function backdatePayoutHold(orderId: string): Promise<void> {
  const admin = createE2eAdminClient();
  const { error } = await (
    admin as unknown as {
      rpc: (
        fn: "rpc_e2e_backdate_merchant_payout_hold",
        args: { p_order_id: string },
      ) => Promise<{ error: { message: string } | null }>;
    }
  ).rpc("rpc_e2e_backdate_merchant_payout_hold", { p_order_id: orderId });

  if (error) {
    throw new Error(`[backdatePayoutHold] ${error.message}`);
  }
}

export async function runMerchantConnectPayout(
  orderId: string,
): Promise<string> {
  const result = await executeMerchantConnectPayout(orderId);
  if (!result.success) {
    throw new Error(
      `[runMerchantConnectPayout] ${result.error} (order ${orderId})`,
    );
  }
  if (result.alreadyApplied) {
    const snapshot = await getMerchantOrderReconcileSnapshot(orderId);
    if (!snapshot?.stripe_transfer_id) {
      throw new Error(
        `[runMerchantConnectPayout] already applied but no transfer id on order ${orderId}`,
      );
    }
    return snapshot.stripe_transfer_id;
  }
  if (!result.transferId) {
    throw new Error(
      `[runMerchantConnectPayout] zero-net payout (grading recovery likely exceeded gross) for ${orderId}`,
    );
  }
  return result.transferId;
}

export async function assertTransferPayoutRule(params: {
  transferId: string;
  merchantPayoutAmount: number;
  buyerTotalAmount: number;
}): Promise<void> {
  const stripe = createE2eStripeClient();
  const transfer = await stripe.transfers.retrieve(params.transferId);

  const payoutCents = Math.round(params.merchantPayoutAmount * 100);
  const buyerCents = Math.round(params.buyerTotalAmount * 100);

  expect(transfer.amount).toBe(payoutCents);
  expect(transfer.currency).toBe("hkd");

  if (payoutCents > buyerCents) {
    expect(transfer.source_transaction).toBeNull();
  } else {
    expect(transfer.source_transaction).toBeTruthy();
  }
}

export async function advanceOrderToPayoutReady(params: {
  orderId: string;
  sellerId: string;
  buyerEmail: string;
  buyerPassword: string;
}): Promise<MerchantOrderReconcileSnapshot> {
  await waitForMerchantOrderPaymentHeld(params.orderId);

  await submitMerchantDirectFulfillment({
    orderId: params.orderId,
    sellerId: params.sellerId,
  });

  const shipped = await getMerchantOrderReconcileSnapshot(params.orderId);
  expect(shipped?.escrow_status).toBe("shipped");

  await confirmMerchantBuyerReceipt({
    orderId: params.orderId,
    buyerEmail: params.buyerEmail,
    buyerPassword: params.buyerPassword,
  });

  const held = await expect
    .poll(async () => {
      const row = await getMerchantOrderReconcileSnapshot(params.orderId);
      return row?.payout_status === "held" && row.merchant_payout_amount != null;
    })
    .toBe(true)
    .then(async () => getMerchantOrderReconcileSnapshot(params.orderId));

  expect(held).toBeTruthy();
  await assertMerchantPayoutGross(held!);

  await backdatePayoutHold(params.orderId);
  return held!;
}
