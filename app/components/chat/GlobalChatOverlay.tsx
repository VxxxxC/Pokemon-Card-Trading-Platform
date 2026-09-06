"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ensureChatRoom, getUserChatInboxLobby } from "@/app/actions/chat";
import { readChatLocalCache } from "@/app/lib/chat/chatLocalCache";
import { resetChatSessionState } from "@/app/lib/chat/resetChatSessionState";
import { hydrateChatRoomThread } from "@/app/lib/chat/hydrateChatRoomThread";
import {
  isDbChatRoomId,
  isEphemeralChatRoomId,
} from "@/app/lib/chat/constants";
import { isProfileUuid } from "@/app/lib/chat/partnerRoomKey";
import {
  findRoomByPartnerId,
  findRoomByPartnerName,
  mergeChatRoomsWithDb,
} from "@/app/lib/chat/mergeChatRooms";
import { persistMarkRoomReadAsync } from "@/app/lib/chat/persistMarkRoomRead";
import { roomMatchesViewerPersona } from "@/app/lib/chat/filter-rooms-for-viewer-persona";
import { isViewingChatThread } from "@/lib/chat/viewing-chat-thread";
import { roomHasPersistedThreadTail } from "@/app/lib/chat/roomHydration";
import {
  clearChatLocalCacheOnLogout,
  useChatLocalCachePersistence,
} from "@/app/lib/hooks/useChatLocalCachePersistence";
import { useChatRoomRealtime } from "@/app/lib/hooks/useChatRoomRealtime";
import { useCurrentUserId } from "@/app/lib/hooks/useCurrentUserId";
import { useIsDesktopChat } from "@/app/lib/hooks/useIsDesktopChat";
import { useHkCardVaultStore } from "@/app/store/useHkCardVaultStore";
import { useUIStore } from "@/app/store/useUIStore";
import { ChatOverlaySkeleton } from "@/app/components/chat/ChatOverlaySkeleton";

const GlobalChatConsole = dynamic(
  () =>
    import("@/app/components/chat/GlobalChatConsole").then(
      (module) => module.GlobalChatConsole,
    ),
  {
    ssr: false,
    loading: () => <ChatOverlaySkeleton />,
  },
);

export function GlobalChatOverlay() {
  const isChatOpen = useHkCardVaultStore((state) => state.isChatOpen);
  const activeRoomId = useHkCardVaultStore((state) => state.activeRoomId);
  const mobileView = useHkCardVaultStore((state) => state.mobileView);
  const setChats = useHkCardVaultStore((state) => state.setChats);
  const setActiveRoomId = useHkCardVaultStore((state) => state.setActiveRoomId);
  const setMobileView = useHkCardVaultStore((state) => state.setMobileView);
  const promotePendingChatRoom = useHkCardVaultStore(
    (state) => state.promotePendingChatRoom,
  );
  const chats = useHkCardVaultStore((state) => state.chats);
  const activeListingPersona = useUIStore((state) => state.activeListingPersona);
  const currentUserId = useCurrentUserId();
  const isDesktopChat = useIsDesktopChat();
  const inboxRequestIdRef = useRef(0);
  const lobbySyncTailRef = useRef(Promise.resolve());
  const threadRequestIdRef = useRef(0);
  const lastLobbySyncAtRef = useRef(0);
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRestoreKeyRef = useRef<string | null>(null);
  const LOBBY_STALE_MS = 30_000;
  const [inboxLoading, setInboxLoading] = useState(false);
  const [isLobbyRefreshing, setIsLobbyRefreshing] = useState(false);
  const [threadLoadingRoomId, setThreadLoadingRoomId] = useState<string | null>(
    null,
  );
  const [provisioningRoomId, setProvisioningRoomId] = useState<string | null>(
    null,
  );
  const provisionAttemptedRef = useRef<Set<string>>(new Set());
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  const prevPersonaRef = useRef(activeListingPersona);
  const prevUserIdForLobbySyncRef = useRef<string | null | undefined>(undefined);
  const forceThreadHydrateRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(currentUserId);
  currentUserIdRef.current = currentUserId;

  useChatRoomRealtime({ enabled: Boolean(currentUserId) });
  useChatLocalCachePersistence(currentUserId, activeListingPersona);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    const userChanged =
      prevUserId !== undefined && prevUserId !== currentUserId;

    if (userChanged) {
      resetChatSessionState();
      cacheRestoreKeyRef.current = null;
      lastLobbySyncAtRef.current = 0;
      inboxRequestIdRef.current += 1;
      lobbySyncTailRef.current = Promise.resolve();
      threadRequestIdRef.current += 1;
      provisionAttemptedRef.current.clear();
      forceThreadHydrateRef.current = true;

      if (prevUserId && !currentUserId) {
        clearChatLocalCacheOnLogout(prevUserId);
      }
    }

    prevUserIdRef.current = currentUserId;

    if (!currentUserId) {
      cacheRestoreKeyRef.current = null;
      return;
    }

    const restoreKey = `${currentUserId}:${activeListingPersona}`;

    if (userChanged) {
      cacheRestoreKeyRef.current = restoreKey;
      return;
    }

    if (cacheRestoreKeyRef.current === restoreKey) {
      return;
    }
    cacheRestoreKeyRef.current = restoreKey;

    const cached = readChatLocalCache(currentUserId, activeListingPersona);
    if (cached && cached.length > 0) {
      setChats((currentRooms) => {
        const personaRooms = currentRooms.filter((room) =>
          roomMatchesViewerPersona(room, activeListingPersona),
        );
        return mergeChatRoomsWithDb(personaRooms, cached, {
          stripeRooms: true,
          preferServerUnread: false,
        });
      });
    } else {
      setChats((currentRooms) =>
        currentRooms.filter((room) =>
          roomMatchesViewerPersona(room, activeListingPersona),
        ),
      );
    }
  }, [activeListingPersona, currentUserId, setChats]);

  useEffect(() => {
    if (prevPersonaRef.current === activeListingPersona) {
      return;
    }

    prevPersonaRef.current = activeListingPersona;
    forceThreadHydrateRef.current = true;
    threadRequestIdRef.current += 1;
  }, [activeListingPersona]);

  const applyLobbyMerge = useCallback(
    (dbRooms: Parameters<typeof mergeChatRoomsWithDb>[1]) => {
      const prevActiveId = useHkCardVaultStore.getState().activeRoomId;
      const prevChats = useHkCardVaultStore.getState().chats;
      const prevActive = prevChats.find((room) => room.id === prevActiveId);

      setChats((currentRooms) =>
        mergeChatRoomsWithDb(currentRooms, dbRooms, {
          stripeRooms: Boolean(currentUserId),
          preferServerUnread: true,
        }),
      );

      if (prevActive) {
        const merged = useHkCardVaultStore.getState().chats;
        if (!merged.some((room) => room.id === prevActiveId)) {
          const replacement =
            findRoomByPartnerId(
              merged,
              prevActive.partnerId,
              prevActive.partnerPersona,
            ) ??
            findRoomByPartnerName(
              merged,
              prevActive.partnerName,
              prevActive.partnerPersona,
            );
          setActiveRoomId(replacement?.id ?? "");
        }
      } else if (
        prevActiveId &&
        !useHkCardVaultStore
          .getState()
          .chats.some((room) => room.id === prevActiveId)
      ) {
        setActiveRoomId("");
      }
    },
    [currentUserId, setActiveRoomId, setChats],
  );

  const syncInboxLobby = useCallback(
    async (options?: {
      showLoading?: boolean;
      force?: boolean;
      backgroundRefresh?: boolean;
      trigger?: string;
    }) => {
      const showLoading = options?.showLoading ?? false;
      const backgroundRefresh = options?.backgroundRefresh ?? false;
      const now = Date.now();

      if (
        !options?.force &&
        now - lastLobbySyncAtRef.current < LOBBY_STALE_MS
      ) {
        return;
      }

      const syncUserId = currentUserIdRef.current;
      if (!syncUserId) {
        return;
      }

      const requestId = ++inboxRequestIdRef.current;

      const run = async () => {
        if (showLoading) {
          setInboxLoading(true);
        }
        if (backgroundRefresh) {
          setIsLobbyRefreshing(true);
        }

        try {
          const result = await getUserChatInboxLobby();

          if (syncUserId !== currentUserIdRef.current) {
            return;
          }

          if (!result.success) {
            if (showLoading) {
              toast.error(result.error);
            }
            return;
          }

          applyLobbyMerge(result.data);

          if (result.data.length > 0) {
            lastLobbySyncAtRef.current = Date.now();
          }
        } finally {
          if (requestId === inboxRequestIdRef.current) {
            if (showLoading) {
              setInboxLoading(false);
            }
            if (backgroundRefresh) {
              setIsLobbyRefreshing(false);
            }
          }
        }
      };

      const queued = lobbySyncTailRef.current.then(run).catch(() => undefined);
      lobbySyncTailRef.current = queued;
      await queued;
    },
    [activeListingPersona, applyLobbyMerge, currentUserId],
  );

  useEffect(() => {
    if (!currentUserId) {
      prevUserIdForLobbySyncRef.current = currentUserId;
      return;
    }

    const prevUserId = prevUserIdForLobbySyncRef.current;
    const userChanged = prevUserId !== currentUserId;

    void syncInboxLobby({
      force: true,
      showLoading: userChanged,
      backgroundRefresh: !userChanged,
      trigger: userChanged ? "userId-change" : "persona-or-remount",
    });

    prevUserIdForLobbySyncRef.current = currentUserId;
  }, [activeListingPersona, currentUserId, syncInboxLobby]);

  const hydrateActiveThread = useCallback(async (roomId: string) => {
    if (!isDbChatRoomId(roomId)) {
      return;
    }

    const activeRoom = useHkCardVaultStore
      .getState()
      .chats.find((room) => room.id === roomId);

    const hasCachedThread = roomHasPersistedThreadTail(activeRoom);
    const requestId = ++threadRequestIdRef.current;

    if (!hasCachedThread) {
      setThreadLoadingRoomId(roomId);
    }

    try {
      const shouldForceHydrate = forceThreadHydrateRef.current;
      if (shouldForceHydrate) {
        forceThreadHydrateRef.current = false;
      }

      const { isChatOpen, activeRoomId, mobileView } =
        useHkCardVaultStore.getState();
      const markRead = isViewingChatThread(
        { isChatOpen, activeRoomId, mobileView },
        roomId,
      );

      const result = await hydrateChatRoomThread(roomId, {
        force: shouldForceHydrate,
        markRead,
      });

      if (requestId !== threadRequestIdRef.current) {
        return;
      }

      if (!result.success) {
        toast.error(result.error);
      }
    } finally {
      if (requestId === threadRequestIdRef.current) {
        setThreadLoadingRoomId((current) =>
          current === roomId ? null : current,
        );
      }
    }
  }, []);

  const prevChatOpenRef = useRef(isChatOpen);

  useEffect(() => {
    const wasOpen = prevChatOpenRef.current;
    prevChatOpenRef.current = isChatOpen;

    if (!wasOpen || isChatOpen || !currentUserId) {
      return;
    }

    void syncInboxLobby({
      showLoading: false,
      trigger: "chat-closed",
    });
  }, [currentUserId, isChatOpen, syncInboxLobby]);

  useEffect(() => {
    const { activeRoomId, chats, isChatOpen: chatOpen } =
      useHkCardVaultStore.getState();
    if (!activeRoomId) {
      return;
    }

    const activeRoom = chats.find((room) => room.id === activeRoomId);
    if (
      activeRoom &&
      !roomMatchesViewerPersona(activeRoom, activeListingPersona)
    ) {
      setActiveRoomId("");
      setMobileView("LIST");
      return;
    }

    if (chatOpen) {
      void syncInboxLobby({
        force: true,
        backgroundRefresh: true,
        trigger: "active-room-persona",
      });
    }
  }, [
    activeListingPersona,
    setActiveRoomId,
    setMobileView,
    syncInboxLobby,
  ]);

  useEffect(() => {
    if (!isChatOpen) {
      setInboxLoading(false);
      setIsLobbyRefreshing(false);
      return;
    }

    const hasCachedRooms = useHkCardVaultStore.getState().chats.length > 0;

    void syncInboxLobby({
      force: true,
      showLoading: !hasCachedRooms,
      backgroundRefresh: hasCachedRooms,
      trigger: "chat-open",
    });
  }, [isChatOpen, syncInboxLobby]);

  useEffect(() => {
    if (!isChatOpen || !activeRoomId) {
      return;
    }

    void hydrateActiveThread(activeRoomId);
  }, [activeRoomId, hydrateActiveThread, isChatOpen]);

  useEffect(() => {
    if (!isChatOpen || !activeRoomId || isDbChatRoomId(activeRoomId)) {
      if (!isChatOpen) {
        setProvisioningRoomId(null);
      }
      return;
    }

    if (!currentUserId) {
      if (!provisionAttemptedRef.current.has(activeRoomId)) {
        provisionAttemptedRef.current.add(activeRoomId);
        toast.error("請先登入後再開啟對話");
      }
      return;
    }

    const activeRoom = chats.find((room) => room.id === activeRoomId);
    if (!activeRoom || !isEphemeralChatRoomId(activeRoomId)) {
      return;
    }

    if (!isProfileUuid(activeRoom.partnerId)) {
      if (!provisionAttemptedRef.current.has(activeRoomId)) {
        provisionAttemptedRef.current.add(activeRoomId);
        toast.error("請輸入有效用戶 ID 開啟對話");
      }
      return;
    }

    if (provisionAttemptedRef.current.has(activeRoomId)) {
      return;
    }

    provisionAttemptedRef.current.add(activeRoomId);
    setProvisioningRoomId(activeRoomId);

    void ensureChatRoom({
      partnerId: activeRoom.partnerId,
      partnerPersona: activeRoom.partnerPersona,
      viewerPersona: activeListingPersona,
    })
      .then((result) => {
        if (!result.success) {
          toast.error(result.error);
          provisionAttemptedRef.current.delete(activeRoomId);
          return;
        }

        promotePendingChatRoom(activeRoomId, result.data);
        void hydrateActiveThread(result.data.id);
      })
      .finally(() => {
        setProvisioningRoomId((current) =>
          current === activeRoomId ? null : current,
        );
      });
  }, [
    activeListingPersona,
    activeRoomId,
    chats,
    currentUserId,
    hydrateActiveThread,
    isChatOpen,
    promotePendingChatRoom,
  ]);

  useEffect(() => {
    if (!isChatOpen || !activeRoomId || !isDbChatRoomId(activeRoomId)) {
      return;
    }

    if (threadLoadingRoomId === activeRoomId) {
      return;
    }

    const { mobileView } = useHkCardVaultStore.getState();
    const isViewingThread = isViewingChatThread(
      { isChatOpen, activeRoomId, mobileView },
      activeRoomId,
    );
    if (!isViewingThread) {
      return;
    }

    if (markReadTimerRef.current) {
      clearTimeout(markReadTimerRef.current);
    }

    markReadTimerRef.current = setTimeout(() => {
      const activeRoom = useHkCardVaultStore
        .getState()
        .chats.find((room) => room.id === activeRoomId);
      const lastMessageTs =
        activeRoom?.messages.at(-1)?.timestamp ?? activeRoom?.timestamp;

      void persistMarkRoomReadAsync(activeRoomId, lastMessageTs).then(
        (persisted) => {
          if (persisted) {
            void syncInboxLobby({ force: true, backgroundRefresh: true });
          }
        },
      );
    }, 300);

    return () => {
      if (markReadTimerRef.current) {
        clearTimeout(markReadTimerRef.current);
        markReadTimerRef.current = null;
      }
    };
  }, [
    activeRoomId,
    isChatOpen,
    isDesktopChat,
    mobileView,
    syncInboxLobby,
    threadLoadingRoomId,
  ]);

  return (
    <AnimatePresence mode="wait">
      {isChatOpen ? (
        <GlobalChatConsole
          key="global-chat-console"
          inboxLoading={inboxLoading}
          isLobbyRefreshing={isLobbyRefreshing}
          threadLoadingRoomId={threadLoadingRoomId}
          isProvisioningRoom={provisioningRoomId === activeRoomId}
        />
      ) : null}
    </AnimatePresence>
  );
}
