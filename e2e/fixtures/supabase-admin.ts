import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getChatRealtimeFixtures } from "./chat-test-data";

export type ChatMessageAuditRow = {
  id: string;
  room_id: string;
  content: string;
  created_at: string | null;
  sender_id: string;
  is_system_warning: boolean | null;
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
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getProfileEmailById(userId: string): Promise<string | null> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);

  if (error) {
    throw new Error(`[getProfileEmailById] ${error.message}`);
  }

  return data.user?.email?.trim() ?? null;
}

export async function getProfileIdByEmail(email: string): Promise<string | null> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw new Error(`[getProfileIdByEmail] ${error.message}`);
  }

  const normalized = email.trim().toLowerCase();
  const user = data.users.find(
    (entry) => entry.email?.trim().toLowerCase() === normalized,
  );

  return user?.id ?? null;
}

export async function ensureDbChatRoom(
  buyerId: string,
  sellerId: string,
): Promise<string> {
  const admin = createE2eAdminClient();

  const { data: existingRows, error: selectError } = await admin
    .from("chat_rooms")
    .select("id")
    .eq("buyer_id", buyerId)
    .eq("seller_id", sellerId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (selectError) {
    throw new Error(`[ensureDbChatRoom] ${selectError.message}`);
  }

  const existing = existingRows?.[0];

  if (existing?.id) {
    return existing.id;
  }

  const { data: created, error: insertError } = await admin
    .from("chat_rooms")
    .insert({ buyer_id: buyerId, seller_id: sellerId })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(`[ensureDbChatRoom] ${insertError.message}`);
  }

  return created.id;
}

export async function getChatRoomSellerPersona(
  roomId: string,
): Promise<"member" | "merchant"> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("chat_rooms")
    .select("seller_persona")
    .eq("id", roomId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getChatRoomSellerPersona] ${error.message}`);
  }

  return data?.seller_persona === "merchant" ? "merchant" : "member";
}

export async function acknowledgePendingRewardGrantsForUser(
  userId: string,
): Promise<void> {
  const admin = createE2eAdminClient();
  const { error } = await admin
    .from("user_rewards")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("acknowledged_at", null);

  if (error) {
    throw new Error(`[acknowledgePendingRewardGrantsForUser] ${error.message}`);
  }
}

export async function getLatestChatMessage(
  roomId: string,
  contentContains?: string,
): Promise<ChatMessageAuditRow | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("chat_messages")
    .select("id, room_id, content, created_at, sender_id, is_system_warning")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`[getLatestChatMessage] ${error.message}`);
  }

  const rows = (data ?? []) as ChatMessageAuditRow[];
  if (rows.length === 0) {
    return null;
  }

  if (contentContains) {
    return rows.find((row) => row.content.includes(contentContains)) ?? null;
  }

  return rows[0] ?? null;
}

export async function getLatestChatMessageForParties(
  buyerId: string,
  sellerId: string,
  contentContains?: string,
): Promise<ChatMessageAuditRow | null> {
  const admin = createE2eAdminClient();

  const { data: rooms, error: roomsError } = await admin
    .from("chat_rooms")
    .select("id")
    .eq("buyer_id", buyerId)
    .eq("seller_id", sellerId);

  if (roomsError) {
    throw new Error(`[getLatestChatMessageForParties] ${roomsError.message}`);
  }

  const roomIds = (rooms ?? []).map((room) => room.id).filter(Boolean);
  if (roomIds.length === 0) {
    return null;
  }

  const { data, error } = await admin
    .from("chat_messages")
    .select("id, room_id, content, created_at, sender_id, is_system_warning")
    .in("room_id", roomIds)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`[getLatestChatMessageForParties] ${error.message}`);
  }

  const rows = (data ?? []) as ChatMessageAuditRow[];
  if (rows.length === 0) {
    return null;
  }

  if (contentContains) {
    return rows.find((row) => row.content.includes(contentContains)) ?? null;
  }

  return rows[0] ?? null;
}

export async function getOfferStatus(offerId: string): Promise<string | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("offers")
    .select("status")
    .eq("id", offerId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getOfferStatus] ${error.message}`);
  }

  return data?.status ?? null;
}

export async function getOfferRoomId(offerId: string): Promise<string | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("offers")
    .select("room_id")
    .eq("id", offerId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getOfferRoomId] ${error.message}`);
  }

  return data?.room_id ?? null;
}

export async function hasOfferChatMessage(offerId: string): Promise<boolean> {
  const admin = createE2eAdminClient();

  const { count, error } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("offer_id", offerId);

  if (error) {
    throw new Error(`[hasOfferChatMessage] ${error.message}`);
  }

  return (count ?? 0) > 0;
}

export async function acceptOfferViaSellerRpc(
  offerId: string,
  sellerId: string,
): Promise<void> {
  const admin = createE2eAdminClient();
  const { error: adminError } = await (
    admin as unknown as {
      rpc: (
        fn: "rpc_accept_offer",
        args: { p_offer_id: string; p_seller_id: string },
      ) => Promise<{ error: { message?: string } | null }>;
    }
  ).rpc("rpc_accept_offer", {
    p_offer_id: offerId,
    p_seller_id: sellerId,
  });
  if (!adminError) {
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { sellerEmail, sellerPassword } = getChatRealtimeFixtures();

  if (!url || !anonKey || !sellerEmail || !sellerPassword) {
    throw new Error(
      `[acceptOfferViaSellerRpc] admin RPC failed (${adminError.message ?? "unknown"}) and seller auth env is missing`,
    );
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let lastSignInError: { message?: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error: signInError } = await client.auth.signInWithPassword({
      email: sellerEmail,
      password: sellerPassword,
    });
    if (!signInError) {
      const { error } = await client.rpc("rpc_accept_offer", {
        p_offer_id: offerId,
        p_seller_id: sellerId,
      });
      if (error) {
        throw new Error(`[acceptOfferViaSellerRpc] ${error.message}`);
      }
      return;
    }
    lastSignInError = signInError;
    await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)));
  }

  throw new Error(
    `[acceptOfferViaSellerRpc] admin RPC failed (${adminError.message ?? "unknown"}); sign-in failed: ${lastSignInError?.message ?? JSON.stringify(lastSignInError)}`,
  );
}

export async function rejectOfferViaSellerRpc(
  offerId: string,
  sellerId: string,
): Promise<void> {
  const admin = createE2eAdminClient();
  const { error } = await (
    admin as unknown as {
      rpc: (
        fn: "rpc_reject_offer",
        args: { p_offer_id: string; p_seller_id: string },
      ) => Promise<{ error: { message?: string } | null }>;
    }
  ).rpc("rpc_reject_offer", {
    p_offer_id: offerId,
    p_seller_id: sellerId,
  });

  if (error) {
    throw new Error(`[rejectOfferViaSellerRpc] ${error.message}`);
  }
}

export async function submitChatReportViaBuyerRpc(params: {
  sellerId: string;
  roomId: string;
  details: string;
  category?: Database["public"]["Enums"]["report_category"];
}): Promise<
  | { success: true; reportId: string; caseId: string }
  | { success: false; error: string }
> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.E2E_BUYER_EMAIL?.trim();
  const password = process.env.E2E_BUYER_PASSWORD?.trim();

  if (!url || !anonKey || !email || !password) {
    throw new Error(
      "Missing Supabase public env or E2E buyer credentials for chat report RPC",
    );
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    throw new Error(
      `[submitChatReportViaBuyerRpc] sign-in failed: ${signInError.message}`,
    );
  }

  const { data, error } = await client.rpc("rpc_submit_user_report_v2", {
    p_target_id: params.sellerId,
    p_category: params.category ?? "fraud",
    p_details: params.details,
    p_chat_room_id: params.roomId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const payload = data as { report_id?: string; case_id?: string } | null;
  if (!payload?.report_id || !payload?.case_id) {
    return { success: false, error: "提交舉報回傳資料格式異常" };
  }

  return {
    success: true,
    reportId: payload.report_id,
    caseId: payload.case_id,
  };
}

export async function simulateMemberAuthOrderPayment(
  memberOrderId: string,
): Promise<void> {
  const admin = createE2eAdminClient();

  const { data: order, error: orderError } = await admin
    .from("member_orders")
    .select("stripe_payment_intent_id")
    .eq("id", memberOrderId)
    .maybeSingle<{ stripe_payment_intent_id: string | null }>();

  if (orderError) {
    throw new Error(`[simulateMemberAuthOrderPayment] ${orderError.message}`);
  }

  const paymentIntentId =
    order?.stripe_payment_intent_id?.trim() ||
    `pi_e2e_${memberOrderId.replace(/-/g, "").slice(0, 24)}`;

  const { error } = await (
    admin as unknown as {
      rpc: (
        fn: "rpc_mark_member_auth_order_authorized",
        args: {
          p_order_id: string;
          p_payment_intent_id: string;
          p_amounts: Record<string, never>;
        },
      ) => Promise<{ error: { message: string } | null }>;
    }
  ).rpc("rpc_mark_member_auth_order_authorized", {
    p_order_id: memberOrderId,
    p_payment_intent_id: paymentIntentId,
    p_amounts: {},
  });

  if (error) {
    throw new Error(`[simulateMemberAuthOrderPayment] ${error.message}`);
  }
}

export async function submitInboundTrackingViaAdmin(
  orderId: string,
  trackingNo: string,
  courierName: string,
): Promise<void> {
  const admin = createE2eAdminClient();

  const { error } = await admin
    .from("member_orders")
    .update({
      inbound_tracking_no: trackingNo,
      inbound_courier_name: courierName,
    })
    .eq("id", orderId);

  if (error) {
    if (isAdminPermissionDenied(error)) {
      throw new Error(
        "[submitInboundTrackingViaAdmin] service role lacks member_orders update grant",
      );
    }
    throw new Error(`[submitInboundTrackingViaAdmin] ${error.message}`);
  }
}

export async function getListingSellerId(
  listingId: string,
): Promise<string | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("listings")
    .select("seller_id")
    .eq("id", listingId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getListingSellerId] ${error.message}`);
  }

  return data?.seller_id ?? null;
}

export async function getProfileDisplayName(profileId: string): Promise<string> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getProfileDisplayName] ${error.message}`);
  }

  return data?.display_name?.trim() || "對話夥伴";
}

export async function isBuyerWithinP2pNewAccountGrace(
  profileId: string,
): Promise<boolean> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("created_at")
    .eq("id", profileId)
    .maybeSingle();

  if (error || !data?.created_at) {
    return false;
  }

  const ageMs = Date.now() - new Date(data.created_at).getTime();
  return ageMs < 14 * 24 * 60 * 60 * 1000;
}

export type ListingMarketplaceFixture = {
  listingId: string;
  productId: string;
  displayId: string | null;
  sellerId: string;
  sellerName: string;
  productName: string;
  listingPrice: number;
  lowestPrice: number;
  searchKeyword: string;
  /** Codes / product id — more reliable in AddAssetModal catalog search. */
  catalogModalKeyword: string;
};

export type ListingMarketplaceFixtureResult =
  | { ok: true; fixture: ListingMarketplaceFixture }
  | { ok: false; skipReason: string };

export type GetListingMarketplaceFixtureOptions = {
  /** When set, returns skip if the listing owner does not match. */
  expectedSellerId?: string;
  /** When set, preferred over catalog fields for `searchKeyword`. */
  preferredSearchKeyword?: string;
  /** When set, skips listings whose `seller_persona` does not match. */
  requiredSellerPersona?: "member" | "merchant";
};

type ProductCatalogSummary = {
  display_id: string | null;
  card_number: string | null;
  name_zh: string | null;
  name_en: string | null;
  name_ja: string;
};

type ListingCatalogJoinRow = {
  id: string;
  price: number;
  status: string;
  product_id: string;
  seller_id: string;
  seller_persona: "member" | "merchant" | null;
  profiles: { display_name: string } | { display_name: string }[] | null;
  product_catalog: ProductCatalogSummary | ProductCatalogSummary[] | null;
};

function hasE2eAdminEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

function readTrimmedEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function unwrapJoinRow<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function resolveProductName(catalog: ProductCatalogSummary | null): string {
  if (!catalog) {
    return "未命名卡牌";
  }

  const zh = catalog.name_zh?.trim();
  if (zh) return zh;

  const en = catalog.name_en?.trim();
  if (en) return en;

  const ja = catalog.name_ja?.trim();
  if (ja) return ja;

  return "未命名卡牌";
}

function resolveSearchKeyword(
  catalog: ProductCatalogSummary | null,
  preferredSearchKeyword?: string,
): string | null {
  const preferred = preferredSearchKeyword?.trim();
  if (preferred) {
    return preferred;
  }

  if (!catalog) {
    return null;
  }

  // Prefer catalog names before codes — card_number / display_id can match unrelated products.
  const nameZh = catalog.name_zh?.trim();
  if (nameZh) return nameZh;

  const nameJa = catalog.name_ja?.trim();
  if (nameJa) return nameJa;

  const nameEn = catalog.name_en?.trim();
  if (nameEn) return nameEn;

  const displayId = catalog.display_id?.trim();
  if (displayId) return displayId;

  const cardNumber = catalog.card_number?.trim();
  if (cardNumber) return cardNumber;

  return null;
}

function resolveCatalogModalKeyword(
  catalog: ProductCatalogSummary | null,
  productId: string,
): string | null {
  if (catalog) {
    const displayId = catalog.display_id?.trim();
    if (displayId) return displayId;

    const cardNumber = catalog.card_number?.trim();
    if (cardNumber) return cardNumber;
  }

  const normalizedProductId = productId.trim();
  if (normalizedProductId) {
    return normalizedProductId;
  }

  return resolveSearchKeyword(catalog);
}

async function getLowestActiveListingPrice(
  admin: ReturnType<typeof createE2eAdminClient>,
  productId: string,
): Promise<number | null> {
  const { data, error } = await admin
    .from("listings")
    .select("price")
    .eq("product_id", productId)
    .eq("status", "active");

  if (error) {
    throw new Error(`[getListingMarketplaceFixture.lowestPrice] ${error.message}`);
  }

  const prices = (data ?? [])
    .map((row) => row.price)
    .filter((price): price is number => typeof price === "number" && price > 0);

  if (prices.length === 0) {
    return null;
  }

  return Math.min(...prices);
}

async function resolveMarketplaceSellerDisplayName(
  admin: ReturnType<typeof createE2eAdminClient>,
  sellerId: string,
  sellerPersona: string | null | undefined,
  displayName: string | undefined,
): Promise<string | null> {
  if (sellerPersona === "merchant") {
    const { data: merchant, error } = await admin
      .from("merchant_shops")
      .select("shop_name")
      .eq("merchant_id", sellerId)
      .maybeSingle();

    if (error) {
      const permissionDenied = /permission denied/i.test(error.message);
      if (!permissionDenied) {
        throw new Error(`[resolveMarketplaceSellerDisplayName] ${error.message}`);
      }
    } else {
      const shopName = merchant?.shop_name?.trim();
      if (shopName) {
        return shopName;
      }
    }
  }

  return displayName?.trim() ?? null;
}

/**
 * Loads marketplace search/order-book fixture data for a listing.
 * Returns `{ ok: false, skipReason }` when env or listing state is unsuitable for E2E.
 */
export async function getListingMarketplaceFixture(
  listingId: string,
  options: GetListingMarketplaceFixtureOptions = {},
): Promise<ListingMarketplaceFixtureResult> {
  const normalizedListingId = listingId.trim();
  if (!normalizedListingId) {
    return { ok: false, skipReason: "Missing listingId for marketplace fixture lookup" };
  }

  if (!hasE2eAdminEnv()) {
    return {
      ok: false,
      skipReason:
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for marketplace fixture lookup",
    };
  }

  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("listings")
    .select(
      `
      id,
      price,
      status,
      product_id,
      seller_id,
      seller_persona,
      profiles!fk_listings_seller_id (
        display_name
      ),
      product_catalog!listings_product_id_fkey (
        display_id,
        card_number,
        name_zh,
        name_en,
        name_ja
      )
    `,
    )
    .eq("id", normalizedListingId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getListingMarketplaceFixture] ${error.message}`);
  }

  if (!data) {
    return {
      ok: false,
      skipReason: `Listing ${normalizedListingId} was not found in Supabase`,
    };
  }

  const row = data as ListingCatalogJoinRow;

  if (row.status !== "active") {
    return {
      ok: false,
      skipReason: `Listing ${normalizedListingId} is not active (status=${row.status})`,
    };
  }

  if (
    options.requiredSellerPersona &&
    row.seller_persona !== options.requiredSellerPersona
  ) {
    return {
      ok: false,
      skipReason: `Listing ${normalizedListingId} seller_persona=${row.seller_persona ?? "unknown"} (expected ${options.requiredSellerPersona})`,
    };
  }

  const expectedSellerId =
    options.expectedSellerId?.trim() ?? readTrimmedEnv("E2E_SELLER_ID");
  if (expectedSellerId && row.seller_id !== expectedSellerId) {
    return {
      ok: false,
      skipReason: `Listing ${normalizedListingId} owner is ${row.seller_id} but E2E_SELLER_ID is ${expectedSellerId}`,
    };
  }

  const sellerProfile = unwrapJoinRow(row.profiles);
  const sellerName = await resolveMarketplaceSellerDisplayName(
    admin,
    row.seller_id,
    row.seller_persona,
    sellerProfile?.display_name,
  );
  if (!sellerName) {
    return {
      ok: false,
      skipReason: `Listing ${normalizedListingId} is missing seller display_name or shop_name`,
    };
  }

  const catalog = unwrapJoinRow(row.product_catalog);
  if (!catalog) {
    return {
      ok: false,
      skipReason: `Listing ${normalizedListingId} is missing product_catalog join`,
    };
  }

  const preferredSearchKeyword = options.preferredSearchKeyword?.trim();
  const searchKeyword = resolveSearchKeyword(catalog, preferredSearchKeyword);
  const catalogModalKeyword = resolveCatalogModalKeyword(catalog, row.product_id);

  if (!searchKeyword) {
    return {
      ok: false,
      skipReason: `Listing ${normalizedListingId} has no usable search keyword (display_id / card_number / name)`,
    };
  }

  if (!catalogModalKeyword) {
    return {
      ok: false,
      skipReason: `Listing ${normalizedListingId} has no usable catalog modal keyword`,
    };
  }

  const lowestPrice = await getLowestActiveListingPrice(admin, row.product_id);
  if (lowestPrice == null) {
    return {
      ok: false,
      skipReason: `Product ${row.product_id} has no active listings for lowestPrice`,
    };
  }

  if (typeof row.price !== "number" || row.price <= 0) {
    return {
      ok: false,
      skipReason: `Listing ${normalizedListingId} has invalid price`,
    };
  }

  return {
    ok: true,
    fixture: {
      listingId: row.id,
      productId: row.product_id,
      displayId: catalog.display_id?.trim() ?? null,
      sellerId: row.seller_id,
      sellerName,
      productName: resolveProductName(catalog),
      listingPrice: row.price,
      lowestPrice,
      searchKeyword,
      catalogModalKeyword,
    },
  };
}

/**
 * Seeds a minimal active listing when staging wipe removed E2E fixtures.
 * Uses the first catalog row with a Chinese name for reliable marketplace search.
 */
export async function seedE2eMarketplaceListingForSeller(
  sellerId: string,
  sellerPersona: "member" | "merchant" = "member",
): Promise<string | null> {
  if (!hasE2eAdminEnv()) {
    return null;
  }

  const admin = createE2eAdminClient();
  const { data: catalog, error: catalogError } = await admin
    .from("product_catalog")
    .select("id, display_id, name_zh, card_number")
    .not("name_zh", "is", null)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (catalogError) {
    throw new Error(`[seedE2eMarketplaceListingForSeller] ${catalogError.message}`);
  }

  if (!catalog?.id) {
    return null;
  }

  const useAuthentication = sellerPersona === "merchant";
  const { data, error } = await admin
    .from("listings")
    .insert({
      seller_id: sellerId,
      product_id: catalog.id,
      price: 299,
      status: "active",
      seller_persona: sellerPersona,
      grading_company: "RAW",
      seller_description: "E2E marketplace fixture listing (auto-seeded)",
      images: [],
      use_authentication: useAuthentication,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`[seedE2eMarketplaceListingForSeller] ${error.message}`);
  }

  return data.id;
}

export async function getProfileUsername(profileId: string): Promise<string | null> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("username")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getProfileUsername] ${error.message}`);
  }

  return data?.username?.trim() ?? null;
}

export async function getProfilePublicSlug(profileId: string): Promise<string | null> {
  const admin = createE2eAdminClient();
  const { data: merchant, error: merchantError } = await admin
    .from("merchant_shops")
    .select("shop_handle")
    .eq("merchant_id", profileId)
    .maybeSingle();

  if (merchantError && !/permission denied/i.test(merchantError.message)) {
    throw new Error(`[getProfilePublicSlug] ${merchantError.message}`);
  }

  const shopHandle = merchant?.shop_handle?.trim();
  if (shopHandle) {
    return shopHandle;
  }

  return getProfileUsername(profileId);
}

async function findActiveListingIdForSeller(
  admin: ReturnType<typeof createE2eAdminClient>,
  sellerId: string,
  sellerPersona?: "member" | "merchant",
): Promise<string | null> {
  let query = admin
    .from("listings")
    .select("id")
    .eq("seller_id", sellerId)
    .eq("status", "active");

  if (sellerPersona) {
    query = query.eq("seller_persona", sellerPersona);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[findActiveListingIdForSeller] ${error.message}`);
  }

  return data?.id ?? null;
}

async function findRecyclableListingIdForSeller(
  admin: ReturnType<typeof createE2eAdminClient>,
  sellerId: string,
  sellerPersona: "member" | "merchant",
): Promise<string | null> {
  const { data, error } = await admin
    .from("listings")
    .select("id")
    .eq("seller_id", sellerId)
    .eq("seller_persona", sellerPersona)
    .in("status", ["active", "sold", "inactive"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[findRecyclableListingIdForSeller] ${error.message}`);
  }

  return data?.id ?? null;
}

/**
 * Prefer `E2E_LISTING_ID`; if that listing is no longer active, fall back to any
 * active listing owned by `E2E_SELLER_ID` so local E2E env does not go stale.
 */
export async function resolveE2eMarketplaceFixture(
  options: GetListingMarketplaceFixtureOptions = {},
): Promise<ListingMarketplaceFixtureResult> {
  const configuredListingId = readTrimmedEnv("E2E_LISTING_ID");
  if (!configuredListingId) {
    return {
      ok: false,
      skipReason: "Missing E2E_LISTING_ID for marketplace fixture lookup",
    };
  }

  await ensureListingActive(configuredListingId);

  const primary = await getListingMarketplaceFixture(
    configuredListingId,
    options,
  );
  if (primary.ok) {
    return primary;
  }

  const sellerId = options.expectedSellerId?.trim() ?? readTrimmedEnv("E2E_SELLER_ID");
  if (!sellerId || !hasE2eAdminEnv()) {
    return primary;
  }

  const admin = createE2eAdminClient();
  const fallbackListingId = await findActiveListingIdForSeller(
    admin,
    sellerId,
    options.requiredSellerPersona,
  );
  if (!fallbackListingId || fallbackListingId === configuredListingId) {
    if (!options.requiredSellerPersona) {
      const seededListingId = await seedE2eMarketplaceListingForSeller(
        sellerId,
        "member",
      );
      if (seededListingId) {
        await ensureListingActive(seededListingId);
        return getListingMarketplaceFixture(seededListingId, options);
      }
      return primary;
    }

    const recycledListingId = await findRecyclableListingIdForSeller(
      admin,
      sellerId,
      options.requiredSellerPersona,
    );
    if (!recycledListingId || recycledListingId === configuredListingId) {
      const seededListingId = await seedE2eMarketplaceListingForSeller(
        sellerId,
        options.requiredSellerPersona,
      );
      if (seededListingId) {
        await ensureListingActive(seededListingId);
        return getListingMarketplaceFixture(seededListingId, options);
      }
      return primary;
    }

    await ensureListingActive(recycledListingId);
    return getListingMarketplaceFixture(recycledListingId, options);
  }

  return getListingMarketplaceFixture(fallbackListingId, options);
}

function isSupabaseAccessDenied(
  error: { message?: string } | null,
  status?: number,
): boolean {
  if (status === 401 || status === 403) {
    return true;
  }

  if (status === 400 && !error?.message?.trim()) {
    return true;
  }

  return isAdminPermissionDenied(error);
}

export async function getOfferById(offerId: string): Promise<{
  id: string;
  status: string | null;
  offer_price: number | null;
  modified_count: number | null;
  room_id: string | null;
} | null> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("offers")
    .select("id, status, offer_price, modified_count, room_id")
    .eq("id", offerId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getOfferById] ${error.message}`);
  }

  return data;
}

export async function getLatestOfferForListing(params: {
  listingId: string;
  buyerId: string;
  roomId?: string;
}): Promise<{
  id: string;
  status: string | null;
  use_authentication: boolean | null;
  offer_price: number | null;
  modified_count: number | null;
  room_id?: string;
} | null> {
  const admin = createE2eAdminClient();

  let query = admin
    .from("offers")
    .select("id, status, use_authentication, room_id, offer_price, modified_count")
    .eq("listing_id", params.listingId)
    .eq("buyer_id", params.buyerId);

  if (params.roomId) {
    query = query.eq("room_id", params.roomId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[getLatestOfferForListing] ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    status: data.status,
    use_authentication: data.use_authentication,
    offer_price: data.offer_price,
    modified_count: data.modified_count,
    room_id: data.room_id ?? undefined,
  };
}

function isAdminPermissionDenied(error: {
  message?: string;
  status?: number;
} | null): boolean {
  if (!error) {
    return false;
  }

  if (error.status === 401 || error.status === 403) {
    return true;
  }

  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("permission denied") || message.includes("forbidden")
  );
}

export type MemberOrderAuditRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  status: string | null;
  use_authentication: boolean;
  escrow_status: string | null;
  order_number: string | null;
  inbound_tracking_no?: string | null;
  final_price: number;
};

export type P2pOrderGuardResult =
  | { ok: true; order: MemberOrderAuditRow }
  | { ok: false; skipReason: string };

export type AuthOrderGuardResult =
  | { ok: true; order: MemberOrderAuditRow }
  | { ok: false; skipReason: string };

export function guardAuthMemberOrder(
  order: MemberOrderAuditRow,
): AuthOrderGuardResult {
  if (!order.use_authentication) {
    return {
      ok: false,
      skipReason: "Order is not an auth escrow member order",
    };
  }

  return { ok: true, order };
}

export function guardP2pMemberOrder(
  order: MemberOrderAuditRow,
): P2pOrderGuardResult {
  if (order.use_authentication) {
    return {
      ok: false,
      skipReason:
        "Escrow/auth member orders are excluded until Stripe is enabled",
    };
  }

  return { ok: true, order };
}

export async function getMemberOrderIdForOffer(
  offerId: string,
): Promise<string | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("chat_messages")
    .select("member_order_id")
    .eq("offer_id", offerId)
    .not("member_order_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return null;
    }
    throw new Error(`[getMemberOrderIdForOffer] ${error.message}`);
  }

  return data?.member_order_id ?? null;
}

export async function getLatestMemberOrderForListing(params: {
  listingId: string;
  buyerId: string;
}): Promise<MemberOrderAuditRow | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("member_orders")
    .select(
      "id, listing_id, buyer_id, seller_id, status, use_authentication, escrow_status, order_number, final_price, inbound_tracking_no",
    )
    .eq("listing_id", params.listingId)
    .eq("buyer_id", params.buyerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return null;
    }
    throw new Error(`[getLatestMemberOrderForListing] ${error.message}`);
  }

  return data as MemberOrderAuditRow | null;
}

export async function cancelMemberOrderViaRpc(
  orderId: string,
  userId: string,
): Promise<boolean> {
  const admin = createE2eAdminClient();

  const { error } = await (
    admin as unknown as {
      rpc: (
        fn: "rpc_cancel_member_order",
        args: { p_order_id: string; p_user_id: string },
      ) => Promise<{ error: { message: string } | null }>;
    }
  ).rpc("rpc_cancel_member_order", {
    p_order_id: orderId,
    p_user_id: userId,
  });

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return false;
    }
    throw new Error(`[cancelMemberOrderViaRpc] ${error.message}`);
  }

  return true;
}

export async function getMemberOrderById(
  orderId: string,
): Promise<MemberOrderAuditRow | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("member_orders")
    .select(
      "id, listing_id, buyer_id, seller_id, status, use_authentication, escrow_status, order_number, final_price, inbound_tracking_no",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return null;
    }
    throw new Error(`[getMemberOrderById] ${error.message}`);
  }

  return data as MemberOrderAuditRow | null;
}

export async function getReviewForMemberOrder(params: {
  memberOrderId: string;
  reviewerId: string;
}): Promise<{ id: string; rating: number } | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("transaction_reviews")
    .select("id, rating")
    .eq("member_order_id", params.memberOrderId)
    .eq("reviewer_id", params.reviewerId)
    .maybeSingle();

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return null;
    }
    throw new Error(`[getReviewForMemberOrder] ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return { id: data.id, rating: data.rating };
}

export async function getGamificationStatsForProfile(
  profileId: string,
): Promise<{
  points_balance: number;
  current_streak: number | null;
  last_check_in: string | null;
} | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("gamification_stats")
    .select("points_balance, current_streak, last_check_in")
    .eq("user_id", profileId)
    .maybeSingle();

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return null;
    }
    throw new Error(`[getGamificationStatsForProfile] ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    points_balance: data.points_balance,
    current_streak: data.current_streak,
    last_check_in: data.last_check_in,
  };
}

export type GamificationStatsPatch = {
  points_balance?: number;
  current_streak?: number;
  last_check_in?: string | null;
};

export async function upsertGamificationStatsForProfile(
  profileId: string,
  patch: GamificationStatsPatch,
): Promise<void> {
  const admin = createE2eAdminClient();

  const { error } = await admin.from("gamification_stats").upsert(
    {
      user_id: profileId,
      points_balance: patch.points_balance ?? 0,
      current_streak: patch.current_streak ?? 0,
      last_check_in: patch.last_check_in ?? null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return;
    }
    throw new Error(`[upsertGamificationStatsForProfile] ${error.message}`);
  }
}

export async function countProductWatchlistsForUser(
  userId: string,
  productId: string,
): Promise<number> {
  const admin = createE2eAdminClient();

  const { count, error, status } = await admin
    .from("product_watchlists")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("product_id", productId);

  if (error) {
    if (isSupabaseAccessDenied(error, status)) {
      return 0;
    }
    throw new Error(`[countProductWatchlistsForUser] ${error.message}`);
  }

  return count ?? 0;
}

export async function getBuyerProfileIdFromEnv(): Promise<string | null> {
  const email = process.env.E2E_BUYER_EMAIL?.trim();
  if (!email) {
    return null;
  }

  return getProfileIdByEmail(email);
}

export async function deleteProductWatchlistsForUser(
  userId: string,
  productId: string,
): Promise<void> {
  const admin = createE2eAdminClient();

  const { error, status } = await admin
    .from("product_watchlists")
    .delete()
    .eq("user_id", userId)
    .eq("product_id", productId);

  if (error && !isSupabaseAccessDenied(error, status)) {
    throw new Error(`[deleteProductWatchlistsForUser] ${error.message}`);
  }
}

export async function seedProductWatchlistForUser(
  userId: string,
  productId: string,
): Promise<void> {
  const admin = createE2eAdminClient();
  await deleteProductWatchlistsForUser(userId, productId);

  const { error, status } = await admin.from("product_watchlists").insert({
    user_id: userId,
    product_id: productId,
    grading_company: "RAW",
    grading_score: "A",
    alert_enabled: true,
  });

  if (error) {
    throw new Error(`[seedProductWatchlistForUser] ${error.message}`);
  }
}

export async function deleteUserCollectionsForUserProduct(
  userId: string,
  productId: string,
): Promise<void> {
  const admin = createE2eAdminClient();

  const { error, status } = await admin
    .from("user_collections")
    .delete()
    .eq("user_id", userId)
    .eq("product_id", productId);

  if (error) {
    if (isSupabaseAccessDenied(error, status)) {
      return;
    }
    throw new Error(`[deleteUserCollectionsForUserProduct] ${error.message}`);
  }
}

export async function countUserCollectionsForUserProduct(
  userId: string,
  productId: string,
): Promise<number> {
  const admin = createE2eAdminClient();

  const { count, error, status } = await admin
    .from("user_collections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("product_id", productId)
    .is("sold_at", null);

  if (error) {
    if (isSupabaseAccessDenied(error, status)) {
      return 0;
    }
    throw new Error(`[countUserCollectionsForUserProduct] ${error.message}`);
  }

  return count ?? 0;
}

export async function setListingStatusInactive(
  listingId: string,
): Promise<void> {
  const admin = createE2eAdminClient();

  const { error } = await admin
    .from("listings")
    .update({ status: "inactive" })
    .eq("id", listingId);

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return;
    }
    throw new Error(`[setListingStatusInactive] ${error.message}`);
  }
}

export async function getLatestActiveListingForSellerProduct(
  sellerId: string,
  productId: string,
): Promise<string | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("listings")
    .select("id")
    .eq("seller_id", sellerId)
    .eq("product_id", productId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return null;
    }
    throw new Error(`[getLatestActiveListingForSellerProduct] ${error.message}`);
  }

  return data?.id ?? null;
}

export async function countActiveListingsForSellerProduct(
  sellerId: string,
  productId: string,
): Promise<number> {
  const admin = createE2eAdminClient();

  const { count, error } = await admin
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", sellerId)
    .eq("product_id", productId)
    .eq("status", "active");

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return 0;
    }
    throw new Error(`[countActiveListingsForSellerProduct] ${error.message}`);
  }

  return count ?? 0;
}

export async function getLatestUserCollectionId(
  userId: string,
  productId: string,
): Promise<string | null> {
  const admin = createE2eAdminClient();

  const { data, error, status } = await admin
    .from("user_collections")
    .select("id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .is("sold_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isSupabaseAccessDenied(error, status)) {
      return null;
    }
    throw new Error(`[getLatestUserCollectionId] ${error.message}`);
  }

  return data?.id ?? null;
}

export async function getListingSourceCollectionId(
  listingId: string,
): Promise<string | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("listings")
    .select("source_collection_id")
    .eq("id", listingId)
    .maybeSingle();

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return null;
    }
    throw new Error(`[getListingSourceCollectionId] ${error.message}`);
  }

  return data?.source_collection_id ?? null;
}

export async function ensureListingActive(listingId: string): Promise<boolean> {
  const admin = createE2eAdminClient();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { error } = await admin
      .from("listings")
      .update({ status: "active" })
      .eq("id", listingId);

    if (!error) {
      return true;
    }

    if (isAdminPermissionDenied(error)) {
      return false;
    }

    const isStatementTimeout = /statement timeout/i.test(error.message);
    if (isStatementTimeout && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
      continue;
    }

    throw new Error(`[ensureListingActive] ${error.message}`);
  }

  return true;
}

export async function ensureListingP2pMode(listingId: string): Promise<boolean> {
  const admin = createE2eAdminClient();

  const { error } = await admin
    .from("listings")
    .update({ use_authentication: false, status: "active" })
    .eq("id", listingId);

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return false;
    }
    throw new Error(`[ensureListingP2pMode] ${error.message}`);
  }

  return true;
}

export async function ensureListingAcceptsAuthentication(
  listingId: string,
): Promise<boolean> {
  const admin = createE2eAdminClient();

  const { error } = await admin
    .from("listings")
    .update({ use_authentication: true })
    .eq("id", listingId);

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return false;
    }
    throw new Error(`[ensureListingAcceptsAuthentication] ${error.message}`);
  }

  return true;
}

export async function getListingStatus(
  listingId: string,
): Promise<string | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("listings")
    .select("status")
    .eq("id", listingId)
    .maybeSingle();

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return null;
    }
    throw new Error(`[getListingStatus] ${error.message}`);
  }

  return data?.status ?? null;
}

export async function getListingAcceptsAuthentication(
  listingId: string,
): Promise<boolean | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("listings")
    .select("use_authentication")
    .eq("id", listingId)
    .maybeSingle();

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return null;
    }
    throw new Error(`[getListingAcceptsAuthentication] ${error.message}`);
  }

  return data?.use_authentication ?? false;
}

export async function advanceAuthOrderToCustody(
  orderId: string,
): Promise<boolean> {
  const admin = createE2eAdminClient();

  const { error } = await admin
    .from("member_orders")
    .update({
      escrow_status: "custody",
      payment_confirmed_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return false;
    }
    throw new Error(`[advanceAuthOrderToCustody] ${error.message}`);
  }

  return true;
}

export async function deactivateActiveListingsForSellerProduct(
  sellerId: string,
  productId: string,
): Promise<void> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("listings")
    .select("id")
    .eq("seller_id", sellerId)
    .eq("product_id", productId)
    .eq("status", "active");

  if (error) {
    if (isAdminPermissionDenied(error)) {
      return;
    }
    throw new Error(
      `[deactivateActiveListingsForSellerProduct] ${error.message}`,
    );
  }

  for (const row of data ?? []) {
    if (row.id) {
      await setListingStatusInactive(row.id);
    }
  }
}

export async function clearListingsForSellerProduct(
  sellerId: string,
  productId: string,
): Promise<void> {
  const admin = createE2eAdminClient();

  const { error, status } = await admin
    .from("listings")
    .delete()
    .eq("seller_id", sellerId)
    .eq("product_id", productId);

  if (error) {
    if (isSupabaseAccessDenied(error, status)) {
      await deactivateActiveListingsForSellerProduct(sellerId, productId);
      return;
    }
    throw new Error(`[clearListingsForSellerProduct] ${error.message}`);
  }
}

export async function markUserCollectionAsSold(params: {
  userId: string;
  collectionId: string;
  listingId?: string | null;
  soldPrice?: number;
}): Promise<boolean> {
  const admin = createE2eAdminClient();

  const { error, status } = await admin
    .from("user_collections")
    .update({
      sold_at: new Date().toISOString(),
      sold_listing_id: params.listingId ?? null,
      sold_price: params.soldPrice ?? null,
    })
    .eq("id", params.collectionId)
    .eq("user_id", params.userId);

  if (error) {
    if (isSupabaseAccessDenied(error, status)) {
      return false;
    }
    throw new Error(`[markUserCollectionAsSold] ${error.message}`);
  }

  return true;
}

export type E2eListingTradingResetResult = {
  ok: boolean;
  method: "rpc" | "fallback" | "skipped";
  cancelledOrders: number;
  cancelledOffers: number;
  error?: string;
};

function isMissingRpcError(message: string | undefined): boolean {
  const normalized = message?.toLowerCase() ?? "";
  return (
    normalized.includes("could not find the function") ||
    normalized.includes("function public.rpc_e2e_reset_listing_trading_fixture") ||
    normalized.includes("schema cache")
  );
}

export async function resetE2eListingTradingFixture(params: {
  listingId: string;
  buyerId: string;
  sellerId: string;
}): Promise<E2eListingTradingResetResult> {
  if (!hasE2eAdminEnv()) {
    return {
      ok: false,
      method: "skipped",
      cancelledOrders: 0,
      cancelledOffers: 0,
      error: "Missing SUPABASE_SERVICE_ROLE_KEY",
    };
  }

  const admin = createE2eAdminClient();

  const { data, error } = await (
    admin as unknown as {
      rpc: (
        fn: "rpc_e2e_reset_listing_trading_fixture",
        args: {
          p_listing_id: string;
          p_buyer_id: string;
          p_seller_id: string;
        },
      ) => Promise<{
        data: {
          cancelled_orders?: number;
          cancelled_offers?: number;
        } | null;
        error: { message: string } | null;
      }>;
    }
  ).rpc("rpc_e2e_reset_listing_trading_fixture", {
    p_listing_id: params.listingId,
    p_buyer_id: params.buyerId,
    p_seller_id: params.sellerId,
  });

  if (!error && data) {
    return {
      ok: true,
      method: "rpc",
      cancelledOrders: Number(data.cancelled_orders ?? 0),
      cancelledOffers: Number(data.cancelled_offers ?? 0),
    };
  }

  if (error && !isMissingRpcError(error.message)) {
    return {
      ok: false,
      method: "rpc",
      cancelledOrders: 0,
      cancelledOffers: 0,
      error: error.message,
    };
  }

  let cancelledOffers = 0;
  let cancelledOrders = 0;

  const { data: pendingOffers, error: pendingOffersError } = await admin
    .from("offers")
    .select("id")
    .eq("listing_id", params.listingId)
    .eq("buyer_id", params.buyerId)
    .eq("status", "pending");

  if (pendingOffersError) {
    return {
      ok: false,
      method: "fallback",
      cancelledOrders: 0,
      cancelledOffers: 0,
      error: pendingOffersError.message,
    };
  }

  for (const offer of pendingOffers ?? []) {
    if (!offer.id) {
      continue;
    }

    const { error: rejectError } = await (
      admin as unknown as {
        rpc: (
          fn: "rpc_reject_offer",
          args: { p_offer_id: string; p_seller_id: string },
        ) => Promise<{ error: { message: string } | null }>;
      }
    ).rpc("rpc_reject_offer", {
      p_offer_id: offer.id,
      p_seller_id: params.sellerId,
    });

    if (!rejectError) {
      cancelledOffers += 1;
    }
  }

  const roomId = await ensureDbChatRoom(params.buyerId, params.sellerId);
  const { data: orderMessages, error: orderMessagesError } = await admin
    .from("chat_messages")
    .select("member_order_id")
    .eq("room_id", roomId)
    .not("member_order_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (orderMessagesError) {
    return {
      ok: false,
      method: "fallback",
      cancelledOrders,
      cancelledOffers,
      error: orderMessagesError.message,
    };
  }

  const seenOrderIds = new Set<string>();
  for (const message of orderMessages ?? []) {
    const orderId = message.member_order_id;
    if (!orderId || seenOrderIds.has(orderId)) {
      continue;
    }
    seenOrderIds.add(orderId);

    const { error: cancelError } = await (
      admin as unknown as {
        rpc: (
          fn: "rpc_cancel_member_order",
          args: { p_order_id: string; p_user_id: string },
        ) => Promise<{ error: { message: string } | null }>;
      }
    ).rpc("rpc_cancel_member_order", {
      p_order_id: orderId,
      p_user_id: params.sellerId,
    });

    if (!cancelError) {
      cancelledOrders += 1;
    }
  }

  await ensureListingActive(params.listingId);

  return {
    ok: true,
    method: "fallback",
    cancelledOrders,
    cancelledOffers,
  };
}

export type ReportAuditRow = {
  id: string;
  reporter_id: string;
  target_id: string;
  target_type: string;
  reason: string;
  status: string | null;
  category: string | null;
  case_id: string | null;
  contribution_score: number | null;
};

export async function deletePendingReportAttachments(
  reporterId: string,
): Promise<void> {
  const admin = createE2eAdminClient();

  const { error, status } = await admin
    .from("report_attachments")
    .delete()
    .eq("reporter_id", reporterId);

  if (error) {
    if (isSupabaseAccessDenied(error, status)) {
      return;
    }
    throw new Error(`[deletePendingReportAttachments] ${error.message}`);
  }
}

export async function deleteModerationCasesForSubject(
  subjectId: string,
): Promise<void> {
  const admin = createE2eAdminClient();

  const { error, status } = await admin
    .from("moderation_cases")
    .delete()
    .eq("subject_user_id", subjectId);

  if (error) {
    if (isSupabaseAccessDenied(error, status)) {
      return;
    }
    throw new Error(`[deleteModerationCasesForSubject] ${error.message}`);
  }
}

export async function deletePendingReports(params: {
  reporterId: string;
  targetId: string;
}): Promise<void> {
  const admin = createE2eAdminClient();

  await deletePendingReportAttachments(params.reporterId);

  const { error, status } = await admin
    .from("reports")
    .delete()
    .eq("reporter_id", params.reporterId)
    .eq("target_id", params.targetId)
    .eq("status", "pending");

  if (error) {
    if (isSupabaseAccessDenied(error, status)) {
      return;
    }
    throw new Error(`[deletePendingReports] ${error.message}`);
  }

  await deleteModerationCasesForSubject(params.targetId);
}

export async function acknowledgeAllReportOutcomesForReporter(
  reporterId: string,
): Promise<number> {
  const admin = createE2eAdminClient();
  const acknowledgedAt = new Date().toISOString();
  const { data, error, status } = await admin
    .from("reports")
    .update({ outcome_acknowledged_at: acknowledgedAt })
    .eq("reporter_id", reporterId)
    .is("outcome_acknowledged_at", null)
    .select("id");

  if (error) {
    if (isSupabaseAccessDenied(error, status)) {
      return 0;
    }
    throw new Error(
      `[acknowledgeAllReportOutcomesForReporter] ${error.message}`,
    );
  }

  return data?.length ?? 0;
}

export async function countPendingReports(params: {
  reporterId: string;
  targetId: string;
}): Promise<number> {
  const admin = createE2eAdminClient();

  const { count, error } = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("reporter_id", params.reporterId)
    .eq("target_id", params.targetId)
    .eq("status", "pending");

  if (error) {
    throw new Error(`[countPendingReports] ${error.message}`);
  }

  return count ?? 0;
}

export async function getLatestReport(params: {
  reporterId: string;
  targetId: string;
}): Promise<ReportAuditRow | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("reports")
    .select(
      "id, reporter_id, target_id, target_type, reason, status, category, case_id, contribution_score",
    )
    .eq("reporter_id", params.reporterId)
    .eq("target_id", params.targetId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[getLatestReport] ${error.message}`);
  }

  return (data as ReportAuditRow | null) ?? null;
}

export type ReportAttachmentAuditRow = {
  id: string;
  report_id: string | null;
  reporter_id: string;
  storage_path: string;
};

export async function getReportAttachmentsForReport(
  reportId: string,
): Promise<ReportAttachmentAuditRow[]> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("report_attachments")
    .select("id, report_id, reporter_id, storage_path")
    .eq("report_id", reportId);

  if (error) {
    throw new Error(`[getReportAttachmentsForReport] ${error.message}`);
  }

  return (data as ReportAttachmentAuditRow[] | null) ?? [];
}

export type ModerationCaseAuditRow = {
  id: string;
  case_number: string;
  subject_user_id: string;
  status: string;
  final_score: number | null;
  primary_category?: string | null;
};

export async function getLatestModerationCaseForSubject(
  subjectId: string,
): Promise<ModerationCaseAuditRow | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("moderation_cases")
    .select("id, case_number, subject_user_id, status, final_score")
    .eq("subject_user_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[getLatestModerationCaseForSubject] ${error.message}`);
  }

  return (data as ModerationCaseAuditRow | null) ?? null;
}

export type ModerationCaseWithChatRoom = ModerationCaseAuditRow & {
  chatRoomId: string;
};

export async function getLatestModerationCaseWithChatRoom(
  subjectId: string,
): Promise<ModerationCaseWithChatRoom | null> {
  const admin = createE2eAdminClient();

  const { data: cases, error: casesError } = await admin
    .from("moderation_cases")
    .select("id, case_number, subject_user_id, status, final_score, created_at, primary_category")
    .eq("subject_user_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (casesError) {
    throw new Error(`[getLatestModerationCaseWithChatRoom] ${casesError.message}`);
  }

  for (const moderationCase of cases ?? []) {
    const { data: report, error: reportError } = await admin
      .from("reports")
      .select("context_type, context_id")
      .eq("case_id", moderationCase.id)
      .eq("context_type", "chat_room")
      .not("context_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (reportError) {
      throw new Error(`[getLatestModerationCaseWithChatRoom] ${reportError.message}`);
    }

    if (report?.context_id) {
      return {
        ...(moderationCase as ModerationCaseAuditRow),
        chatRoomId: report.context_id,
      };
    }
  }

  return null;
}

export async function resolveModerationCaseChatRoomId(
  caseId: string,
): Promise<string | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("reports")
    .select("context_id")
    .eq("case_id", caseId)
    .eq("context_type", "chat_room")
    .not("context_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[resolveModerationCaseChatRoomId] ${error.message}`);
  }

  return data?.context_id ?? null;
}

export async function getLatestOpenModerationCaseForSubject(
  subjectId: string,
): Promise<ModerationCaseAuditRow | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("moderation_cases")
    .select("id, case_number, subject_user_id, status, final_score")
    .eq("subject_user_id", subjectId)
    .in("status", ["open", "reviewing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[getLatestOpenModerationCaseForSubject] ${error.message}`);
  }

  return (data as ModerationCaseAuditRow | null) ?? null;
}

export async function getModerationCaseStatus(
  caseId: string,
): Promise<{ status: string; resolution: string | null } | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("moderation_cases")
    .select("status, resolution")
    .eq("id", caseId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getModerationCaseStatus] ${error.message}`);
  }

  return (data as { status: string; resolution: string | null } | null) ?? null;
}

export async function countModerationAuditLogsForCase(
  caseId: string,
  action?: string,
): Promise<number> {
  const admin = createE2eAdminClient();

  let query = admin
    .from("moderation_audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId);

  if (action) {
    query = query.eq("action", action);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`[countModerationAuditLogsForCase] ${error.message}`);
  }

  return count ?? 0;
}

export async function insertChatMessageForE2e(params: {
  roomId: string;
  senderId: string;
  content: string;
  createdAt?: string;
}): Promise<void> {
  const admin = createE2eAdminClient();

  const { error } = await admin.from("chat_messages").insert({
    room_id: params.roomId,
    sender_id: params.senderId,
    content: params.content,
    is_system_warning: false,
    ...(params.createdAt ? { created_at: params.createdAt } : {}),
  });

  if (error) {
    throw new Error(`[insertChatMessageForE2e] ${error.message}`);
  }
}

export type ModerationCaseDetailAuditRow = ModerationCaseAuditRow & {
  primary_category: string | null;
};

export async function getLatestModerationCaseDetailForSubject(
  subjectId: string,
): Promise<ModerationCaseDetailAuditRow | null> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("moderation_cases")
    .select("id, case_number, subject_user_id, status, final_score, primary_category")
    .eq("subject_user_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[getLatestModerationCaseDetailForSubject] ${error.message}`);
  }

  return (data as ModerationCaseDetailAuditRow | null) ?? null;
}

export async function insertAccountSanctionForE2e(params: {
  userId: string;
  type: "suspend" | "ban";
  endsAt?: string | null;
  caseId?: string | null;
}): Promise<string> {
  const admin = createE2eAdminClient();

  const { data, error } = await admin
    .from("account_sanctions")
    .insert({
      user_id: params.userId,
      scope: "account",
      type: params.type,
      ends_at: params.endsAt ?? null,
      source: "admin",
      reason: "E2E test sanction",
      case_id: params.caseId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`[insertAccountSanctionForE2e] ${error.message}`);
  }

  return data.id as string;
}

export async function deleteAccountSanctionsForUser(userId: string): Promise<void> {
  const admin = createE2eAdminClient();

  const { error, status } = await admin
    .from("account_sanctions")
    .delete()
    .eq("user_id", userId);

  if (error) {
    if (isSupabaseAccessDenied(error, status)) {
      return;
    }
    throw new Error(`[deleteAccountSanctionsForUser] ${error.message}`);
  }
}

export async function countResolvedModerationCasesForSubject(
  subjectId: string,
): Promise<number> {
  const admin = createE2eAdminClient();
  const { count, error } = await admin
    .from("moderation_cases")
    .select("id", { count: "exact", head: true })
    .eq("subject_user_id", subjectId)
    .in("status", ["resolved", "dismissed"]);

  if (error) {
    throw new Error(
      `[countResolvedModerationCasesForSubject] ${error.message}`,
    );
  }

  return count ?? 0;
}

export async function resolveModerationCaseForE2e(params: {
  caseId: string;
  resolution?: "dismissed" | "insufficient_evidence" | "upheld";
  notifyReporter?: boolean;
}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.E2E_ADMIN_EMAIL?.trim();
  const password = process.env.E2E_ADMIN_PASSWORD?.trim();

  if (!url || !anonKey || !email || !password) {
    throw new Error(
      "Missing Supabase public env or E2E admin credentials for moderation resolve",
    );
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    throw new Error(
      `[resolveModerationCaseForE2e] sign-in failed: ${signInError.message}`,
    );
  }

  const { error } = await client.rpc("rpc_resolve_moderation_case", {
    p_case_id: params.caseId,
    p_payload: {
      resolution: params.resolution ?? "dismissed",
      notifyReporter: params.notifyReporter ?? true,
    },
  });
  if (error) {
    throw new Error(`[resolveModerationCaseForE2e] ${error.message}`);
  }
}

export async function getAdminProfileIdFromEnv(): Promise<string | null> {
  const email = process.env.E2E_ADMIN_EMAIL?.trim();
  if (!email) {
    return null;
  }

  return getProfileIdByEmail(email);
}

export async function expireAccountSanctionForE2e(userId: string): Promise<void> {
  const admin = createE2eAdminClient();
  const { error, status } = await admin
    .from("account_sanctions")
    .update({ ends_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("user_id", userId)
    .eq("type", "suspend");

  if (error) {
    if (isSupabaseAccessDenied(error, status)) {
      return;
    }
    throw new Error(`[expireAccountSanctionForE2e] ${error.message}`);
  }
}

export async function unbanUserForE2e(userId: string): Promise<void> {
  const admin = createE2eAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });

  if (error) {
    throw new Error(`[unbanUserForE2e] ${error.message}`);
  }
}

export async function insertOpenFraudCaseForE2e(params: {
  subjectId: string;
  reporterId: string;
  suffix: string;
}): Promise<string> {
  const admin = createE2eAdminClient();
  const caseNumber = `E2E-BAN-${params.suffix}-${Date.now()}`;

  const { data: moderationCase, error: caseError } = await admin
    .from("moderation_cases")
    .insert({
      case_number: caseNumber,
      subject_user_id: params.subjectId,
      status: "open",
      primary_category: "fraud",
      auto_score: 40,
      admin_adjustment: 0,
    })
    .select("id")
    .single();

  if (caseError) {
    throw new Error(`[insertOpenFraudCaseForE2e:case] ${caseError.message}`);
  }

  const { error: reportError } = await admin.from("reports").insert({
    reporter_id: params.reporterId,
    target_id: params.subjectId,
    target_type: "user",
    reason: "E2E AB-7 ban fixture",
    status: "pending",
    category: "fraud",
    case_id: moderationCase.id,
    source: "profile",
    contribution_score: 40,
  });

  if (reportError) {
    await admin.from("moderation_cases").delete().eq("id", moderationCase.id);
    throw new Error(`[insertOpenFraudCaseForE2e:report] ${reportError.message}`);
  }

  return moderationCase.id;
}

export async function hasActiveBanSanctionForUser(userId: string): Promise<boolean> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("account_sanctions")
    .select("id, type, revoked_at, ends_at")
    .eq("user_id", userId)
    .eq("type", "ban");

  if (error) {
    throw new Error(`[hasActiveBanSanctionForUser] ${error.message}`);
  }

  return (data ?? []).some(
    (row) =>
      row.revoked_at == null &&
      (row.ends_at == null || new Date(row.ends_at).getTime() > Date.now()),
  );
}

export async function isSellerPasswordSignInBlocked(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.E2E_SELLER_EMAIL?.trim();
  const password = process.env.E2E_SELLER_PASSWORD?.trim();

  if (!url || !anonKey || !email || !password) {
    throw new Error("Missing seller auth env for ban assertion");
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  return Boolean(error);
}

export async function getLatestMemberOrderForPair(params: {
  buyerId: string;
  sellerId: string;
}): Promise<{ id: string; orderNumber: string | null } | null> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("member_orders")
    .select("id, order_number")
    .eq("buyer_id", params.buyerId)
    .eq("seller_id", params.sellerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[getLatestMemberOrderForPair] ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    orderNumber: data.order_number ?? null,
  };
}
