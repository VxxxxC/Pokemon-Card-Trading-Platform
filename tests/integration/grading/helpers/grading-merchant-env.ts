import type { TestFunction } from "vitest";
import { it } from "vitest";
import {
  findMerchantListingForIntegration,
  ensureMerchantListingAcceptsAuthentication,
} from "../../rewards/helpers/checkout-fixture";
import {
  getSellerUserId,
  warmSession,
} from "../../shared/auth-context";
import { hasBaseIntegrationEnv } from "../../shared/env";
import { createServiceRoleClient } from "../../shared/supabase-admin";
import { findMerchantListingForSellerIntegration } from "./grading-merchant-fixture";

export type MerchantGradingContext = {
  listingId: string;
  sellerId: string;
};

let merchantGradingEnvReady = false;
let merchantGradingContext: MerchantGradingContext | null = null;

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

export function hasMerchantGradingEnvVars(): boolean {
  return Boolean(
    hasBaseIntegrationEnv() &&
      readEnv("E2E_SELLER_ID") &&
      readEnv("E2E_LISTING_ID") &&
      readEnv("E2E_SELLER_EMAIL") &&
      readEnv("E2E_SELLER_PASSWORD"),
  );
}

export function isMerchantGradingEnvReady(): boolean {
  return merchantGradingEnvReady;
}

export function getMerchantGradingContext(): MerchantGradingContext | null {
  return merchantGradingContext;
}

export function getMerchantGradingSellerId(): string {
  const sellerId = readEnv("E2E_SELLER_ID");
  if (!sellerId) {
    throw new Error("Missing E2E_SELLER_ID for merchant grading integration tests");
  }
  return sellerId;
}

export async function assertMerchantGradingEnvReady(): Promise<MerchantGradingContext> {
  const expectedSellerId = getMerchantGradingSellerId();

  await warmSession("seller");
  const sessionSellerId = getSellerUserId();
  if (sessionSellerId !== expectedSellerId) {
    throw new Error(
      `[assertMerchantGradingEnvReady] E2E_SELLER_EMAIL must sign in as E2E_SELLER_ID (got session ${sessionSellerId}, expected ${expectedSellerId})`,
    );
  }

  const listing = await findMerchantListingForIntegration();
  if (listing.sellerId !== expectedSellerId) {
    throw new Error(
      `[assertMerchantGradingEnvReady] E2E_LISTING_ID seller_id must equal E2E_SELLER_ID (listing ${listing.sellerId}, expected ${expectedSellerId})`,
    );
  }

  await findMerchantListingForSellerIntegration(expectedSellerId);
  await ensureMerchantListingAcceptsAuthentication(listing.listingId);

  const admin = createServiceRoleClient();
  const { data: listingRow, error: listingError } = await admin
    .from("listings")
    .select("id, seller_id, use_authentication")
    .eq("id", listing.listingId)
    .maybeSingle();

  if (listingError || !listingRow) {
    throw new Error(
      `[assertMerchantGradingEnvReady] listing lookup: ${listingError?.message ?? "not found"}`,
    );
  }

  if (!listingRow.use_authentication) {
    throw new Error(
      "[assertMerchantGradingEnvReady] E2E_LISTING_ID must have use_authentication=true",
    );
  }

  return { listingId: listing.listingId, sellerId: listing.sellerId };
}

export async function warmMerchantGradingEnv(): Promise<boolean> {
  merchantGradingEnvReady = false;
  merchantGradingContext = null;

  if (!hasMerchantGradingEnvVars()) {
    return false;
  }

  try {
    const context = await assertMerchantGradingEnvReady();
    merchantGradingEnvReady = true;
    merchantGradingContext = context;
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[merchant grading] env not ready, skipping: ${message}`);
    return false;
  }
}

export async function requireMerchantGradingEnvReady(): Promise<MerchantGradingContext> {
  const ready = await warmMerchantGradingEnv();
  if (!ready || !merchantGradingContext) {
    throw new Error(
      "Merchant grading env not ready — run verify:merchant-grading-e2e and check E2E_SELLER_* + E2E_LISTING_ID",
    );
  }
  return merchantGradingContext;
}

export function merchantIt(name: string, fn: TestFunction): void {
  it(name, fn);
}
