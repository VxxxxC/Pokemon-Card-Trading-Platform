import type {
  ChatRoom,
  Message,
  SpecialTransactionData,
} from "@/app/store/useHkCardVaultStore";
import { resolveOfferCardDisplayImage } from "@/app/lib/chat/offerCardImage";
import { parseListingImageUrls } from "@/lib/listings/images";
import {
  resolveSystemOfferAcceptedText,
  resolveSystemOfferRejectedText,
  SYSTEM_ORDER_CANCELLED_TEXT,
} from "@/app/lib/chat/offerSystemMessageCopy";
import type { Tables } from "@/types/supabase";
import { resolveAvatarUrl } from "@/lib/profile/avatar";

type SellerPersona = Tables<"listings">["seller_persona"];

export type ProfileSnippet = {
  id: string;
  display_name: string;
  role: Tables<"profiles">["role"];
  avatar_path: string | null;
  persona?: SellerPersona;
  username?: string | null;
  shop_name?: string | null;
  shop_handle?: string | null;
  is_merchant?: boolean | null;
};

type CatalogSnippet = {
  id: string;
  name_zh: string | null;
  name_ja: string;
  card_number: string | null;
  set_code: string;
  image_url: string;
};

export type DbOfferSnippet = {
  id: string;
  buyer_id: string;
  offer_price: number;
  status: Tables<"offers">["status"];
  modified_count: number;
  use_authentication: boolean;
  listing_id?: string | null;
  listings: {
    id?: string;
    product_id: string;
    images: unknown;
    product_catalog: CatalogSnippet | null;
  } | null;
};

export type DbChatMessageRow = {
  id: string;
  room_id: string;
  content: string;
  created_at: string | null;
  sender_id: string;
  offer_id: string | null;
  member_order_id: string | null;
  merchant_order_id?: string | null;
  is_system_warning: boolean | null;
  offers?: DbOfferSnippet | null;
};

export type DbChatRoomBaseRow = {
  id: string;
  buyer_id: string;
  buyer_persona?: SellerPersona | null;
  seller_id: string;
  seller_persona?: SellerPersona | null;
  created_at: string | null;
  updated_at: string | null;
  unread_count?: number | null;
  buyer: ProfileSnippet | null;
  seller: ProfileSnippet | null;
};

/** @deprecated nested select shape — use assembleDbChatRooms */
export type DbChatRoomRow = DbChatRoomBaseRow & {
  chat_messages: DbChatMessageRow[] | null;
};

export function partyDisplayName(party: ProfileSnippet): string {
  if (party.persona === "merchant") {
    return (
      party.shop_name?.trim() ||
      party.shop_handle?.trim() ||
      party.display_name?.trim() ||
      "認證商戶"
    );
  }

  return (
    party.display_name?.trim() ||
    party.username?.trim() ||
    "對話夥伴"
  );
}

export function partnerTierForPersona(persona: SellerPersona | null | undefined): string {
  return persona === "merchant" ? "專業認證商戶" : "認證用戶";
}

export function resolvePartnerPresentation(
  room: DbChatRoomBaseRow,
  currentUserId: string,
): {
  partnerId: string;
  partnerName: string;
  partnerAvatarUrl: string;
  partnerTier: string;
  partnerPersona: SellerPersona;
  partner: ProfileSnippet;
} {
  const buyer: ProfileSnippet = {
    persona: room.buyer_persona ?? "member",
    ...(room.buyer ?? {
      id: room.buyer_id,
      display_name: "買家",
      role: "member" as const,
      avatar_path: null,
    }),
  };
  const seller: ProfileSnippet = {
    persona: room.seller_persona ?? "member",
    ...(room.seller ?? {
      id: room.seller_id,
      display_name: "賣家",
      role: "merchant" as const,
      avatar_path: null,
    }),
  };

  const isBuyer = currentUserId === room.buyer_id;
  const partner = isBuyer ? seller : buyer;

  return {
    partner,
    partnerId: partner.id,
    partnerName: partyDisplayName(partner),
    partnerAvatarUrl: resolveAvatarUrl(partner.avatar_path),
    partnerTier: partnerTierForPersona(partner.persona ?? "member"),
    partnerPersona: partner.persona ?? "member",
  };
}

function mapOfferStatusToInitialStatus(
  status: Tables<"offers">["status"],
  modifiedCount: number,
): SpecialTransactionData["initialStatus"] {
  if (status === "accepted") return "accepted";
  if (status === "rejected" || status === "cancelled") return "rejected";
  if (modifiedCount >= 1) return "countered";
  return "pending";
}

function buildSpecialData(
  offer: DbOfferSnippet,
  buyer: ProfileSnippet,
  seller: ProfileSnippet,
): SpecialTransactionData | null {
  const catalog = offer.listings?.product_catalog;
  if (!catalog) return null;

  const cardName =
    catalog.name_zh?.trim() || catalog.name_ja?.trim() || "未命名卡牌";
  const listingImages = offer.listings?.images;
  const imageUrl = resolveOfferCardDisplayImage(
    listingImages,
    catalog.image_url,
  );

  return {
    cardName,
    cardId: catalog.id,
    listingId:
      offer.listing_id?.trim() || offer.listings?.id?.trim() || catalog.id,
    offerPrice: Number(offer.offer_price),
    buyerName: partyDisplayName(buyer),
    buyerId: buyer.id,
    sellerId: seller.id,
    sellerName: partyDisplayName(seller),
    offerId: offer.id,
    modifiedCount: offer.modified_count ?? 0,
    listingImageUrls: parseListingImageUrls(listingImages),
    imageUrl: imageUrl || undefined,
    useAuthentication: offer.use_authentication,
    initialStatus: mapOfferStatusToInitialStatus(
      offer.status,
      offer.modified_count ?? 0,
    ),
  };
}

function resolveSender(
  senderId: string,
  currentUserId: string,
  isSystemWarning: boolean,
  content: string,
): Message["sender"] {
  if (
    isSystemWarning ||
    content === "SYSTEM_OFFER_ACCEPTED" ||
    content === "SYSTEM_OFFER_REJECTED" ||
    content === "SYSTEM_ORDER_COMPLETED" ||
    content === "SYSTEM_ORDER_CANCELLED"
  ) {
    return "system";
  }
  return senderId === currentUserId ? "me" : "them";
}

function mapDbMessage(
  row: DbChatMessageRow,
  currentUserId: string,
  buyer: ProfileSnippet,
  seller: ProfileSnippet,
  primaryOfferMessageIds: Map<string, string>,
): Message {
  const timestamp = row.created_at ?? new Date().toISOString();
  const sender = resolveSender(
    row.sender_id,
    currentUserId,
    Boolean(row.is_system_warning),
    row.content,
  );

  const isPrimaryOfferMessage =
    row.offer_id != null &&
    primaryOfferMessageIds.get(row.offer_id) === row.id &&
    row.offers != null;

  if (isPrimaryOfferMessage && row.offers) {
    const specialData = buildSpecialData(row.offers, buyer, seller);
    if (specialData) {
      return {
        id: row.id,
        sender,
        text: row.content,
        timestamp,
        type: "special_transaction",
        specialData,
      };
    }
  }

  if (row.content === "SYSTEM_OFFER_ACCEPTED") {
    const merchantOrderId = row.merchant_order_id?.trim();
    const memberOrderId = row.member_order_id?.trim();
    return {
      id: row.id,
      sender: "system",
      text: resolveSystemOfferAcceptedText(currentUserId === seller.id),
      timestamp,
      type: "text",
      offerId: row.offer_id ?? undefined,
      orderData: merchantOrderId
        ? { orderId: merchantOrderId, orderKind: "merchant" }
        : memberOrderId
          ? { orderId: memberOrderId, orderKind: "member" }
          : undefined,
    };
  }

  if (row.content === "SYSTEM_OFFER_REJECTED") {
    return {
      id: row.id,
      sender: "system",
      text: resolveSystemOfferRejectedText(currentUserId === seller.id),
      timestamp,
      type: "text",
      offerId: row.offer_id ?? undefined,
    };
  }

  if (row.content === "SYSTEM_ORDER_COMPLETED") {
    const merchantOrderId = row.merchant_order_id?.trim();
    const memberOrderId = row.member_order_id?.trim();
    return {
      id: row.id,
      sender: "system",
      text: "✅ 交易已順利完成",
      timestamp,
      type: "system_order_completed",
      orderData: merchantOrderId
        ? { orderId: merchantOrderId, orderKind: "merchant" }
        : memberOrderId
          ? { orderId: memberOrderId, orderKind: "member" }
          : undefined,
    };
  }

  if (row.content === "SYSTEM_ORDER_CANCELLED") {
    const merchantOrderId = row.merchant_order_id?.trim();
    const memberOrderId = row.member_order_id?.trim();
    return {
      id: row.id,
      sender: "system",
      text: SYSTEM_ORDER_CANCELLED_TEXT,
      timestamp,
      type: "system_order_cancelled",
      orderData: merchantOrderId
        ? { orderId: merchantOrderId, orderKind: "merchant" }
        : memberOrderId
          ? { orderId: memberOrderId, orderKind: "member" }
          : undefined,
    };
  }

  return {
    id: row.id,
    sender,
    text: row.content,
    timestamp,
    type: "text",
  };
}

function resolveUnreadCount(room: DbChatRoomBaseRow): number {
  const raw = room.unread_count;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return 0;
  }
  return Math.max(0, Math.floor(raw));
}

function mapRoomToStore(
  room: DbChatRoomBaseRow,
  messages: DbChatMessageRow[],
  currentUserId: string,
): ChatRoom {
  const buyer: ProfileSnippet = {
    persona: room.buyer_persona ?? "member",
    ...(room.buyer ?? {
      id: room.buyer_id,
      display_name: "買家",
      role: "member" as const,
      avatar_path: null,
    }),
  };
  const seller: ProfileSnippet = {
    persona: room.seller_persona ?? "member",
    ...(room.seller ?? {
      id: room.seller_id,
      display_name: "賣家",
      role: "merchant" as const,
      avatar_path: null,
    }),
  };

  const presentation = resolvePartnerPresentation(room, currentUserId);

  const sortedMessages = [...messages].sort(
    (a, b) =>
      new Date(a.created_at ?? 0).getTime() -
      new Date(b.created_at ?? 0).getTime(),
  );

  const primaryOfferMessageIds = new Map<string, string>();
  for (const message of sortedMessages) {
    if (message.offer_id && !primaryOfferMessageIds.has(message.offer_id)) {
      primaryOfferMessageIds.set(message.offer_id, message.id);
    }
  }

  const mappedMessages = sortedMessages.map((message) =>
    mapDbMessage(
      message,
      currentUserId,
      buyer,
      seller,
      primaryOfferMessageIds,
    ),
  );

  const lastMessage = mappedMessages.at(-1)?.text ?? "尚無訊息";
  const timestamp =
    mappedMessages.at(-1)?.timestamp ??
    room.updated_at ??
    room.created_at ??
    new Date().toISOString();

  const viewerPersona =
    currentUserId === room.buyer_id
      ? (room.buyer_persona ?? "member")
      : (room.seller_persona ?? "member");

  return {
    id: room.id,
    partnerId: presentation.partnerId,
    partnerPersona: presentation.partnerPersona,
    viewerPersona,
    partnerName: presentation.partnerName,
    partnerAvatarUrl: presentation.partnerAvatarUrl,
    partnerTier: presentation.partnerTier,
    lastMessage,
    unreadCount: resolveUnreadCount(room),
    timestamp,
    messages: mappedMessages,
  };
}

function mapLastMessagePreview(
  row: DbChatMessageRow,
  room: DbChatRoomBaseRow,
  currentUserId: string,
): string {
  switch (row.content) {
    case "SYSTEM_OFFER_ACCEPTED":
      return resolveSystemOfferAcceptedText(currentUserId === room.seller_id);
    case "SYSTEM_OFFER_REJECTED":
      return resolveSystemOfferRejectedText(currentUserId === room.seller_id);
    case "SYSTEM_ORDER_COMPLETED":
      return "✅ 交易已順利完成";
    case "SYSTEM_ORDER_CANCELLED":
      return "❌ 此筆訂單已取消";
    default:
      return row.content;
  }
}

/** Lobby-only assembly — room list + preview text; messages load on room select. */
export function assembleDbChatLobbyRooms(
  rooms: DbChatRoomBaseRow[],
  lastMessages: DbChatMessageRow[],
  currentUserId: string,
): ChatRoom[] {
  const lastByRoom = new Map(lastMessages.map((message) => [message.room_id, message]));

  return rooms.map((room) => {
    const base = mapRoomToStore(room, [], currentUserId);
    const last = lastByRoom.get(room.id);
    if (!last) {
      return base;
    }

    return {
      ...base,
      lastMessage: mapLastMessagePreview(last, room, currentUserId),
      timestamp: last.created_at ?? base.timestamp,
      messages: [],
    };
  });
}

export function assembleDbChatThreadRoom(
  room: DbChatRoomBaseRow,
  messages: DbChatMessageRow[],
  offersById: Map<string, DbOfferSnippet>,
  currentUserId: string,
): ChatRoom {
  const hydratedMessages = messages.map((message) => ({
    ...message,
    offers: message.offer_id ? offersById.get(message.offer_id) ?? null : null,
  }));

  return mapRoomToStore(room, hydratedMessages, currentUserId);
}

export function assembleDbChatRooms(
  rooms: DbChatRoomBaseRow[],
  messages: DbChatMessageRow[],
  offersById: Map<string, DbOfferSnippet>,
  currentUserId: string,
): ChatRoom[] {
  const messagesByRoom = new Map<string, DbChatMessageRow[]>();

  for (const message of messages) {
    const hydrated: DbChatMessageRow = {
      ...message,
      offers: message.offer_id ? offersById.get(message.offer_id) ?? null : null,
    };
    const bucket = messagesByRoom.get(message.room_id) ?? [];
    bucket.push(hydrated);
    messagesByRoom.set(message.room_id, bucket);
  }

  return rooms.map((room) =>
    mapRoomToStore(
      room,
      messagesByRoom.get(room.id) ?? [],
      currentUserId,
    ),
  );
}

/** @deprecated use assembleDbChatRooms */
export function mapDbChatRoomsToStore(
  rows: DbChatRoomRow[],
  currentUserId: string,
): ChatRoom[] {
  return rows.map((room) =>
    mapRoomToStore(room, room.chat_messages ?? [], currentUserId),
  );
}
