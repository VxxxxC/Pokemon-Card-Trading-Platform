import { getSiteUrl } from "@/lib/auth/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/supabase";
import {
  buildBuyerOrderDetailUrl,
  buildMerchantFinanceUrl,
  buildMerchantOrderDetailUrl,
  buildSellerOrderDetailUrl,
} from "@/lib/notifications/email-urls";
import { enqueueTransactionalEmail } from "@/lib/notifications/enqueue-email";
import { sendOrderBuyerConfirmedSellerPush } from "@/lib/notifications/order-push";
import { resolveAuthUserEmails } from "@/lib/notifications/resolve-auth-user-email";
import { resolveEmailLogoUrl } from "@/lib/email/layout";

type ListingEmailContext = {
  cardName: string;
  sellerPersona: "merchant" | "member";
};

type MemberGradingOrderRow = Pick<
  Tables<"member_orders">,
  | "id"
  | "buyer_id"
  | "seller_id"
  | "listing_id"
  | "order_number"
  | "use_authentication"
  | "inbound_tracking_no"
  | "outbound_tracking_no"
  | "buyer_total_amount"
  | "total_amount"
  | "final_price"
>;

type MerchantGradingOrderRow = Pick<
  Tables<"merchant_orders">,
  | "id"
  | "buyer_id"
  | "merchant_id"
  | "listing_id"
  | "order_number"
  | "requires_authentication"
  | "inbound_tracking_no"
  | "outbound_tracking_no"
  | "buyer_total_amount"
  | "total_amount"
  | "final_price"
>;

function formatHkd(amount: number): string {
  return `HK$${amount.toLocaleString("en-HK", { maximumFractionDigits: 0 })}`;
}

function resolveOrderAmountLabel(
  order: {
    buyer_total_amount: number | null;
    total_amount: number | null;
    final_price: number;
  },
): string {
  const amount =
    order.buyer_total_amount ?? order.total_amount ?? order.final_price;
  return formatHkd(Number(amount));
}

async function fetchListingEmailContext(
  listingId: string,
): Promise<ListingEmailContext | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("listings")
    .select(
      `
        seller_persona,
        product_catalog (
          name_zh,
          name_ja
        )
      `,
    )
    .eq("id", listingId)
    .maybeSingle<{
      seller_persona: Tables<"listings">["seller_persona"] | null;
      product_catalog: {
        name_zh: string | null;
        name_ja: string;
      } | null;
    }>();

  if (error || !data) {
    console.warn("[grading-emails] listing lookup", listingId, error?.message);
    return null;
  }

  const catalog = data.product_catalog;
  const cardName =
    catalog?.name_zh?.trim() || catalog?.name_ja?.trim() || "商品";

  return {
    cardName,
    sellerPersona: data.seller_persona === "merchant" ? "merchant" : "member",
  };
}

async function enqueueGradingEmailSafely(
  input: Parameters<typeof enqueueTransactionalEmail>[0],
): Promise<void> {
  try {
    await enqueueTransactionalEmail(input);
  } catch (error) {
    console.warn("[grading-emails] enqueue failed", input.eventId, error);
  }
}

export async function enqueueC2cShipToPlatformEmail(orderId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("member_orders")
    .select(
      "id, seller_id, listing_id, order_number, use_authentication",
    )
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MemberGradingOrderRow,
        "id" | "seller_id" | "listing_id" | "order_number" | "use_authentication"
      >
    >();

  if (error || !order || !order.use_authentication) {
    return;
  }

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const sellerEmail = await resolveAuthUserEmails([order.seller_id]).then(
    (map) => map.get(order.seller_id),
  );
  if (!sellerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildSellerOrderDetailUrl(
    siteUrl,
    order.id,
    listing.sellerPersona,
  );

  await enqueueGradingEmailSafely({
    eventId: "E-GRD-C2C-01",
    templateKey: "grading.c2c.ship_to_platform",
    toEmail: sellerEmail,
    idempotencyKey: `E-GRD-C2C-01:${order.id}:seller`,
    payload: {
      cardName: listing.cardName,
      orderNumber: order.order_number,
      actionUrl,
      logoUrl,
    },
  });
}


export async function enqueueB2cMerchantShipInEmail(orderId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, merchant_id, listing_id, order_number, requires_authentication")
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MerchantGradingOrderRow,
        "id" | "merchant_id" | "listing_id" | "order_number" | "requires_authentication"
      >
    >();

  if (error || !order || !order.requires_authentication) {
    return;
  }

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const merchantEmail = await resolveAuthUserEmails([order.merchant_id]).then(
    (map) => map.get(order.merchant_id),
  );
  if (!merchantEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildMerchantOrderDetailUrl(siteUrl, order.id);

  await enqueueGradingEmailSafely({
    eventId: "E-GRD-B2C-02",
    templateKey: "grading.b2c.merchant_ship_in",
    toEmail: merchantEmail,
    idempotencyKey: `E-GRD-B2C-02:${order.id}:merchant`,
    payload: {
      cardName: listing.cardName,
      orderNumber: order.order_number,
      actionUrl,
      logoUrl,
    },
  });
}


async function enqueuePassedShippedPair(args: {
  orderKind: "member" | "merchant";
  orderId: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  orderNumber: string | null;
  trackingNo?: string | null;
}): Promise<void> {
  const listing = await fetchListingEmailContext(args.listingId);
  if (!listing) return;

  const emails = await resolveAuthUserEmails([args.buyerId, args.sellerId]);
  const buyerEmail = emails.get(args.buyerId);
  const sellerEmail = emails.get(args.sellerId);
  if (!buyerEmail && !sellerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const isMerchant = args.orderKind === "merchant";
  const eventId = isMerchant ? "E-GRD-B2C-05" : "E-GRD-C2C-05";
  const templateKey = isMerchant
    ? "grading.b2c.passed_shipped"
    : "grading.c2c.passed_shipped";
  const buyerActionUrl = buildBuyerOrderDetailUrl(siteUrl, args.orderId);
  const sellerActionUrl = isMerchant
    ? buildMerchantOrderDetailUrl(siteUrl, args.orderId)
    : buildSellerOrderDetailUrl(siteUrl, args.orderId, listing.sellerPersona);
  const trackingNo = args.trackingNo?.trim() || undefined;

  const sharedPayload = {
    cardName: listing.cardName,
    orderNumber: args.orderNumber,
    trackingNo,
    logoUrl,
  };

  if (buyerEmail) {
    await enqueueGradingEmailSafely({
      eventId,
      templateKey,
      toEmail: buyerEmail,
      idempotencyKey: `${eventId}:${args.orderId}:buyer`,
      payload: {
        ...sharedPayload,
        recipientRole: "buyer",
        actionUrl: buyerActionUrl,
      },
    });
  }

  if (sellerEmail) {
    await enqueueGradingEmailSafely({
      eventId,
      templateKey,
      toEmail: sellerEmail,
      idempotencyKey: `${eventId}:${args.orderId}:seller`,
      payload: {
        ...sharedPayload,
        recipientRole: "seller",
        actionUrl: sellerActionUrl,
      },
    });
  }
}

export async function enqueueMemberGradingPassedShippedEmails(
  orderId: string,
  options?: { trackingNo?: string | null },
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("member_orders")
    .select(
      "id, buyer_id, seller_id, listing_id, order_number, outbound_tracking_no",
    )
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MemberGradingOrderRow,
        | "id"
        | "buyer_id"
        | "seller_id"
        | "listing_id"
        | "order_number"
        | "outbound_tracking_no"
      >
    >();

  if (error || !order) {
    console.warn(
      "[grading-emails] member order lookup (passed)",
      orderId,
      error?.message,
    );
    return;
  }

  await enqueuePassedShippedPair({
    orderKind: "member",
    orderId: order.id,
    buyerId: order.buyer_id,
    sellerId: order.seller_id,
    listingId: order.listing_id,
    orderNumber: order.order_number,
    trackingNo: options?.trackingNo ?? order.outbound_tracking_no,
  });
}

export async function enqueueMerchantGradingPassedShippedEmails(
  orderId: string,
  options?: { trackingNo?: string | null },
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select(
      "id, buyer_id, merchant_id, listing_id, order_number, outbound_tracking_no",
    )
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MerchantGradingOrderRow,
        | "id"
        | "buyer_id"
        | "merchant_id"
        | "listing_id"
        | "order_number"
        | "outbound_tracking_no"
      >
    >();

  if (error || !order) {
    console.warn(
      "[grading-emails] merchant order lookup (passed)",
      orderId,
      error?.message,
    );
    return;
  }

  await enqueuePassedShippedPair({
    orderKind: "merchant",
    orderId: order.id,
    buyerId: order.buyer_id,
    sellerId: order.merchant_id,
    listingId: order.listing_id,
    orderNumber: order.order_number,
    trackingNo: options?.trackingNo ?? order.outbound_tracking_no,
  });
}

async function enqueueGradingFailedPair(args: {
  orderKind: "member" | "merchant";
  orderId: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  orderNumber: string | null;
}): Promise<void> {
  const listing = await fetchListingEmailContext(args.listingId);
  if (!listing) return;

  const emails = await resolveAuthUserEmails([args.buyerId, args.sellerId]);
  const buyerEmail = emails.get(args.buyerId);
  const sellerEmail = emails.get(args.sellerId);
  if (!buyerEmail && !sellerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const isMerchant = args.orderKind === "merchant";
  const eventId = isMerchant ? "E-GRD-B2C-06" : "E-GRD-C2C-06";
  const templateKey = isMerchant ? "grading.b2c.failed" : "grading.c2c.failed";
  const buyerActionUrl = buildBuyerOrderDetailUrl(siteUrl, args.orderId);
  const sellerActionUrl = isMerchant
    ? buildMerchantOrderDetailUrl(siteUrl, args.orderId)
    : buildSellerOrderDetailUrl(siteUrl, args.orderId, listing.sellerPersona);

  const sharedPayload = {
    cardName: listing.cardName,
    orderNumber: args.orderNumber,
    logoUrl,
  };

  if (buyerEmail) {
    await enqueueGradingEmailSafely({
      eventId,
      templateKey,
      toEmail: buyerEmail,
      idempotencyKey: `${eventId}:${args.orderId}:buyer`,
      payload: {
        ...sharedPayload,
        recipientRole: "buyer",
        actionUrl: buyerActionUrl,
      },
    });
  }

  if (sellerEmail) {
    await enqueueGradingEmailSafely({
      eventId,
      templateKey,
      toEmail: sellerEmail,
      idempotencyKey: `${eventId}:${args.orderId}:seller`,
      payload: {
        ...sharedPayload,
        recipientRole: "seller",
        actionUrl: sellerActionUrl,
      },
    });
  }
}

export async function enqueueMemberGradingFailedEmails(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("member_orders")
    .select("id, buyer_id, seller_id, listing_id, order_number")
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MemberGradingOrderRow,
        "id" | "buyer_id" | "seller_id" | "listing_id" | "order_number"
      >
    >();

  if (error || !order) {
    console.warn(
      "[grading-emails] member order lookup (failed)",
      orderId,
      error?.message,
    );
    return;
  }

  await enqueueGradingFailedPair({
    orderKind: "member",
    orderId: order.id,
    buyerId: order.buyer_id,
    sellerId: order.seller_id,
    listingId: order.listing_id,
    orderNumber: order.order_number,
  });
}

export async function enqueueMerchantGradingFailedEmails(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, buyer_id, merchant_id, listing_id, order_number")
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MerchantGradingOrderRow,
        "id" | "buyer_id" | "merchant_id" | "listing_id" | "order_number"
      >
    >();

  if (error || !order) {
    console.warn(
      "[grading-emails] merchant order lookup (failed)",
      orderId,
      error?.message,
    );
    return;
  }

  await enqueueGradingFailedPair({
    orderKind: "merchant",
    orderId: order.id,
    buyerId: order.buyer_id,
    sellerId: order.merchant_id,
    listingId: order.listing_id,
    orderNumber: order.order_number,
  });
}

export async function enqueueC2cGradingRefundEmail(orderId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("member_orders")
    .select(
      "id, buyer_id, listing_id, order_number, buyer_total_amount, total_amount, final_price",
    )
    .eq("id", orderId)
    .maybeSingle<MemberGradingOrderRow>();

  if (error || !order) {
    console.warn(
      "[grading-emails] member order lookup (refund)",
      orderId,
      error?.message,
    );
    return;
  }

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const buyerEmail = await resolveAuthUserEmails([order.buyer_id]).then(
    (map) => map.get(order.buyer_id),
  );
  if (!buyerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildBuyerOrderDetailUrl(siteUrl, order.id);

  await enqueueGradingEmailSafely({
    eventId: "E-GRD-C2C-07",
    templateKey: "grading.c2c.refund",
    toEmail: buyerEmail,
    idempotencyKey: `E-GRD-C2C-07:${order.id}:buyer`,
    payload: {
      cardName: listing.cardName,
      orderNumber: order.order_number,
      amountLabel: resolveOrderAmountLabel(order),
      actionUrl,
      logoUrl,
    },
  });
}


export async function enqueueC2cInboundShippedBuyerEmail(
  orderId: string,
  options?: { trackingNo?: string | null; courierName?: string | null },
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("member_orders")
    .select("id, buyer_id, listing_id, order_number, inbound_tracking_no")
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MemberGradingOrderRow,
        "id" | "buyer_id" | "listing_id" | "order_number" | "inbound_tracking_no"
      >
    >();

  if (error || !order) return;

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const buyerEmail = await resolveAuthUserEmails([order.buyer_id]).then(
    (map) => map.get(order.buyer_id),
  );
  if (!buyerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const trackingNo =
    options?.trackingNo?.trim() || order.inbound_tracking_no?.trim() || "";

  await enqueueGradingEmailSafely({
    eventId: "E-GRD-C2C-02",
    templateKey: "grading.c2c.inbound_shipped",
    toEmail: buyerEmail,
    idempotencyKey: `E-GRD-C2C-02:${order.id}:buyer`,
    payload: {
      cardName: listing.cardName,
      orderNumber: order.order_number,
      trackingNo: trackingNo || undefined,
      courierName: options?.courierName?.trim() || undefined,
      actionUrl: buildBuyerOrderDetailUrl(siteUrl, order.id),
      logoUrl,
    },
  });
}

async function enqueueGradingIntakePair(args: {
  orderKind: "member" | "merchant";
  orderId: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  orderNumber: string | null;
}): Promise<void> {
  const listing = await fetchListingEmailContext(args.listingId);
  if (!listing) return;

  const emails = await resolveAuthUserEmails([args.buyerId, args.sellerId]);
  const buyerEmail = emails.get(args.buyerId);
  const sellerEmail = emails.get(args.sellerId);
  if (!buyerEmail && !sellerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const isMerchant = args.orderKind === "merchant";
  const eventId = isMerchant ? "E-GRD-B2C-04" : "E-GRD-C2C-03";
  const templateKey = isMerchant
    ? "grading.b2c.authenticating"
    : "grading.c2c.intake";
  const buyerActionUrl = buildBuyerOrderDetailUrl(siteUrl, args.orderId);
  const sellerActionUrl = isMerchant
    ? buildMerchantOrderDetailUrl(siteUrl, args.orderId)
    : buildSellerOrderDetailUrl(siteUrl, args.orderId, listing.sellerPersona);

  const shared = {
    cardName: listing.cardName,
    orderNumber: args.orderNumber,
    logoUrl,
  };

  if (buyerEmail) {
    await enqueueGradingEmailSafely({
      eventId,
      templateKey,
      toEmail: buyerEmail,
      idempotencyKey: `${eventId}:${args.orderId}:buyer`,
      payload: {
        ...shared,
        recipientRole: "buyer",
        actionUrl: buyerActionUrl,
      },
    });
  }

  if (sellerEmail) {
    await enqueueGradingEmailSafely({
      eventId,
      templateKey,
      toEmail: sellerEmail,
      idempotencyKey: `${eventId}:${args.orderId}:seller`,
      payload: {
        ...shared,
        recipientRole: "seller",
        actionUrl: sellerActionUrl,
      },
    });
  }
}

export async function enqueueMemberGradingIntakeEmails(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("member_orders")
    .select("id, buyer_id, seller_id, listing_id, order_number")
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MemberGradingOrderRow,
        "id" | "buyer_id" | "seller_id" | "listing_id" | "order_number"
      >
    >();

  if (!order) return;

  await enqueueGradingIntakePair({
    orderKind: "member",
    orderId: order.id,
    buyerId: order.buyer_id,
    sellerId: order.seller_id,
    listingId: order.listing_id,
    orderNumber: order.order_number,
  });
}

export async function enqueueMerchantGradingIntakeEmails(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("merchant_orders")
    .select("id, buyer_id, merchant_id, listing_id, order_number")
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MerchantGradingOrderRow,
        "id" | "buyer_id" | "merchant_id" | "listing_id" | "order_number"
      >
    >();

  if (!order) return;

  await enqueueGradingIntakePair({
    orderKind: "merchant",
    orderId: order.id,
    buyerId: order.buyer_id,
    sellerId: order.merchant_id,
    listingId: order.listing_id,
    orderNumber: order.order_number,
  });
}

export async function enqueueB2cInboundShippedBuyerEmail(
  orderId: string,
  options?: { trackingNo?: string | null; courierName?: string | null },
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, buyer_id, listing_id, order_number, inbound_tracking_no")
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MerchantGradingOrderRow,
        "id" | "buyer_id" | "listing_id" | "order_number" | "inbound_tracking_no"
      >
    >();

  if (error || !order) return;

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const buyerEmail = await resolveAuthUserEmails([order.buyer_id]).then(
    (map) => map.get(order.buyer_id),
  );
  if (!buyerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const trackingNo =
    options?.trackingNo?.trim() || order.inbound_tracking_no?.trim() || "";

  await enqueueGradingEmailSafely({
    eventId: "E-GRD-B2C-03",
    templateKey: "grading.b2c.inbound_shipped",
    toEmail: buyerEmail,
    idempotencyKey: `E-GRD-B2C-03:${order.id}:buyer`,
    payload: {
      cardName: listing.cardName,
      orderNumber: order.order_number,
      trackingNo: trackingNo || undefined,
      courierName: options?.courierName?.trim() || undefined,
      actionUrl: buildBuyerOrderDetailUrl(siteUrl, order.id),
      logoUrl,
    },
  });
}


export async function enqueueC2cSellerReturnEmail(orderId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("member_orders")
    .select("id, seller_id, listing_id, order_number")
    .eq("id", orderId)
    .maybeSingle<
      Pick<MemberGradingOrderRow, "id" | "seller_id" | "listing_id" | "order_number">
    >();

  if (error || !order) return;

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const sellerEmail = await resolveAuthUserEmails([order.seller_id]).then(
    (map) => map.get(order.seller_id),
  );
  if (!sellerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueGradingEmailSafely({
    eventId: "E-GRD-C2C-08",
    templateKey: "grading.c2c.seller_return",
    toEmail: sellerEmail,
    idempotencyKey: `E-GRD-C2C-08:${order.id}:seller`,
    payload: {
      cardName: listing.cardName,
      orderNumber: order.order_number,
      actionUrl: buildSellerOrderDetailUrl(
        siteUrl,
        order.id,
        listing.sellerPersona,
      ),
      logoUrl,
    },
  });
}


export async function enqueueC2cBuyerConfirmedSellerEmail(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("member_orders")
    .select("id, seller_id, listing_id, order_number, use_authentication")
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MemberGradingOrderRow,
        "id" | "seller_id" | "listing_id" | "order_number" | "use_authentication"
      >
    >();

  if (error || !order?.use_authentication) return;

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const sellerEmail = await resolveAuthUserEmails([order.seller_id]).then(
    (map) => map.get(order.seller_id),
  );
  if (!sellerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueGradingEmailSafely({
    eventId: "E-GRD-C2C-09",
    templateKey: "grading.c2c.buyer_confirmed",
    toEmail: sellerEmail,
    idempotencyKey: `E-GRD-C2C-09:${order.id}:seller`,
    payload: {
      cardName: listing.cardName,
      orderNumber: order.order_number,
      actionUrl: buildSellerOrderDetailUrl(
        siteUrl,
        order.id,
        listing.sellerPersona,
      ),
      logoUrl,
    },
  });
}


export async function enqueueB2cBuyerConfirmedMerchantEmail(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, merchant_id, listing_id, order_number, requires_authentication")
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MerchantGradingOrderRow,
        "id" | "merchant_id" | "listing_id" | "order_number" | "requires_authentication"
      >
    >();

  if (error || !order?.requires_authentication) return;

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const merchantEmail = await resolveAuthUserEmails([order.merchant_id]).then(
    (map) => map.get(order.merchant_id),
  );
  if (!merchantEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueGradingEmailSafely({
    eventId: "E-GRD-B2C-08",
    templateKey: "grading.b2c.buyer_confirmed",
    toEmail: merchantEmail,
    idempotencyKey: `E-GRD-B2C-08:${order.id}:merchant`,
    payload: {
      cardName: listing.cardName,
      orderNumber: order.order_number,
      actionUrl: buildMerchantOrderDetailUrl(siteUrl, order.id),
      logoUrl,
    },
  });

  await sendOrderBuyerConfirmedSellerPush({
    orderId: order.id,
    orderKind: "merchant",
  });
}


export async function enqueueC2cPayoutReleasedSellerEmail(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("member_orders")
    .select("id, seller_id, listing_id, order_number")
    .eq("id", orderId)
    .maybeSingle<
      Pick<MemberGradingOrderRow, "id" | "seller_id" | "listing_id" | "order_number">
    >();

  if (error || !order) return;

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const sellerEmail = await resolveAuthUserEmails([order.seller_id]).then(
    (map) => map.get(order.seller_id),
  );
  if (!sellerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueGradingEmailSafely({
    eventId: "E-GRD-C2C-10",
    templateKey: "grading.c2c.payout_released",
    toEmail: sellerEmail,
    idempotencyKey: `E-GRD-C2C-10:${order.id}:seller`,
    payload: {
      cardName: listing.cardName,
      orderNumber: order.order_number,
      actionUrl: buildSellerOrderDetailUrl(
        siteUrl,
        order.id,
        listing.sellerPersona,
      ),
      logoUrl,
    },
  });
}


export async function enqueueB2cGradingFailSettlementMerchantEmail(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, merchant_id, listing_id, order_number")
    .eq("id", orderId)
    .maybeSingle<
      Pick<MerchantGradingOrderRow, "id" | "merchant_id" | "listing_id" | "order_number">
    >();

  if (error || !order) return;

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const merchantEmail = await resolveAuthUserEmails([order.merchant_id]).then(
    (map) => map.get(order.merchant_id),
  );
  if (!merchantEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueGradingEmailSafely({
    eventId: "E-GRD-B2C-07",
    templateKey: "grading.b2c.fail_settlement",
    toEmail: merchantEmail,
    idempotencyKey: `E-GRD-B2C-07:${order.id}:merchant`,
    payload: {
      cardName: listing.cardName,
      orderNumber: order.order_number,
      actionUrl: buildMerchantOrderDetailUrl(siteUrl, order.id),
      logoUrl,
    },
  });
}

export async function enqueueB2cAwaitingPaymentBuyerEmail(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, buyer_id, listing_id, order_number, escrow_status, requires_authentication")
    .eq("id", orderId)
    .maybeSingle<{
      id: string;
      buyer_id: string;
      listing_id: string;
      order_number: string | null;
      escrow_status: string | null;
      requires_authentication: boolean | null;
    }>();

  if (error || !order) return;
  if (!order.requires_authentication || order.escrow_status !== "pending_payment") {
    return;
  }

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const buyerEmail = await resolveAuthUserEmails([order.buyer_id]).then(
    (map) => map.get(order.buyer_id),
  );
  if (!buyerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueGradingEmailSafely({
    eventId: "E-GRD-B2C-01",
    templateKey: "grading.b2c.awaiting_payment",
    toEmail: buyerEmail,
    idempotencyKey: `E-GRD-B2C-01:${order.id}:buyer`,
    payload: {
      cardName: listing.cardName,
      orderNumber: order.order_number,
      actionUrl: buildBuyerOrderDetailUrl(siteUrl, order.id),
      logoUrl,
    },
  });
}

export async function enqueueB2cGradingPayoutCompletedEmail(args: {
  orderId: string;
  merchantPayoutAmount: number;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, merchant_id, listing_id, order_number, requires_authentication")
    .eq("id", args.orderId)
    .maybeSingle<
      Pick<
        MerchantGradingOrderRow,
        "id" | "merchant_id" | "listing_id" | "order_number" | "requires_authentication"
      >
    >();

  if (error || !order) return;
  if (!order.requires_authentication) return;

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const merchantEmail = await resolveAuthUserEmails([order.merchant_id]).then(
    (map) => map.get(order.merchant_id),
  );
  if (!merchantEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueGradingEmailSafely({
    eventId: "E-GRD-B2C-09",
    templateKey: "grading.b2c.payout_completed",
    toEmail: merchantEmail,
    idempotencyKey: `E-GRD-B2C-09:${order.id}:merchant`,
    payload: {
      cardName: listing.cardName,
      orderNumber: order.order_number,
      amountLabel: formatHkd(args.merchantPayoutAmount),
      actionUrl: buildMerchantFinanceUrl(siteUrl),
      logoUrl,
    },
  });
}
