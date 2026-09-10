/**
 * Seed held + failed merchant_orders for Partner M7 admin ledger smoke.
 * Run: bun run seed:merchant-connect-payout-e2e
 *
 * Requires: prelaunch env (SUPABASE_SERVICE_ROLE_KEY, E2E_BUYER_EMAIL/PASSWORD,
 * E2E_LISTING_ID merchant persona, E2E_SELLER_ID).
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";
import { getBuyerProfileIdFromEnv } from "../e2e/fixtures/supabase-admin";

function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function createServiceClient() {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createBuyerClient() {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const email = readEnv("E2E_BUYER_EMAIL");
  const password = readEnv("E2E_BUYER_PASSWORD");
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (!email || !password) {
    throw new Error("Missing E2E_BUYER_EMAIL or E2E_BUYER_PASSWORD");
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`[seed-merchant-connect-payout-e2e] buyer sign-in failed: ${error.message}`);
  }
  return client;
}

async function validateMerchantListing(admin: ReturnType<typeof createServiceClient>) {
  const listingId = readEnv("E2E_LISTING_ID");
  const sellerId = readEnv("E2E_SELLER_ID");
  if (!listingId || !sellerId) {
    throw new Error("Missing E2E_LISTING_ID or E2E_SELLER_ID");
  }

  const { data: listing, error: listingError } = await admin
    .from("listings")
    .select("id, seller_id, seller_persona")
    .eq("id", listingId)
    .maybeSingle();

  if (listingError) {
    throw new Error(`[seed-merchant-connect-payout-e2e] listing lookup failed: ${listingError.message}`);
  }
  if (!listing) {
    throw new Error(`[seed-merchant-connect-payout-e2e] E2E_LISTING_ID not found: ${listingId}`);
  }
  if (listing.seller_persona !== "merchant") {
    throw new Error(
      `[seed-merchant-connect-payout-e2e] E2E_LISTING_ID must be merchant persona (got ${listing.seller_persona ?? "null"})`,
    );
  }
  if (listing.seller_id !== sellerId) {
    throw new Error(
      "[seed-merchant-connect-payout-e2e] E2E_SELLER_ID does not match listing seller_id",
    );
  }

  const { data: kyc, error: kycError } = await admin
    .from("kyc_records")
    .select("kyc_status, stripe_charges_enabled, stripe_payouts_enabled")
    .eq("merchant_id", sellerId)
    .maybeSingle();

  if (kycError) {
    throw new Error(`[seed-merchant-connect-payout-e2e] KYC lookup failed: ${kycError.message}`);
  }
  if (
    kyc?.kyc_status !== "verified" ||
    !kyc.stripe_charges_enabled ||
    !kyc.stripe_payouts_enabled
  ) {
    throw new Error(
      "[seed-merchant-connect-payout-e2e] merchant must be KYC verified with Stripe charges/payouts enabled",
    );
  }

  return { listingId, sellerId };
}

async function seedShippedAwaitingConfirm(
  admin: ReturnType<typeof createServiceClient>,
  params: { listingId: string; buyerId: string; suffix: string },
): Promise<string> {
  const { data: orderId, error } = await admin.rpc(
    "rpc_e2e_seed_merchant_shipped_awaiting_confirm",
    {
      p_listing_id: params.listingId,
      p_buyer_id: params.buyerId,
      p_payment_intent_suffix: params.suffix,
      p_item_subtotal: 100,
    },
  );
  if (error || !orderId) {
    throw new Error(
      `[seed-merchant-connect-payout-e2e] seed failed: ${error?.message ?? "missing order id"}`,
    );
  }
  return orderId;
}

async function confirmBuyerReceipt(
  buyerClient: Awaited<ReturnType<typeof createBuyerClient>>,
  orderId: string,
): Promise<void> {
  const { error } = await buyerClient.rpc("rpc_confirm_merchant_buyer_receipt", {
    p_order_id: orderId,
  });
  if (error) {
    throw new Error(
      `[seed-merchant-connect-payout-e2e] buyer confirm failed: ${error.message}`,
    );
  }
}

async function fetchOrderNumber(
  admin: ReturnType<typeof createServiceClient>,
  orderId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("merchant_orders")
    .select("order_number, payout_status")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data?.order_number) {
    throw new Error(
      `[seed-merchant-connect-payout-e2e] order lookup failed: ${error?.message ?? "missing order_number"}`,
    );
  }
  return data.order_number;
}

async function main() {
  const admin = createServiceClient();
  const buyerId = await getBuyerProfileIdFromEnv();
  if (!buyerId) {
    throw new Error("Missing E2E_BUYER_EMAIL or buyer profile not found");
  }

  const { listingId } = await validateMerchantListing(admin);
  const buyerClient = await createBuyerClient();
  const runSuffix = randomUUID().slice(0, 8);

  const heldOrderId = await seedShippedAwaitingConfirm(admin, {
    listingId,
    buyerId,
    suffix: `m7-held-${runSuffix}`,
  });
  await confirmBuyerReceipt(buyerClient, heldOrderId);

  const failedOrderId = await seedShippedAwaitingConfirm(admin, {
    listingId,
    buyerId,
    suffix: `m7-failed-${runSuffix}`,
  });
  await confirmBuyerReceipt(buyerClient, failedOrderId);

  const { error: markFailedError } = await admin.rpc(
    "rpc_mark_merchant_order_payout_failed",
    {
      p_order_id: failedOrderId,
      p_error: "partner_m7_seed_failed",
    },
  );
  if (markFailedError) {
    throw new Error(
      `[seed-merchant-connect-payout-e2e] mark failed: ${markFailedError.message}`,
    );
  }

  const [heldOrderNumber, failedOrderNumber] = await Promise.all([
    fetchOrderNumber(admin, heldOrderId),
    fetchOrderNumber(admin, failedOrderId),
  ]);

  console.log(
    JSON.stringify(
      {
        heldOrderId,
        heldOrderNumber,
        failedOrderId,
        failedOrderNumber,
        hint: "Admin /admin/payouts → 💳 商戶流水 (Stripe) → search orderNumber in chip filters",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
