import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createServiceRoleClient } from "../../shared/supabase-admin";

export type MerchantListingFixture = {
  listingId: string;
  sellerId: string;
  price: number;
};

const DEFAULT_PREPARE_ARGS = {
  p_shipping_method: "meetup",
  p_use_auth: false,
  p_sf_locker_code: null,
  p_sf_address: null,
  p_buyer_phone: "91234567",
  p_meetup_detail: "Vitest meetup",
  p_buyer_remark: null,
} as const;

async function seedMerchantListingForIntegration(
  sellerId: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data: catalog, error: catalogError } = await admin
    .from("product_catalog")
    .select("id")
    .not("name_zh", "is", null)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (catalogError) {
    throw new Error(
      `[seedMerchantListingForIntegration] ${catalogError.message}`,
    );
  }

  if (!catalog?.id) {
    return null;
  }

  const { data, error } = await admin
    .from("listings")
    .insert({
      seller_id: sellerId,
      product_id: catalog.id,
      price: 299,
      status: "active",
      seller_persona: "merchant",
      grading_company: "RAW",
      seller_description: "Integration merchant auth-fee fixture (auto-seeded)",
      images: [],
      use_authentication: true,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`[seedMerchantListingForIntegration] ${error.message}`);
  }

  return data.id;
}

export async function findMerchantListingForIntegration(): Promise<MerchantListingFixture> {
  const envListingId = process.env.E2E_LISTING_ID?.trim();
  const envMerchantListingId = process.env.E2E_MERCHANT_LISTING_ID?.trim();
  const envSellerId = process.env.E2E_SELLER_ID?.trim();
  const admin = createServiceRoleClient();

  async function resolveMerchantListing(
    listing: {
      id: string;
      seller_id: string | null;
      price: number | null;
      seller_persona: string | null;
      status: string | null;
    },
  ): Promise<MerchantListingFixture | null> {
    if (listing.seller_persona !== "merchant" || !listing.seller_id) {
      return null;
    }

    if (listing.status !== "active") {
      const { error: activateError } = await admin
        .from("listings")
        .update({ status: "active" })
        .eq("id", listing.id);
      if (activateError) {
        throw new Error(
          `[findMerchantListingForIntegration] reactivate listing: ${activateError.message}`,
        );
      }
    }

    return {
      listingId: listing.id,
      sellerId: listing.seller_id,
      price: Number(listing.price ?? 0),
    };
  }

  async function loadListingById(
    listingId: string,
  ): Promise<MerchantListingFixture | null> {
    const { data, error } = await admin
      .from("listings")
      .select("id, seller_id, price, seller_persona, status")
      .eq("id", listingId)
      .maybeSingle();

    if (error) {
      throw new Error(`[findMerchantListingForIntegration] ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return resolveMerchantListing(data);
  }

  if (envMerchantListingId) {
    const resolved = await loadListingById(envMerchantListingId);
    if (!resolved) {
      throw new Error(
        `[findMerchantListingForIntegration] E2E_MERCHANT_LISTING_ID must be a merchant listing: ${envMerchantListingId}`,
      );
    }
    if (envSellerId && resolved.sellerId !== envSellerId) {
      throw new Error(
        `[findMerchantListingForIntegration] E2E_MERCHANT_LISTING_ID seller_id must equal E2E_SELLER_ID (listing ${resolved.sellerId}, expected ${envSellerId})`,
      );
    }
    return resolved;
  }

  if (envListingId && envSellerId) {
    const { data, error } = await admin
      .from("listings")
      .select("id, seller_id, price, seller_persona, status")
      .eq("id", envListingId)
      .maybeSingle();

    if (error) {
      throw new Error(`[findMerchantListingForIntegration] ${error.message}`);
    }

    if (!data) {
      throw new Error(
        `[findMerchantListingForIntegration] E2E_LISTING_ID not found: ${envListingId}`,
      );
    }

    if (data.seller_persona === "merchant") {
      if (!data.seller_id) {
        throw new Error(
          `[findMerchantListingForIntegration] E2E_LISTING_ID merchant listing missing seller_id`,
        );
      }
      if (data.seller_id !== envSellerId) {
        throw new Error(
          `[findMerchantListingForIntegration] E2E_LISTING_ID seller_id must equal E2E_SELLER_ID (listing ${data.seller_id}, expected ${envSellerId})`,
        );
      }
      const resolved = await resolveMerchantListing(data);
      if (resolved) {
        return resolved;
      }
    }
  }

  if (envSellerId) {
    const { data: sellerListings, error: sellerError } = await admin
      .from("listings")
      .select("id, seller_id, price, seller_persona, status")
      .eq("seller_id", envSellerId)
      .eq("seller_persona", "merchant")
      .in("status", ["active", "inactive", "sold"])
      .order("updated_at", { ascending: false })
      .limit(5);

    if (sellerError) {
      throw new Error(`[findMerchantListingForIntegration] ${sellerError.message}`);
    }

    for (const row of sellerListings ?? []) {
      const resolved = await resolveMerchantListing(row);
      if (resolved) {
        return resolved;
      }
    }

    const seededListingId = await seedMerchantListingForIntegration(envSellerId);
    if (seededListingId) {
      const resolved = await loadListingById(seededListingId);
      if (resolved) {
        return resolved;
      }
    }
  }

  const { data: kycRows, error: kycError } = await admin
    .from("kyc_records")
    .select("merchant_id")
    .eq("kyc_status", "verified")
    .eq("stripe_charges_enabled", true)
    .eq("stripe_payouts_enabled", true);

  if (kycError) {
    throw new Error(`[findMerchantListingForIntegration] ${kycError.message}`);
  }

  const payoutReadySellerIds = new Set(
    (kycRows ?? [])
      .map((row) => row.merchant_id)
      .filter((sellerId): sellerId is string => Boolean(sellerId)),
  );

  const { data: listings, error: listingError } = await admin
    .from("listings")
    .select("id, seller_id, price, seller_persona")
    .eq("seller_persona", "merchant")
    .order("created_at", { ascending: false })
    .limit(50);

  if (listingError) {
    throw new Error(`[findMerchantListingForIntegration] ${listingError.message}`);
  }

  const match = (listings ?? []).find(
    (row) => row.seller_id && payoutReadySellerIds.has(row.seller_id),
  );

  if (!match?.seller_id) {
    throw new Error(
      "No payout-ready merchant listing found for coupon FSM integration tests",
    );
  }

  return {
    listingId: match.id,
    sellerId: match.seller_id,
    price: match.price,
  };
}

export async function ensureMerchantListingAcceptsAuthentication(
  listingId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("listings")
    .update({ use_authentication: true })
    .eq("id", listingId);

  if (error) {
    throw new Error(
      `[ensureMerchantListingAcceptsAuthentication] ${error.message}`,
    );
  }
}

export async function seedPendingMerchantOrders(
  buyerId: string,
  listingId: string,
  count: number,
): Promise<string[]> {
  const admin = createServiceRoleClient();
  const orderIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const { data, error } = await admin.rpc(
      "rpc_e2e_seed_merchant_pending_payment_order",
      {
        p_listing_id: listingId,
        p_buyer_id: buyerId,
      },
    );

    if (error) {
      throw new Error(`[seedPendingMerchantOrders] ${error.message}`);
    }

    if (!data) {
      throw new Error("[seedPendingMerchantOrders] missing order id");
    }

    orderIds.push(data);
  }

  return orderIds;
}

export async function grantCouponForCheckout(params: {
  userId: string;
  templateId: string;
  dedupKey?: string;
}): Promise<string> {
  const admin = createServiceRoleClient();
  const dedupKey =
    params.dedupKey ?? `vitest-coupon-${crypto.randomUUID()}`;

  const { data, error } = await admin
    .from("user_rewards")
    .insert({
      user_id: params.userId,
      template_id: params.templateId,
      grant_dedup_key: dedupKey,
      is_used: false,
      calculated_expiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`[grantCouponForCheckout] ${error.message}`);
  }

  return data.id;
}

export async function invokePreparePayment(
  client: SupabaseClient<Database>,
  orderId: string,
  couponId: string,
  overrides?: Partial<{
    p_shipping_method: string;
    p_use_auth: boolean;
    p_sf_locker_code: string | null;
    p_sf_address: string | null;
    p_buyer_phone: string;
    p_meetup_detail: string;
    p_buyer_remark: string | null;
  }>,
): Promise<{ success: true } | { success: false; error: string }> {
  const { error } = await client.rpc("rpc_prepare_merchant_order_payment", {
    p_order_id: orderId,
    ...DEFAULT_PREPARE_ARGS,
    ...overrides,
    p_user_reward_id: couponId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function releaseMerchantOrderCoupon(
  orderId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.rpc("fn_release_merchant_order_coupon", {
    p_order_id: orderId,
  });

  if (error) {
    throw new Error(`[releaseMerchantOrderCoupon] ${error.message}`);
  }
}

export async function backdateMerchantOrderCreatedAt(
  orderId: string,
  hoursAgo = 49,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.rpc(
    "rpc_e2e_backdate_merchant_order_created_at",
    {
      p_order_id: orderId,
      p_hours_ago: hoursAgo,
    },
  );

  if (error) {
    throw new Error(`[backdateMerchantOrderCreatedAt] ${error.message}`);
  }
}

export type MerchantPendingPaymentExpiryCandidate = {
  order_id: string;
  stripe_payment_intent_id: string | null;
  listing_id: string;
};

export async function listMerchantPendingPaymentExpiryCandidates(
  limit = 50,
): Promise<MerchantPendingPaymentExpiryCandidate[]> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc(
    "rpc_list_merchant_pending_payment_expiry_candidates",
    { p_limit: limit },
  );

  if (error) {
    throw new Error(
      `[listMerchantPendingPaymentExpiryCandidates] ${error.message}`,
    );
  }

  return (data ?? []) as MerchantPendingPaymentExpiryCandidate[];
}

export async function finalizeMerchantPendingPaymentExpiry(
  orderId: string,
): Promise<{ success: boolean; already_applied: boolean; escrow_status: string }> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc(
    "rpc_finalize_merchant_pending_payment_expiry",
    { p_order_id: orderId },
  );

  if (error) {
    throw new Error(`[finalizeMerchantPendingPaymentExpiry] ${error.message}`);
  }

  const payload = data as {
    success?: boolean;
    already_applied?: boolean;
    escrow_status?: string;
  };

  return {
    success: payload.success === true,
    already_applied: payload.already_applied === true,
    escrow_status: payload.escrow_status ?? "",
  };
}

export async function restoreMerchantOrderCouponOnVoid(
  orderId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.rpc("fn_restore_merchant_order_coupon_on_void", {
    p_order_id: orderId,
  });

  if (error) {
    throw new Error(`[restoreMerchantOrderCouponOnVoid] ${error.message}`);
  }
}

export async function markCouponUsedForOrder(params: {
  userRewardId: string;
  orderId: string;
}): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("user_rewards")
    .update({
      is_used: true,
      used_at: new Date().toISOString(),
      reserved_merchant_order_id: params.orderId,
    })
    .eq("id", params.userRewardId);

  if (error) {
    throw new Error(`[markCouponUsedForOrder] ${error.message}`);
  }
}

export async function setBuyerProfileComplete(userId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("profiles")
    .update({
      avatar_path: `vitest/avatar-${userId.slice(0, 8)}.png`,
      username: `vitest_${userId.slice(0, 8)}`,
    })
    .eq("id", userId);

  if (error) {
    throw new Error(`[setBuyerProfileComplete] ${error.message}`);
  }
}

export async function invokeMarkPaid(
  orderId: string,
  paymentIntentId = `pi_vitest_${crypto.randomUUID()}`,
): Promise<{ success: true } | { success: false; error: string }> {
  const admin = createServiceRoleClient();
  const { error } = await admin.rpc("rpc_mark_merchant_order_paid", {
    p_order_id: orderId,
    p_payment_intent_id: paymentIntentId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function backdateCouponReserve(
  userRewardId: string,
  minutesAgo = 16,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.rpc("rpc_e2e_backdate_coupon_reserve", {
    p_user_reward_id: userRewardId,
    p_minutes_ago: minutesAgo,
  });

  if (error) {
    throw new Error(`[backdateCouponReserve] ${error.message}`);
  }
}

export async function finalizeStaleCouponReserve(
  userRewardId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.rpc("rpc_finalize_stale_coupon_reserve", {
    p_user_reward_id: userRewardId,
  });

  if (error) {
    throw new Error(`[finalizeStaleCouponReserve] ${error.message}`);
  }
}

export async function getUserRewardCheckoutRow(userRewardId: string) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("user_rewards")
    .select(
      "id, is_used, used_at, reserved_merchant_order_id, reserved_member_order_id, reserved_at, calculated_expiry",
    )
    .eq("id", userRewardId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getUserRewardCheckoutRow] ${error.message}`);
  }

  return data;
}

export async function getMerchantOrderCouponRow(orderId: string) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("merchant_orders")
    .select("id, coupon_user_reward_id, escrow_status")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getMerchantOrderCouponRow] ${error.message}`);
  }

  return data;
}

export type MerchantOrderAuthEscrowRow = {
  id: string;
  item_subtotal: number | null;
  final_price: number | null;
  auth_fee: number | null;
  shipping_fee: number | null;
  inbound_shipping_fee: number | null;
  outbound_shipping_fee: number | null;
  total_amount: number | null;
  buyer_total_amount: number | null;
  platform_subsidy_amount: number | null;
  escrow_capture_model: string | null;
  coupon_user_reward_id: string | null;
  coupon_type: string | null;
  requires_authentication: boolean | null;
};

export async function getMerchantOrderAuthEscrowRow(
  orderId: string,
): Promise<MerchantOrderAuthEscrowRow | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("merchant_orders")
    .select(
      "id, item_subtotal, final_price, auth_fee, shipping_fee, inbound_shipping_fee, outbound_shipping_fee, total_amount, buyer_total_amount, platform_subsidy_amount, escrow_capture_model, coupon_user_reward_id, coupon_type, requires_authentication",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getMerchantOrderAuthEscrowRow] ${error.message}`);
  }

  return data;
}

const AUTH_PREPARE_OVERRIDES = {
  p_use_auth: true,
  p_shipping_method: "sf",
  p_sf_locker_code: "VITEST01",
  p_sf_address: "Vitest SF locker",
  p_buyer_phone: "91234567",
} as const;

export async function invokeAuthPreparePayment(
  client: SupabaseClient<Database>,
  orderId: string,
  couponId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  return invokePreparePayment(client, orderId, couponId, AUTH_PREPARE_OVERRIDES);
}

export type CheckoutEligibleCouponRow = {
  id: string;
  eligible: boolean;
  ineligibleReason: string | null;
  previewSubsidy: number;
};

export async function invokeListCheckoutEligibleCoupons(
  client: SupabaseClient<Database>,
  orderId: string,
  options?: { shippingMethod?: string; useAuth?: boolean },
): Promise<CheckoutEligibleCouponRow[]> {
  const { data, error } = await client.rpc("rpc_list_checkout_eligible_coupons", {
    p_order_id: orderId,
    p_shipping_method: options?.shippingMethod ?? "sf",
    p_use_auth: options?.useAuth ?? false,
  });

  if (error) {
    throw new Error(`[invokeListCheckoutEligibleCoupons] ${error.message}`);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string") {
      return [];
    }

    return [
      {
        id: row.id,
        eligible: row.eligible === true,
        ineligibleReason:
          typeof row.ineligible_reason === "string" ? row.ineligible_reason : null,
        previewSubsidy: Number(row.preview_subsidy ?? 0),
      },
    ];
  });
}

export async function setCouponExpiry(
  userRewardId: string,
  expiryIso: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("user_rewards")
    .update({ calculated_expiry: expiryIso })
    .eq("id", userRewardId)
    .select("id");

  if (error) {
    throw new Error(`[setCouponExpiry] ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error(`[setCouponExpiry] no user_rewards row for ${userRewardId}`);
  }
}

export async function attemptDirectCouponTamper(
  client: SupabaseClient<Database>,
  userRewardId: string,
  patch: {
    is_used?: boolean;
    calculated_expiry?: string;
    reserved_merchant_order_id?: null;
  },
): Promise<{ success: true } | { success: false; error: string }> {
  const { error } = await client
    .from("user_rewards")
    .update(patch)
    .eq("id", userRewardId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function invokeReleaseCoupon(
  client: SupabaseClient<Database>,
  orderId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { error } = await client.rpc("fn_release_merchant_order_coupon", {
    p_order_id: orderId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function invokeGetRewardCouponCenter(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<{ success: true; data: unknown } | { success: false; error: string }> {
  const { data, error } = await client.rpc("get_reward_coupon_center", {
    p_user_id: userId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export type MemberListingFixture = {
  listingId: string;
  sellerId: string;
  price: number;
};

export async function seedMemberListingForIntegration(
  sellerId: string,
): Promise<string> {
  const admin = createServiceRoleClient();
  const { data: catalog, error: catalogError } = await admin
    .from("product_catalog")
    .select("id")
    .not("name_zh", "is", null)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (catalogError) {
    throw new Error(
      `[seedMemberListingForIntegration] ${catalogError.message}`,
    );
  }

  if (!catalog?.id) {
    throw new Error("[seedMemberListingForIntegration] no product catalog row");
  }

  const { data, error } = await admin
    .from("listings")
    .insert({
      seller_id: sellerId,
      product_id: catalog.id,
      price: 199,
      status: "active",
      seller_persona: "member",
      grading_company: "RAW",
      seller_description: "Integration member auth fixture (auto-seeded)",
      images: [],
      use_authentication: true,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`[seedMemberListingForIntegration] ${error.message}`);
  }

  return data.id;
}

export async function findMemberListingForIntegration(params?: {
  excludeBuyerId?: string;
}): Promise<MemberListingFixture> {
  const admin = createServiceRoleClient();
  const envListingId = process.env.E2E_LISTING_ID?.trim();
  const envSellerId = process.env.E2E_SELLER_ID?.trim();

  async function resolveListing(
    listing: {
      id: string;
      seller_id: string;
      price: number | null;
      seller_persona: string | null;
      status: string | null;
    },
  ): Promise<MemberListingFixture | null> {
    if (
      listing.seller_persona !== "member" ||
      !listing.seller_id ||
      (params?.excludeBuyerId && listing.seller_id === params.excludeBuyerId)
    ) {
      return null;
    }

    if (listing.status !== "active") {
      const { error: activateError } = await admin
        .from("listings")
        .update({ status: "active" })
        .eq("id", listing.id);
      if (activateError) {
        throw new Error(
          `[findMemberListingForIntegration] reactivate listing: ${activateError.message}`,
        );
      }
    }

    return {
      listingId: listing.id,
      sellerId: listing.seller_id,
      price: Number(listing.price ?? 0),
    };
  }

  if (envListingId) {
    const { data: envListing, error: envError } = await admin
      .from("listings")
      .select("id, seller_id, price, seller_persona, status")
      .eq("id", envListingId)
      .maybeSingle();

    if (envError) {
      throw new Error(`[findMemberListingForIntegration] ${envError.message}`);
    }

    if (envListing) {
      const resolved = await resolveListing(envListing);
      if (resolved) {
        return resolved;
      }
    }
  }

  if (envSellerId && (!params?.excludeBuyerId || envSellerId !== params.excludeBuyerId)) {
    const { data: sellerListing, error: sellerError } = await admin
      .from("listings")
      .select("id, seller_id, price, seller_persona, status")
      .eq("seller_id", envSellerId)
      .eq("seller_persona", "member")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sellerError) {
      throw new Error(`[findMemberListingForIntegration] ${sellerError.message}`);
    }

    if (sellerListing) {
      const resolved = await resolveListing(sellerListing);
      if (resolved) {
        return resolved;
      }
    }
  }

  let query = admin
    .from("listings")
    .select("id, seller_id, price, seller_persona, status")
    .eq("seller_persona", "member")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (params?.excludeBuyerId) {
    query = query.neq("seller_id", params.excludeBuyerId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`[findMemberListingForIntegration] ${error.message}`);
  }

  if (!data?.seller_id) {
    throw new Error("No active member listing found for member auth coupon tests");
  }

  return {
    listingId: data.id,
    sellerId: data.seller_id,
    price: Number(data.price),
  };
}

export async function ensureMemberListingAcceptsAuthentication(
  listingId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("listings")
    .update({ use_authentication: true })
    .eq("id", listingId);

  if (error) {
    throw new Error(
      `[ensureMemberListingAcceptsAuthentication] ${error.message}`,
    );
  }
}

export async function seedPendingMemberAuthOrders(
  buyerId: string,
  listingId: string,
  count = 1,
): Promise<string[]> {
  const admin = createServiceRoleClient();
  const orderIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const { data, error } = await admin.rpc(
      "rpc_e2e_seed_member_auth_pending_payment_order",
      {
        p_listing_id: listingId,
        p_buyer_id: buyerId,
      },
    );

    if (error) {
      throw new Error(`[seedPendingMemberAuthOrders] ${error.message}`);
    }

    if (!data) {
      throw new Error("[seedPendingMemberAuthOrders] missing order id");
    }

    orderIds.push(data);
  }

  return orderIds;
}

export type MemberOrderAuthEscrowRow = {
  id: string;
  final_price: number;
  item_subtotal: number | null;
  auth_fee: number | null;
  inbound_shipping_fee: number | null;
  outbound_shipping_fee: number | null;
  total_amount: number | null;
  buyer_total_amount: number | null;
  platform_subsidy_amount: number | null;
  coupon_user_reward_id: string | null;
  coupon_type: string | null;
  escrow_capture_model: string | null;
};

export async function getMemberOrderAuthEscrowRow(
  orderId: string,
): Promise<MemberOrderAuthEscrowRow | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("member_orders")
    .select(
      "id, final_price, item_subtotal, auth_fee, inbound_shipping_fee, outbound_shipping_fee, total_amount, buyer_total_amount, platform_subsidy_amount, escrow_capture_model, coupon_user_reward_id, coupon_type",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getMemberOrderAuthEscrowRow] ${error.message}`);
  }

  return data;
}

export async function invokeMemberAuthPreparePayment(
  client: SupabaseClient<Database>,
  orderId: string,
  couponId?: string | null,
): Promise<{ success: true } | { success: false; error: string }> {
  const { error } = await client.rpc("rpc_prepare_member_auth_order_payment", {
    p_order_id: orderId,
    p_user_reward_id: couponId ?? undefined,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function restoreMemberOrderCouponOnVoid(
  orderId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.rpc("fn_restore_member_order_coupon_on_void", {
    p_order_id: orderId,
  });

  if (error) {
    throw new Error(`[restoreMemberOrderCouponOnVoid] ${error.message}`);
  }
}

export async function invokeReleaseMemberCoupon(
  orderId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const admin = createServiceRoleClient();
  const { error } = await admin.rpc("fn_release_member_order_coupon", {
    p_order_id: orderId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
