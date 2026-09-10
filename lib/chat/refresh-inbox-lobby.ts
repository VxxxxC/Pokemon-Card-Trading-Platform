"use client";

import { getUserChatInboxLobby } from "@/app/actions/chat";
import { mergeChatRoomsWithDb } from "@/app/lib/chat/mergeChatRooms";
import { useHkCardVaultStore } from "@/app/store/useHkCardVaultStore";

export async function refreshInboxLobbyInStore(): Promise<boolean> {
  const result = await getUserChatInboxLobby();
  if (!result.success) {
    return false;
  }

  useHkCardVaultStore.getState().setChats((currentRooms) =>
    mergeChatRoomsWithDb(currentRooms, result.data, {
      stripeRooms: true,
      preferServerUnread: true,
    }),
  );

  return true;
}
