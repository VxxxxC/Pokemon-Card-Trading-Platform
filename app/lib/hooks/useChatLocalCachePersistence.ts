"use client";

import { useEffect } from "react";
import {
  clearChatLocalCacheForUser,
  writeChatLocalCache,
} from "@/app/lib/chat/chatLocalCache";
import type { ChatPartnerPersona } from "@/app/lib/chat/partnerRoomKey";
import { useHkCardVaultStore } from "@/app/store/useHkCardVaultStore";

const PERSIST_DEBOUNCE_MS = 500;

export function useChatLocalCachePersistence(
  userId: string | null,
  persona: ChatPartnerPersona,
): void {
  useEffect(() => {
    if (!userId) {
      return;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = useHkCardVaultStore.subscribe((state, prevState) => {
      if (state.chats === prevState.chats) {
        return;
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        writeChatLocalCache(userId, persona, state.chats);
      }, PERSIST_DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [persona, userId]);
}

export function clearChatLocalCacheOnLogout(userId: string | null): void {
  if (!userId) {
    return;
  }
  clearChatLocalCacheForUser(userId);
}
