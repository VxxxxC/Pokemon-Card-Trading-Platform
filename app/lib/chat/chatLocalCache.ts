import { CHAT_THREAD_PAGE_SIZE, isDbChatRoomId } from "@/app/lib/chat/constants";
import { filterChatRoomsForViewerPersona } from "@/app/lib/chat/filter-rooms-for-viewer-persona";
import type { ChatPartnerPersona } from "@/app/lib/chat/partnerRoomKey";
import type { ChatRoom, Message } from "@/app/store/useHkCardVaultStore";

const CACHE_VERSION = 1;
const CACHE_KEY_PREFIX = `hkcv.chat.v${CACHE_VERSION}`;
const MAX_HYDRATED_ROOMS = 20;

type ChatLocalCacheV1 = {
  version: 1;
  savedAt: string;
  inbox: ChatRoom[];
};

export function buildChatLocalCacheKey(
  userId: string,
  persona: ChatPartnerPersona,
): string {
  return `${CACHE_KEY_PREFIX}.${userId.trim()}.${persona}`;
}

function stripOptimisticMessages(messages: Message[]): Message[] {
  return messages.filter((message) => !message.id.startsWith("opt-"));
}

function prepareRoomsForCache(chats: ChatRoom[]): ChatRoom[] {
  const dbRooms = chats.filter((room) => isDbChatRoomId(room.id));

  const hydratedRoomIds = new Set(
    dbRooms
      .filter(
        (room) =>
          room.threadHydrated === true &&
          stripOptimisticMessages(room.messages).length > 0,
      )
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, MAX_HYDRATED_ROOMS)
      .map((room) => room.id),
  );

  return dbRooms.map((room) => {
    const shouldKeepThread = hydratedRoomIds.has(room.id);

    if (!shouldKeepThread) {
      return {
        ...room,
        messages: [],
        threadHydrated: undefined,
        threadHasMoreOlder: undefined,
      };
    }

    const messages = stripOptimisticMessages(room.messages).slice(
      -CHAT_THREAD_PAGE_SIZE,
    );

    return {
      ...room,
      messages,
      threadHydrated: true,
      threadHasMoreOlder: room.threadHasMoreOlder,
    };
  });
}

export function readChatLocalCache(
  userId: string,
  persona: ChatPartnerPersona,
): ChatRoom[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(
      buildChatLocalCacheKey(trimmedUserId, persona),
    );
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as ChatLocalCacheV1;
    if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.inbox)) {
      return null;
    }

    return filterChatRoomsForViewerPersona(
      parsed.inbox.filter((room) => isDbChatRoomId(room.id)),
      persona,
    );
  } catch {
    return null;
  }
}

export function writeChatLocalCache(
  userId: string,
  persona: ChatPartnerPersona,
  chats: ChatRoom[],
): void {
  if (typeof window === "undefined") {
    return;
  }

  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    return;
  }

  const inbox = prepareRoomsForCache(
    filterChatRoomsForViewerPersona(chats, persona),
  );
  if (inbox.length === 0) {
    return;
  }

  const payload: ChatLocalCacheV1 = {
    version: CACHE_VERSION,
    savedAt: new Date().toISOString(),
    inbox,
  };

  try {
    window.localStorage.setItem(
      buildChatLocalCacheKey(trimmedUserId, persona),
      JSON.stringify(payload),
    );
  } catch (error) {
    console.warn("[chatLocalCache] write failed", error);
  }
}

export function clearChatLocalCacheForUser(userId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    return;
  }

  const prefix = `${CACHE_KEY_PREFIX}.${trimmedUserId}.`;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix)) {
      window.localStorage.removeItem(key);
    }
  }
}
