import type { ChatPartnerPersona } from "@/app/lib/chat/partnerRoomKey";

export type ChatRoomPartyTuple = {
  buyerId: string;
  buyerPersona: ChatPartnerPersona;
  sellerId: string;
  sellerPersona: ChatPartnerPersona;
};

/** Matches rpc_ensure_chat_room bidirectional lookup orientation. */
export function buildEnsureChatRoomLookupTuples(
  viewerId: string,
  partnerId: string,
  viewerPersona: ChatPartnerPersona,
  partnerPersona: ChatPartnerPersona,
): ChatRoomPartyTuple[] {
  return [
    {
      buyerId: viewerId,
      buyerPersona: viewerPersona,
      sellerId: partnerId,
      sellerPersona: partnerPersona,
    },
    {
      buyerId: partnerId,
      buyerPersona: partnerPersona,
      sellerId: viewerId,
      sellerPersona: viewerPersona,
    },
  ];
}

export function chatRoomMatchesPartyTuple(
  room: ChatRoomPartyTuple,
  tuple: ChatRoomPartyTuple,
): boolean {
  return (
    room.buyerId === tuple.buyerId &&
    room.buyerPersona === tuple.buyerPersona &&
    room.sellerId === tuple.sellerId &&
    room.sellerPersona === tuple.sellerPersona
  );
}

export function findChatRoomByPartyTuples(
  rooms: ChatRoomPartyTuple[],
  viewerId: string,
  partnerId: string,
  viewerPersona: ChatPartnerPersona,
  partnerPersona: ChatPartnerPersona,
): ChatRoomPartyTuple | undefined {
  const candidates = buildEnsureChatRoomLookupTuples(
    viewerId,
    partnerId,
    viewerPersona,
    partnerPersona,
  );

  return rooms.find((room) =>
    candidates.some((tuple) => chatRoomMatchesPartyTuple(room, tuple)),
  );
}
