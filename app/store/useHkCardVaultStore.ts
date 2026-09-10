import { create } from "zustand";
import { buildPendingChatRoomId } from "@/app/lib/chat/constants";
import { filterChatRoomsForViewerPersona } from "@/app/lib/chat/filter-rooms-for-viewer-persona";
import { findRoomByPartnerId, mergeChatRoomsWithDb } from "@/app/lib/chat/mergeChatRooms";
import type { ChatPartnerPersona } from "@/app/lib/chat/partnerRoomKey";
import { partnerTierForPersona } from "@/app/lib/chat/partnerRoomKey";
import { generateDeterministicRoomId } from "@/app/lib/utils/chatUtils";
import { useUIStore } from "@/app/store/useUIStore";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/avatar";
import { shouldIncrementUnreadForInboundMessage } from "@/lib/chat/viewing-chat-thread";
import {
  resolveSystemOfferAcceptedText,
  resolveSystemOfferRejectedText,
} from "@/app/lib/chat/offerSystemMessageCopy";
import type { Tables } from "@/types/supabase";

type OfferLedgerStatus = Tables<"offers">["status"];

export type OfferLedgerEntry = {
  status: OfferLedgerStatus;
  memberOrderId?: string;
  merchantOrderId?: string;
  orderKind?: "member" | "merchant";
  offerPrice?: number;
  modifiedCount?: number;
  paymentHref?: string | null;
};

export interface SpecialTransactionData {
  cardName: string;
  cardId: string;
  listingId?: string;
  offerPrice: number;
  buyerName: string;
  buyerId: string;
  sellerId: string;
  sellerName: string;
  offerId?: string;
  modifiedCount?: number;
  imageUrl?: string;
  listingImageUrls?: string[];
  useAuthentication?: boolean;
  initialStatus?: "pending" | "accepted" | "rejected" | "countered";
}

export interface OrderCompletedData {
  orderId: string;
  orderKind?: "member" | "merchant";
}

export interface Message {
  id: string;
  sender: "me" | "them" | "system";
  text: string;
  timestamp: string;
  type?: "text" | "special_transaction" | "system_order_completed" | "system_order_cancelled";
  /** Present on SYSTEM_OFFER_* rows when the DB message carries offer_id */
  offerId?: string;
  specialData?: SpecialTransactionData;
  orderData?: OrderCompletedData;
}

export interface ChatRoom {
  id: string;
  partnerId: string;
  partnerPersona?: "member" | "merchant";
  /** Persona the current user uses in this room (not the counterparty). */
  viewerPersona?: "member" | "merchant";
  partnerName: string;
  partnerAvatarUrl: string;
  partnerTier: string;
  lastMessage: string;
  unreadCount: number;
  timestamp: string;
  messages: Message[];
  /** Set true after the first thread page is loaded for this room */
  threadHydrated?: boolean;
  /** Whether older messages remain to be loaded via scroll-up pagination */
  threadHasMoreOlder?: boolean;
}

function readActiveViewerPersona(): ChatPartnerPersona {
  return useUIStore.getState().activeListingPersona;
}

function isValidSpecialTransactionData(
  payload?: Partial<SpecialTransactionData>,
): payload is SpecialTransactionData {
  return Boolean(
    payload?.cardName &&
    payload.cardId &&
    payload.buyerName &&
    payload.sellerId &&
    Number.isFinite(payload.offerPrice),
  );
}

function createSpecialTransactionMessage(
  sender: Message["sender"],
  payload: SpecialTransactionData,
  customText?: string,
): Message {
  return {
    id: "MSG-TXN-" + Date.now(),
    sender,
    text:
      customText ||
      payload.buyerName + " offer price HK$ " + payload.offerPrice + " - " + payload.cardName + " (" + payload.cardId + ")",
    timestamp: new Date().toISOString(),
    type: "special_transaction",
    specialData: payload,
  };
}

function findRoomIdByOfferId(chats: ChatRoom[], offerId: string): string | null {
  for (const room of chats) {
    const hasOffer = room.messages.some(
      (message) =>
        message.type === "special_transaction" &&
        message.specialData?.offerId === offerId,
    );
    if (hasOffer) {
      return room.id;
    }
  }
  return null;
}

function mapInitialStatusToLedgerStatus(
  initialStatus: SpecialTransactionData["initialStatus"],
): OfferLedgerStatus {
  if (initialStatus === "accepted") return "accepted";
  if (initialStatus === "rejected") return "rejected";
  return "pending";
}

function isOfferAlreadyInStatus(
  offers: Record<string, OfferLedgerEntry>,
  chats: ChatRoom[],
  offerId: string,
  targetStatus: Extract<OfferLedgerStatus, "accepted" | "rejected">,
): boolean {
  if (offers[offerId]?.status === targetStatus) {
    return true;
  }

  for (const room of chats) {
    for (const message of room.messages) {
      if (
        message.type === "special_transaction" &&
        message.specialData?.offerId === offerId
      ) {
        if (targetStatus === "accepted" && message.specialData.initialStatus === "accepted") {
          return true;
        }
        if (targetStatus === "rejected" && message.specialData.initialStatus === "rejected") {
          return true;
        }
      }
    }
  }

  return false;
}

function buildOfferLedgerFromChats(
  chats: ChatRoom[],
): Record<string, OfferLedgerEntry> {
  const ledger: Record<string, OfferLedgerEntry> = {};

  for (const room of chats) {
    for (const message of room.messages) {
      if (
        message.type !== "special_transaction" ||
        !message.specialData?.offerId
      ) {
        continue;
      }

      const offerId = message.specialData.offerId;
      ledger[offerId] = {
        status: mapInitialStatusToLedgerStatus(
          message.specialData.initialStatus ?? "pending",
        ),
        offerPrice: message.specialData.offerPrice,
        modifiedCount: message.specialData.modifiedCount ?? 0,
      };
    }
  }

  return ledger;
}

interface HkCardVaultStore {
  isChatOpen: boolean;
  activeRoomId: string;
  mobileView: "LIST" | "CHAT";
  chats: ChatRoom[];
  offers: Record<string, OfferLedgerEntry>;

  setIsChatOpen: (open: boolean) => void;
  setActiveRoomId: (id: string) => void;
  setMobileView: (view: "LIST" | "CHAT") => void;
  setChats: (updater: ChatRoom[] | ((prev: ChatRoom[]) => ChatRoom[])) => void;

  /**
   * Opens the global chat console and navigates to the canonical deterministic room
   * derived from buyerId + sellerId via MD5 hash. Bi-directional symmetry is guaranteed:
   * openGlobalChat(A, B) and openGlobalChat(B, A) resolve to the exact same room.
   */
  openGlobalChat: (
    buyerId: string,
    buyerName: string,
    sellerId: string,
    sellerName: string,
    currentViewerRole: "BUYER" | "SELLER",
    injectOffer?: SpecialTransactionData,
  ) => void;

  /**
   * Legacy-compatible room activator for CustomEvent-driven nav paths.
   * Activates an existing room by its raw ID, or creates a minimal stub if not found.
   * Prefer openGlobalChat for new call sites where buyer/seller IDs are known.
   */
  activateRoomById: (
    roomId: string,
    partnerName: string,
    partnerId?: string,
  ) => void;

  /** Resolve an existing room by counterparty profile id + persona, or open a pending stub. */
  openChatWithPartner: (
    partnerId: string,
    partnerName: string,
    partnerPersona?: ChatPartnerPersona,
  ) => void;

  openOfferChatSession: (payload: {
    roomId: string;
    partnerId: string;
    partnerName: string;
    partnerPersona?: ChatPartnerPersona;
    buyerId: string;
    buyerName: string;
    sellerId: string;
    sellerName: string;
    cardName: string;
    cardId: string;
    listingId?: string;
    offerId: string;
    offerPrice: number;
    modifiedCount?: number;
    messageId: string;
    messageContent: string;
    messageCreatedAt: string;
    offerStatus: "pending" | "accepted" | "rejected" | "cancelled";
    useAuthentication?: boolean;
    imageUrl?: string;
    listingImageUrls?: string[];
  }) => void;

  applyOfferModification: (payload: {
    roomId: string;
    offerId: string;
    newPrice: number;
    modifiedCount: number;
    messageId: string;
    messageContent: string;
    messageCreatedAt?: string;
  }) => void;

  applyOfferAccepted: (
    offerId: string,
    orderId?: string,
    orderKind?: "member" | "merchant",
    paymentHref?: string | null,
  ) => void;

  applyOfferRejected: (offerId: string) => void;

  applyOfferPriceSync: (payload: {
    offerId: string;
    offerPrice: number;
    modifiedCount: number;
  }) => void;

  appendRoomMessage: (
    roomId: string,
    message: Message,
    options?: { countAsUnread?: boolean },
  ) => void;

  markRoomRead: (roomId: string) => void;

  finalizeOptimisticMessage: (
    roomId: string,
    optimisticId: string,
    confirmed: Message,
  ) => void;

  rollbackOptimisticMessage: (roomId: string, optimisticId: string) => void;

  reconcileOfferLedger: () => void;

  /** Replace a pending/ephemeral room stub with a persisted DB room row. */
  promotePendingChatRoom: (pendingRoomId: string, dbRoom: ChatRoom) => void;
}

export const useHkCardVaultStore = create<HkCardVaultStore>((set) => ({
  isChatOpen: false,
  activeRoomId: "",
  mobileView: "LIST",
  chats: [],
  offers: {},

  setIsChatOpen: (open) =>
    set((state) => {
      if (!open) {
        return { isChatOpen: false };
      }

      const hasActiveRoom = state.chats.some(
        (room) => room.id === state.activeRoomId,
      );

      return {
        isChatOpen: true,
        mobileView: hasActiveRoom ? state.mobileView : "LIST",
      };
    }),
  setActiveRoomId: (id) => set({ activeRoomId: id }),
  setMobileView: (view) => set({ mobileView: view }),
  setChats: (updater) =>
    set((state) => {
      const chats =
        typeof updater === "function" ? updater(state.chats) : updater;
      return {
        chats,
        offers: buildOfferLedgerFromChats(chats),
      };
    }),

  activateRoomById: (roomId, partnerName, partnerId) =>
    set((state) => {
      const resolvedPartnerId = partnerId?.trim() || "";
      const exists = state.chats.some((c) => c.id === roomId);
      if (exists) {
        return {
          activeRoomId: roomId,
          isChatOpen: true,
          mobileView: "CHAT" as const,
          chats: state.chats.map((c) =>
            c.id === roomId
              ? {
                  ...c,
                  unreadCount: 0,
                  ...(resolvedPartnerId ? { partnerId: resolvedPartnerId } : {}),
                }
              : c,
          ),
        };
      }
      const stub: ChatRoom = {
        id: roomId,
        partnerId: resolvedPartnerId || roomId,
        partnerPersona: "member",
        viewerPersona: readActiveViewerPersona(),
        partnerName,
        partnerAvatarUrl: DEFAULT_AVATAR_URL,
        partnerTier: "認證用戶",
        lastMessage: "已開啟對話",
        unreadCount: 0,
        timestamp: new Date().toISOString(),
        messages: [
          {
            id: "sys-" + Date.now(),
            sender: "system",
            text: "🔒 已建立與 " + partnerName + " 的安全對話通道。",
            timestamp: new Date().toISOString(),
          },
        ],
      };
      return {
        chats: [stub, ...state.chats],
        activeRoomId: roomId,
        isChatOpen: true,
        mobileView: "CHAT" as const,
      };
    }),

  openChatWithPartner: (partnerId, partnerName, partnerPersona = "member") =>
    set((state) => {
      const viewerPersona = readActiveViewerPersona();
      const scopedChats = filterChatRoomsForViewerPersona(
        state.chats,
        viewerPersona,
      );
      const existing = findRoomByPartnerId(
        scopedChats,
        partnerId,
        partnerPersona,
      );
      if (existing) {
        return {
          activeRoomId: existing.id,
          isChatOpen: true,
          mobileView: "CHAT" as const,
          chats: state.chats.map((c) =>
            c.id === existing.id ? { ...c, unreadCount: 0 } : c,
          ),
        };
      }

      const roomId = buildPendingChatRoomId(partnerId, partnerPersona);
      const stub: ChatRoom = {
        id: roomId,
        partnerId,
        partnerPersona,
        viewerPersona,
        partnerName,
        partnerAvatarUrl: DEFAULT_AVATAR_URL,
        partnerTier: partnerTierForPersona(partnerPersona),
        lastMessage: "已開啟對話",
        unreadCount: 0,
        timestamp: new Date().toISOString(),
        messages: [
          {
            id: "sys-" + Date.now(),
            sender: "system",
            text: "🔒 已建立與 " + partnerName + " 的安全對話通道。",
            timestamp: new Date().toISOString(),
          },
        ],
      };

      return {
        chats: [stub, ...state.chats],
        activeRoomId: roomId,
        isChatOpen: true,
        mobileView: "CHAT" as const,
      };
    }),

  openGlobalChat: (buyerId, buyerName, sellerId, sellerName, currentViewerRole, injectOffer) =>
    set((state) => {
      const buyerPersona: ChatPartnerPersona = "member";
      const sellerPersona: ChatPartnerPersona = "member";
      const canonicalRoomId = generateDeterministicRoomId(
        buyerId,
        buyerPersona,
        sellerId,
        sellerPersona,
      );
      const exists = state.chats.some((c) => c.id === canonicalRoomId);
      let updatedChats = [...state.chats];

      const partnerId = currentViewerRole === "SELLER" ? buyerId : sellerId;
      const partnerName = currentViewerRole === "SELLER" ? buyerName : sellerName;
      const partnerPersona =
        currentViewerRole === "SELLER" ? buyerPersona : sellerPersona;
      const partnerTier = partnerTierForPersona(partnerPersona);

      if (exists) {
        updatedChats = state.chats.map((room) => {
          if (room.id !== canonicalRoomId) return room;

          let currentMessages = [...room.messages];
          let currentLastMessage = room.lastMessage;

          if (isValidSpecialTransactionData(injectOffer)) {
            const hasOfferAlready = currentMessages.some(
              (m) =>
                m.type === "special_transaction" &&
                m.specialData?.cardId === injectOffer.cardId,
            );

            if (!hasOfferAlready) {
              const specialMsg = createSpecialTransactionMessage("them", {
                ...injectOffer,
                initialStatus: injectOffer.initialStatus || "pending",
              });
              currentMessages = [...currentMessages, specialMsg];
              currentLastMessage = specialMsg.text;
            }
          }

          return {
            ...room,
            partnerId,
            partnerName,
            partnerPersona,
            partnerTier,
            messages: currentMessages,
            lastMessage: currentLastMessage,
            unreadCount: 0,
          };
        });
      } else {
        const newSession: ChatRoom = {
          id: canonicalRoomId,
          partnerId,
          partnerPersona,
          viewerPersona: readActiveViewerPersona(),
          partnerName,
          partnerAvatarUrl: DEFAULT_AVATAR_URL,
          partnerTier,
          lastMessage: "已開啟即時議價對話",
          unreadCount: 0,
          timestamp: new Date().toISOString(),
          messages: [
            {
              id: "sys-" + Date.now(),
              sender: "system",
              text: "🔒 已建立與 " + partnerName + " 的安全交易對話通道。",
              timestamp: new Date().toISOString(),
            },
          ],
        };

        if (isValidSpecialTransactionData(injectOffer)) {
          const specialMsg = createSpecialTransactionMessage("them", {
            ...injectOffer,
            initialStatus: injectOffer.initialStatus || "pending",
          });
          newSession.messages.push(specialMsg);
          newSession.lastMessage = specialMsg.text;
        }

        updatedChats = [newSession, ...state.chats];
      }

      return {
        chats: updatedChats,
        activeRoomId: canonicalRoomId,
        isChatOpen: true,
        mobileView: "CHAT",
      };
    }),

  openOfferChatSession: (payload) =>
    set((state) => {
      const partnerPersona = payload.partnerPersona ?? "member";
      const modifiedCount = payload.modifiedCount ?? 0;
      const initialStatus: SpecialTransactionData["initialStatus"] =
        modifiedCount >= 1
          ? "countered"
          : payload.offerStatus === "accepted"
            ? "accepted"
            : payload.offerStatus === "rejected"
              ? "rejected"
              : "pending";

      const specialMsg: Message = {
        id: payload.messageId,
        sender: "me",
        text: payload.messageContent,
        timestamp: payload.messageCreatedAt,
        type: "special_transaction",
        specialData: {
          cardName: payload.cardName,
          cardId: payload.cardId,
          listingId: payload.listingId,
          offerPrice: payload.offerPrice,
          buyerName: payload.buyerName,
          buyerId: payload.buyerId,
          sellerId: payload.sellerId,
          sellerName: payload.sellerName,
          offerId: payload.offerId,
          modifiedCount,
          listingImageUrls: payload.listingImageUrls,
          imageUrl: payload.imageUrl,
          initialStatus,
          useAuthentication: payload.useAuthentication ?? false,
        },
      };

      const exists = state.chats.some((c) => c.id === payload.roomId);
      let updatedChats = [...state.chats];

      if (exists) {
        updatedChats = state.chats.map((room) => {
          if (room.id !== payload.roomId) return room;

          const hasOfferMsg = room.messages.some((m) => m.id === payload.messageId);

          return {
            ...room,
            partnerId: payload.partnerId,
            partnerName: payload.partnerName,
            partnerPersona,
            viewerPersona: "member",
            partnerTier: partnerTierForPersona(partnerPersona),
            lastMessage: specialMsg.text,
            unreadCount: 0,
            messages: hasOfferMsg ? room.messages : [...room.messages, specialMsg],
          };
        });
      } else {
        const newRoom: ChatRoom = {
          id: payload.roomId,
          partnerId: payload.partnerId,
          partnerPersona,
          viewerPersona: "member",
          partnerName: payload.partnerName,
          partnerAvatarUrl: DEFAULT_AVATAR_URL,
          partnerTier: partnerTierForPersona(partnerPersona),
          lastMessage: specialMsg.text,
          unreadCount: 0,
          timestamp: payload.messageCreatedAt,
          messages: [
            {
              id: "sys-" + payload.messageId,
              sender: "system",
              text: "🔒 已建立與 " + payload.partnerName + " 的安全交易對話通道。",
              timestamp: payload.messageCreatedAt,
            },
            specialMsg,
          ],
        };
        updatedChats = [newRoom, ...state.chats];
      }

      return {
        chats: updatedChats,
        activeRoomId: payload.roomId,
        isChatOpen: true,
        mobileView: "CHAT",
      };
    }),

  applyOfferModification: (payload) =>
    set((state) => {
      const roomId = payload.roomId;
      const nextOffers: Record<string, OfferLedgerEntry> = {
        ...state.offers,
        [payload.offerId]: {
          status: "pending",
          offerPrice: payload.newPrice,
          modifiedCount: payload.modifiedCount,
        },
      };

      return {
        offers: nextOffers,
        chats: state.chats.map((room) => {
          if (room.id !== roomId) return room;

          const hasNewMsg = room.messages.some(
            (message) => message.id === payload.messageId,
          );

          const updatedMessages = room.messages.map((message) => {
            if (
              message.type === "special_transaction" &&
              message.specialData?.offerId === payload.offerId
            ) {
              return {
                ...message,
                specialData: {
                  ...message.specialData,
                  offerPrice: payload.newPrice,
                  modifiedCount: payload.modifiedCount,
                  initialStatus: "countered" as const,
                },
              };
            }
            return message;
          });

          const modificationNotice: Message = {
            id: payload.messageId,
            sender: "me",
            text: payload.messageContent,
            timestamp: payload.messageCreatedAt ?? new Date().toISOString(),
            type: "text",
          };

          return {
            ...room,
            lastMessage: payload.messageContent,
            messages: hasNewMsg
              ? updatedMessages
              : [...updatedMessages, modificationNotice],
          };
        }),
      };
    }),

  applyOfferAccepted: (offerId, orderId, orderKind = "member", paymentHref) =>
    set((state) => {
      if (isOfferAlreadyInStatus(state.offers, state.chats, offerId, "accepted")) {
        return state;
      }

      const roomId = findRoomIdByOfferId(state.chats, offerId);
      const nextOffers: Record<string, OfferLedgerEntry> = {
        ...state.offers,
        [offerId]: {
          ...state.offers[offerId],
          status: "accepted",
          orderKind,
          ...(paymentHref !== undefined ? { paymentHref } : {}),
          ...(orderKind === "merchant"
            ? { merchantOrderId: orderId }
            : { memberOrderId: orderId }),
        },
      };

      if (!roomId) {
        return { offers: nextOffers };
      }

      return {
        offers: nextOffers,
        chats: state.chats.map((room) => {
          if (room.id !== roomId) return room;

          const updatedMessages = room.messages.map((message) => {
            if (
              message.type === "special_transaction" &&
              message.specialData?.offerId === offerId
            ) {
              return {
                ...message,
                specialData: {
                  ...message.specialData,
                  initialStatus: "accepted" as const,
                },
              };
            }
            return message;
          });

          const offerSpecialData = updatedMessages.find(
            (message) =>
              message.type === "special_transaction" &&
              message.specialData?.offerId === offerId,
          )?.specialData;
          const isSellerView =
            offerSpecialData != null &&
            room.partnerId === offerSpecialData.buyerId;

          return {
            ...room,
            lastMessage: resolveSystemOfferAcceptedText(isSellerView),
            messages: updatedMessages,
          };
        }),
      };
    }),

  applyOfferRejected: (offerId) =>
    set((state) => {
      if (isOfferAlreadyInStatus(state.offers, state.chats, offerId, "rejected")) {
        return state;
      }

      const roomId = findRoomIdByOfferId(state.chats, offerId);
      const nextOffers: Record<string, OfferLedgerEntry> = {
        ...state.offers,
        [offerId]: {
          ...state.offers[offerId],
          status: "rejected",
        },
      };

      if (!roomId) {
        return { offers: nextOffers };
      }

      return {
        offers: nextOffers,
        chats: state.chats.map((room) => {
          if (room.id !== roomId) return room;

          const updatedMessages = room.messages.map((message) => {
            if (
              message.type === "special_transaction" &&
              message.specialData?.offerId === offerId
            ) {
              return {
                ...message,
                specialData: {
                  ...message.specialData,
                  initialStatus: "rejected" as const,
                },
              };
            }
            return message;
          });

          const offerSpecialData = updatedMessages.find(
            (message) =>
              message.type === "special_transaction" &&
              message.specialData?.offerId === offerId,
          )?.specialData;
          const isSellerView =
            offerSpecialData != null &&
            room.partnerId === offerSpecialData.buyerId;

          return {
            ...room,
            lastMessage: resolveSystemOfferRejectedText(isSellerView),
            messages: updatedMessages,
          };
        }),
      };
    }),

  applyOfferPriceSync: (payload) =>
    set((state) => {
      const roomId = findRoomIdByOfferId(state.chats, payload.offerId);
      const nextOffers: Record<string, OfferLedgerEntry> = {
        ...state.offers,
        [payload.offerId]: {
          ...state.offers[payload.offerId],
          status: state.offers[payload.offerId]?.status ?? "pending",
          offerPrice: payload.offerPrice,
          modifiedCount: payload.modifiedCount,
        },
      };

      if (!roomId) {
        return { offers: nextOffers };
      }

      return {
        offers: nextOffers,
        chats: state.chats.map((room) => {
          if (room.id !== roomId) return room;

          return {
            ...room,
            messages: room.messages.map((message) => {
              if (
                message.type === "special_transaction" &&
                message.specialData?.offerId === payload.offerId
              ) {
                return {
                  ...message,
                  specialData: {
                    ...message.specialData,
                    offerPrice: payload.offerPrice,
                    modifiedCount: payload.modifiedCount,
                    initialStatus: "countered" as const,
                  },
                };
              }
              return message;
            }),
          };
        }),
      };
    }),

  appendRoomMessage: (roomId, message, options) =>
    set((state) => {
      const viewState = {
        isChatOpen: state.isChatOpen,
        activeRoomId: state.activeRoomId,
        mobileView: state.mobileView,
      };
      const shouldIncrementUnread =
        options?.countAsUnread === true ||
        shouldIncrementUnreadForInboundMessage(
          viewState,
          roomId,
          message.sender,
        );

      const chats = state.chats.map((room) => {
        if (room.id !== roomId) return room;

        const existingIndex = room.messages.findIndex(
          (existing) => existing.id === message.id,
        );
        if (existingIndex !== -1) {
          const messages = [...room.messages];
          messages[existingIndex] = message;
          return {
            ...room,
            messages,
            lastMessage: message.text,
            timestamp: message.timestamp,
          };
        }

        const lastMessage = room.messages.at(-1);
        const messageTime = new Date(message.timestamp).getTime();
        const lastTime = lastMessage
          ? new Date(lastMessage.timestamp).getTime()
          : 0;
        const messages =
          !lastMessage || messageTime >= lastTime
            ? [...room.messages, message]
            : [...room.messages, message].sort(
                (a, b) =>
                  new Date(a.timestamp).getTime() -
                  new Date(b.timestamp).getTime(),
              );

        return {
          ...room,
          messages,
          lastMessage: message.text,
          timestamp: message.timestamp,
          unreadCount: shouldIncrementUnread
            ? room.unreadCount + 1
            : room.unreadCount,
        };
      });

      return {
        chats,
        offers: buildOfferLedgerFromChats(chats),
      };
    }),

  markRoomRead: (roomId) =>
    set((state) => ({
      chats: state.chats.map((room) =>
        room.id === roomId ? { ...room, unreadCount: 0 } : room,
      ),
    })),

  finalizeOptimisticMessage: (roomId, optimisticId, confirmed) =>
    set((state) => ({
      chats: state.chats.map((room) => {
        if (room.id !== roomId) return room;

        const withoutOptimistic = room.messages.filter(
          (message) => message.id !== optimisticId,
        );
        const existingIndex = withoutOptimistic.findIndex(
          (message) => message.id === confirmed.id,
        );
        const messages =
          existingIndex === -1
            ? [...withoutOptimistic, confirmed].sort(
                (a, b) =>
                  new Date(a.timestamp).getTime() -
                  new Date(b.timestamp).getTime(),
              )
            : withoutOptimistic.map((message, index) =>
                index === existingIndex ? confirmed : message,
              );

        return {
          ...room,
          messages,
          lastMessage: confirmed.text,
          timestamp: confirmed.timestamp,
        };
      }),
    })),

  rollbackOptimisticMessage: (roomId, optimisticId) =>
    set((state) => ({
      chats: state.chats.map((room) => {
        if (room.id !== roomId) return room;

        const messages = room.messages.filter(
          (message) => message.id !== optimisticId,
        );
        const lastMessage = messages.at(-1)?.text ?? room.lastMessage ?? "";

        return {
          ...room,
          messages,
          lastMessage,
        };
      }),
    })),

  promotePendingChatRoom: (pendingRoomId, dbRoom) =>
    set((state) => {
      const pendingStub = state.chats.find((room) => room.id === pendingRoomId);
      const chatsWithoutPending = state.chats.filter(
        (room) => room.id !== pendingRoomId,
      );

      const dbRoomWithStubMessages =
        pendingStub && dbRoom.messages.length === 0 && pendingStub.messages.length > 0
          ? {
              ...dbRoom,
              messages: pendingStub.messages,
              lastMessage: pendingStub.lastMessage,
              timestamp: pendingStub.timestamp,
            }
          : dbRoom;

      const chats = mergeChatRoomsWithDb(chatsWithoutPending, [dbRoomWithStubMessages], {
        preferServerUnread: true,
      });

      return {
        chats,
        activeRoomId: dbRoom.id,
        offers: buildOfferLedgerFromChats(chats),
      };
    }),

  reconcileOfferLedger: () =>
    set((state) => ({
      offers: buildOfferLedgerFromChats(state.chats),
    })),
}));
