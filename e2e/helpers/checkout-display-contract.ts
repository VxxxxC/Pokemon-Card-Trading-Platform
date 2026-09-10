import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  AUTH_ESCROW_AUTH_FEE_HKD,
  AUTH_ESCROW_SF_LEG_FEE_HKD,
} from "@/lib/auth-escrow/defaults";
import { computeCourierShippingFee } from "@/lib/merchant-checkout/pricing";
import { PLATFORM_DEFAULT_COURIER_SHIPPING_FEE } from "@/lib/merchant/shipping-fee";
import {
  readAuthEscrowCheckoutShippingLegs,
  readCheckoutSummaryAmounts,
} from "./rewards-checkout-coupon";

export type AuthEscrowCheckoutBreakdown = {
  itemSubtotal: number;
  inboundShippingFee: number;
  outboundShippingFee: number;
  authFee: number;
  totalAmount: number;
};

export type MerchantDirectCheckoutBreakdown = {
  itemSubtotal: number;
  shippingFee: number;
  totalAmount: number;
};

function createE2eAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function checkoutOrderSummary(page: Page) {
  return page
    .getByText("帳單明細", { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
}

async function readSummaryRowAmount(
  page: Page,
  label: string | RegExp,
): Promise<number> {
  const summary = checkoutOrderSummary(page);
  const labelEl =
    typeof label === "string"
      ? summary.getByText(label, { exact: true })
      : summary.getByText(label);
  const row = labelEl.locator(
    "xpath=ancestor::*[contains(@class,'justify-between')][1]",
  );
  const valueText = await row.locator("span").last().textContent();
  const normalized = (valueText ?? "").replace(/,/g, "");
  const match = normalized.match(/-?\s*HK\$\s*([\d.]+)/);
  return match ? Number(match[1]) : 0;
}

export async function readAuthEscrowCheckoutBreakdown(
  page: Page,
): Promise<AuthEscrowCheckoutBreakdown> {
  const summary = await readCheckoutSummaryAmounts(page);
  const legs = await readAuthEscrowCheckoutShippingLegs(page);
  const authFee = await readSummaryRowAmount(page, "官方第三方鑑定費");

  return {
    itemSubtotal: summary.itemSubtotal,
    inboundShippingFee: legs.inboundShippingFee,
    outboundShippingFee: legs.outboundShippingFee,
    authFee,
    totalAmount: summary.totalAmount,
  };
}

export function expectStandardAuthEscrowCheckoutBreakdown(
  breakdown: AuthEscrowCheckoutBreakdown,
): void {
  expect(breakdown.inboundShippingFee).toBe(AUTH_ESCROW_SF_LEG_FEE_HKD);
  expect(breakdown.outboundShippingFee).toBe(AUTH_ESCROW_SF_LEG_FEE_HKD);
  expect(breakdown.authFee).toBe(AUTH_ESCROW_AUTH_FEE_HKD);
  expect(breakdown.itemSubtotal).toBeGreaterThan(0);
  expect(breakdown.totalAmount).toBe(
    breakdown.itemSubtotal +
      AUTH_ESCROW_AUTH_FEE_HKD +
      AUTH_ESCROW_SF_LEG_FEE_HKD * 2,
  );
}

export async function assertAuthEscrowCheckoutBreakdownOnPage(
  page: Page,
): Promise<AuthEscrowCheckoutBreakdown> {
  await expect(page.getByText("帳單明細", { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  const breakdown = await readAuthEscrowCheckoutBreakdown(page);
  expectStandardAuthEscrowCheckoutBreakdown(breakdown);
  return breakdown;
}

export async function enableAuthServiceOnMerchantDirectCheckout(
  page: Page,
): Promise<void> {
  const authSection = page
    .getByRole("heading", { name: "平台鑑定服務" })
    .locator("xpath=ancestor::section[1]");
  await expect(authSection).toBeVisible({ timeout: 15_000 });

  const authSwitch = authSection.getByRole("switch");
  await expect(authSwitch).toBeEnabled({ timeout: 10_000 });
  if ((await authSwitch.getAttribute("aria-checked")) !== "true") {
    await authSwitch.focus();
    await page.keyboard.press("Space");
  }
  await expect(authSwitch).toHaveAttribute("aria-checked", "true");
}

export async function getMerchantListingShippingQuote(listingId: string): Promise<{
  itemSubtotal: number;
  baseCourierShippingFee: number;
  listingExtraShippingFee: number;
  expectedShippingFee: number;
}> {
  const admin = createE2eAdminClient();
  const { data: listing, error: listingError } = await admin
    .from("listings")
    .select("price, extra_shipping_fee, seller_id")
    .eq("id", listingId)
    .maybeSingle();

  if (listingError || !listing?.seller_id) {
    throw new Error(
      `[getMerchantListingShippingQuote] ${listingError?.message ?? "listing not found"}`,
    );
  }

  const { data: shop, error: shopError } = await admin
    .from("merchant_shops")
    .select("base_courier_shipping_fee")
    .eq("merchant_id", listing.seller_id)
    .maybeSingle();

  if (shopError) {
    throw new Error(`[getMerchantListingShippingQuote] ${shopError.message}`);
  }

  const baseCourierShippingFee = Number(
    shop?.base_courier_shipping_fee ?? PLATFORM_DEFAULT_COURIER_SHIPPING_FEE,
  );
  const listingExtraShippingFee = Number(listing.extra_shipping_fee ?? 0);
  const expectedShippingFee = computeCourierShippingFee({
    shippingMethod: "sf",
    baseFee: baseCourierShippingFee,
    extraFee: listingExtraShippingFee,
  });

  return {
    itemSubtotal: Number(listing.price),
    baseCourierShippingFee,
    listingExtraShippingFee,
    expectedShippingFee,
  };
}

export async function readMerchantDirectCheckoutBreakdown(
  page: Page,
): Promise<MerchantDirectCheckoutBreakdown> {
  const summary = await readCheckoutSummaryAmounts(page);
  return {
    itemSubtotal: summary.itemSubtotal,
    shippingFee: summary.shippingFee,
    totalAmount: summary.totalAmount,
  };
}

export async function assertMerchantDirectSfCheckoutBreakdownOnPage(
  page: Page,
  quote: {
    itemSubtotal: number;
    expectedShippingFee: number;
  },
): Promise<MerchantDirectCheckoutBreakdown> {
  await expect(page.getByText("帳單明細", { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  const breakdown = await readMerchantDirectCheckoutBreakdown(page);
  expect(breakdown.itemSubtotal).toBeGreaterThan(0);
  expect(breakdown.shippingFee).toBe(quote.expectedShippingFee);
  expect(breakdown.totalAmount).toBe(
    breakdown.itemSubtotal + quote.expectedShippingFee,
  );
  return breakdown;
}

export async function assertCheckoutCouponSubsidyOnPage(
  page: Page,
  params: {
    rewardId: string;
    baseline: Awaited<ReturnType<typeof readCheckoutSummaryAmounts>>;
  },
): Promise<void> {
  const optionLabel =
    (await page
      .locator(`#checkout-coupon option[value="${params.rewardId}"]`)
      .textContent()) ?? "";
  const previewMatch = optionLabel.match(/-HK\$(\d+(?:\.\d+)?)/);
  const expectedSubsidy = previewMatch
    ? Number(previewMatch[1])
    : Math.min(10, params.baseline.itemSubtotal);

  const withCoupon = await readCheckoutSummaryAmounts(page);
  expect(withCoupon.platformSubsidy).toBe(expectedSubsidy);
  expect(withCoupon.totalAmount).toBe(
    params.baseline.itemSubtotal +
      params.baseline.shippingFee -
      expectedSubsidy,
  );
}
