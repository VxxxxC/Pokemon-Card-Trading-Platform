import type { ChatRoom } from "@/app/store/useHkCardVaultStore";
import {
  isDbChatRoomId,
  isChatRoomId,
} from "@/app/lib/chat/constants";
import { resolveRoomViewerPersona } from "@/app/lib/chat/filter-rooms-for-viewer-persona";
import {
  buildPartnerRoomKey,
  type ChatPartnerPersona,
  inferPartnerPersona,
  isProfileUuid,
} from "@/app/lib/chat/partnerRoomKey";

export type MergeChatRoomsOptions = {
  /** Drop chatId-* preset rooms after a successful DB sync */
  stripeRooms?: boolean;
  /** Lobby sync: trust server unread_count over local realtime bumps */
  preferServerUnread?: boolean;
};

function sortRoomsByActivity(rooms: ChatRoom[]): ChatRoom[] {
  return [...rooms].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export function normalizePartnerId(partnerId: string): string {
  return partnerId.trim().toLowerCase();
}

export function findRoomsByPartnerId(
  rooms: ChatRoom[],
  partnerId: string,
  partnerPersona?: ChatPartnerPersona,
): ChatRoom[] {
  const key = normalizePartnerId(partnerId);
  if (!key) {
    return [];
  }

  const matches = rooms.filter(
    (room) => normalizePartnerId(room.partnerId) === key,
  );

  if (!partnerPersona) {
    return matches;
  }

  return matches.filter(
    (room) => inferPartnerPersona(room) === partnerPersona,
  );
}

export function findRoomByPartnerId(
  rooms: ChatRoom[],
  partnerId: string,
  partnerPersona?: ChatPartnerPersona,
): ChatRoom | undefined {
  const matches = findRoomsByPartnerId(rooms, partnerId, partnerPersona);

  if (matches.length === 0) {
    return undefined;
  }

  if (partnerPersona) {
    return matches[0];
  }

  if (matches.length === 1) {
    return matches[0];
  }

  return (
    matches.find((room) => inferPartnerPersona(room) === "member") ?? matches[0]
  );
}

export function normalizePartnerName(partnerName: string): string {
  return partnerName.trim().toLowerCase();
}

export function findRoomByPartnerName(
  rooms: ChatRoom[],
  partnerName: string,
  partnerPersona?: ChatPartnerPersona,
): ChatRoom | undefined {
  const key = normalizePartnerName(partnerName);
  if (!key) {
    return undefined;
  }

  const matches = rooms.filter(
    (room) => normalizePartnerName(room.partnerName) === key,
  );

  if (partnerPersona) {
    return matches.find(
      (room) => inferPartnerPersona(room) === partnerPersona,
    );
  }

  if (matches.length === 1) {
    return matches[0];
  }

  return undefined;
}

function dedupeMessagesByOfferId(messages: ChatRoom["messages"]): ChatRoom["messages"] {
  const seenOfferIds = new Set<string>();

  return messages.filter((message) => {
    const offerId = message.specialData?.offerId;
    if (message.type !== "special_transaction" || !offerId) {
      return true;
    }
    if (seenOfferIds.has(offerId)) {
      return false;
    }
    seenOfferIds.add(offerId);
    return true;
  });
}

function mergeRoomMessages(
  local: ChatRoom,
  db: ChatRoom,
  preferServerUnread = false,
): ChatRoom {
  const dbMessageIds = new Set(db.messages.map((message) => message.id));
  const optimisticOnly = local.messages.filter(
    (message) => !dbMessageIds.has(message.id),
  );

  const messages = dedupeMessagesByOfferId(
    [...db.messages, ...optimisticOnly].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    ),
  );

  const lastMessage = messages.at(-1)?.text ?? db.lastMessage;
  const timestamp =
    messages.at(-1)?.timestamp ?? db.timestamp ?? local.timestamp;

  const mergedUnread = Math.max(local.unreadCount, db.unreadCount);

  return {
    ...db,
    messages,
    lastMessage,
    timestamp,
    unreadCount: mergedUnread,
    threadHydrated: local.threadHydrated === true || db.threadHydrated === true,
    threadHasMoreOlder:
      local.threadHasMoreOlder ?? db.threadHasMoreOlder,
  };
}

function pickCanonicalRoom(
  a: ChatRoom,
  b: ChatRoom,
  preferServerUnread = false,
): ChatRoom {
  const aIsDb = isDbChatRoomId(a.id);
  const bIsDb = isDbChatRoomId(b.id);

  if (aIsDb && !bIsDb) {
    return finalizeCanonicalRoom(mergeRoomMessages(b, a, preferServerUnread), a, b, preferServerUnread);
  }
  if (!aIsDb && bIsDb) {
    return finalizeCanonicalRoom(mergeRoomMessages(a, b, preferServerUnread), a, b, preferServerUnread);
  }

  const aTime = new Date(a.timestamp).getTime();
  const bTime = new Date(b.timestamp).getTime();

  if (aTime >= bTime) {
    return finalizeCanonicalRoom(mergeRoomMessages(b, a, preferServerUnread), a, b, preferServerUnread);
  }

  return finalizeCanonicalRoom(mergeRoomMessages(a, b, preferServerUnread), a, b, preferServerUnread);
}

function finalizeCanonicalRoom(
  merged: ChatRoom,
  a: ChatRoom,
  b: ChatRoom,
  preferServerUnread: boolean,
): ChatRoom {
  if (!preferServerUnread) {
    return merged;
  }

  return {
    ...merged,
    unreadCount: Math.max(a.unreadCount, b.unreadCount),
  };
}

function roomsSharePartnerIdentity(left: ChatRoom, right: ChatRoom): boolean {
  if (resolveRoomViewerPersona(left) !== resolveRoomViewerPersona(right)) {
    return false;
  }

  const leftPartnerKey = buildPartnerRoomKey(
    left.partnerId,
    inferPartnerPersona(left),
  );
  const rightPartnerKey = buildPartnerRoomKey(
    right.partnerId,
    inferPartnerPersona(right),
  );

  if (leftPartnerKey === rightPartnerKey) {
    return true;
  }

  const leftIdIsUuid = isProfileUuid(left.partnerId);
  const rightIdIsUuid = isProfileUuid(right.partnerId);
  if (leftIdIsUuid || rightIdIsUuid) {
    return false;
  }

  const leftNameKey = normalizePartnerName(left.partnerName);
  const rightNameKey = normalizePartnerName(right.partnerName);

  return Boolean(
    leftNameKey && rightNameKey && leftNameKey === rightNameKey,
  );
}

function dedupeByPartner(
  rooms: ChatRoom[],
  preferServerUnread = false,
): ChatRoom[] {
  const result: ChatRoom[] = [];

  for (const room of rooms) {
    const existingIndex = result.findIndex((candidate) =>
      roomsSharePartnerIdentity(candidate, room),
    );

    if (existingIndex === -1) {
      result.push(room);
      continue;
    }

    result[existingIndex] = pickCanonicalRoom(
      result[existingIndex],
      room,
      preferServerUnread,
    );
  }

  return result;
}

/**
 * Merges Supabase inbox rooms with local session state.
 * DB rows win for matching room IDs; partner duplicates collapse only within the same persona.
 */
export function mergeChatRoomsWithDb(
  currentRooms: ChatRoom[],
  dbRooms: ChatRoom[],
  options?: MergeChatRoomsOptions,
): ChatRoom[] {
  const stripeEnabled =
    options?.stripeRooms ?? (dbRooms.length > 0 ? true : false);

  const systemRooms = stripeEnabled
    ? []
    : currentRooms.filter((room) => isChatRoomId(room.id));
  const localRealRooms = currentRooms.filter(
    (room) => !isChatRoomId(room.id),
  );

  const dbById = new Map(dbRooms.map((room) => [room.id, room]));

  const preferServerUnread = options?.preferServerUnread ?? false;

  const mergedDbRooms = dbRooms.map((dbRoom) => {
    const local = localRealRooms.find((room) => room.id === dbRoom.id);
    return local
      ? mergeRoomMessages(local, dbRoom, preferServerUnread)
      : dbRoom;
  });

  const ephemeralRooms = localRealRooms.filter((room) => !dbById.has(room.id));

  const deduped = dedupeByPartner(
    [...mergedDbRooms, ...ephemeralRooms],
    preferServerUnread,
  );

  return sortRoomsByActivity([...systemRooms, ...deduped]);
}

/** Refresh the latest thread page without discarding older pages already loaded. */
export function mergeLatestThreadPageFromDb(
  currentRooms: ChatRoom[],
  threadRoom: ChatRoom,
  hasMoreOlder: boolean,
): ChatRoom[] {
  return currentRooms.map((room) => {
    if (room.id !== threadRoom.id) {
      return room;
    }

    const pageTimestamps = threadRoom.messages
      .map((message) => new Date(message.timestamp).getTime())
      .filter((value) => Number.isFinite(value));

    if (pageTimestamps.length === 0) {
      return {
        ...mergeRoomMessages(room, threadRoom),
        threadHydrated: true,
        threadHasMoreOlder: hasMoreOlder,
      };
    }

    const pageStartMs = Math.min(...pageTimestamps);
    const olderMessages = room.messages.filter(
      (message) => new Date(message.timestamp).getTime() < pageStartMs,
    );
    const refreshedTail = mergeRoomMessages(
      { ...room, messages: [] },
      threadRoom,
    ).messages;

    const messages = dedupeMessagesByOfferId(
      [...olderMessages, ...refreshedTail].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
    );

    return {
      ...room,
      ...threadRoom,
      messages,
      lastMessage: messages.at(-1)?.text ?? threadRoom.lastMessage,
      timestamp: messages.at(-1)?.timestamp ?? threadRoom.timestamp,
      threadHydrated: true,
      threadHasMoreOlder:
        olderMessages.length > 0 ? true : hasMoreOlder,
    };
  });
}

/** Merge a lazy-loaded thread page into an existing room row. */
export function mergeRoomThreadFromDb(
  currentRooms: ChatRoom[],
  threadRoom: ChatRoom,
  hasMoreOlder: boolean,
): ChatRoom[] {
  return currentRooms.map((room) =>
    room.id === threadRoom.id
      ? {
          ...mergeRoomMessages(room, threadRoom),
          threadHydrated: true,
          threadHasMoreOlder: hasMoreOlder,
        }
      : room,
  );
}

/** Prepend an older thread page into an existing room row. */
export function prependOlderRoomMessages(
  currentRooms: ChatRoom[],
  roomId: string,
  olderMessages: ChatRoom["messages"],
  hasMoreOlder: boolean,
): ChatRoom[] {
  return currentRooms.map((room) => {
    if (room.id !== roomId) {
      return room;
    }

    const existingIds = new Set(room.messages.map((message) => message.id));
    const uniqueOlder = olderMessages.filter(
      (message) => !existingIds.has(message.id),
    );

    const messages = dedupeMessagesByOfferId(
      [...uniqueOlder, ...room.messages].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
    );

    return {
      ...room,
      messages,
      threadHasMoreOlder: hasMoreOlder,
    };
  });
}

/** Append newer messages from a delta sync without replacing older scroll-up pages. */
export function appendDeltaMessagesToRoom(
  currentRooms: ChatRoom[],
  roomId: string,
  deltaMessages: ChatRoom["messages"],
): ChatRoom[] {
  if (deltaMessages.length === 0) {
    return currentRooms;
  }

  return currentRooms.map((room) => {
    if (room.id !== roomId) {
      return room;
    }

    const existingIds = new Set(room.messages.map((message) => message.id));
    const uniqueDelta = deltaMessages.filter(
      (message) => !existingIds.has(message.id),
    );

    if (uniqueDelta.length === 0) {
      return room;
    }

    const messages = dedupeMessagesByOfferId(
      [...room.messages, ...uniqueDelta].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
    );

    const lastMessage = messages.at(-1)?.text ?? room.lastMessage;
    const timestamp = messages.at(-1)?.timestamp ?? room.timestamp;

    return {
      ...room,
      messages,
      lastMessage,
      timestamp,
      threadHydrated: true,
    };
  });
}
