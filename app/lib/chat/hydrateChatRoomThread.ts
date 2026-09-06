"use client";

import {
  getChatRoomMessagesSince,
  getChatRoomThread,
  loadOlderChatRoomMessages,
} from "@/app/actions/chat";
import { batchGetOfferCardContexts } from "@/app/actions/offers";
import { CHAT_THREAD_PAGE_SIZE, isDbChatRoomId } from "@/app/lib/chat/constants";
import { extractOfferIdsFromMessages } from "@/app/lib/chat/extractOfferIdsFromMessages";
import {
  appendDeltaMessagesToRoom,
  mergeRoomThreadFromDb,
  prependOlderRoomMessages,
} from "@/app/lib/chat/mergeChatRooms";
import { writeCachedOfferCardContext } from "@/app/lib/chat/offerCardContextCache";
import {
  roomHasPersistedThreadTail,
  roomNeedsThreadHydration,
} from "@/app/lib/chat/roomHydration";
import { persistMarkRoomReadAsync } from "@/app/lib/chat/persistMarkRoomRead";
import { getLastPersistedMessageTimestamp } from "@/app/lib/chat/realtimeChatMessages";
import { useHkCardVaultStore } from "@/app/store/useHkCardVaultStore";
import type { Message } from "@/app/store/useHkCardVaultStore";

type HydrateChatRoomThreadOptions = {
  force?: boolean;
  markRead?: boolean;
};

async function maybeMarkRoomRead(
  roomId: string,
  readAt: string | undefined,
  markRead: boolean,
): Promise<void> {
  if (!markRead) {
    return;
  }

  await persistMarkRoomReadAsync(roomId, readAt);
}

function getOldestPersistedTimestamp(
  messages: { id: string; timestamp: string }[],
): string | null {
  const persisted = messages.filter((message) => !message.id.startsWith("opt-"));
  const oldest = persisted[0];
  return oldest?.timestamp ?? null;
}

async function populateOfferCardContextCache(messages: Message[]): Promise<void> {
  const offerIds = extractOfferIdsFromMessages(messages);
  if (offerIds.length === 0) {
    return;
  }

  const result = await batchGetOfferCardContexts(offerIds);
  if (!result.success) {
    return;
  }

  for (const [offerId, context] of Object.entries(result.data)) {
    writeCachedOfferCardContext(offerId, context);
  }
}

async function syncChatRoomThreadDelta(
  roomId: string,
  sinceCreatedAt: string,
  markRead: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  const deltaResult = await getChatRoomMessagesSince(roomId, sinceCreatedAt);
  if (!deltaResult.success) {
    return { success: false, error: deltaResult.error };
  }

  if (deltaResult.data.messages.length > 0) {
    await populateOfferCardContextCache(deltaResult.data.messages);
    useHkCardVaultStore.getState().setChats((currentRooms) =>
      appendDeltaMessagesToRoom(
        currentRooms,
        roomId,
        deltaResult.data.messages,
      ),
    );
  }

  const updatedRoom = useHkCardVaultStore
    .getState()
    .chats.find((entry) => entry.id === roomId);
  const lastTs =
    updatedRoom?.messages.at(-1)?.timestamp ?? updatedRoom?.timestamp;
  await maybeMarkRoomRead(roomId, lastTs, markRead);

  return { success: true };
}

export async function hydrateChatRoomThread(
  roomId: string,
  options?: HydrateChatRoomThreadOptions,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!isDbChatRoomId(roomId)) {
    return { success: false, error: "請選擇有效的聊天室" };
  }

  const markRead = options?.markRead ?? false;
  const room = useHkCardVaultStore
    .getState()
    .chats.find((entry) => entry.id === roomId);

  if (roomHasPersistedThreadTail(room)) {
    const persistedRoom = room!;
    const since = getLastPersistedMessageTimestamp(persistedRoom.messages);
    if (since) {
      const deltaResult = await syncChatRoomThreadDelta(roomId, since, markRead);
      if (deltaResult.success) {
        return { success: true };
      }
    }
  }

  if (!options?.force && !roomNeedsThreadHydration(room)) {
    const lastTs =
      room?.messages.at(-1)?.timestamp ?? room?.timestamp ?? undefined;
    await maybeMarkRoomRead(roomId, lastTs, markRead);
    return { success: true };
  }

  const result = await getChatRoomThread(roomId, {
    limit: CHAT_THREAD_PAGE_SIZE,
  });
  if (!result.success) {
    return { success: false, error: result.error };
  }

  await populateOfferCardContextCache(result.data.messages);

  useHkCardVaultStore.getState().setChats((currentRooms) =>
    mergeRoomThreadFromDb(currentRooms, result.data, result.hasMore),
  );

  const lastTs =
    result.data.messages.at(-1)?.timestamp ?? result.data.timestamp;
  await maybeMarkRoomRead(roomId, lastTs, markRead);

  return { success: true };
}

export async function loadOlderChatRoomThread(
  roomId: string,
): Promise<{ success: true; hasMore: boolean } | { success: false; error: string }> {
  if (!isDbChatRoomId(roomId)) {
    return { success: false, error: "請選擇有效的聊天室" };
  }

  const room = useHkCardVaultStore
    .getState()
    .chats.find((entry) => entry.id === roomId);

  if (!room || room.threadHasMoreOlder === false) {
    return { success: true, hasMore: false };
  }

  const beforeCreatedAt = getOldestPersistedTimestamp(room.messages);
  if (!beforeCreatedAt) {
    return { success: true, hasMore: false };
  }

  const result = await loadOlderChatRoomMessages(roomId, beforeCreatedAt);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  if (result.data.messages.length === 0) {
    useHkCardVaultStore.getState().setChats((currentRooms) =>
      currentRooms.map((entry) =>
        entry.id === roomId
          ? { ...entry, threadHasMoreOlder: false }
          : entry,
      ),
    );
    return { success: true, hasMore: false };
  }

  await populateOfferCardContextCache(result.data.messages);

  useHkCardVaultStore.getState().setChats((currentRooms) =>
    prependOlderRoomMessages(
      currentRooms,
      roomId,
      result.data.messages,
      result.hasMore,
    ),
  );

  return { success: true, hasMore: result.hasMore };
}
