/**
 * Seed one ready FPS payout_request for admin E2E (銷帳 dialog).
 * Run: bun run seed:fps-payout-e2e
 *
 * Requires: prelaunch env (SUPABASE_SERVICE_ROLE_KEY, E2E_BUYER_*, E2E_LISTING_ID).
 * Idempotent per run: creates a new order via e2e seed RPC; safe to re-run for fresh ready row.
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

async function main() {
  const listingId = readEnv("E2E_LISTING_ID");
  if (!listingId) {
    throw new Error("Missing E2E_LISTING_ID");
  }

  const admin = createServiceClient();
  const buyerId = await getBuyerProfileIdFromEnv();
  if (!buyerId) {
    throw new Error("Missing E2E_BUYER_EMAIL or buyer profile not found");
  }

  const { data: orderId, error: seedError } = await admin.rpc(
    "rpc_e2e_seed_member_auth_refund_eligible_order",
    {
      p_listing_id: listingId,
      p_buyer_id: buyerId,
    },
  );
  if (seedError || !orderId) {
    throw new Error(
      `[seed-fps-payout-e2e] seed failed: ${seedError?.message ?? "missing order id"}`,
    );
  }

  const { data: orderRow } = await admin
    .from("member_orders")
    .select("seller_id")
    .eq("id", orderId)
    .single();

  const suffix = randomUUID().slice(0, 8);
  await admin
    .from("profiles")
    .update({
      fps_id: `e2e-fps-${suffix}`,
      fps_name: "E2E FPS Seller",
    })
    .eq("id", orderRow!.seller_id);

  await admin
    .from("member_orders")
    .update({
      payout_hold_until: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })
    .eq("id", orderId);

  const { error: finalizeError } = await admin.rpc(
    "rpc_finalize_member_fps_payout_ready",
    { p_order_id: orderId },
  );
  if (finalizeError) {
    throw new Error(`[seed-fps-payout-e2e] finalize failed: ${finalizeError.message}`);
  }

  const { data: payoutRow } = await admin
    .from("payout_requests")
    .select("id, status")
    .eq("order_id", orderId)
    .single();

  console.log(
    JSON.stringify(
      {
        orderId,
        payoutRequestId: payoutRow?.id,
        status: payoutRow?.status,
        hint: "Run e2e/admin-stripe-finance.spec.ts FPS 銷帳 flow on /admin/payouts",
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
