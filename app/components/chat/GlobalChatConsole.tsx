"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
  useMemo,
  memo,
} from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { IoChevronBack, IoSearchOutline } from "react-icons/io5";
import { toast } from "sonner";
import { sendMessage } from "@/app/actions/chat";
import { refreshInboxLobbyInStore } from "@/lib/chat/refresh-inbox-lobby";
import { isAmlSensitiveChatContent } from "@/app/lib/chat/realtimeChatMessages";
import { filterRedundantOfferSystemMessages } from "@/app/lib/chat/filterRedundantOfferSystemMessages";
import { isDbChatRoomId } from "@/app/lib/chat/constants";
import { ChatUnreadDotInline } from "@/app/components/chat/ChatUnreadDot";
import { SpecialTransactionMessage } from "./SpecialTransactionMessage";
import { SystemOrderCompletedMessage } from "./SystemOrderCompletedMessage";
import { SystemOrderCancelledMessage } from "./SystemOrderCancelledMessage";
import {
  useHkCardVaultStore,
  type Message,
  type OfferLedgerEntry,
} from "@/app/store/useHkCardVaultStore";
import { useShallow } from "zustand/react/shallow";
import { useCurrentUserId } from "@/app/lib/hooks/useCurrentUserId";
import { useRoomReviewedOrderIds } from "@/app/lib/hooks/useRoomReviewedOrderIds";
import { useChatThreadPagination } from "@/app/lib/hooks/useChatThreadPagination";
import { useIsDesktopChat } from "@/app/lib/hooks/useIsDesktopChat";
import {
  formatMessageTime,
  getDateSeparatorLabel,
} from "@/app/lib/utils/chatUtils";
import { IoMdCheckboxOutline } from "react-icons/io";

import Link from "next/link";
import { ProfileAvatar } from "@/app/components/profile/ProfileAvatar";
import { findRoomByPartnerId, findRoomByPartnerName } from "@/app/lib/chat/mergeChatRooms";
import type { ChatPartnerPersona } from "@/app/lib/chat/partnerRoomKey";
import { inferPartnerPersona, isProfileUuid } from "@/app/lib/chat/partnerRoomKey";
import { CertifiedMerchantBadge } from "@/app/components/profile/CertifiedMerchantBadge";
import { filterChatRoomsForViewerPersona } from "@/app/lib/chat/filter-rooms-for-viewer-persona";
import { useUIStore } from "@/app/store/useUIStore";

const ReviewModal = dynamic(
  () =>
    import("@/app/components/trading/ReviewModal").then(
      (module) => module.ReviewModal,
    ),
  { ssr: false },
);

const UserReportModal = dynamic(
  () =>
    import("@/app/components/report/UserReportModal").then(
      (module) => module.UserReportModal,
    ),
  { ssr: false },
);

export type { Message };

export interface ChatRoom {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerAvatarUrl: string;
  partnerTier: string;
  lastMessage: string;
  unreadCount: number;
  timestamp: string;
  messages: Message[];
}

function hasRenderableSpecialData(
  specialData: Message["specialData"],
): specialData is NonNullable<Message["specialData"]> {
  return Boolean(
    specialData?.cardName &&
    specialData.cardId &&
    specialData.buyerName &&
    specialData.buyerId &&
    specialData.sellerId &&
    specialData.sellerName &&
    Number.isFinite(specialData.offerPrice),
  );
}

// Day-separator HUD pill chip
function DateSeparatorChip({ label }: { label: string }) {
  return (
    <div className="flex justify-center my-3">
      <span className="mx-auto px-2.5 py-0.5 rounded-full bg-[#26211C] border border-white/5 font-mono text-[10px] text-text-disabled tracking-wider select-none uppercase inline-block text-center">
        {label}
      </span>
    </div>
  );
}

// Inline micro-timestamp adjacent to a message bubble
function MicroTimestamp({
  timestamp,
  isMe,
}: {
  timestamp: string;
  isMe: boolean;
}) {
  const label = formatMessageTime(timestamp);
  return (
    <span
      className={
        "font-mono text-[9.5px] text-text-disabled/60 self-end px-1.5 pb-0.5 select-none" +
        (isMe ? " order-first" : " order-last")
      }
    >
      {label}
    </span>
  );
}

function AntiScamDisclaimer() {
  return (
    <div className="bg-[#1A1612] px-4 py-2 border-t border-[rgba(237,232,224,0.05)] text-left shrink-0 select-none">
      <p className="font-sans text-[10.5px] leading-normal text-[#8A8680] tracking-tight">
        <span className="text-brand font-black mr-1">🛡️ 安全聲明：</span>
        交易由雙方自願進行；因交易產生的損失，平台不負法律責任及賠償義務。平台外溝通所致的任何損失，平台概不負責；請於平台內進行交易溝通。
      </p>
    </div>
  );
}

/**
 * Builds a list of render items interleaved with date separator nodes.
 * A separator is only injected when the calendar date of a message differs
 * from the previous message in the thread.
 */
function buildMessageRenderList(messages: Message[]) {
  const visibleMessages = filterRedundantOfferSystemMessages(messages);
  const items: Array<
    { type: "separator"; label: string } | { type: "message"; msg: Message }
  > = [];
  let lastDateKey = "";

  for (const msg of visibleMessages) {
    try {
      const d = new Date(msg.timestamp);
      if (!isNaN(d.getTime())) {
        const dateKey =
          d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
        if (dateKey !== lastDateKey) {
          lastDateKey = dateKey;
          items.push({
            type: "separator",
            label: getDateSeparatorLabel(msg.timestamp),
          });
        }
      }
    } catch {
      // malformed timestamp: skip separator
    }
    items.push({ type: "message", msg });
  }
  return items;
}

type RenderItem = ReturnType<typeof buildMessageRenderList>[number];

type MessageThreadProps = {
  renderList: RenderItem[];
  currentUserId: string | null;
  activeRoomId: string;
  partnerId: string;
  partnerName: string;
  roomMessages: Message[];
  offers: Record<string, OfferLedgerEntry>;
  onOpenReview: (orderId: string, revieweeId: string) => void;
  reviewedOrderIds: ReadonlySet<string> | null;
  isReviewLoading: boolean;
};

function renderOrderCancelledCard(
  msg: Message,
  partnerName: string,
  maxWidthClass: string,
) {
  if (msg.type !== "system_order_cancelled") {
    return null;
  }

  return (
    <div
      key={msg.id}
      className={`w-full flex justify-center ${maxWidthClass} mx-auto animate-fadeIn`}
    >
      <SystemOrderCancelledMessage
        orderId={msg.orderData?.orderId}
        orderKind={msg.orderData?.orderKind}
        partnerName={partnerName}
      />
    </div>
  );
}

function renderOrderCompletedCard(
  msg: Message,
  partnerId: string,
  partnerName: string,
  roomId: string,
  roomMessages: Message[],
  offers: Record<string, OfferLedgerEntry>,
  onOpenReview: (orderId: string, revieweeId: string) => void,
  maxWidthClass: string,
  reviewedOrderIds: ReadonlySet<string> | null,
  isReviewLoading: boolean,
) {
  if (msg.type !== "system_order_completed") {
    return null;
  }

  const orderId = msg.orderData?.orderId;

  return (
    <div
      key={msg.id}
      className={`w-full flex justify-center ${maxWidthClass} mx-auto animate-fadeIn`}
    >
      <SystemOrderCompletedMessage
        messageId={msg.id}
        roomId={roomId}
        roomMessages={roomMessages}
        offers={offers}
        orderId={orderId}
        revieweeId={partnerId}
        partnerName={partnerName}
        reviewedOrderIds={reviewedOrderIds}
        isReviewLoading={isReviewLoading}
        onOpenReview={onOpenReview}
      />
    </div>
  );
}

// Desktop message thread — compact bubbles (12.5px, 75% max-width)
const MessageThread = memo(function MessageThread({
  renderList,
  currentUserId,
  activeRoomId,
  partnerId,
  partnerName,
  roomMessages,
  offers,
  onOpenReview,
  reviewedOrderIds,
  isReviewLoading,
}: MessageThreadProps) {
  return (
    <>
      {renderList.map((item, idx) => {
        if (item.type === "separator") {
          return <DateSeparatorChip key={"sep-" + idx} label={item.label} />;
        }

        const msg = item.msg;

        const orderCancelledCard = renderOrderCancelledCard(
          msg,
          partnerName,
          "max-w-[90%]",
        );
        if (orderCancelledCard) {
          return orderCancelledCard;
        }

        const orderCompletedCard = renderOrderCompletedCard(
          msg,
          partnerId,
          partnerName,
          activeRoomId,
          roomMessages,
          offers,
          onOpenReview,
          "max-w-[90%]",
          reviewedOrderIds,
          isReviewLoading,
        );
        if (orderCompletedCard) {
          return orderCompletedCard;
        }

        if (
          msg.type === "special_transaction" &&
          hasRenderableSpecialData(msg.specialData)
        ) {
          if (!msg.specialData.offerId) {
            return null;
          }

          return (
            <div
              key={msg.id}
              className="w-full flex justify-start max-w-[90%] animate-fadeIn"
            >
              <SpecialTransactionMessage
                msgId={msg.id}
                buyerName={msg.specialData.buyerName}
                buyerId={msg.specialData.buyerId}
                sellerId={msg.specialData.sellerId}
                sellerName={msg.specialData.sellerName}
                cardName={msg.specialData.cardName}
                cardId={msg.specialData.cardId}
                listingId={msg.specialData.listingId}
                offerId={msg.specialData.offerId}
                imageUrl={msg.specialData.imageUrl}
                listingImageUrls={msg.specialData.listingImageUrls}
                offerPrice={msg.specialData.offerPrice}
                initialModifiedCount={msg.specialData.modifiedCount ?? 0}
                useAuthentication={msg.specialData.useAuthentication}
                initialStatus={msg.specialData.initialStatus || "pending"}
                isMe={msg.sender === "me"}
                currentUserId={currentUserId}
                roomId={activeRoomId}
              />
            </div>
          );
        }

        const isMe = msg.sender === "me";

        if (msg.sender === "system") {
          return (
            <div key={msg.id} className="flex justify-center my-1">
              <span className="font-mono text-[10px] text-text-disabled/70 bg-[#26211C]/60 px-3 py-1 rounded-full border border-white/[0.04] select-none text-center">
                {msg.text}
              </span>
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={
              "flex w-full items-end gap-1 " +
              (isMe ? "justify-end" : "justify-start")
            }
          >
            {isMe && <MicroTimestamp timestamp={msg.timestamp} isMe={true} />}
            <div className="max-w-[75%]">
              <div
                className={
                  "px-3 py-1.5 rounded-xl font-sans text-[12.5px] inline-block shadow-sm leading-snug " +
                  (isMe
                    ? "bg-brand text-[#17130f] font-medium"
                    : "bg-[#26211C] text-text-primary border border-[rgba(237,232,224,0.04)]")
                }
              >
                {msg.text}
              </div>
            </div>
            {!isMe && <MicroTimestamp timestamp={msg.timestamp} isMe={false} />}
          </div>
        );
      })}
    </>
  );
});

// Mobile message thread — larger bubbles (13px, rounded-2xl)
const MobileMessageThread = memo(function MobileMessageThread({
  renderList,
  currentUserId,
  activeRoomId,
  partnerId,
  partnerName,
  roomMessages,
  offers,
  onOpenReview,
  reviewedOrderIds,
  isReviewLoading,
}: MessageThreadProps) {
  return (
    <>
      {renderList.map((item, idx) => {
        if (item.type === "separator") {
          return <DateSeparatorChip key={"sep-m-" + idx} label={item.label} />;
        }

        const msg = item.msg;

        const orderCancelledCard = renderOrderCancelledCard(
          msg,
          partnerName,
          "max-w-[90%]",
        );
        if (orderCancelledCard) {
          return orderCancelledCard;
        }

        const orderCompletedCard = renderOrderCompletedCard(
          msg,
          partnerId,
          partnerName,
          activeRoomId,
          roomMessages,
          offers,
          onOpenReview,
          "max-w-[90%]",
          reviewedOrderIds,
          isReviewLoading,
        );
        if (orderCompletedCard) {
          return orderCompletedCard;
        }

        if (
          msg.type === "special_transaction" &&
          hasRenderableSpecialData(msg.specialData)
        ) {
          if (!msg.specialData.offerId) {
            return null;
          }

          return (
            <div
              key={msg.id}
              className="w-full flex justify-start max-w-[95%] animate-fadeIn"
            >
              <SpecialTransactionMessage
                msgId={msg.id}
                buyerName={msg.specialData.buyerName}
                buyerId={msg.specialData.buyerId}
                sellerId={msg.specialData.sellerId}
                sellerName={msg.specialData.sellerName}
                cardName={msg.specialData.cardName}
                cardId={msg.specialData.cardId}
                listingId={msg.specialData.listingId}
                offerId={msg.specialData.offerId}
                imageUrl={msg.specialData.imageUrl}
                listingImageUrls={msg.specialData.listingImageUrls}
                offerPrice={msg.specialData.offerPrice}
                initialModifiedCount={msg.specialData.modifiedCount ?? 0}
                useAuthentication={msg.specialData.useAuthentication}
                initialStatus={msg.specialData.initialStatus || "pending"}
                isMe={msg.sender === "me"}
                currentUserId={currentUserId}
                roomId={activeRoomId}
              />
            </div>
          );
        }

        const isMe = msg.sender === "me";

        if (msg.sender === "system") {
          return (
            <div key={msg.id} className="flex justify-center my-1">
              <span className="font-mono text-[10px] text-text-disabled/70 bg-[#26211C]/60 px-3 py-1 rounded-full border border-white/[0.04] select-none text-center">
                {msg.text}
              </span>
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={
              "flex w-full items-end gap-1 " +
              (isMe ? "justify-end" : "justify-start")
            }
          >
            {isMe && <MicroTimestamp timestamp={msg.timestamp} isMe={true} />}
            <div
              className={
                "px-4 py-2 rounded-2xl font-sans text-[13px] " +
                (isMe
                  ? "bg-brand text-[#17130f]"
                  : "bg-[#26211C] text-text-primary")
              }
            >
              {msg.text}
            </div>
            {!isMe && <MicroTimestamp timestamp={msg.timestamp} isMe={false} />}
          </div>
        );
      })}
    </>
  );
});

function ChatLobbyLoadingRows() {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <div
          key={"chat-lobby-loading-" + index}
          className="w-full p-2 rounded-xl flex items-center gap-2 animate-pulse"
          aria-hidden="true"
        >
          <div className="w-7 h-7 rounded-full bg-[#26211C] shrink-0" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="h-3 w-2/3 rounded bg-[#26211C]" />
            <div className="h-2.5 w-1/2 rounded bg-[#26211C]/70" />
          </div>
        </div>
      ))}
      <p className="font-mono text-[10px] text-text-disabled text-center pt-1 select-none">
        載入對話中…
      </p>
    </>
  );
}

function ChatLobbyRefreshingHint() {
  return (
    <p className="font-mono text-[10px] text-text-disabled text-center py-1 select-none">
      更新中…
    </p>
  );
}

function SpawnPersonaToggle({
  value,
  onChange,
}: {
  value: ChatPartnerPersona;
  onChange: (persona: ChatPartnerPersona) => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => onChange("member")}
        className={
          value === "member"
            ? "font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#3b9eff]/40 text-[#3b9eff] bg-[#3b9eff]/10"
            : "font-mono text-[9px] px-1.5 py-0.5 rounded border border-white/10 text-text-disabled"
        }
      >
        會員
      </button>
      <button
        type="button"
        onClick={() => onChange("merchant")}
        className={
          value === "merchant"
            ? "font-mono text-[9px] px-1.5 py-0.5 rounded border border-brand/40 text-brand bg-brand/10"
            : "font-mono text-[9px] px-1.5 py-0.5 rounded border border-white/10 text-text-disabled"
        }
      >
        商家
      </button>
    </div>
  );
}

function ChatLobbyEmptyState({
  variant,
}: {
  variant: "no-rooms" | "no-search-results";
}) {
  if (variant === "no-rooms") {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
        <p className="font-sans text-[12px] text-text-secondary select-none">
          尚無對話
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
      <p className="font-sans text-[12px] text-text-secondary select-none">
        找不到相關對話
      </p>
    </div>
  );
}

type GlobalChatConsoleProps = {
  inboxLoading?: boolean;
  isLobbyRefreshing?: boolean;
  threadLoadingRoomId?: string | null;
  isProvisioningRoom?: boolean;
};

export function GlobalChatConsole({
  inboxLoading = false,
  isLobbyRefreshing = false,
  threadLoadingRoomId = null,
  isProvisioningRoom = false,
}: GlobalChatConsoleProps) {
  const {
    isChatOpen,
    setIsChatOpen,
    chats,
    offers,
    activeRoomId,
    setActiveRoomId,
    mobileView,
    setMobileView,
    openChatWithPartner,
    appendRoomMessage,
    finalizeOptimisticMessage,
    rollbackOptimisticMessage,
  } = useHkCardVaultStore(
    useShallow((state) => ({
      isChatOpen: state.isChatOpen,
      setIsChatOpen: state.setIsChatOpen,
      chats: state.chats,
      offers: state.offers,
      activeRoomId: state.activeRoomId,
      setActiveRoomId: state.setActiveRoomId,
      mobileView: state.mobileView,
      setMobileView: state.setMobileView,
      openChatWithPartner: state.openChatWithPartner,
      appendRoomMessage: state.appendRoomMessage,
      finalizeOptimisticMessage: state.finalizeOptimisticMessage,
      rollbackOptimisticMessage: state.rollbackOptimisticMessage,
    })),
  );

  const currentUserId = useCurrentUserId();
  const isDesktopChat = useIsDesktopChat();
  const activeListingPersona = useUIStore((state) => state.activeListingPersona);
  const onClose = useCallback(() => setIsChatOpen(false), [setIsChatOpen]);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const [composerByRoomId, setComposerByRoomId] = useState<
    Record<string, string>
  >({});
  const sendInFlightRef = useRef(false);
  const [activeReview, setActiveReview] = useState<{
    orderId: string;
    revieweeId: string;
  } | null>(null);
  const [submittedReviewOrderIds, setSubmittedReviewOrderIds] = useState<
    Set<string>
  >(() => new Set());
  const [lobbySearchQuery, setLobbySearchQuery] = useState("");
  const [isNewChatComboOpen, setIsNewChatComboOpen] = useState(false);
  const [targetUsername, setTargetUsername] = useState("");
  const [spawnPersona, setSpawnPersona] = useState<ChatPartnerPersona>("member");
  const desktopConsoleRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleOpenReview = useCallback(
    (orderId: string, revieweeId: string) => {
      setActiveReview({ orderId, revieweeId });
    },
    [],
  );

  const handleCloseReview = useCallback(() => {
    setActiveReview(null);
  }, []);

  const handleReviewSubmitted = useCallback((orderId: string) => {
    setSubmittedReviewOrderIds((current) => {
      const next = new Set(current);
      next.add(orderId);
      return next;
    });
  }, []);

  const handleSpawnChat = useCallback(() => {
    if (!targetUsername.trim()) return;

    const trimmedUsername = targetUsername.trim();
    const partnerLookupId = isProfileUuid(trimmedUsername)
      ? trimmedUsername
      : trimmedUsername.toLowerCase();

    const viewerChats = filterChatRoomsForViewerPersona(
      chats,
      activeListingPersona,
    );
    const existingRoom =
      findRoomByPartnerId(viewerChats, partnerLookupId, spawnPersona) ??
      findRoomByPartnerName(viewerChats, trimmedUsername, spawnPersona);

    if (existingRoom) {
      setActiveRoomId(existingRoom.id);
      setIsNewChatComboOpen(false);
      setTargetUsername("");
      setMobileView("CHAT");
      toast.success(`已切換至與 ${existingRoom.partnerName} 的對話`);
    } else {
      openChatWithPartner(partnerLookupId, trimmedUsername, spawnPersona);
      setIsNewChatComboOpen(false);
      setTargetUsername("");
      setMobileView("CHAT");
      toast.success(`成功與 ${trimmedUsername} 建立新對話通道`);
    }
  }, [
    targetUsername,
    chats,
    activeListingPersona,
    spawnPersona,
    setActiveRoomId,
    openChatWithPartner,
    setMobileView,
  ]);

  const reportButtonClass =
    "flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-red-400/90 transition-colors font-sans hover:text-red-400 cursor-pointer select-none focus:outline-none";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as HTMLElement;
      if (!target || !document.body.contains(target)) return;
      if (target.closest('[data-chat-console="true"]')) return;

      if (
        target.closest('[role="alertdialog"]') ||
        target.closest("[data-radix-portal]") ||
        target.closest('[role="listbox"]')
      ) {
        return;
      }

      if (
        isDesktopChat &&
        desktopConsoleRef.current &&
        !desktopConsoleRef.current.contains(target)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isChatOpen, isDesktopChat, onClose]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const activeRoomMessageCount =
    chats.find((room) => room.id === activeRoomId)?.messages.length ?? 0;

  const inputText = composerByRoomId[activeRoomId] ?? "";
  const setInputText = useCallback(
    (text: string) => {
      setComposerByRoomId((current) => ({
        ...current,
        [activeRoomId]: text,
      }));
    },
    [activeRoomId],
  );

  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const personaLobbyRooms = useMemo(
    () => filterChatRoomsForViewerPersona(chats, activeListingPersona),
    [activeListingPersona, chats],
  );

  const filteredLobbyRooms = useMemo(() => {
    return personaLobbyRooms.filter((room) =>
      room.partnerName.toLowerCase().includes(lobbySearchQuery.toLowerCase()),
    );
  }, [lobbySearchQuery, personaLobbyRooms]);

  const showLobbySkeleton =
    inboxLoading && filteredLobbyRooms.length === 0;

  const lobbyEmptyVariant =
    personaLobbyRooms.length === 0 ? "no-rooms" : "no-search-results";

  const showLobbyEmptyState =
    !showLobbySkeleton && filteredLobbyRooms.length === 0;

  const activeRoom = useMemo(
    () => chats.find((room) => room.id === activeRoomId) ?? null,
    [activeRoomId, chats],
  );

  const chatPartnerProfileHref = activeRoom
    ? `/profile/${activeRoom.partnerId}?persona=${inferPartnerPersona(activeRoom)}`
    : "#";

  const handleChatPartnerProfileClick = useCallback(() => {
    if (!isDesktopChat) {
      setIsChatOpen(false);
    }
  }, [isDesktopChat, setIsChatOpen]);

  const { reviewedOrderIds, isReviewLoading } = useRoomReviewedOrderIds(
    activeRoom?.messages ?? [],
    offers,
    submittedReviewOrderIds,
  );

  const fullRenderList = useMemo(
    () => buildMessageRenderList(activeRoom?.messages ?? []),
    [activeRoom?.messages],
  );

  const renderList = fullRenderList;

  const isThreadLoading =
    Boolean(activeRoomId) && threadLoadingRoomId === activeRoomId;

  const { loadingOlder, handleScroll, showAllHistoryLoaded, topSentinelRef, bottomAnchorRef } =
    useChatThreadPagination({
      scrollRef,
      activeRoomId,
      activeRoom,
      isThreadLoading,
      isChatOpen,
      messageCount: activeRoomMessageCount,
      threadHydrated: activeRoom?.threadHydrated === true,
    });

  useEffect(() => {
    if (!isChatOpen || activeRoom || mobileView !== "CHAT") {
      return;
    }

    setMobileView("LIST");
  }, [activeRoom, isChatOpen, mobileView, setMobileView]);

  if (!isMounted) return null;
  if (!isChatOpen) return null;

  const canPersistMessages = Boolean(activeRoom) && isDbChatRoomId(activeRoomId);
  const composerPlaceholder = !activeRoom
    ? "請先選擇對話…"
    : isProvisioningRoom
      ? "正在建立對話…"
      : canPersistMessages
        ? "回覆給 " + activeRoom.partnerName + "..."
        : "等待對話同步…";

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || sendInFlightRef.current) return;

    if (!canPersistMessages) {
      toast.error("對話尚未建立，請等待同步或透過出價/個人檔案開啟對話");
      return;
    }

    const optimisticId = `opt-${Date.now()}`;
    const sentAt = new Date().toISOString();
    const optimisticMsg: Message = {
      id: optimisticId,
      sender: "me",
      text,
      timestamp: sentAt,
      type: "text",
    };

    setInputText("");
    appendRoomMessage(activeRoomId, optimisticMsg);

    sendInFlightRef.current = true;

    void sendMessage(activeRoomId, text)
      .then((result) => {
        if (!result.success) {
          rollbackOptimisticMessage(activeRoomId, optimisticId);
          toast.error(result.error);
          setInputText(text);
          return;
        }

        const { data } = result;
        const isSystemWarning =
          data.isSystemWarning || isAmlSensitiveChatContent(data.content);
        finalizeOptimisticMessage(activeRoomId, optimisticId, {
          id: data.id,
          sender: isSystemWarning ? "system" : "me",
          text: data.content,
          timestamp: data.createdAt,
          type: "text",
        });
        void refreshInboxLobbyInStore();
      })
      .catch((error) => {
        const msg =
          error instanceof Error ? error.message : "發送訊息時發生錯誤";
        toast.error(msg);
        rollbackOptimisticMessage(activeRoomId, optimisticId);
        setInputText(text);
      })
      .finally(() => {
        sendInFlightRef.current = false;
      });
  };

  const chatConsoleLayer = isDesktopChat ? (
      <motion.div
        ref={desktopConsoleRef}
        data-chat-console="true"
        initial={false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.98 }}
        className="flex fixed bottom-6 right-6 z-[500] w-[640px] h-[460px] bg-[#17130f] border border-[rgba(237,232,224,0.12)] rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.8)] overflow-hidden"
      >
          {/* Left column: room list */}
          <div className="w-[200px] border-r border-[rgba(237,232,224,0.06)] bg-[#1A1612] flex flex-col">
            <div className="p-3 border-b border-[rgba(237,232,224,0.06)] shrink-0 flex items-center justify-between gap-1.5 h-12">
              <div className="flex-1 flex items-center gap-1 overflow-hidden">
                {!isNewChatComboOpen ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsNewChatComboOpen((prev) => !prev)}
                      className="flex flex-row gap-1 p-1 hover:bg-[#26211C] rounded transition-colors text-brand flex items-center justify-center shrink-0 focus:outline-none"
                      title="新建對話"
                    >
                      <svg
                        className="w-4 h-4 text-brand"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                      <span className="font-mono text-sm text-brand">
                        新增聊天
                      </span>
                    </button>
                  </>
                ) : (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: "auto", opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="flex items-center gap-1 flex-1 min-w-0"
                  >
                    <input
                      type="text"
                      value={targetUsername}
                      onChange={(e) => setTargetUsername(e.target.value)}
                      placeholder="搜尋/輸入用戶..."
                      className="w-full min-w-0 bg-[#17130f] border border-white/10 rounded px-1.5 py-0.5 font-sans text-[10.5px] text-text-primary placeholder:text-[#50453b] focus:outline-none focus:border-brand/40"
                    />
                    <SpawnPersonaToggle
                      value={spawnPersona}
                      onChange={setSpawnPersona}
                    />
                  </motion.div>
                )}
              </div>

              {isNewChatComboOpen && (
                <button
                  type="button"
                  onClick={handleSpawnChat}
                  disabled={!targetUsername.trim()}
                  className={`p-1 flex items-center justify-center shrink-0 transition-all focus:outline-none ${
                    !targetUsername.trim()
                      ? "opacity-30 grayscale cursor-not-allowed text-text-disabled"
                      : "text-brand opacity-100 hover:text-brand-hover active:scale-95 cursor-pointer"
                  }`}
                  title="確認新建對話"
                >
                  <IoMdCheckboxOutline className="w-4.5 h-4.5" />
                </button>
              )}
            </div>

            {/* 🎯 Target Injected Real-Time Lobby Filtering Search Bar Chassis */}
            <div className="px-3 py-2 border-b border-white/[0.04] bg-[#1A1612] shrink-0">
              <div className="flex items-center h-8 bg-[#17130f] border border-white/5 rounded-lg px-2.5 focus-within:border-brand/40 transition-colors">
                <IoSearchOutline
                  className="mr-1.5 h-3.5 w-3.5 shrink-0 text-text-disabled/70"
                  aria-hidden
                />
                <input
                  type="text"
                  value={lobbySearchQuery}
                  onChange={(e) => setLobbySearchQuery(e.target.value)}
                  placeholder="搜尋已存在對話用戶..."
                  className="w-full bg-transparent font-sans text-[11.5px] text-text-primary placeholder:text-[#50453b] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-1.5 space-y-1 scrollbar-none">
              {isLobbyRefreshing ? <ChatLobbyRefreshingHint /> : null}
              {showLobbySkeleton ? (
                <ChatLobbyLoadingRows />
              ) : showLobbyEmptyState ? (
                <ChatLobbyEmptyState variant={lobbyEmptyVariant} />
              ) : (
                filteredLobbyRooms.map((room: ChatRoom) => (
                <button
                  key={room.id}
                  type="button"
                  data-chat-room-id={room.id}
                  onClick={() => {
                    setActiveRoomId(room.id);
                  }}
                  className={
                    "w-full p-2 rounded-xl text-left flex items-center gap-2 transition-all focus:outline-none relative " +
                    (room.id === activeRoomId
                      ? "bg-[#26211C] border border-[rgba(237,232,224,0.08)] shadow-md"
                      : "hover:bg-[#26211C]/40 border border-transparent")
                  }
                >
                  <ProfileAvatar
                    avatarUrl={room.partnerAvatarUrl}
                    displayName={room.partnerName}
                    className="w-7 h-7 border border-brand/20 shrink-0"
                    fallbackClassName="bg-[#17130f] text-[11px] font-bold text-brand"
                  />
                  <div className="min-w-0 flex-1 flex flex-row items-center text-nowrap gap-x-1">
                    <div className="font-sans font-medium text-[12px] text-text-primary truncate">
                      {room.partnerName}
                    </div>
                    {/* 🎯 Target Injected SNKRDUNK-Style Merchant Identifier Chip */}
                    {inferPartnerPersona(room) === "merchant" ? (
                      <CertifiedMerchantBadge />
                    ) : null}
                  </div>
                  {room.unreadCount > 0 ? (
                    <ChatUnreadDotInline />
                  ) : null}
                </button>
              ))
              )}
            </div>
          </div>

          {/* Right column: message thread */}
          <div className="flex-1 flex flex-col bg-[#17130f]">
            {activeRoom ? (
              <>
            <div className="h-12 bg-[#26211C] border-b border-[rgba(237,232,224,0.08)] flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-2">
                <Link
                  href={chatPartnerProfileHref}
                  prefetch={false}
                  data-testid="chat-partner-profile-link"
                  onClick={handleChatPartnerProfileClick}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <ProfileAvatar
                    avatarUrl={activeRoom.partnerAvatarUrl}
                    displayName={activeRoom.partnerName}
                    className="w-7 h-7 border border-brand/20 shrink-0"
                    fallbackClassName="bg-[#17130f] text-[11px] font-bold text-brand"
                  />
                  <span className="font-sans font-bold text-[13px] text-text-primary">
                    {activeRoom.partnerName}
                  </span>
                  {inferPartnerPersona(activeRoom) === "merchant" ? (
                    <CertifiedMerchantBadge />
                  ) : null}
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsReportOpen(true)}
                  className={reportButtonClass}
                >
                  舉報
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-6 w-6 items-center justify-center font-sans text-[11px] text-text-secondary hover:text-[#eae1da] focus:outline-none"
                >
                  ✕
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#17130f] scrollbar-none flex flex-col relative"
            >
              {isThreadLoading ? (
                <div className="flex flex-1 items-center justify-center">
                  <p className="font-mono text-[11px] text-text-disabled select-none">
                    載入對話內容…
                  </p>
                </div>
              ) : (
                <>
                  {loadingOlder ? (
                    <p className="font-mono text-[10px] text-text-disabled text-center py-1 select-none">
                      載入更早訊息…
                    </p>
                  ) : null}
                  {showAllHistoryLoaded ? (
                    <p className="font-mono text-[10px] text-text-disabled text-center py-1 select-none">
                      已載入全部歷史訊息
                    </p>
                  ) : null}
                  <div
                    ref={topSentinelRef}
                    aria-hidden
                    className="h-px w-full shrink-0"
                  />
                  <MessageThread
                    renderList={renderList}
                    currentUserId={currentUserId}
                    activeRoomId={activeRoomId}
                    partnerId={activeRoom.partnerId}
                    partnerName={activeRoom.partnerName}
                    roomMessages={activeRoom.messages}
                    offers={offers}
                    onOpenReview={handleOpenReview}
                    reviewedOrderIds={reviewedOrderIds}
                    isReviewLoading={isReviewLoading}
                  />
                  <div
                    ref={bottomAnchorRef}
                    aria-hidden
                    className="h-px w-full shrink-0"
                  />
                </>
              )}
            </div>

            <AntiScamDisclaimer />

            <form
              onSubmit={handleSendMessage}
              className="p-2.5 bg-[#26211C] border-t border-[rgba(237,232,224,0.08)] shrink-0 flex gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={composerPlaceholder}
                disabled={!canPersistMessages || isProvisioningRoom}
                className="flex-1 h-9 bg-[#17130f] border border-[rgba(237,232,224,0.12)] rounded-lg px-3 text-[12px] text-text-primary focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!canPersistMessages || !inputText.trim() || isProvisioningRoom}
                className="h-9 px-4 bg-brand text-[#17130f] font-sans font-bold text-[12px] rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none"
              >
                發送 ⚡
              </button>
            </form>
              </>
            ) : (
              <div className="flex flex-1 flex-col">
                <div className="h-12 bg-[#26211C] border-b border-[rgba(237,232,224,0.08)] flex items-center justify-end px-4 shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex h-6 w-6 items-center justify-center font-sans text-[11px] text-text-secondary hover:text-[#eae1da] focus:outline-none"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-1 items-center justify-center p-6">
                  <p className="font-mono text-[11px] text-text-disabled text-center select-none">
                    請從左側選擇對話以開始
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      ) : (
        <motion.div
          data-chat-console="true"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed inset-0 z-[500] bg-[#17130f] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="聊天"
        >
          {mobileView === "LIST" || !activeRoom ? (
            <div className="flex flex-col h-full">
              <div className="h-14 bg-[#26211C] border-b border-[rgba(237,232,224,0.08)] flex items-center justify-between px-4 shrink-0 gap-2">
                {/*
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className="flex-1 flex items-center gap-1.5 overflow-hidden">
                    {!isNewChatComboOpen ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setIsNewChatComboOpen((prev) => !prev)}
                          className="gap-1 p-1.5 hover:bg-[#1A1612] rounded-full transition-colors text-brand flex items-center justify-center shrink-0 focus:outline-none"
                          title="新建對話"
                        >
                          <svg
                            className="w-5 h-5 text-brand"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2.5}
                              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                            />
                          </svg>

                          <h3 className="font-mono text-sm text-brand">
                            新增聊天
                          </h3>
                        </button>
                      </>
                    ) : (
                      <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: "auto", opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 300,
                          damping: 20,
                        }}
                        className="flex items-center gap-1.5 flex-1 min-w-0"
                      >
                        <input
                          type="text"
                          value={targetUsername}
                          onChange={(e) => setTargetUsername(e.target.value)}
                          placeholder="搜尋/輸入用戶..."
                          className="w-full bg-[#17130f] border border-white/10 rounded-lg px-2.5 py-1 font-sans text-[12px] text-text-primary placeholder:text-[#50453b] focus:outline-none focus:border-brand/40"
                        />
                      </motion.div>
                    )}
                  </div>

                  {isNewChatComboOpen && (
                    <button
                      type="button"
                      onClick={handleSpawnChat}
                      disabled={!targetUsername.trim()}
                      className={`p-1.5 flex items-center justify-center shrink-0 transition-all focus:outline-none ${
                        !targetUsername.trim()
                          ? "opacity-30 grayscale cursor-not-allowed text-text-disabled"
                          : "text-brand opacity-100 hover:text-brand-hover active:scale-95 cursor-pointer"
                      }`}
                      title="確認新建對話"
                    >
                      <IoMdCheckboxOutline className="w-5.5 h-5.5" />
                    </button>
                  )}
                </div>
                  */}
                <p className="font-mono font-bold text-sm text-brand">聊天室</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 shrink-0 items-center justify-center font-sans text-sm text-text-secondary hover:text-[#eae1da] focus:outline-none"
                >
                  ✕
                </button>
              </div>

              {/* 🎯 Target Injected Real-Time Lobby Filtering Search Bar Chassis */}
              <div className="px-3 py-2 border-b border-white/[0.04] bg-[#1A1612] shrink-0">
                <div className="flex items-center h-9 bg-[#17130f] border border-white/5 rounded-lg px-2.5 focus-within:border-brand/40 transition-colors">
                  <IoSearchOutline
                    className="mr-1.5 h-3.5 w-3.5 shrink-0 text-text-disabled/70"
                    aria-hidden
                  />
                  <input
                    type="text"
                    value={lobbySearchQuery}
                    onChange={(e) => setLobbySearchQuery(e.target.value)}
                    placeholder="搜尋已存在對話用戶..."
                    className="w-full bg-transparent font-sans text-[12px] text-text-primary placeholder:text-[#50453b] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#17130f] scrollbar-none">
                {isLobbyRefreshing ? <ChatLobbyRefreshingHint /> : null}
                {showLobbySkeleton ? (
                  <ChatLobbyLoadingRows />
                ) : showLobbyEmptyState ? (
                  <ChatLobbyEmptyState variant={lobbyEmptyVariant} />
                ) : (
                  filteredLobbyRooms.map((room: ChatRoom) => (
                  <button
                    key={room.id}
                    type="button"
                    data-chat-room-id={room.id}
                    onClick={() => {
                      setActiveRoomId(room.id);
                      setMobileView("CHAT");
                    }}
                    className="w-full text-left p-3.5 rounded-2xl bg-[#26211C] border border-[rgba(237,232,224,0.04)] flex items-start gap-3.5 relative focus:outline-none"
                  >
                    <ProfileAvatar
                      avatarUrl={room.partnerAvatarUrl}
                      displayName={room.partnerName}
                      className="w-9 h-9 border border-brand/20 shrink-0"
                      fallbackClassName="bg-[#17130f] text-[13px] font-bold text-brand"
                    />
                    <div className="min-w-0 flex-1 ">
                      <div className="flex flex-row text-nowrap gap-x-1">
                        <span className="font-sans font-semibold text-[13px] text-text-primary">
                          {room.partnerName}
                        </span>
                        {/* 🎯 Target Injected SNKRDUNK-Style Merchant Identifier Chip */}
                        {inferPartnerPersona(room) === "merchant" ? (
                          <CertifiedMerchantBadge />
                        ) : null}
                      </div>
                      <p className="font-sans text-[12px] text-text-secondary truncate mt-1">
                        {room.lastMessage}
                      </p>
                    </div>
                    {room.unreadCount > 0 ? (
                      <ChatUnreadDotInline className="mt-1" />
                    ) : null}
                  </button>
                ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="h-14 bg-[#26211C] border-b border-[rgba(237,232,224,0.08)] flex items-center justify-between px-3 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMobileView("LIST")}
                    className="flex h-8 w-8 items-center justify-center font-sans text-[12px] font-medium text-brand hover:text-[#e8b896] focus:outline-none"
                  >
                    <IoChevronBack />
                  </button>
                  <div className="flex items-center gap-2">
                    <Link
                      href={chatPartnerProfileHref}
                      prefetch={false}
                      data-testid="chat-partner-profile-link"
                      onClick={handleChatPartnerProfileClick}
                      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      <ProfileAvatar
                        avatarUrl={activeRoom.partnerAvatarUrl}
                        displayName={activeRoom.partnerName}
                        className="w-7 h-7 border border-brand/20 shrink-0"
                        fallbackClassName="bg-[#17130f] text-[11px] font-bold text-brand"
                      />
                      <span className="font-sans font-bold text-[13px] text-text-primary">
                        {activeRoom.partnerName}
                      </span>
                      {inferPartnerPersona(activeRoom) === "merchant" ? (
                        <CertifiedMerchantBadge />
                      ) : null}
                    </Link>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsReportOpen(true)}
                    className={reportButtonClass}
                  >
                    舉報
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex h-8 w-8 items-center justify-center font-sans text-sm text-text-secondary hover:text-[#eae1da] focus:outline-none"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#17130f] scrollbar-none flex flex-col relative"
              >
                {isThreadLoading ? (
                  <div className="flex flex-1 items-center justify-center">
                    <p className="font-mono text-[11px] text-text-disabled select-none">
                      載入對話內容…
                    </p>
                  </div>
                ) : (
                  <>
                    {loadingOlder ? (
                      <p className="font-mono text-[10px] text-text-disabled text-center py-1 select-none">
                        載入更早訊息…
                      </p>
                    ) : null}
                    {showAllHistoryLoaded ? (
                      <p className="font-mono text-[10px] text-text-disabled text-center py-1 select-none">
                        已載入全部歷史訊息
                      </p>
                    ) : null}
                    <div
                      ref={topSentinelRef}
                      aria-hidden
                      className="h-px w-full shrink-0"
                    />
                    <MobileMessageThread
                      renderList={renderList}
                      currentUserId={currentUserId}
                      activeRoomId={activeRoomId}
                      partnerId={activeRoom.partnerId}
                      partnerName={activeRoom.partnerName}
                      roomMessages={activeRoom.messages}
                      offers={offers}
                      onOpenReview={handleOpenReview}
                      reviewedOrderIds={reviewedOrderIds}
                      isReviewLoading={isReviewLoading}
                    />
                    <div
                      ref={bottomAnchorRef}
                      aria-hidden
                      className="h-px w-full shrink-0"
                    />
                  </>
                )}
              </div>

              <AntiScamDisclaimer />

              <form
                onSubmit={handleSendMessage}
                className="p-3 bg-[#26211C] border-t border-[rgba(237,232,224,0.08)] shrink-0 flex gap-2"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={composerPlaceholder}
                  disabled={!canPersistMessages || isProvisioningRoom}
                  className="flex-1 h-11 bg-[#17130f] border border-[rgba(237,232,224,0.12)] rounded-xl px-4 text-[13px] text-text-primary focus:outline-none disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!canPersistMessages || !inputText.trim() || isProvisioningRoom}
                  className="h-11 px-5 bg-brand text-[#17130f] font-sans font-bold text-[13px] rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none"
                >
                  發送
                </button>
              </form>
            </div>
          )}
        </motion.div>
      );

  return (
    <>
      {activeReview ? (
        <ReviewModal
          isOpen={activeReview !== null}
          onClose={handleCloseReview}
          orderId={activeReview.orderId}
          revieweeId={activeReview.revieweeId}
          onSubmitted={handleReviewSubmitted}
        />
      ) : null}

      {isMounted ? createPortal(chatConsoleLayer, document.body) : null}

      {activeRoom ? (
        <UserReportModal
          isOpen={isReportOpen}
          onOpenChange={setIsReportOpen}
          targetUserId={activeRoom.partnerId}
          targetUserName={activeRoom.partnerName}
          targetType="chat_message"
          chatRoomId={activeRoomId}
        />
      ) : null}
    </>
  );
}
