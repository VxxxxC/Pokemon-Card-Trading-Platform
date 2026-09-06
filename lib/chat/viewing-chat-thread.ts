import { isInboundTransactionSystemContent } from "@/app/lib/chat/realtimeChatMessages";

const DESKTOP_CHAT_MEDIA_QUERY = "(min-width: 1024px)";

export type ChatThreadViewState = {
  isChatOpen: boolean;
  activeRoomId: string;
  mobileView: "LIST" | "CHAT";
};

export function isDesktopChatViewport(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia(DESKTOP_CHAT_MEDIA_QUERY).matches;
}

/** True when the user is actively viewing the thread for `roomId`. */
export function isViewingChatThread(
  state: ChatThreadViewState,
  roomId: string,
): boolean {
  if (!state.isChatOpen || state.activeRoomId !== roomId) {
    return false;
  }

  if (isDesktopChatViewport()) {
    return true;
  }

  return state.mobileView === "CHAT";
}

export function shouldIncrementUnreadForInboundMessage(
  state: ChatThreadViewState,
  roomId: string,
  sender: "me" | "them" | "system",
  options?: { countSystemTransaction?: boolean },
): boolean {
  if (isViewingChatThread(state, roomId)) {
    return false;
  }

  if (sender === "me") {
    return false;
  }

  if (sender === "them") {
    return true;
  }

  return options?.countSystemTransaction === true;
}

export function shouldIncrementUnreadForInboundRealtimeRow(
  state: ChatThreadViewState,
  roomId: string,
  row: {
    sender_id: string;
    content: string;
  },
  currentUserId: string,
): boolean {
  if (isViewingChatThread(state, roomId)) {
    return false;
  }

  if (row.sender_id === currentUserId) {
    return false;
  }

  if (isInboundTransactionSystemContent(row.content)) {
    return true;
  }

  return true;
}
