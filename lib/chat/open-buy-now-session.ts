import type { BuyNowListingPayload } from "@/app/actions/buy-now";
import { useHkCardVaultStore } from "@/app/store/useHkCardVaultStore";

/** Hydrate chat UI after `buyNowListing` — accepted offer card + order ledger. */
export function openBuyNowChatSession(payload: BuyNowListingPayload): void {
  const store = useHkCardVaultStore.getState();
  const messageCreatedAt =
    payload.offerMessage.created_at ?? new Date().toISOString();

  store.openOfferChatSession({
    roomId: payload.roomId,
    partnerId: payload.sellerId,
    partnerName: payload.sellerName,
    partnerPersona: payload.partnerPersona,
    buyerId: payload.buyerId,
    buyerName: payload.buyerName,
    sellerId: payload.sellerId,
    sellerName: payload.sellerName,
    cardName: payload.cardName,
    cardId: payload.productId,
    listingId: payload.listingId,
    offerId: payload.offerId,
    offerPrice: payload.offerPrice,
    modifiedCount: 0,
    messageId: payload.offerMessage.id,
    messageContent: payload.offerMessage.content,
    messageCreatedAt,
    offerStatus: "accepted",
    useAuthentication: payload.useAuthentication,
  });

  store.applyOfferAccepted(
    payload.offerId,
    payload.orderId,
    payload.orderKind,
    payload.paymentHref,
  );
}
