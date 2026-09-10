"use client";

import { markChatRoomRead } from "@/app/actions/chat";
import { isDbChatRoomId } from "@/app/lib/chat/constants";
import { resolveRoomViewerPersona } from "@/app/lib/chat/filter-rooms-for-viewer-persona";
import {
  buildPartnerRoomKey,
  inferPartnerPersona,
} from "@/app/lib/chat/partnerRoomKey";
import type { ChatRoom } from "@/app/store/useHkCardVaultStore";
import { useHkCardVaultStore } from "@/app/store/useHkCardVaultStore";

const inFlightByRoom = new Map<string, Promise<boolean>>();

export function getRoomIdsToMarkRead(
  chats: ChatRoom[],
  roomId: string,
): string[] {
  const room = chats.find((candidate) => candidate.id === roomId);
  if (!room) {
    return roomId.trim() ? [roomId] : [];
  }

  const targetViewerPersona = resolveRoomViewerPersona(room);
  const targetPartnerKey = buildPartnerRoomKey(
    room.partnerId,
    inferPartnerPersona(room),
  );

  const roomIds = new Set<string>();
  for (const candidate of chats) {
    const matchesRoomId = candidate.id === roomId;
    const matchesPersonaThread =
      resolveRoomViewerPersona(candidate) === targetViewerPersona &&
      buildPartnerRoomKey(
        candidate.partnerId,
        inferPartnerPersona(candidate),
      ) === targetPartnerKey;

    if (matchesRoomId || matchesPersonaThread) {
      roomIds.add(candidate.id);
    }
  }

  return [...roomIds];
}

function markScopedRoomsReadInStore(roomId: string): void {
  const { chats, markRoomRead } = useHkCardVaultStore.getState();
  const roomIds = getRoomIdsToMarkRead(chats, roomId);

  for (const id of roomIds) {
    markRoomRead(id);
  }
}

async function executePersist(
  roomId: string,
  readAt?: string,
): Promise<boolean> {
  markScopedRoomsReadInStore(roomId);

  if (!isDbChatRoomId(roomId)) {
    return true;
  }

  try {
    const result = await markChatRoomRead(roomId, readAt);
    if (!result.success) {
      console.error("[persistMarkRoomRead]", result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[persistMarkRoomRead]", error);
    return false;
  }
}

export async function persistMarkRoomReadAsync(
  roomId: string,
  readAt?: string,
): Promise<boolean> {
  const trimmedRoomId = roomId.trim();
  if (!trimmedRoomId) {
    return false;
  }

  const existing = inFlightByRoom.get(trimmedRoomId);
  if (existing) {
    return existing;
  }

  const promise = executePersist(trimmedRoomId, readAt).finally(() => {
    if (inFlightByRoom.get(trimmedRoomId) === promise) {
      inFlightByRoom.delete(trimmedRoomId);
    }
  });

  inFlightByRoom.set(trimmedRoomId, promise);
  return promise;
}

export function persistMarkRoomRead(
  roomId: string,
  readAt?: string,
): void {
  void persistMarkRoomReadAsync(roomId, readAt);
}
