"use client";

import type { OfferCardContext } from "@/app/actions/offers";
import { DEFAULT_AUTH_FEE_HKD } from "@/lib/platform/auth-escrow-config";
import type { SpecialTransactionData } from "@/app/store/useHkCardVaultStore";
import { OfferCard, type OfferCardMessage } from "./OfferCard";

export interface SpecialTransactionProps {
  msgId: string;
  buyerName: string;
  buyerId: string;
  sellerId: string;
  sellerName: string;
  cardName: string;
  cardId: string;
  listingId?: string;
  offerId?: string;
  imageUrl?: string;
  offerPrice: number;
  initialModifiedCount?: number;
  useAuthentication?: boolean;
  initialStatus: "pending" | "accepted" | "rejected" | "countered";
  isMe: boolean;
  currentUserId: string | null;
  roomId?: string;
  listingImageUrls?: string[];
}

function mapInitialStatusToOfferStatus(
  status: SpecialTransactionProps["initialStatus"],
): OfferCardContext["offer"]["status"] {
  if (status === "accepted") return "accepted";
  if (status === "rejected") return "rejected";
  return "pending";
}

function buildHydratedContext(
  props: SpecialTransactionProps,
): OfferCardContext | null {
  if (!props.offerId) return null;

  return {
    offer: {
      id: props.offerId,
      buyer_id: props.buyerId,
      offer_price: props.offerPrice,
      status: mapInitialStatusToOfferStatus(props.initialStatus),
      modified_count: props.initialModifiedCount ?? 0,
      room_id: props.roomId ?? "",
      use_authentication: props.useAuthentication ?? false,
    },
    listingId: props.listingId ?? props.cardId,
    productId: props.cardId,
    cardName: props.cardName,
    cardNumber: null,
    setCode: "",
    displayId: null,
    listingImageUrls: props.listingImageUrls,
    imageUrl: props.imageUrl,
    buyerName: props.buyerName,
    sellerId: props.sellerId,
    authServiceFeeHkd: DEFAULT_AUTH_FEE_HKD,
  };
}

/**
 * Legacy adapter for Zustand-hydrated offer messages and preset thread shapes.
 * Real offer cards render via {@link OfferCard}.
 */
export function SpecialTransactionMessage(props: SpecialTransactionProps) {
  if (!props.offerId) {
    return null;
  }

  const message: OfferCardMessage = {
    id: props.msgId,
    offer_id: props.offerId,
    content: null,
    room_id: props.roomId ?? null,
  };

  return (
    <OfferCard
      message={message}
      currentUserId={props.currentUserId}
      roomId={props.roomId}
      initialContext={buildHydratedContext(props)}
    />
  );
}

export function buildOfferCardHydrationFromSpecialData(
  specialData: SpecialTransactionData,
  msgId: string,
  roomId?: string,
): {
  message: OfferCardMessage;
  initialContext: OfferCardContext | null;
} | null {
  if (!specialData.offerId) return null;

  const props: SpecialTransactionProps = {
    msgId,
    buyerName: specialData.buyerName,
    buyerId: specialData.buyerId,
    sellerId: specialData.sellerId,
    sellerName: specialData.sellerName,
    cardName: specialData.cardName,
    cardId: specialData.cardId,
    listingId: specialData.listingId,
    offerId: specialData.offerId,
    imageUrl: specialData.imageUrl,
    listingImageUrls: specialData.listingImageUrls,
    offerPrice: specialData.offerPrice,
    initialModifiedCount: specialData.modifiedCount ?? 0,
    useAuthentication: specialData.useAuthentication,
    initialStatus: specialData.initialStatus ?? "pending",
    isMe: false,
    currentUserId: null,
    roomId,
  };

  return {
    message: {
      id: msgId,
      offer_id: specialData.offerId,
      content: null,
      room_id: roomId ?? null,
    },
    initialContext: buildHydratedContext(props),
  };
}
