import { getSiteUrl } from "@/lib/auth/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/supabase";
import {
  buildBuyerOrderDetailUrl,
  buildMemberTradingUrl,
  buildMerchantFinanceUrl,
  buildMerchantOrderDetailUrl,
  buildSellerOrderDetailUrl,
} from "@/lib/notifications/email-urls";
import { enqueueTransactionalEmail } from "@/lib/notifications/enqueue-email";
import {
  sendMemberOrderPaymentConfirmedSellerPush,
  sendMerchantOrderPaymentConfirmedSellerPush,
  sendMerchantOrderPaymentExpiredBuyerPush,
  sendMerchantOrderShippedBuyerPush,
  sendOrderBuyerConfirmedSellerPush,
  sendOrderCompletedBuyerPush,
  sendOrderCompletedMerchantPush,
  sendOrderConfirmReminderBuyerPush,
  sendOrderReviewInvitePush,
  sendOrderShipReminderSellerPush,
} from "@/lib/notifications/order-push";
import { resolveAuthUserEmails } from "@/lib/notifications/resolve-auth-user-email";
import { resolveEmailLogoUrl } from "@/lib/email/layout";

type ListingEmailContext = {
  listingId: string;
  cardName: string;
  sellerPersona: "merchant" | "member";
};

type ProfileNameRow = Pick<Tables<"profiles">, "display_name" | "username">;
type MerchantShopNameRow = Pick<Tables<"merchant_shops">, "shop_name" | "shop_handle">;

type MerchantOrderPaymentRow = Pick<
  Tables<"merchant_orders">,
  | "id"
  | "buyer_id"
  | "merchant_id"
  | "listing_id"
  | "buyer_total_amount"
  | "total_amount"
  | "final_price"
  | "order_number"
  | "outbound_tracking_no"
  | "outbound_courier_name"
>;

type MemberOrderPaymentRow = Pick<
  Tables<"member_orders">,
  | "id"
  | "buyer_id"
  | "seller_id"
  | "listing_id"
  | "buyer_total_amount"
  | "total_amount"
  | "final_price"
  | "order_number"
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

export async function fetchListingEmailContext(
  listingId: string,
): Promise<ListingEmailContext | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("listings")
    .select(
      `
        id,
        seller_persona,
        product_catalog (
          name_zh,
          name_ja
        )
      `,
    )
    .eq("id", listingId)
    .maybeSingle<{
      id: string;
      seller_persona: Tables<"listings">["seller_persona"] | null;
      product_catalog: {
        name_zh: string | null;
        name_ja: string;
      } | null;
    }>();

  if (error || !data) {
    console.warn("[order-emails] listing lookup", listingId, error?.message);
    return null;
  }

  const catalog = data.product_catalog;
  const cardName =
    catalog?.name_zh?.trim() || catalog?.name_ja?.trim() || "商品";

  return {
    listingId: data.id,
    cardName,
    sellerPersona: data.seller_persona === "merchant" ? "merchant" : "member",
  };
}

async function resolveMemberDisplayName(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("display_name, username")
    .eq("id", userId)
    .maybeSingle<ProfileNameRow>();

  return data?.display_name?.trim() || data?.username?.trim() || "會員";
}

async function resolveSellerDisplayName(
  sellerId: string,
  sellerPersona: "merchant" | "member",
): Promise<string> {
  const admin = createAdminClient();

  if (sellerPersona === "merchant") {
    const { data } = await admin
      .from("merchant_shops")
      .select("shop_name, shop_handle")
      .eq("merchant_id", sellerId)
      .maybeSingle<MerchantShopNameRow>();

    return (
      data?.shop_name?.trim() ||
      data?.shop_handle?.trim() ||
      "認證商戶"
    );
  }

  return resolveMemberDisplayName(sellerId);
}

async function enqueueOrderEmailSafely(
  input: Parameters<typeof enqueueTransactionalEmail>[0],
): Promise<boolean> {
  try {
    const result = await enqueueTransactionalEmail(input);
    if (!result.success) {
      console.warn("[order-emails] enqueue failed", input.eventId, result.error);
      return false;
    }
    return !result.data.duplicate;
  } catch (error) {
    console.warn("[order-emails] enqueue failed", input.eventId, error);
    return false;
  }
}

async function enqueuePaymentConfirmedPair(args: {
  orderId: string;
  orderKind: "merchant" | "member";
  buyerId: string;
  sellerId: string;
  listingId: string;
  amountLabel: string;
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
  const sellerPersona = listing.sellerPersona;
  const sellerName = await resolveSellerDisplayName(args.sellerId, sellerPersona);
  const buyerName = await resolveMemberDisplayName(args.buyerId);
  const buyerActionUrl = buildBuyerOrderDetailUrl(siteUrl, args.orderId);
  const sellerActionUrl =
    args.orderKind === "merchant"
      ? buildMerchantOrderDetailUrl(siteUrl, args.orderId)
      : buildSellerOrderDetailUrl(siteUrl, args.orderId, sellerPersona);

  const sharedPayload = {
    orderId: args.orderId,
    orderKind: args.orderKind,
    cardName: listing.cardName,
    amountLabel: args.amountLabel,
    orderNumber: args.orderNumber,
    logoUrl,
  };

  if (buyerEmail) {
    await enqueueOrderEmailSafely({
      eventId: "E-ORD-01",
      templateKey: "order.payment_confirmed",
      toEmail: buyerEmail,
      idempotencyKey: `E-ORD-01:${args.orderId}:buyer`,
      recipientUserId: args.buyerId,
      payload: {
        ...sharedPayload,
        recipientRole: "buyer",
        counterpartyName: sellerName,
        actionUrl: buyerActionUrl,
      },
    });
  }

  if (sellerEmail) {
    await enqueueOrderEmailSafely({
      eventId: "E-ORD-01",
      templateKey: "order.payment_confirmed",
      toEmail: sellerEmail,
      idempotencyKey: `E-ORD-01:${args.orderId}:seller`,
      recipientUserId: args.sellerId,
      payload: {
        ...sharedPayload,
        recipientRole: "seller",
        counterpartyName: buyerName,
        actionUrl: sellerActionUrl,
      },
    });
  }
}

export async function enqueueMerchantOrderPaymentConfirmedEmails(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select(
      "id, buyer_id, merchant_id, listing_id, buyer_total_amount, total_amount, final_price, order_number",
    )
    .eq("id", orderId)
    .maybeSingle<MerchantOrderPaymentRow>();

  if (error || !order) {
    console.warn("[order-emails] merchant order lookup", orderId, error?.message);
    return;
  }

  await enqueuePaymentConfirmedPair({
    orderId: order.id,
    orderKind: "merchant",
    buyerId: order.buyer_id,
    sellerId: order.merchant_id,
    listingId: order.listing_id,
    amountLabel: resolveOrderAmountLabel(order),
    orderNumber: order.order_number,
  });

  await sendMerchantOrderPaymentConfirmedSellerPush(order.id);
}

export async function enqueueMemberOrderPaymentConfirmedEmails(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("member_orders")
    .select(
      "id, buyer_id, seller_id, listing_id, buyer_total_amount, total_amount, final_price, order_number",
    )
    .eq("id", orderId)
    .maybeSingle<MemberOrderPaymentRow>();

  if (error || !order) {
    console.warn("[order-emails] member order lookup", orderId, error?.message);
    return;
  }

  await enqueuePaymentConfirmedPair({
    orderId: order.id,
    orderKind: "member",
    buyerId: order.buyer_id,
    sellerId: order.seller_id,
    listingId: order.listing_id,
    amountLabel: resolveOrderAmountLabel(order),
    orderNumber: order.order_number,
  });

  await sendMemberOrderPaymentConfirmedSellerPush(order.id);
}

async function enqueuePaymentExpiredPair(args: {
  orderId: string;
  orderKind: "merchant" | "member";
  buyerId: string;
  sellerId: string;
  listingId: string;
  amountLabel: string;
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
  const sellerPersona = listing.sellerPersona;
  const sellerName = await resolveSellerDisplayName(args.sellerId, sellerPersona);
  const buyerName = await resolveMemberDisplayName(args.buyerId);
  const buyerActionUrl = buildMemberTradingUrl(siteUrl);
  const sellerActionUrl =
    args.orderKind === "merchant"
      ? buildMerchantOrderDetailUrl(siteUrl, args.orderId)
      : buildSellerOrderDetailUrl(siteUrl, args.orderId, sellerPersona);

  const sharedPayload = {
    orderId: args.orderId,
    orderKind: args.orderKind,
    cardName: listing.cardName,
    amountLabel: args.amountLabel,
    orderNumber: args.orderNumber,
    logoUrl,
  };

  if (buyerEmail) {
    await enqueueOrderEmailSafely({
      eventId: "E-ORD-02",
      templateKey: "order.payment_expired",
      toEmail: buyerEmail,
      idempotencyKey: `E-ORD-02:${args.orderId}:buyer`,
      recipientUserId: args.buyerId,
      payload: {
        ...sharedPayload,
        recipientRole: "buyer",
        counterpartyName: sellerName,
        actionUrl: buyerActionUrl,
      },
    });
  }

  if (sellerEmail) {
    await enqueueOrderEmailSafely({
      eventId: "E-ORD-02",
      templateKey: "order.payment_expired",
      toEmail: sellerEmail,
      idempotencyKey: `E-ORD-02:${args.orderId}:seller`,
      recipientUserId: args.sellerId,
      payload: {
        ...sharedPayload,
        recipientRole: "seller",
        counterpartyName: buyerName,
        actionUrl: sellerActionUrl,
      },
    });
  }
}

export async function enqueueMerchantOrderPaymentExpiredEmails(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select(
      "id, buyer_id, merchant_id, listing_id, buyer_total_amount, total_amount, final_price, order_number",
    )
    .eq("id", orderId)
    .maybeSingle<MerchantOrderPaymentRow>();

  if (error || !order) {
    console.warn(
      "[order-emails] merchant order lookup (expired)",
      orderId,
      error?.message,
    );
    return;
  }

  await enqueuePaymentExpiredPair({
    orderId: order.id,
    orderKind: "merchant",
    buyerId: order.buyer_id,
    sellerId: order.merchant_id,
    listingId: order.listing_id,
    amountLabel: resolveOrderAmountLabel(order),
    orderNumber: order.order_number,
  });

  await sendMerchantOrderPaymentExpiredBuyerPush(order.id);
}

async function enqueueOrderShippedBuyerEmail(args: {
  orderId: string;
  orderKind: "merchant";
  buyerId: string;
  sellerId: string;
  listingId: string;
  orderNumber: string | null;
  trackingNo?: string | null;
  courierName?: string | null;
}): Promise<void> {
  const listing = await fetchListingEmailContext(args.listingId);
  if (!listing) return;

  const buyerEmail = await resolveAuthUserEmails([args.buyerId]).then(
    (map) => map.get(args.buyerId),
  );
  if (!buyerEmail) return;

  const sellerName = await resolveSellerDisplayName(
    args.sellerId,
    listing.sellerPersona,
  );
  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildBuyerOrderDetailUrl(siteUrl, args.orderId);
  const trackingNo = args.trackingNo?.trim() || "";
  const courierName = args.courierName?.trim() || "";

  await enqueueOrderEmailSafely({
    eventId: "E-ORD-04",
    templateKey: "order.shipped",
    toEmail: buyerEmail,
    idempotencyKey: `E-ORD-04:${args.orderId}:buyer`,
    recipientUserId: args.buyerId,
    payload: {
      orderId: args.orderId,
      orderKind: args.orderKind,
      cardName: listing.cardName,
      sellerName,
      orderNumber: args.orderNumber,
      trackingNo: trackingNo || undefined,
      courierName: courierName || undefined,
      actionUrl,
      logoUrl,
    },
  });
}
async function enqueueOrderBuyerConfirmedSellerEmail(args: {
  orderId: string;
  orderKind: "merchant" | "member";
  buyerId: string;
  sellerId: string;
  listingId: string;
  orderNumber: string | null;
}): Promise<void> {
  const listing = await fetchListingEmailContext(args.listingId);
  if (!listing) return;

  const sellerEmail = await resolveAuthUserEmails([args.sellerId]).then(
    (map) => map.get(args.sellerId),
  );
  if (!sellerEmail) return;

  const buyerName = await resolveMemberDisplayName(args.buyerId);
  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl =
    args.orderKind === "merchant"
      ? buildMerchantOrderDetailUrl(siteUrl, args.orderId)
      : buildSellerOrderDetailUrl(siteUrl, args.orderId, listing.sellerPersona);

  await enqueueOrderEmailSafely({
    eventId: "E-ORD-05",
    templateKey: "order.buyer_confirmed",
    toEmail: sellerEmail,
    idempotencyKey: `E-ORD-05:${args.orderId}:seller`,
      recipientUserId: args.sellerId,
    payload: {
      orderId: args.orderId,
      orderKind: args.orderKind,
      cardName: listing.cardName,
      buyerName,
      orderNumber: args.orderNumber,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueMerchantOrderShippedBuyerEmail(
  orderId: string,
  options?: { trackingNo?: string | null; courierName?: string | null },
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select(
      "id, buyer_id, merchant_id, listing_id, order_number, outbound_tracking_no, outbound_courier_name",
    )
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MerchantOrderPaymentRow,
        | "id"
        | "buyer_id"
        | "merchant_id"
        | "listing_id"
        | "order_number"
        | "outbound_tracking_no"
        | "outbound_courier_name"
      >
    >();

  if (error || !order) {
    console.warn(
      "[order-emails] merchant order lookup (shipped)",
      orderId,
      error?.message,
    );
    return;
  }

  await enqueueOrderShippedBuyerEmail({
    orderId: order.id,
    orderKind: "merchant",
    buyerId: order.buyer_id,
    sellerId: order.merchant_id,
    listingId: order.listing_id,
    orderNumber: order.order_number,
    trackingNo: options?.trackingNo ?? order.outbound_tracking_no,
    courierName: options?.courierName ?? order.outbound_courier_name,
  });

  await sendMerchantOrderShippedBuyerPush(orderId, options);
}

export async function enqueueMerchantOrderBuyerConfirmedSellerEmail(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, buyer_id, merchant_id, listing_id, order_number")
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MerchantOrderPaymentRow,
        "id" | "buyer_id" | "merchant_id" | "listing_id" | "order_number"
      >
    >();

  if (error || !order) {
    console.warn(
      "[order-emails] merchant order lookup (buyer confirmed)",
      orderId,
      error?.message,
    );
    return;
  }

  await enqueueOrderBuyerConfirmedSellerEmail({
    orderId: order.id,
    orderKind: "merchant",
    buyerId: order.buyer_id,
    sellerId: order.merchant_id,
    listingId: order.listing_id,
    orderNumber: order.order_number,
  });

  await sendOrderBuyerConfirmedSellerPush({
    orderId: order.id,
    orderKind: "merchant",
  });
}

export async function enqueueMemberOrderBuyerConfirmedSellerEmail(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("member_orders")
    .select("id, buyer_id, seller_id, listing_id, order_number")
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MemberOrderPaymentRow,
        "id" | "buyer_id" | "seller_id" | "listing_id" | "order_number"
      >
    >();

  if (error || !order) {
    console.warn(
      "[order-emails] member order lookup (buyer confirmed)",
      orderId,
      error?.message,
    );
    return;
  }

  await enqueueOrderBuyerConfirmedSellerEmail({
    orderId: order.id,
    orderKind: "member",
    buyerId: order.buyer_id,
    sellerId: order.seller_id,
    listingId: order.listing_id,
    orderNumber: order.order_number,
  });

  await sendOrderBuyerConfirmedSellerPush({
    orderId: order.id,
    orderKind: "member",
  });
}

async function enqueueOrderCancelledPair(args: {
  orderId: string;
  orderKind: "merchant" | "member";
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
  const sellerPersona = listing.sellerPersona;
  const buyerActionUrl = buildBuyerOrderDetailUrl(siteUrl, args.orderId);
  const sellerActionUrl =
    args.orderKind === "merchant"
      ? buildMerchantOrderDetailUrl(siteUrl, args.orderId)
      : buildSellerOrderDetailUrl(siteUrl, args.orderId, sellerPersona);

  const sharedPayload = {
    orderId: args.orderId,
    orderKind: args.orderKind,
    cardName: listing.cardName,
    orderNumber: args.orderNumber,
    logoUrl,
  };

  if (buyerEmail) {
    await enqueueOrderEmailSafely({
      eventId: "E-ORD-03",
      templateKey: "order.cancelled",
      toEmail: buyerEmail,
      idempotencyKey: `E-ORD-03:${args.orderId}:buyer`,
      recipientUserId: args.buyerId,
      payload: {
        ...sharedPayload,
        recipientRole: "buyer",
        actionUrl: buyerActionUrl,
      },
    });
  }

  if (sellerEmail) {
    await enqueueOrderEmailSafely({
      eventId: "E-ORD-03",
      templateKey: "order.cancelled",
      toEmail: sellerEmail,
      idempotencyKey: `E-ORD-03:${args.orderId}:seller`,
      recipientUserId: args.sellerId,
      payload: {
        ...sharedPayload,
        recipientRole: "seller",
        actionUrl: sellerActionUrl,
      },
    });
  }
}

export async function enqueueMemberOrderCancelledEmails(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("member_orders")
    .select("id, buyer_id, seller_id, listing_id, order_number")
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MemberOrderPaymentRow,
        "id" | "buyer_id" | "seller_id" | "listing_id" | "order_number"
      >
    >();

  if (error || !order) {
    console.warn(
      "[order-emails] member order lookup (cancelled)",
      orderId,
      error?.message,
    );
    return;
  }

  await enqueueOrderCancelledPair({
    orderId: order.id,
    orderKind: "member",
    buyerId: order.buyer_id,
    sellerId: order.seller_id,
    listingId: order.listing_id,
    orderNumber: order.order_number,
  });
}

export async function enqueueMerchantOrderCancelledEmails(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, buyer_id, merchant_id, listing_id, order_number")
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MerchantOrderPaymentRow,
        "id" | "buyer_id" | "merchant_id" | "listing_id" | "order_number"
      >
    >();

  if (error || !order) {
    console.warn(
      "[order-emails] merchant order lookup (cancelled)",
      orderId,
      error?.message,
    );
    return;
  }

  await enqueueOrderCancelledPair({
    orderId: order.id,
    orderKind: "merchant",
    buyerId: order.buyer_id,
    sellerId: order.merchant_id,
    listingId: order.listing_id,
    orderNumber: order.order_number,
  });
}

export async function enqueueOrderCompletedBuyerEmail(
  orderId: string,
  orderKind: "member" | "merchant",
): Promise<void> {
  const admin = createAdminClient();
  const orderRow =
    orderKind === "member"
      ? (
          await admin
            .from("member_orders")
            .select("buyer_id, listing_id, order_number")
            .eq("id", orderId)
            .maybeSingle<{
              buyer_id: string;
              listing_id: string;
              order_number: string | null;
            }>()
        ).data
      : (
          await admin
            .from("merchant_orders")
            .select("buyer_id, listing_id, order_number")
            .eq("id", orderId)
            .maybeSingle<{
              buyer_id: string;
              listing_id: string;
              order_number: string | null;
            }>()
        ).data;

  if (!orderRow) return;

  const listing = await fetchListingEmailContext(orderRow.listing_id);
  if (!listing) return;

  const buyerEmail = await resolveAuthUserEmails([orderRow.buyer_id]).then(
    (map) => map.get(orderRow.buyer_id),
  );

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  if (buyerEmail) {
    await enqueueOrderEmailSafely({
      eventId: "E-ORD-06",
      templateKey: "order.completed",
      toEmail: buyerEmail,
      idempotencyKey: `E-ORD-06:${orderId}:buyer`,
      recipientUserId: orderRow.buyer_id,
      payload: {
        orderId,
        orderKind,
        cardName: listing.cardName,
        orderNumber: orderRow.order_number,
        actionUrl: buildBuyerOrderDetailUrl(siteUrl, orderId),
        logoUrl,
      },
    });
  }

  await sendOrderCompletedBuyerPush(orderId, orderKind);
}
export async function enqueueB2cPaymentMerchantActionEmail(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, merchant_id, listing_id, order_number")
    .eq("id", orderId)
    .maybeSingle<
      Pick<MerchantOrderPaymentRow, "id" | "merchant_id" | "listing_id" | "order_number">
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

  await enqueueOrderEmailSafely({
    eventId: "E-ORD-B2C-01",
    templateKey: "b2c.payment_merchant_action",
    toEmail: merchantEmail,
    idempotencyKey: `E-ORD-B2C-01:${order.id}:merchant`,
      recipientUserId: order.merchant_id,
    payload: {
      orderId: order.id,
      cardName: listing.cardName,
      orderNumber: order.order_number,
      actionUrl: buildMerchantOrderDetailUrl(siteUrl, order.id),
      logoUrl,
    },
  });
}

export async function enqueueB2cShippedBuyerEmail(
  orderId: string,
  options?: { trackingNo?: string | null; courierName?: string | null },
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select(
      "id, buyer_id, listing_id, order_number, outbound_tracking_no, outbound_courier_name",
    )
    .eq("id", orderId)
    .maybeSingle<
      Pick<
        MerchantOrderPaymentRow,
        | "id"
        | "buyer_id"
        | "listing_id"
        | "order_number"
        | "outbound_tracking_no"
        | "outbound_courier_name"
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
    options?.trackingNo?.trim() || order.outbound_tracking_no?.trim() || "";
  const courierName =
    options?.courierName?.trim() || order.outbound_courier_name?.trim() || "";

  await enqueueOrderEmailSafely({
    eventId: "E-ORD-B2C-02",
    templateKey: "b2c.shipped",
    toEmail: buyerEmail,
    idempotencyKey: `E-ORD-B2C-02:${order.id}:buyer`,
    recipientUserId: order.buyer_id,
    payload: {
      orderId: order.id,
      cardName: listing.cardName,
      orderNumber: order.order_number,
      trackingNo: trackingNo || undefined,
      courierName: courierName || undefined,
      actionUrl: buildBuyerOrderDetailUrl(siteUrl, order.id),
      logoUrl,
    },
  });
}

export async function enqueueB2cCompletedMerchantEmail(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("id, merchant_id, listing_id, order_number")
    .eq("id", orderId)
    .maybeSingle<
      Pick<MerchantOrderPaymentRow, "id" | "merchant_id" | "listing_id" | "order_number">
    >();

  if (error || !order) return;

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const merchantEmail = await resolveAuthUserEmails([order.merchant_id]).then(
    (map) => map.get(order.merchant_id),
  );

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  if (merchantEmail) {
    await enqueueOrderEmailSafely({
      eventId: "E-ORD-B2C-03",
      templateKey: "b2c.completed",
      toEmail: merchantEmail,
      idempotencyKey: `E-ORD-B2C-03:${order.id}:merchant`,
      recipientUserId: order.merchant_id,
      payload: {
        orderId: order.id,
        cardName: listing.cardName,
        orderNumber: order.order_number,
        actionUrl: buildMerchantFinanceUrl(siteUrl),
        logoUrl,
      },
    });
  }

  await sendOrderCompletedMerchantPush(order.id);
}

export async function enqueueOrderConfirmReminderBuyerEmail(args: {
  orderId: string;
  orderKind: "merchant" | "member";
  idempotencyDateSuffix: string;
}): Promise<void> {
  const admin = createAdminClient();
  const orderRow =
    args.orderKind === "merchant"
      ? (
          await admin
            .from("merchant_orders")
            .select("buyer_id, listing_id, order_number")
            .eq("id", args.orderId)
            .maybeSingle<{
              buyer_id: string;
              listing_id: string;
              order_number: string | null;
            }>()
        ).data
      : (
          await admin
            .from("member_orders")
            .select("buyer_id, listing_id, order_number")
            .eq("id", args.orderId)
            .maybeSingle<{
              buyer_id: string;
              listing_id: string;
              order_number: string | null;
            }>()
        ).data;

  if (!orderRow) return;

  const listing = await fetchListingEmailContext(orderRow.listing_id);
  if (!listing) return;

  const buyerEmail = await resolveAuthUserEmails([orderRow.buyer_id]).then(
    (map) => map.get(orderRow.buyer_id),
  );
  if (!buyerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  const emailed = await enqueueOrderEmailSafely({
    eventId: "E-ORD-07",
    templateKey: "order.confirm_reminder",
    toEmail: buyerEmail,
    idempotencyKey: `E-ORD-07:${args.orderId}:buyer:${args.idempotencyDateSuffix}`,
      recipientUserId: orderRow.buyer_id,
    payload: {
      orderId: args.orderId,
      orderKind: args.orderKind,
      cardName: listing.cardName,
      orderNumber: orderRow.order_number,
      actionUrl: buildBuyerOrderDetailUrl(siteUrl, args.orderId),
      logoUrl,
    },
  });

  if (emailed) {
    await sendOrderConfirmReminderBuyerPush({
      orderId: args.orderId,
      orderKind: args.orderKind,
    });
  }
}

export async function enqueueOrderShipReminderSellerEmail(args: {
  orderId: string;
  orderKind: "merchant" | "member";
  idempotencyDateSuffix: string;
}): Promise<void> {
  const admin = createAdminClient();
  const orderRow =
    args.orderKind === "merchant"
      ? (
          await admin
            .from("merchant_orders")
            .select("merchant_id, listing_id, order_number")
            .eq("id", args.orderId)
            .maybeSingle<{
              merchant_id: string;
              listing_id: string;
              order_number: string | null;
            }>()
        ).data
      : (
          await admin
            .from("member_orders")
            .select("seller_id, listing_id, order_number")
            .eq("id", args.orderId)
            .maybeSingle<{
              seller_id: string;
              listing_id: string;
              order_number: string | null;
            }>()
        ).data;

  if (!orderRow) return;

  const sellerId =
    args.orderKind === "merchant"
      ? (orderRow as { merchant_id: string }).merchant_id
      : (orderRow as { seller_id: string }).seller_id;

  const listing = await fetchListingEmailContext(orderRow.listing_id);
  if (!listing) return;

  const sellerEmail = await resolveAuthUserEmails([sellerId]).then(
    (map) => map.get(sellerId),
  );
  if (!sellerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl =
    args.orderKind === "merchant"
      ? buildMerchantOrderDetailUrl(siteUrl, args.orderId)
      : buildSellerOrderDetailUrl(siteUrl, args.orderId, listing.sellerPersona);

  const emailed = await enqueueOrderEmailSafely({
    eventId: "E-ORD-08",
    templateKey: "order.ship_reminder",
    toEmail: sellerEmail,
    idempotencyKey: `E-ORD-08:${args.orderId}:seller:${args.idempotencyDateSuffix}`,
    recipientUserId: sellerId,
    payload: {
      orderId: args.orderId,
      orderKind: args.orderKind,
      cardName: listing.cardName,
      orderNumber: orderRow.order_number,
      actionUrl,
      logoUrl,
    },
  });

  if (emailed) {
    await sendOrderShipReminderSellerPush({
      orderId: args.orderId,
      orderKind: args.orderKind,
    });
  }
}

export async function enqueueOrderReviewInviteEmails(
  orderId: string,
  orderKind: "member" | "merchant",
): Promise<void> {
  const admin = createAdminClient();
  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  if (orderKind === "member") {
    const { data: order } = await admin
      .from("member_orders")
      .select("buyer_id, seller_id, listing_id, order_number")
      .eq("id", orderId)
      .maybeSingle<{
        buyer_id: string;
        seller_id: string;
        listing_id: string;
        order_number: string | null;
      }>();
    if (!order) return;

    const listing = await fetchListingEmailContext(order.listing_id);
    if (!listing) return;

    const emails = await resolveAuthUserEmails([
      order.buyer_id,
      order.seller_id,
    ]);
    const recipients = [
      {
        userId: order.buyer_id,
        email: emails.get(order.buyer_id),
        actionUrl: buildBuyerOrderDetailUrl(siteUrl, orderId),
      },
      {
        userId: order.seller_id,
        email: emails.get(order.seller_id),
        actionUrl: buildSellerOrderDetailUrl(
          siteUrl,
          orderId,
          listing.sellerPersona,
        ),
      },
    ];

    for (const recipient of recipients) {
      if (!recipient.email) continue;

      const { data: reviewRow } = await admin
        .from("transaction_reviews")
        .select("id")
        .eq("member_order_id", orderId)
        .eq("reviewer_id", recipient.userId)
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (reviewRow?.id) continue;

      const emailed = await enqueueOrderEmailSafely({
        eventId: "E-ORD-09",
        templateKey: "order.review_invite",
        toEmail: recipient.email,
        idempotencyKey: `E-ORD-09:${orderId}:${recipient.userId}`,
      recipientUserId: recipient.userId,
        payload: {
          orderId,
          orderKind,
          cardName: listing.cardName,
          orderNumber: order.order_number,
          actionUrl: recipient.actionUrl,
          logoUrl,
        },
      });

      if (emailed) {
        await sendOrderReviewInvitePush({
          orderId,
          orderKind,
          userId: recipient.userId,
        });
      }
    }

    return;
  }

  const { data: order } = await admin
    .from("merchant_orders")
    .select("buyer_id, merchant_id, listing_id, order_number")
    .eq("id", orderId)
    .maybeSingle<{
      buyer_id: string;
      merchant_id: string;
      listing_id: string;
      order_number: string | null;
    }>();
  if (!order) return;

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const emails = await resolveAuthUserEmails([
    order.buyer_id,
    order.merchant_id,
  ]);
  const recipients = [
    {
      userId: order.buyer_id,
      email: emails.get(order.buyer_id),
      actionUrl: buildBuyerOrderDetailUrl(siteUrl, orderId),
    },
    {
      userId: order.merchant_id,
      email: emails.get(order.merchant_id),
      actionUrl: buildMerchantOrderDetailUrl(siteUrl, orderId),
    },
  ];

  for (const recipient of recipients) {
    if (!recipient.email) continue;

    const { data: reviewRow } = await admin
      .from("transaction_reviews")
      .select("id")
      .eq("merchant_order_id", orderId)
      .eq("reviewer_id", recipient.userId)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (reviewRow?.id) continue;

    const emailed = await enqueueOrderEmailSafely({
      eventId: "E-ORD-09",
      templateKey: "order.review_invite",
      toEmail: recipient.email,
      idempotencyKey: `E-ORD-09:${orderId}:${recipient.userId}`,
      recipientUserId: recipient.userId,
      payload: {
        orderId,
        orderKind,
        cardName: listing.cardName,
        orderNumber: order.order_number,
        actionUrl: recipient.actionUrl,
        logoUrl,
      },
    });

    if (emailed) {
      await sendOrderReviewInvitePush({
        orderId,
        orderKind,
        userId: recipient.userId,
      });
    }
  }
}
