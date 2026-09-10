import { getSiteUrl } from "@/lib/auth/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildBuyerOrderDetailUrl,
  buildSellerOrderDetailUrl,
} from "@/lib/notifications/email-urls";
import { enqueueTransactionalEmail } from "@/lib/notifications/enqueue-email";
import { fetchListingEmailContext } from "@/lib/notifications/order-emails";
import { resolveAuthUserEmails } from "@/lib/notifications/resolve-auth-user-email";
import { resolveEmailLogoUrl } from "@/lib/email/layout";

async function enqueueP2pEmailSafely(
  input: Parameters<typeof enqueueTransactionalEmail>[0],
): Promise<void> {
  try {
    await enqueueTransactionalEmail(input);
  } catch (error) {
    console.warn("[p2p-order-emails] enqueue failed", input.eventId, error);
  }
}

export async function enqueueP2pMeetupArrangedEmails(args: {
  orderId: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  orderNumber?: string | null;
  sellerPersona?: "merchant" | "member";
}): Promise<void> {
  const listing = await fetchListingEmailContext(args.listingId);
  if (!listing) return;

  const emails = await resolveAuthUserEmails([args.buyerId, args.sellerId]);
  const buyerEmail = emails.get(args.buyerId);
  const sellerEmail = emails.get(args.sellerId);
  if (!buyerEmail && !sellerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const sellerPersona =
    args.sellerPersona ?? listing.sellerPersona ?? "member";
  const shared = {
    cardName: listing.cardName,
    orderNumber: args.orderNumber,
    logoUrl,
  };

  if (buyerEmail) {
    await enqueueP2pEmailSafely({
      eventId: "E-ORD-P2P-01",
      templateKey: "p2p.meetup_arranged",
      toEmail: buyerEmail,
      idempotencyKey: `E-ORD-P2P-01:${args.orderId}:buyer`,
      payload: {
        ...shared,
        recipientRole: "buyer",
        actionUrl: buildBuyerOrderDetailUrl(siteUrl, args.orderId),
      },
    });
  }

  if (sellerEmail) {
    await enqueueP2pEmailSafely({
      eventId: "E-ORD-P2P-01",
      templateKey: "p2p.meetup_arranged",
      toEmail: sellerEmail,
      idempotencyKey: `E-ORD-P2P-01:${args.orderId}:seller`,
      payload: {
        ...shared,
        recipientRole: "seller",
        actionUrl: buildSellerOrderDetailUrl(
          siteUrl,
          args.orderId,
          sellerPersona,
        ),
      },
    });
  }
}

export async function enqueueP2pMeetupCompletedCounterpartyEmail(
  orderId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("member_orders")
    .select("id, buyer_id, seller_id, listing_id, order_number, use_authentication")
    .eq("id", orderId)
    .maybeSingle<{
      id: string;
      buyer_id: string;
      seller_id: string;
      listing_id: string;
      order_number: string | null;
      use_authentication: boolean;
    }>();

  if (!order || order.use_authentication) return;

  const listing = await fetchListingEmailContext(order.listing_id);
  if (!listing) return;

  const sellerEmail = await resolveAuthUserEmails([order.seller_id]).then(
    (map) => map.get(order.seller_id),
  );
  if (!sellerEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueP2pEmailSafely({
    eventId: "E-ORD-P2P-02",
    templateKey: "p2p.meetup_completed",
    toEmail: sellerEmail,
    idempotencyKey: `E-ORD-P2P-02:${order.id}:seller`,
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
