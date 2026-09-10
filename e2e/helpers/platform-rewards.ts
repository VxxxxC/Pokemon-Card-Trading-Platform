import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { parseRewardCouponCenter } from "@/lib/rewards/mapUserRewardCoupon";
import { ACTIVE_LISTING_PERSONA_STORAGE_KEY } from "@/lib/listings/active-listing-persona";
import type { Database } from "@/types/supabase";
import {
  acknowledgePendingRewardGrantsForUser,
  getBuyerProfileIdFromEnv,
} from "../fixtures/supabase-admin";
import { ensureMemberPersona } from "./collection-asset";
import {
  dismissBlockingOverlays as dismissGlobalBlockingOverlays,
  dismissRewardUnlockedModal,
  suppressTransientHomeOverlays,
} from "./overlays";

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

export async function getMerchantSellerDisplayNameForE2e(
  sellerId: string,
): Promise<string> {
  const normalizedSellerId = sellerId.trim();
  if (!normalizedSellerId) {
    throw new Error("Missing sellerId for merchant display name lookup");
  }

  const admin = createE2eAdminClient();
  const { data: shop, error: shopError } = await admin
    .from("merchant_shops")
    .select("shop_name")
    .eq("merchant_id", normalizedSellerId)
    .maybeSingle();

  if (shopError) {
    throw new Error(
      `[getMerchantSellerDisplayNameForE2e] merchant_shops ${shopError.message}`,
    );
  }

  const shopName = shop?.shop_name?.trim();
  if (shopName) {
    return shopName;
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", normalizedSellerId)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      `[getMerchantSellerDisplayNameForE2e] profiles ${profileError.message}`,
    );
  }

  const displayName = profile?.display_name?.trim();
  if (displayName) {
    return displayName;
  }

  throw new Error(
    `Could not resolve merchant seller display name for ${normalizedSellerId}`,
  );
}

export type MerchantOrderCouponSnapshot = {
  id: string;
  item_subtotal: number | null;
  auth_fee: number | null;
  shipping_fee: number | null;
  inbound_shipping_fee: number | null;
  outbound_shipping_fee: number | null;
  total_amount: number | null;
  buyer_total_amount: number | null;
  platform_subsidy_amount: number | null;
  coupon_user_reward_id: string | null;
  coupon_type: string | null;
  merchant_payout_amount: number | null;
  escrow_status: string | null;
  escrow_capture_model: string | null;
  payment_capture_status: string | null;
  requires_authentication: boolean | null;
};

type RewardTemplateAuditSnapshot = {
  title?: string;
  type?: string;
  status?: string;
};

async function listRecentTemplateAudits(limit = 50) {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("reward_template_audits")
    .select("template_id, snapshot, created_at, action")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`[listRecentTemplateAudits] ${error.message}`);
  }
  return data ?? [];
}

export async function findPendingMerchantOrderForListing(
  listingId: string,
): Promise<string | null> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("merchant_orders")
    .select("id")
    .eq("listing_id", listingId)
    .eq("escrow_status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[findPendingMerchantOrderForListing] ${error.message}`);
  }

  return data?.id ?? null;
}

export async function reactivateListingForE2e(listingId: string): Promise<void> {
  const admin = createE2eAdminClient();
  const { error } = await admin
    .from("listings")
    .update({ status: "active" })
    .eq("id", listingId);
  if (error) {
    throw new Error(`[reactivateListingForE2e] ${error.message}`);
  }
}

export async function setListingAuthenticationForE2e(
  listingId: string,
  useAuthentication: boolean,
): Promise<void> {
  const admin = createE2eAdminClient();
  const { error } = await admin
    .from("listings")
    .update({ use_authentication: useAuthentication })
    .eq("id", listingId);
  if (error) {
    throw new Error(`[setListingAuthenticationForE2e] ${error.message}`);
  }
}

export async function findActiveFreeShippingTemplateId(): Promise<string | null> {
  const seen = new Set<string>();
  for (const row of await listRecentTemplateAudits()) {
    if (seen.has(row.template_id)) {
      continue;
    }
    seen.add(row.template_id);
    const snapshot = row.snapshot as RewardTemplateAuditSnapshot;
    if (
      snapshot?.type === "free_shipping" &&
      snapshot?.status === "active"
    ) {
      return row.template_id;
    }
  }
  return null;
}

async function lookupRewardTemplateIdByTitle(
  title: string,
): Promise<string | null> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("reward_templates")
    .select("id")
    .eq("title", title)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return null;
  }
  return data?.id ?? null;
}

async function activateRewardTemplateByTitleIfPresent(
  title: string,
): Promise<string | null> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("reward_templates")
    .select("id, status")
    .eq("title", title)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) {
    return null;
  }
  if (data.status !== "active") {
    const { error: updateError } = await admin
      .from("reward_templates")
      .update({ status: "active", is_active: true })
      .eq("id", data.id);
    if (updateError) {
      return null;
    }
  }
  return data.id;
}

export async function getRewardTemplateIdByTitle(
  title: string,
): Promise<string | null> {
  let templateId: string | null = null;
  await expect
    .poll(
      async () => {
        templateId = await lookupRewardTemplateIdByTitle(title);
        return templateId;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
  return templateId;
}

export async function getRewardTemplateRestrictions(
  templateId: string,
): Promise<Record<string, unknown> | null> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("reward_templates")
    .select("restrictions")
    .eq("id", templateId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getRewardTemplateRestrictions] ${error.message}`);
  }

  if (!data?.restrictions || typeof data.restrictions !== "object") {
    return null;
  }

  return data.restrictions as Record<string, unknown>;
}

export async function seedMemberAuthPendingOrderForE2e(params: {
  listingId: string;
  buyerId: string;
}): Promise<string> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin.rpc(
    "rpc_e2e_seed_member_auth_pending_payment_order",
    {
      p_listing_id: params.listingId,
      p_buyer_id: params.buyerId,
    },
  );

  if (error) {
    throw new Error(`[seedMemberAuthPendingOrderForE2e] ${error.message}`);
  }

  if (!data || typeof data !== "string") {
    throw new Error("[seedMemberAuthPendingOrderForE2e] missing order id");
  }

  return data;
}

export async function grantUserRewardForE2e(params: {
  userId: string;
  templateId: string;
}): Promise<string> {
  const admin = createE2eAdminClient();
  const dedupKey = `e2e-phase2-${crypto.randomUUID()}`;
  const { data, error } = await admin
    .from("user_rewards")
    .insert({
      user_id: params.userId,
      template_id: params.templateId,
      grant_dedup_key: dedupKey,
      is_used: false,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`[grantUserRewardForE2e] ${error.message}`);
  }
  return data.id;
}

export async function getMerchantOrderCouponSnapshot(
  orderId: string,
): Promise<MerchantOrderCouponSnapshot | null> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("merchant_orders")
    .select(
      "id, item_subtotal, auth_fee, shipping_fee, inbound_shipping_fee, outbound_shipping_fee, total_amount, buyer_total_amount, platform_subsidy_amount, coupon_user_reward_id, coupon_type, merchant_payout_amount, escrow_status, escrow_capture_model, payment_capture_status, requires_authentication",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getMerchantOrderCouponSnapshot] ${error.message}`);
  }
  return data;
}

function createE2eStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return null;
  }
  return new Stripe(secretKey, {
    apiVersion: "2023-10-16" as Stripe.LatestApiVersion,
  });
}

function readPaymentIntentAmounts(
  paymentIntent: Stripe.PaymentIntent,
): Record<string, string> {
  const amounts: Record<string, string> = {};
  for (const key of [
    "item_subtotal",
    "shipping_fee",
    "auth_fee",
    "total_amount",
    "buyer_total_amount",
    "platform_subsidy_amount",
    "shipping_method",
  ] as const) {
    const value = paymentIntent.metadata?.[key];
    if (typeof value === "string" && value.trim()) {
      amounts[key] = value.trim();
    }
  }
  return amounts;
}

export async function trySyncMerchantOrderPaymentFromStripe(
  orderId: string,
): Promise<void> {
  const stripe = createE2eStripeClient();
  if (!stripe) {
    return;
  }

  const admin = createE2eAdminClient();
  const { data: orderRow, error } = await admin
    .from("merchant_orders")
    .select("stripe_payment_intent_id, requires_authentication, escrow_status")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !orderRow) {
    return;
  }

  if (orderRow.escrow_status === "payment_held") {
    return;
  }

  const paymentIntentId = orderRow.stripe_payment_intent_id?.trim();
  if (!paymentIntentId) {
    return;
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const amounts = readPaymentIntentAmounts(paymentIntent);

  if (orderRow.requires_authentication) {
    if (
      paymentIntent.status !== "requires_capture" ||
      paymentIntent.amount_capturable <= 0
    ) {
      return;
    }

    await admin.rpc("rpc_mark_merchant_order_authorized", {
      p_order_id: orderId,
      p_payment_intent_id: paymentIntentId,
      p_amounts: amounts,
    });
    return;
  }

  if (paymentIntent.status !== "succeeded") {
    return;
  }

  await admin.rpc("rpc_mark_merchant_order_paid", {
    p_order_id: orderId,
    p_payment_intent_id: paymentIntentId,
    p_amounts: amounts,
  });
}

export async function waitForMerchantAuthCheckoutSettled(
  orderId: string,
  timeoutMs = process.env.PRODUCTION_GATE === "1" ? 180_000 : 120_000,
): Promise<MerchantOrderCouponSnapshot> {
  let last: MerchantOrderCouponSnapshot | null = null;

  await expect
    .poll(
      async () => {
        last = await getMerchantOrderCouponSnapshot(orderId);
        if (!last) {
          return false;
        }
        if (
          last.payment_capture_status === "authorized" &&
          last.escrow_status === "payment_held"
        ) {
          return true;
        }
        await trySyncMerchantOrderPaymentFromStripe(orderId);
        last = await getMerchantOrderCouponSnapshot(orderId);
        if (!last) {
          return false;
        }
        return (
          last.payment_capture_status === "authorized" &&
          last.escrow_status === "payment_held"
        );
      },
      { timeout: timeoutMs },
    )
    .toBe(true);

  return last!;
}

export async function waitForMerchantDirectCheckoutSettled(
  orderId: string,
  timeoutMs = process.env.PRODUCTION_GATE === "1" ? 180_000 : 120_000,
): Promise<MerchantOrderCouponSnapshot> {
  let last: MerchantOrderCouponSnapshot | null = null;

  await expect
    .poll(
      async () => {
        last = await getMerchantOrderCouponSnapshot(orderId);
        if (!last) {
          return false;
        }
        if (last.escrow_status === "payment_held") {
          return true;
        }
        await trySyncMerchantOrderPaymentFromStripe(orderId);
        last = await getMerchantOrderCouponSnapshot(orderId);
        if (!last) {
          return false;
        }
        return last.escrow_status === "payment_held";
      },
      { timeout: timeoutMs },
    )
    .toBe(true);

  return last!;
}

export async function getUserRewardRow(rewardId: string) {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("user_rewards")
    .select("id, is_used, used_at, reserved_merchant_order_id")
    .eq("id", rewardId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getUserRewardRow] ${error.message}`);
  }
  return data;
}

const MERCHANT_LISTING_RECYCLABLE_STATUSES = [
  "active",
  "inactive",
  "sold",
] as const;

export async function findActiveMerchantListingForE2e(params?: {
  excludeSellerId?: string;
  preferListingId?: string;
}): Promise<{ listingId: string; sellerId: string; price: number }> {
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
          price: listing.price,
        };
      }
    } catch {
      // Fall through to dynamic merchant listing discovery.
    }
  }
  const envListingId = process.env.E2E_LISTING_ID?.trim();
  const envSellerId = process.env.E2E_SELLER_ID?.trim();

  if (envListingId && envSellerId) {
    if (!params?.excludeSellerId || envSellerId !== params.excludeSellerId) {
      try {
        await reactivateListingForE2e(envListingId);
        const listing = await assertListingIsActiveMerchant(envListingId);
        return {
          listingId: envListingId,
          sellerId: envSellerId,
          price: listing.price,
        };
      } catch {
        // Fall through to dynamic merchant listing discovery.
      }
    }
  }

  const admin = createE2eAdminClient();

  const { data: kycRows, error: kycError } = await admin
    .from("kyc_records")
    .select(
      "merchant_id, kyc_status, stripe_charges_enabled, stripe_payouts_enabled",
    )
    .eq("kyc_status", "verified")
    .eq("stripe_charges_enabled", true)
    .eq("stripe_payouts_enabled", true);

  if (kycError) {
    throw new Error(`[findActiveMerchantListingForE2e] ${kycError.message}`);
  }

  const payoutReadySellerIds = new Set(
    (kycRows ?? [])
      .map((row) => row.merchant_id)
      .filter((sellerId): sellerId is string => Boolean(sellerId)),
  );

  const { data, error } = await admin
    .from("listings")
    .select("id, seller_id, price, status, seller_persona")
    .eq("seller_persona", "merchant")
    .in("status", [...MERCHANT_LISTING_RECYCLABLE_STATUSES])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`[findActiveMerchantListingForE2e] ${error.message}`);
  }

  const row = await (async () => {
    for (const entry of data ?? []) {
      if (
        !entry.seller_id ||
        !payoutReadySellerIds.has(entry.seller_id) ||
        (params?.excludeSellerId && entry.seller_id === params.excludeSellerId)
      ) {
        continue;
      }

      const { count, error: pendingError } = await admin
        .from("merchant_orders")
        .select("id", { count: "exact", head: true })
        .eq("listing_id", entry.id)
        .eq("escrow_status", "pending_payment");

      if (pendingError) {
        throw new Error(`[findActiveMerchantListingForE2e] ${pendingError.message}`);
      }

      if ((count ?? 0) === 0) {
        await reactivateListingForE2e(entry.id);
        try {
          const listing = await assertListingIsActiveMerchant(entry.id);
          return {
            listingId: entry.id,
            sellerId: listing.sellerId,
            price: listing.price,
          };
        } catch {
          continue;
        }
      }
    }
    return null;
  })();

  if (!row) {
    const { data: fallbackRows, error: fallbackError } = await admin
      .from("listings")
      .select("id, seller_id, price, status, seller_persona")
      .eq("seller_persona", "merchant")
      .in("status", [...MERCHANT_LISTING_RECYCLABLE_STATUSES])
      .order("created_at", { ascending: false })
      .limit(50);

    if (fallbackError) {
      throw new Error(`[findActiveMerchantListingForE2e] ${fallbackError.message}`);
    }

    for (const entry of fallbackRows ?? []) {
      if (
        !entry.seller_id ||
        (params?.excludeSellerId && entry.seller_id === params.excludeSellerId)
      ) {
        continue;
      }

      await reactivateListingForE2e(entry.id);
      try {
        const listing = await assertListingIsActiveMerchant(entry.id);
        return {
          listingId: entry.id,
          sellerId: listing.sellerId,
          price: listing.price,
        };
      } catch {
        continue;
      }
    }
  }

  if (!row) {
    throw new Error(
      "No active merchant listing with payout-ready seller found for E2E checkout",
    );
  }

  return row;
}

export async function assertListingIsActiveMerchant(
  listingId: string,
): Promise<{ sellerId: string; price: number }> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("listings")
    .select("id, seller_id, price, status, seller_persona, product_id")
    .eq("id", listingId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Listing ${listingId} not found`);
  }
  if (data.status !== "active") {
    throw new Error(`Listing ${listingId} is not active (${data.status})`);
  }
  if (data.seller_persona !== "merchant") {
    throw new Error(
      `Listing ${listingId} seller_persona=${data.seller_persona} (expected merchant)`,
    );
  }
  if (!data.product_id) {
    throw new Error(`Listing ${listingId} is missing product_id`);
  }
  return { sellerId: data.seller_id, price: Number(data.price) };
}

export async function fillStripePaymentElement(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          const number = frame.locator(
            'input[name="number"], input[autocomplete="cc-number"], input[placeholder*="1234"]',
          );
          if ((await number.count()) > 0) {
            return true;
          }
        }
        return false;
      },
      { timeout: 60_000 },
    )
    .toBe(true);

  await page.waitForTimeout(1500);

  const fillInFrames = async (): Promise<boolean> => {
    for (const frame of page.frames()) {
      const number = frame.locator(
        'input[name="number"], input[autocomplete="cc-number"], input[placeholder*="1234"]',
      );
      if ((await number.count()) === 0) {
        continue;
      }
      await number.first().fill("4242424242424242");

      const expiry = frame.locator(
        'input[name="expiry"], input[autocomplete="cc-exp"]',
      );
      if ((await expiry.count()) > 0) {
        await expiry.first().fill("1234");
      }

      const cvc = frame.locator('input[name="cvc"], input[autocomplete="cc-csc"]');
      if ((await cvc.count()) > 0) {
        await cvc.first().fill("123");
      }
      return true;
    }
    return false;
  };

  const filled = await fillInFrames();
  if (!filled) {
    throw new Error("Could not locate Stripe card fields in iframes");
  }
}

export async function findActiveDiscountCouponTemplateId(): Promise<string | null> {
  const seen = new Set<string>();
  for (const row of await listRecentTemplateAudits()) {
    if (seen.has(row.template_id)) {
      continue;
    }
    seen.add(row.template_id);
    const snapshot = row.snapshot as RewardTemplateAuditSnapshot;
    if (
      snapshot?.type === "discount_coupon" &&
      snapshot?.status === "active"
    ) {
      return row.template_id;
    }
  }
  return null;
}

async function createE2eAdminAuthedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.E2E_ADMIN_EMAIL?.trim();
  const password = process.env.E2E_ADMIN_PASSWORD?.trim();

  if (!url || !anonKey || !email || !password) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, E2E_ADMIN_EMAIL, or E2E_ADMIN_PASSWORD",
    );
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`[createE2eAdminAuthedClient] ${error.message}`);
  }

  return client;
}

type AdminCampaignListRow = {
  id?: string;
  name?: string;
  claimed_count?: number;
};

export async function listActiveFlashCampaignRowsForE2e(): Promise<
  AdminCampaignListRow[]
> {
  const client = await createE2eAdminAuthedClient();
  const { data, error } = await client.rpc("rpc_list_active_flash_campaigns");

  if (error) {
    throw new Error(`[listActiveFlashCampaignRowsForE2e] ${error.message}`);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data as AdminCampaignListRow[];
}

export async function listActiveFlashCampaignRowsForUser(params: {
  email: string;
  password: string;
}): Promise<AdminCampaignListRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing Supabase public env for flash list RPC");
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: signInError } = await client.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });
  if (signInError) {
    throw new Error(`[listActiveFlashCampaignRowsForUser] ${signInError.message}`);
  }

  const { data, error } = await client.rpc("rpc_list_active_flash_campaigns");
  if (error) {
    throw new Error(`[listActiveFlashCampaignRowsForUser] ${error.message}`);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data as AdminCampaignListRow[];
}

export async function gotoMemberCampaignsPage(
  page: Page,
  tab: "flash" | "points" = "flash",
): Promise<void> {
  await ensureMemberPersona(page);
  await page.goto("/profile/user/campaigns", { waitUntil: "domcontentloaded" });
  await dismissBlockingOverlays(page);
  await dismissRewardUnlockedModal(page);

  const tabLabel = tab === "flash" ? "限時搶券" : "積分商城";
  await page.getByRole("button", { name: tabLabel }).click();
}

export async function waitForFlashCampaignSectionReady(page: Page): Promise<void> {
  if (!page.url().includes("/campaigns")) {
    await gotoMemberCampaignsPage(page, "flash");
  }

  await expect(page.getByText(/載入限時搶券/)).toBeHidden({
    timeout: 20_000,
  });
}

export async function waitForPointsRedemptionSectionReady(
  page: Page,
): Promise<void> {
  await gotoMemberCampaignsPage(page, "points");

  await expect(page.getByText("載入積分商城…")).toBeHidden({
    timeout: 60_000,
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await dismissBlockingOverlays(page);
    await dismissRewardUnlockedModal(page);

    const ready = page
      .getByText("積分商城暫無可兌換商品")
      .or(page.getByRole("button", { name: "兌換" }).first())
      .or(page.getByText(/無法載入積分商城/));
    if (await ready.isVisible().catch(() => false)) {
      return;
    }
    await page.waitForTimeout(500);
  }

  await expect(
    page
      .getByText("積分商城暫無可兌換商品")
      .or(page.getByRole("button", { name: "兌換" }).first())
      .or(page.getByText(/無法載入積分商城/)),
  ).toBeVisible({ timeout: 15_000 });
}

export function locatePointsCatalogCard(page: Page, templateTitle: string) {
  return page
    .locator("div.rounded-xl")
    .filter({ has: page.getByText(templateTitle, { exact: true }) });
}

/** Paginated catalog (200+ stale rows in E2E) — sort high→low then walk pages. */
export async function findPointsCatalogCardByTitle(
  page: Page,
  templateTitle: string,
) {
  const buyerId = await getBuyerProfileIdFromEnv();
  if (buyerId) {
    await acknowledgePendingRewardGrantsForUser(buyerId);
  }

  await waitForPointsRedemptionSectionReady(page);

  const sortSelect = page.locator("select").filter({
    has: page.locator('option[value="points_desc"]'),
  });
  if (await sortSelect.isVisible().catch(() => false)) {
    await sortSelect.selectOption("points_desc");
    await page.waitForTimeout(400);
  }

  const card = locatePointsCatalogCard(page, templateTitle);
  const nextPage = page.getByRole("button", { name: "下一頁" });
  let visitedFirstPage = false;

  await expect
    .poll(
      async () => {
        if (await card.isVisible().catch(() => false)) {
          return true;
        }
        if (!visitedFirstPage) {
          visitedFirstPage = true;
          const firstPage = page.getByRole("button", { name: "1" });
          if (await firstPage.isVisible().catch(() => false)) {
            await firstPage.click();
            await page.waitForTimeout(300);
            if (await card.isVisible().catch(() => false)) {
              return true;
            }
          }
        }
        if (await nextPage.isEnabled().catch(() => false)) {
          await nextPage.click();
          await page.waitForTimeout(300);
        }
        return false;
      },
      { timeout: 60_000 },
    )
    .toBe(true);

  return card;
}

export async function getPointsCatalogIdByTemplateTitle(
  title: string,
): Promise<string | null> {
  const admin = createE2eAdminClient();
  const templateId = await lookupRewardTemplateIdByTitle(title);
  if (!templateId) {
    return null;
  }

  const { data, error } = await admin
    .from("reward_redemption_catalog")
    .select("id")
    .eq("template_id", templateId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getPointsCatalogIdByTemplateTitle] ${error.message}`);
  }

  return data?.id ?? null;
}

export async function seedBuyerPointsForE2e(
  _userId: string,
  targetPoints: number,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const buyerEmail = process.env.E2E_BUYER_EMAIL?.trim();
  const buyerPassword = process.env.E2E_BUYER_PASSWORD?.trim();

  if (!url || !anonKey || !buyerEmail || !buyerPassword) {
    throw new Error(
      "Missing Supabase/buyer env for seedBuyerPointsForE2e",
    );
  }

  const buyerClient = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await buyerClient.auth.signInWithPassword({
    email: buyerEmail,
    password: buyerPassword,
  });
  if (signInError) {
    throw new Error(`[seedBuyerPointsForE2e] sign-in failed: ${signInError.message}`);
  }

  const { data: statsData, error: statsError } = await buyerClient.rpc(
    "get_gamification_stats_for_me",
  );
  if (statsError) {
    throw new Error(`[seedBuyerPointsForE2e] ${statsError.message}`);
  }

  const current = Number(
    (statsData as Record<string, unknown> | null)?.points_balance ?? 0,
  );

  if (targetPoints > current) {
    const admin = createE2eAdminClient();
    const { error } = await admin.rpc("rpc_service_seed_user_points", {
      p_user_id: _userId,
      p_points: targetPoints - current,
      p_description: "E2E catalog seed",
    });
    if (error) {
      throw new Error(`[seedBuyerPointsForE2e] ${error.message}`);
    }
  } else if (targetPoints < current) {
    const admin = createE2eAdminClient();
    const { error } = await admin.rpc("fn_apply_point_transaction", {
      p_user_id: _userId,
      p_amount: targetPoints - current,
      p_source_type: "admin_adjust",
      p_source_ref: undefined,
      p_description: "E2E catalog seed down",
    });
    if (error) {
      throw new Error(`[seedBuyerPointsForE2e] ${error.message}`);
    }
  }

  const { data: verifyStats, error: verifyError } = await buyerClient.rpc(
    "get_gamification_stats_for_me",
  );
  if (verifyError) {
    throw new Error(`[seedBuyerPointsForE2e] verify failed: ${verifyError.message}`);
  }

  const balance = Number(
    (verifyStats as Record<string, unknown> | null)?.points_balance ?? 0,
  );
  if (balance < targetPoints) {
    throw new Error(
      `[seedBuyerPointsForE2e] expected >= ${targetPoints} PTS, got ${balance}`,
    );
  }
}

export async function completeMerchantAuthCheckout(
  page: Page,
  options?: { couponRewardId?: string | null },
): Promise<void> {
  const applyCheckoutCoupon = async (): Promise<void> => {
    if (options?.couponRewardId) {
      await page.locator("#checkout-coupon").selectOption(options.couponRewardId);
      await page.waitForTimeout(1500);
    }
  };

  await applyCheckoutCoupon();
  await dismissGlobalBlockingOverlays(page);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await dismissGlobalBlockingOverlays(page);
    await page.getByRole("button", { name: /繼續付款/ }).click({ force: true });
    try {
      await page.getByRole("button", { name: /確認支付 HK\$/ }).waitFor({
        state: "visible",
        timeout: 60_000,
      });
      break;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      await page.reload({ waitUntil: "domcontentloaded" });
      const { waitForMerchantAuthCheckoutReady } = await import(
        "./rewards-checkout-coupon"
      );
      await waitForMerchantAuthCheckoutReady(page);
      await applyCheckoutCoupon();
    }
  }

  await fillStripePaymentElement(page);
  await page.getByRole("button", { name: /確認支付 HK\$/ }).click();

  await page.waitForURL(/\/checkout\/[^/]+\/success/, {
    timeout: 120_000,
    waitUntil: "commit",
  });

  const authOrderId =
    page.url().match(/\/checkout\/([^/?#]+)\/success/)?.[1]?.trim() ?? "";
  if (authOrderId.length > 0) {
    await waitForMerchantAuthCheckoutSettled(authOrderId);
  }
}

async function readLatestSonnerToast(page: Page): Promise<string | null> {
  const toast = page.locator("[data-sonner-toast]").last();
  const text = await toast.textContent().catch(() => null);
  return text?.trim() ? text.trim() : null;
}

export async function completeMerchantDirectCheckout(
  page: Page,
  options?: { couponRewardId?: string | null },
): Promise<void> {
  const {
    ensureCourierShippingSelected,
    fillMerchantDirectFulfillmentForm,
  } = await import("./rewards-checkout-coupon");

  const prepareDirectCheckoutForm = async (): Promise<void> => {
    await ensureCourierShippingSelected(page);
    await fillMerchantDirectFulfillmentForm(page);
  };

  await prepareDirectCheckoutForm();

  if (options?.couponRewardId) {
    await page.locator("#checkout-coupon").selectOption(options.couponRewardId);
    await page.waitForTimeout(1500);
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await dismissGlobalBlockingOverlays(page);
    await page.getByRole("button", { name: /繼續付款/ }).click();
    try {
      await expect
        .poll(
          async () => {
            const confirmPay = await page
              .getByRole("button", { name: /確認支付 HK\$/ })
              .isVisible()
              .catch(() => false);
            if (confirmPay) {
              return "ready";
            }

            const paymentStep = await page
              .getByRole("heading", { name: "輸入付款資料" })
              .isVisible()
              .catch(() => false);
            if (paymentStep) {
              return "ready";
            }

            const toast = await readLatestSonnerToast(page);
            if (toast && /無法建立託管付款|資料未補全|付款服務尚未設定/.test(toast)) {
              throw new Error(`Checkout payment prep failed: ${toast}`);
            }

            return "pending";
          },
          { timeout: 60_000 },
        )
        .toBe("ready");
      break;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      await page.reload({ waitUntil: "domcontentloaded" });
      const { waitForMerchantDirectCheckoutReady } = await import(
        "./rewards-checkout-coupon"
      );
      await waitForMerchantDirectCheckoutReady(page);
      await prepareDirectCheckoutForm();
      if (options?.couponRewardId) {
        await page.locator("#checkout-coupon").selectOption(options.couponRewardId);
        await page.waitForTimeout(1500);
      }
    }
  }

  await fillStripePaymentElement(page);
  await page.getByRole("button", { name: /確認支付 HK\$/ }).click();

  await page.waitForURL(/\/checkout\/[^/]+\/success/, {
    timeout: 120_000,
    waitUntil: "commit",
  });

  const directOrderId =
    page.url().match(/\/checkout\/([^/?#]+)\/success/)?.[1]?.trim() ?? "";
  if (directOrderId.length > 0) {
    await waitForMerchantDirectCheckoutSettled(directOrderId);
  }
}

export async function buyMerchantListingWithAuthAndReachCheckout(
  page: Page,
  sellerId: string,
  listingId: string,
): Promise<string> {
  const sellerDisplayName = await getMerchantSellerDisplayNameForE2e(sellerId);
  await page.goto(
    `/marketplace/${sellerId}/product/${listingId}`,
    { waitUntil: "domcontentloaded" },
  );
  await waitForMerchantProductDetailReady(page, sellerDisplayName);

  await enableProductDetailAuthToggle(page);
  await clickProductDetailBuyNow(page);

  const orderId = await reachCheckoutAfterProductDetailBuyNow(
    page,
    listingId,
    "Auth buy now did not navigate to checkout and no pending order was created",
  );

  const { waitForMerchantAuthCheckoutReady } = await import(
    "./rewards-checkout-coupon"
  );
  await waitForMerchantAuthCheckoutReady(page);
  return orderId;
}

export async function gotoAdminRewardActivityForm(page: Page): Promise<void> {
  const heading = page.getByRole("heading", { name: "新增獎勵活動" });
  await suppressTransientHomeOverlays(page);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (attempt > 0) {
        await page.goto("/admin/campaigns", { waitUntil: "domcontentloaded" });
        await dismissBlockingOverlays(page);
        const newActivityButton = page
          .getByRole("button", { name: "新增活動" })
          .or(page.getByRole("button", { name: "新增一般券" }));
        if (await newActivityButton.first().isVisible().catch(() => false)) {
          await newActivityButton.first().click();
        }
      } else {
        await page.goto("/admin/campaigns/new", {
          waitUntil: "domcontentloaded",
        });
      }

      await dismissBlockingOverlays(page);
      await expect(page).toHaveURL(/\/admin\//, { timeout: 15_000 });
      await expect(heading).toBeVisible({ timeout: 20_000 });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(1_500);
    }
  }
}

/** @deprecated Use gotoAdminRewardActivityForm */
export async function openRewardTemplateWizard(page: Page) {
  await gotoAdminRewardActivityForm(page);
  return page.locator("main");
}

function toDatetimeLocalValue(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function buildOpenActivityWindowForE2e() {
  const now = Date.now();
  return {
    startsAt: toDatetimeLocalValue(new Date(now - 2 * 60 * 60 * 1000)),
    endsAt: toDatetimeLocalValue(new Date(now + 48 * 60 * 60 * 1000)),
  };
}

export async function dismissBlockingOverlays(page: Page): Promise<void> {
  await dismissGlobalBlockingOverlays(page);
  const pwaClose = page.getByRole("button", { name: "✕" }).first();
  if (await pwaClose.isVisible().catch(() => false)) {
    await pwaClose.click({ force: true }).catch(() => undefined);
  }
}

async function waitForMerchantProductDetailReady(
  page: Page,
  sellerDisplayName: string,
): Promise<void> {
  const title = page.locator("main h1");
  const sellerTag = page.getByText(sellerDisplayName, { exact: true });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await dismissBlockingOverlays(page);
    const hasTitle = await title.isVisible().catch(() => false);
    const hasSellerTag = await sellerTag.isVisible().catch(() => false);
    if (hasTitle && hasSellerTag) {
      return;
    }
    if (attempt < 2) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1_000);
    }
  }

  await expect(title).toBeVisible({ timeout: 15_000 });
  await expect(sellerTag).toBeVisible({ timeout: 15_000 });
}

async function waitForProductDetailBuyReady(page: Page): Promise<void> {
  const buyButton = page.getByRole("button", { name: /立即購買/ }).last();
  const guestGate = page.getByRole("link", {
    name: "登入 / 註冊以出價或購買",
  });

  await expect
    .poll(
      async () => {
        if (await buyButton.isVisible().catch(() => false)) {
          return "ready";
        }
        if (await guestGate.isVisible().catch(() => false)) {
          return "guest";
        }
        return "pending";
      },
      { timeout: 45_000 },
    )
    .toBe("ready")
    .catch(async (error) => {
      if (await guestGate.isVisible().catch(() => false)) {
        throw new Error("Buyer session not hydrated on product detail page");
      }
      throw error;
    });
}

async function enableProductDetailAuthToggle(page: Page): Promise<void> {
  const authSection = page
    .getByText("加購平台鑑定託管", { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  const authSwitch = authSection.getByRole("switch");
  await expect(authSwitch).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(
      async () => {
        if ((await authSwitch.getAttribute("aria-checked")) === "true") {
          return "true";
        }
        await authSwitch.click();
        await page.waitForTimeout(250);
        return authSwitch.getAttribute("aria-checked");
      },
      { timeout: 15_000 },
    )
    .toBe("true");
}

async function clickProductDetailBuyNow(page: Page): Promise<void> {
  await waitForProductDetailBuyReady(page);
  const buyButton = page.getByRole("button", { name: /立即購買/ }).last();
  await dismissBlockingOverlays(page);
  await buyButton.scrollIntoViewIfNeeded();
  await expect(buyButton).toBeEnabled({ timeout: 15_000 });
  await buyButton.click();

  const navigated = await page
    .waitForURL(/\/checkout\//, { timeout: 45_000 })
    .then(() => true)
    .catch(() => false);

  if (!navigated) {
    const toast = await readLatestSonnerToast(page);
    if (toast) {
      throw new Error(`Buy now failed: ${toast}`);
    }
  }
}

async function reachCheckoutAfterProductDetailBuyNow(
  page: Page,
  listingId: string,
  errorMessage: string,
): Promise<string> {
  const reachedCheckout = await page
    .waitForURL(/\/checkout\//, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);

  if (!reachedCheckout) {
    await navigateToCheckoutAfterBuyNow(page, listingId, errorMessage);
  }

  await page.waitForURL(/\/checkout\//, { timeout: 15_000 });
  const orderId =
    page.url().match(/\/checkout\/([^/?#]+)/)?.[1]?.trim() ?? "";
  if (orderId.length === 0) {
    throw new Error("Could not resolve checkout order id after buy now");
  }
  return orderId;
}

async function navigateToCheckoutAfterBuyNow(
  page: Page,
  listingId: string,
  errorMessage: string,
): Promise<void> {
  const navigatedToCheckout = await page
    .waitForURL(/\/checkout\//, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  if (navigatedToCheckout) {
    return;
  }

  let pendingOrderId: string | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    pendingOrderId = await findPendingMerchantOrderForListing(listingId);
    if (pendingOrderId) {
      break;
    }
    await page.waitForTimeout(500);
  }
  if (!pendingOrderId) {
    throw new Error(errorMessage);
  }
  await page.goto(`/checkout/${pendingOrderId}`, {
    waitUntil: "domcontentloaded",
  });
}

export async function gotoMemberRewardsPage(page: Page): Promise<void> {
  await ensureMemberPersona(page);
  await suppressTransientHomeOverlays(page);

  const buyerId = await getBuyerProfileIdFromEnv();
  if (buyerId) {
    await acknowledgePendingRewardGrantsForUser(buyerId);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/profile/user/rewards", { waitUntil: "domcontentloaded" });
    await page.evaluate((storageKey) => {
      window.sessionStorage.setItem(storageKey, "member");
      document.cookie = "hkcv_active_listing_persona=member; Path=/; SameSite=Lax";
    }, ACTIVE_LISTING_PERSONA_STORAGE_KEY);
    await page.reload({ waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await dismissRewardUnlockedModal(page);

    if (page.url().includes("/auth")) {
      throw new Error("Buyer session lost before member rewards page");
    }

    const crashed = page.getByText("This page couldn't load");
    if (await crashed.isVisible().catch(() => false)) {
      const reloadButton = page.getByRole("button", { name: "Reload" });
      if (await reloadButton.isVisible().catch(() => false)) {
        await reloadButton.click();
        await page.waitForTimeout(2000);
      }
      continue;
    }

    await page
      .locator(".min-h-screen .animate-spin")
      .first()
      .waitFor({ state: "hidden", timeout: 45_000 })
      .catch(() => undefined);

    const rewardsReady = page
      .getByText("帳戶總積分餘額")
      .or(page.getByRole("heading", { name: "每日簽到" }));

    if (await rewardsReady.isVisible({ timeout: 15_000 }).catch(() => false)) {
      return;
    }
  }

  await expect(
    page
      .getByText("帳戶總積分餘額")
      .or(page.getByRole("heading", { name: "每日簽到" })),
  ).toBeVisible({ timeout: 30_000 });
}

export async function expectCheckInAffordanceVisible(page: Page): Promise<void> {
  const heading = page.getByRole("heading", { name: "每日簽到" });
  const rewardDialog = page.getByRole("dialog", { name: "恭喜解鎖獎勵" });

  await expect(heading.or(rewardDialog)).toBeVisible({ timeout: 45_000 });
  await dismissRewardUnlockedModal(page);
  await expect(heading).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("button", {
      name: /立即簽到|簽到中|今日已簽到|載入中|簽到暫停/,
    }),
  ).toBeVisible({ timeout: 15_000 });
}

export function buildFlashCampaignScheduleForE2e(params?: {
  campaignName?: string;
  maxClaims?: number;
  maxClaimsPerUser?: number;
}): {
  campaignName: string;
  startsAt: string;
  endsAt: string;
  maxClaims: number;
  maxClaimsPerUser: number;
} {
  const now = Date.now();
  const startsAt = new Date(now - 48 * 60 * 60 * 1000);
  const endsAt = new Date(now + 48 * 60 * 60 * 1000);

  // datetime-local + `new Date(value)` in the admin wizard use the browser's local
  // timezone — not HKT — so format with local wall-clock values for the same instants.
  return {
    campaignName: params?.campaignName ?? `E2E Flash ${Date.now()}`,
    startsAt: toDatetimeLocalValue(startsAt),
    endsAt: toDatetimeLocalValue(endsAt),
    maxClaims: params?.maxClaims ?? 2,
    maxClaimsPerUser: params?.maxClaimsPerUser ?? 1,
  };
}

export function buildFutureFlashCampaignScheduleForE2e(params?: {
  campaignName?: string;
  hoursAhead?: number;
  maxClaims?: number;
  maxClaimsPerUser?: number;
}): {
  campaignName: string;
  startsAt: string;
  endsAt: string;
  maxClaims: number;
  maxClaimsPerUser: number;
} {
  const now = Date.now();
  const hoursAhead = params?.hoursAhead ?? 2;
  const startsAt = new Date(now + hoursAhead * 60 * 60 * 1000);
  const endsAt = new Date(now + 48 * 60 * 60 * 1000);

  return {
    campaignName: params?.campaignName ?? `E2E Future Flash ${Date.now()}`,
    startsAt: toDatetimeLocalValue(startsAt),
    endsAt: toDatetimeLocalValue(endsAt),
    maxClaims: params?.maxClaims ?? 10,
    maxClaimsPerUser: params?.maxClaimsPerUser ?? 1,
  };
}

export async function getFlashCampaignIdByName(
  campaignName: string,
): Promise<string | null> {
  const rows = await listActiveFlashCampaignRowsForE2e();
  const row = rows.find((entry) => entry.name === campaignName);
  return row?.id ?? null;
}

export async function countRewardCampaignClaims(
  campaignId: string,
): Promise<number> {
  const rows = await listActiveFlashCampaignRowsForE2e();
  const row = rows.find((entry) => entry.id === campaignId);
  return Number(row?.claimed_count ?? 0);
}

export async function ensureE2eFlashBuyer(params: {
  suffix: string;
}): Promise<{ email: string; password: string; userId: string }> {
  const admin = createE2eAdminClient();
  const email = `e2e-flash-${params.suffix}-${Date.now()}@hkcardvault.test`;
  const password = `E2eFlash!${params.suffix}${Date.now()}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user?.id) {
    throw new Error(
      `[ensureE2eFlashBuyer] ${error?.message ?? "createUser returned no user"}`,
    );
  }

  return {
    email,
    password,
    userId: data.user.id,
  };
}

export async function claimFlashCampaignForUser(params: {
  email: string;
  password: string;
  campaignId: string;
}): Promise<{ userRewardId: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing Supabase public env for flash claim RPC");
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: signInError } = await client.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });
  if (signInError) {
    throw new Error(`[claimFlashCampaignForUser] sign-in failed: ${signInError.message}`);
  }

  const { data, error } = await client.rpc("rpc_claim_flash_reward", {
    p_campaign_id: params.campaignId,
  });

  if (error) {
    throw new Error(`[claimFlashCampaignForUser] ${error.message}`);
  }

  const payload = data as Record<string, unknown> | null;
  const userRewardId =
    typeof payload?.user_reward_id === "string" ? payload.user_reward_id : null;

  if (!userRewardId) {
    throw new Error("[claimFlashCampaignForUser] missing user_reward_id in RPC response");
  }

  return { userRewardId };
}

export async function clearUserRewardsForTemplateForE2e(params: {
  userId: string;
  templateId: string;
}): Promise<void> {
  const admin = createE2eAdminClient();
  const { error } = await admin
    .from("user_rewards")
    .delete()
    .eq("user_id", params.userId)
    .eq("template_id", params.templateId);
  if (error) {
    throw new Error(`[clearUserRewardsForTemplateForE2e] ${error.message}`);
  }
}

export async function findLatestUserRewardForTemplate(params: {
  userId: string;
  templateId: string;
}): Promise<string | null> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("user_rewards")
    .select("id")
    .eq("user_id", params.userId)
    .eq("template_id", params.templateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[findLatestUserRewardForTemplate] ${error.message}`);
  }

  return data?.id ?? null;
}

async function selectRewardDistributionMode(
  page: Page,
  mode: "auto_grant" | "flash_only",
): Promise<void> {
  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "發放方式" }),
  });
  await section.getByRole("combobox").click();
  const label =
    mode === "flash_only"
      ? "限時搶領（先到先得）"
      : "條件達成自動發放";
  await page.getByRole("option", { name: label }).click();
}

const ADMIN_REWARD_PUBLISH_SUCCESS_TOAST = "已發布獎勵活動";

async function submitAdminRewardActivityPublish(
  page: Page,
  title: string,
): Promise<void> {
  await dismissBlockingOverlays(page);
  const publishButton = page.getByRole("button", { name: "發布" });
  await expect(publishButton).toBeEnabled({ timeout: 20_000 });
  await publishButton.click({ force: true, timeout: 15_000 });

  let outcome = "pending";
  await expect
    .poll(
      async () => {
        const onCampaignsList =
          page.url().includes("/admin/campaigns") &&
          !page.url().includes("/admin/campaigns/new");
        if (onCampaignsList) {
          outcome = "success";
          return "success";
        }

        const successVisible = await page
          .locator("[data-sonner-toast]")
          .filter({ hasText: ADMIN_REWARD_PUBLISH_SUCCESS_TOAST })
          .first()
          .isVisible()
          .catch(() => false);
        if (successVisible) {
          outcome = "success";
          return "success";
        }

        const errorToast = page
          .locator('[data-sonner-toast][data-type="error"]')
          .last();
        if (await errorToast.isVisible().catch(() => false)) {
          const text =
            (await errorToast.textContent())?.trim() ?? "unknown error";
          outcome = `error:${text}`;
          return outcome;
        }

        const persistedId = await activateRewardTemplateByTitleIfPresent(title);
        if (persistedId) {
          outcome = "success";
          return "success";
        }

        return "pending";
      },
      { timeout: 45_000, intervals: [500, 1_000, 2_000] },
    )
    .not.toBe("pending");

  if (outcome.startsWith("error:")) {
    throw new Error(
      `Admin reward publish failed: ${outcome.slice("error:".length)}`,
    );
  }

  if (
    !page.url().includes("/admin/campaigns") ||
    page.url().includes("/admin/campaigns/new")
  ) {
    await page.goto("/admin/campaigns", { waitUntil: "domcontentloaded" });
  }
}

async function selectTriggerKind(
  page: Page,
  kind: "trade_count" | "event_once",
): Promise<void> {
  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "觸發條件" }),
  });
  await section.getByRole("combobox").first().click();
  await page
    .getByRole("option", { name: kind === "trade_count" ? "成交筆數" : "一次性事件" })
    .click();
}

export type PublishRewardActivityParams = {
  title: string;
  type: "discount_coupon" | "free_shipping" | "points";
  distributionMode?: "auto_grant" | "flash_only";
  /** When false, do not touch #reward-order-kinds (tests Admin default / type-change only). */
  applyOrderKindsScope?: boolean;
  orderKindsScope?: "merchant" | "member" | "both";
  trigger?:
    | { kind: "trade_count"; role: "buyer" | "merchant"; count: number }
    | { kind: "event_once"; event: string };
  amount?: number;
  minSpend?: number;
  maxSubsidy?: number;
  points?: number;
  flashSchedule?: ReturnType<typeof buildFlashCampaignScheduleForE2e>;
  activityWindow?: { startsAt: string; endsAt: string };
  redemptionCatalog?: { pointsCost: number; stock: number };
};

const REWARD_TYPE_OPTION_LABEL: Record<
  PublishRewardActivityParams["type"],
  string
> = {
  discount_coupon: "折扣券",
  free_shipping: "免運券",
  points: "積分",
};

export async function publishRewardActivityViaAdmin(
  page: Page,
  params: PublishRewardActivityParams,
): Promise<void> {
  const pathname = new URL(page.url()).pathname;
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) {
    const { loginAsAdmin } = await import("./admin-auth");
    await loginAsAdmin(page);
  }
  await gotoAdminRewardActivityForm(page);
  await dismissBlockingOverlays(page);

  if (params.redemptionCatalog) {
    await page.getByRole("button", { name: "積分商城商品" }).click();
  }

  const titleInput = page.locator("#activity-title");
  await expect(titleInput).toBeVisible({ timeout: 15_000 });
  await titleInput.click({ force: true });
  await titleInput.fill(params.title);

  const rewardSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "獎勵內容" }),
  });
  await rewardSection.getByRole("combobox").click();
  await page
    .getByRole("option", { name: REWARD_TYPE_OPTION_LABEL[params.type] })
    .click();

  if (params.type === "discount_coupon") {
    await page.locator("#reward-amount").fill(String(params.amount ?? 10));
    if (params.minSpend != null) {
      await page
        .locator("#reward-min-spend")
        .fill(String(params.minSpend));
    }
  }

  if (params.type === "free_shipping") {
    await page
      .locator("#reward-max-subsidy")
      .fill(String(params.maxSubsidy ?? 30));
    if (params.minSpend != null) {
      await page
        .locator("#reward-shipping-min")
        .fill(String(params.minSpend));
    }
  }

  if (
    params.applyOrderKindsScope !== false &&
    (params.type === "free_shipping" || params.type === "discount_coupon")
  ) {
    const scope = params.orderKindsScope ?? (params.type === "free_shipping" ? "both" : "merchant");
    const scopeLabels: Record<"merchant" | "member" | "both", string> = {
      merchant: "僅商戶訂單 (B2C)",
      member: "僅會員訂單 (C2C)",
      both: "商戶 + 會員 (B2C & C2C)",
    };
    await page.locator("#reward-order-kinds").click();
    await page.getByRole("option", { name: scopeLabels[scope] }).click();
  }

  if (params.type === "points") {
    await page.locator("#reward-points").fill(String(params.points ?? 50));
  }

  const distributionMode = params.distributionMode ?? "auto_grant";
  if (!params.redemptionCatalog && distributionMode === "flash_only") {
    await selectRewardDistributionMode(page, "flash_only");

    const schedule =
      params.flashSchedule ?? buildFlashCampaignScheduleForE2e();
    await page.locator("#campaign-starts").fill(schedule.startsAt);
    await page.locator("#campaign-ends").fill(schedule.endsAt);
    await page.locator("#campaign-stock").fill(String(schedule.maxClaims));
    await page
      .locator("#campaign-per-user")
      .fill(String(schedule.maxClaimsPerUser));
  }

  if (
    !params.redemptionCatalog &&
    distributionMode === "auto_grant" &&
    params.trigger
  ) {
    if (params.trigger.kind === "trade_count") {
      await selectTriggerKind(page, "trade_count");
      const triggerSection = page.locator("section").filter({
        has: page.getByRole("heading", { name: "觸發條件" }),
      });
      const roleCombobox = triggerSection.getByRole("combobox").nth(1);
      const roleLabel = await roleCombobox.textContent();
      const wantsMerchant = params.trigger.role === "merchant";
      const alreadyMerchant = roleLabel?.includes("商戶") ?? false;
      const alreadyBuyer = roleLabel?.includes("買家") ?? false;
      if (
        (wantsMerchant && !alreadyMerchant) ||
        (!wantsMerchant && !alreadyBuyer)
      ) {
        await roleCombobox.click();
        await page
          .getByRole("option", {
            name: wantsMerchant ? "商戶" : "買家",
          })
          .click();
      }
      await page.locator("#trade-count").fill(String(params.trigger.count));
    } else {
      await selectTriggerKind(page, "event_once");
      const eventLabels: Record<string, string> = {
        profile_complete: "完善個人資料",
        first_listing: "首次上架",
        first_chat: "首次聊天",
        account_registered: "註冊完成",
      };
      const eventLabel =
        eventLabels[params.trigger.event] ?? "完善個人資料";
      const triggerSection = page.locator("section").filter({
        has: page.getByRole("heading", { name: "觸發條件" }),
      });
      await triggerSection.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: eventLabel }).click();
    }

    if (params.activityWindow) {
      await page
        .locator("#auto-grant-starts")
        .fill(params.activityWindow.startsAt);
      await page.locator("#auto-grant-ends").fill(params.activityWindow.endsAt);
    }
  }

  if (params.redemptionCatalog) {
    await page
      .locator("#catalog-points-cost")
      .fill(String(params.redemptionCatalog.pointsCost));
    await page
      .locator("#catalog-stock")
      .fill(String(params.redemptionCatalog.stock));
  }

  await submitAdminRewardActivityPublish(page, params.title);
  await openAdminCampaignsActivitiesTab(page);
}

export async function openAdminCheckInTab(page: Page): Promise<void> {
  await page.goto("/admin/campaigns?tab=check-in", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("tab", { name: /^簽到計劃/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page
      .getByRole("button", { name: /儲存簽到計劃/ })
      .or(page.getByText("找不到簽到計劃")),
  ).toBeVisible({ timeout: 20_000 });
}

export async function invokeAutoGrantForUser(userId: string): Promise<void> {
  const admin = createE2eAdminClient();
  const { error } = await admin.rpc("fn_try_auto_grant_rewards", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`[invokeAutoGrantForUser] ${error.message}`);
  }
}

export async function setProfileCompletedTradesCount(
  userId: string,
  count: number,
): Promise<void> {
  const admin = createE2eAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ completed_trades_count: count })
    .eq("id", userId);
  if (error) {
    throw new Error(`[setProfileCompletedTradesCount] ${error.message}`);
  }
}

export async function getPointLedgerGrantForTemplate(params: {
  userId: string;
  templateId: string;
}): Promise<number | null> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("point_ledger")
    .select("amount")
    .eq("user_id", params.userId)
    .eq("source_type", "reward_template")
    .eq("source_ref", params.templateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[getPointLedgerGrantForTemplate] ${error.message}`);
  }

  return data?.amount == null ? null : Number(data.amount);
}

export async function getRewardCouponCenterForUserId(userId: string) {
  throw new Error(
    "[getRewardCouponCenterForUserId] Post R-02 requires an authenticated user session; use getRewardCouponCenterForUser({ email, password }) instead.",
  );
}

export async function getRewardCouponCenterForUser(params: {
  email: string;
  password: string;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing Supabase public env for coupon center RPC");
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: signInData, error: signInError } =
    await client.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    });
  if (signInError) {
    throw new Error(`[getRewardCouponCenterForUser] ${signInError.message}`);
  }

  const userId = signInData.user?.id;
  if (!userId) {
    throw new Error("[getRewardCouponCenterForUser] sign-in returned no user");
  }

  const { data, error } = await client.rpc("get_reward_coupon_center", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`[getRewardCouponCenterForUser] ${error.message}`);
  }

  return parseRewardCouponCenter(data);
}

export async function publishDiscountCouponTemplate(
  page: Page,
  params: {
    title: string;
    amount?: number;
    minSpend?: number;
  },
): Promise<void> {
  await gotoAdminRewardActivityForm(page);

  await page.locator("#activity-title").fill(params.title);

  const rewardSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "獎勵內容" }),
  });
  await rewardSection.getByRole("combobox").click();
  await page.getByRole("option", { name: "折扣券" }).click();
  await page.locator("#reward-amount").fill(String(params.amount ?? 10));
  await page
    .locator("#reward-min-spend")
    .fill(String(params.minSpend ?? 100));

  await submitAdminRewardActivityPublish(page, params.title);
  await openAdminCampaignsActivitiesTab(page);
}

export async function openAdminCampaignsActivitiesTab(page: Page): Promise<void> {
  await page.goto("/admin/campaigns", { waitUntil: "domcontentloaded" });
  await expect(
    page
      .getByRole("button", { name: "新增活動" })
      .or(page.getByRole("button", { name: "新增一般券" })),
  ).toBeVisible({
    timeout: 20_000,
  });
}

export async function setFlashActivityStatusForE2e(
  templateId: string,
  status: "paused" | "active",
): Promise<void> {
  const client = await createE2eAdminAuthedClient();
  const { error } = await client.rpc("rpc_admin_set_reward_activity_status", {
    p_template_id: templateId,
    p_status: status,
  });
  if (error) {
    throw new Error(`[setFlashActivityStatusForE2e] ${error.message}`);
  }
}

export async function setFlashCampaignStatusViaAdmin(
  page: Page,
  templateTitle: string,
  status: "paused" | "active",
): Promise<void> {
  await openAdminCampaignsActivitiesTab(page);

  const card = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: templateTitle, exact: true }) })
    .first();
  const cardVisible = await card.isVisible({ timeout: 10_000 }).catch(() => false);

  if (cardVisible) {
    const toggle = card.getByRole("switch");
    const toggleVisible = await toggle
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (toggleVisible) {
      const isActive = await toggle.isChecked();
      const shouldBeActive = status === "active";
      if (isActive !== shouldBeActive) {
        await toggle.click();
        await expect(toggle).toBeChecked({ checked: shouldBeActive, timeout: 20_000 });
      }
      return;
    }
  }

  const templateId = await getRewardTemplateIdByTitle(templateTitle);
  if (!templateId) {
    throw new Error(`Flash activity template not found for title: ${templateTitle}`);
  }
  await setFlashActivityStatusForE2e(templateId, status);
}

export async function buyMerchantListingAndReachCheckout(
  page: Page,
  sellerId: string,
  listingId: string,
): Promise<string> {
  const sellerDisplayName = await getMerchantSellerDisplayNameForE2e(sellerId);
  const productPath = `/marketplace/${sellerId}/product/${listingId}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(productPath, { waitUntil: "domcontentloaded" });
      break;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(1_000);
    }
  }
  await waitForMerchantProductDetailReady(page, sellerDisplayName);

  await clickProductDetailBuyNow(page);

  const orderId = await reachCheckoutAfterProductDetailBuyNow(
    page,
    listingId,
    "Buy now did not navigate to checkout and no pending order was created",
  );

  await waitForMerchantDirectCheckoutReady(page);
  return orderId;
}

async function waitForMerchantDirectCheckoutReady(page: Page): Promise<void> {
  const { waitForMerchantDirectCheckoutReady: waitReady } = await import(
    "./rewards-checkout-coupon"
  );
  await waitReady(page);
}

export async function tryClaimFlashCampaignViaUI(
  page: Page,
  campaignName?: string,
): Promise<boolean> {
  try {
    await gotoMemberCampaignsPage(page, "flash");
    await page.waitForTimeout(2000);

    const card = campaignName
      ? page.locator("div.rounded-2xl").filter({ hasText: campaignName })
      : page.locator("div.rounded-2xl").first();

    if (!(await card.isVisible({ timeout: 10_000 }).catch(() => false))) {
      return false;
    }

    const claimButton = card.getByRole("button", { name: "立即搶券" });
    if (!(await claimButton.isEnabled({ timeout: 10_000 }).catch(() => false))) {
      return false;
    }

    await claimButton.click();
    await expect(page.getByText("搶券成功")).toBeVisible({ timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

export async function claimFlashCampaignViaUI(
  page: Page,
  campaignName?: string,
): Promise<void> {
  const claimed = await tryClaimFlashCampaignViaUI(page, campaignName);
  if (!claimed) {
    throw new Error("Flash campaign UI claim failed");
  }
}
