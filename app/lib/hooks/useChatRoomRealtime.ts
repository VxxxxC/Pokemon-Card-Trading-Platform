"use client";

import { useEffect, useRef } from "react";
import { getOfferCardContext } from "@/app/actions/offers";
import { hydrateChatRoomThread } from "@/app/lib/chat/hydrateChatRoomThread";
import { isDbChatRoomId } from "@/app/lib/chat/constants";
import { persistMarkRoomReadAsync } from "@/app/lib/chat/persistMarkRoomRead";
import { refreshInboxLobbyInStore } from "@/lib/chat/refresh-inbox-lobby";
import {
  isViewingChatThread,
} from "@/lib/chat/viewing-chat-thread";
import {
  decodeOfferRealtimeEvent,
  getLastPersistedMessageTimestamp,
  isInboundTransactionSystemContent,
  isInitialOfferRealtimeMessage,
  mapChatMessageRowToStoreMessage,
  parseModifyOfferPriceFromContent,
  type RealtimeChatMessageRow,
} from "@/app/lib/chat/realtimeChatMessages";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";
import { useHkCardVaultStore } from "@/app/store/useHkCardVaultStore";

type UseChatRoomRealtimeOptions = {
  enabled: boolean;
};

function isRealtimeDbRoom(roomId: string): boolean {
  return isDbChatRoomId(roomId);
}

const roomHydrateQueues = new Map<string, Promise<void>>();

async function enqueueRoomHydrate(roomId: string): Promise<void> {
  const previous = roomHydrateQueues.get(roomId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await hydrateChatRoomThread(roomId, { force: true });
    });
  roomHydrateQueues.set(roomId, next);

  try {
    await next;
  } finally {
    if (roomHydrateQueues.get(roomId) === next) {
      roomHydrateQueues.delete(roomId);
    }
  }
}

async function removeChatInboxChannels(
  supabase: ReturnType<typeof createClient>,
) {
  const staleChannels = supabase
    .getChannels()
    .filter((activeChannel) => activeChannel.topic.startsWith("realtime:chat-inbox"));

  await Promise.all(
    staleChannels.map((activeChannel) => supabase.removeChannel(activeChannel)),
  );
}

export function useChatRoomRealtime({ enabled }: UseChatRoomRealtimeOptions) {
  const processingRef = useRef(false);
  const subscribingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!isSupabaseConfigured()) {
      return;
    }

    let cancelled = false;
    const supabase = createClient();
    const currentUserIdRef = { current: null as string | null };
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const syncRealtimeAuth = async (): Promise<string | null> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }

      return session?.user?.id ?? null;
    };

    const processRow = async (row: RealtimeChatMessageRow) => {
      const currentUserId = currentUserIdRef.current;
      if (cancelled || !currentUserId || !isRealtimeDbRoom(row.room_id)) {
        return;
      }

      const {
        appendRoomMessage,
        applyOfferAccepted,
        applyOfferRejected,
        applyOfferPriceSync,
        activeRoomId,
        isChatOpen,
        mobileView,
      } = useHkCardVaultStore.getState();

      const isIncoming = row.sender_id !== currentUserId;
      const isActiveOpenThread =
        isIncoming &&
        isViewingChatThread(
          { isChatOpen, activeRoomId, mobileView },
          row.room_id,
        );

      const markActiveThreadReadIfNeeded = () => {
        if (isActiveOpenThread) {
          void persistMarkRoomReadAsync(row.room_id, row.created_at ?? undefined);
        }
      };

      if (isInitialOfferRealtimeMessage(row)) {
        const hadRoom = useHkCardVaultStore
          .getState()
          .chats.some((room) => room.id === row.room_id);

        if (isActiveOpenThread) {
          await enqueueRoomHydrate(row.room_id);
          markActiveThreadReadIfNeeded();
          return;
        }

        if (!hadRoom) {
          await refreshInboxLobbyInStore();
        } else {
          const roomState = useHkCardVaultStore
            .getState()
            .chats.find((room) => room.id === row.room_id);
          const sellerId =
            roomState?.messages.find((message) => message.specialData?.sellerId)
              ?.specialData?.sellerId ?? roomState?.partnerId;

          const message = mapChatMessageRowToStoreMessage(
            row,
            currentUserId,
            sellerId,
          );
          appendRoomMessage(row.room_id, message);
        }

        return;
      }

      const roomState = useHkCardVaultStore
        .getState()
        .chats.find((room) => room.id === row.room_id);
      const sellerId =
        roomState?.messages.find((message) => message.specialData?.sellerId)
          ?.specialData?.sellerId ??
        (roomState?.partnerId != null &&
        roomState.messages.some(
          (message) =>
            message.specialData?.buyerId != null &&
            roomState.partnerId === message.specialData.buyerId,
        )
          ? currentUserId
          : roomState?.partnerId);

      const message = mapChatMessageRowToStoreMessage(
        row,
        currentUserId,
        sellerId,
      );
      const hadRoom = useHkCardVaultStore
        .getState()
        .chats.some((room) => room.id === row.room_id);
      const countAsUnread =
        isIncoming && isInboundTransactionSystemContent(row.content);
      appendRoomMessage(row.room_id, message, { countAsUnread });
      if (!hadRoom) {
        await refreshInboxLobbyInStore();
      }
      markActiveThreadReadIfNeeded();

      const event = decodeOfferRealtimeEvent(row);
      if (!event) {
        return;
      }

      if (event.type === "accepted") {
        const orderId =
          event.orderKind === "merchant"
            ? event.merchantOrderId
            : event.memberOrderId;
        if (orderId) {
          applyOfferAccepted(
            event.offerId,
            orderId,
            event.orderKind ?? "member",
          );
        }
        markActiveThreadReadIfNeeded();
        return;
      }

      if (event.type === "rejected") {
        applyOfferRejected(event.offerId);
        markActiveThreadReadIfNeeded();
        return;
      }

      const parsedPrice = parseModifyOfferPriceFromContent(row.content);
      if (parsedPrice != null) {
        const ledgerEntry = useHkCardVaultStore.getState().offers[event.offerId];
        applyOfferPriceSync({
          offerId: event.offerId,
          offerPrice: parsedPrice,
          modifiedCount: (ledgerEntry?.modifiedCount ?? 0) + 1,
        });
        return;
      }

      const result = await getOfferCardContext(event.offerId);
      if (!result.success || cancelled) {
        return;
      }

      applyOfferPriceSync({
        offerId: event.offerId,
        offerPrice: result.data.offer.offer_price,
        modifiedCount: result.data.offer.modified_count,
      });
    };

    const reconcileRoom = async (roomId: string): Promise<void> => {
      const activeRoom = useHkCardVaultStore
        .getState()
        .chats.find((room) => room.id === roomId);
      const since = activeRoom
        ? getLastPersistedMessageTimestamp(activeRoom.messages) ??
          activeRoom.timestamp ??
          null
        : null;

      let query = supabase
        .from("chat_messages")
        .select(
          "id, room_id, content, created_at, sender_id, offer_id, member_order_id, merchant_order_id, is_system_warning",
        )
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (since) {
        query = query.gt("created_at", since);
      }

      const { data, error } = await query;

      if (cancelled || error || !data) {
        if (error) {
          console.error(
            "[useChatRoomRealtime] reconcile",
            roomId,
            error.message,
          );
        }
        return;
      }

      for (const row of data as RealtimeChatMessageRow[]) {
        if (cancelled) {
          return;
        }
        await processRow(row);
      }
    };

    const reconcileMissedMessages = async () => {
      if (processingRef.current || cancelled || !currentUserIdRef.current) {
        return;
      }

      processingRef.current = true;

      try {
        const state = useHkCardVaultStore.getState();
        const dbRooms = state.chats.filter((room) => {
          if (!isDbChatRoomId(room.id)) {
            return false;
          }
          if (!state.isChatOpen) {
            return true;
          }
          if (room.id === state.activeRoomId) {
            return true;
          }
          if (room.unreadCount > 0) {
            return true;
          }
          return false;
        });

        const concurrency = 5;
        let nextIndex = 0;

        const workers = Array.from(
          { length: Math.min(concurrency, dbRooms.length) },
          async () => {
            while (nextIndex < dbRooms.length) {
              if (cancelled) {
                return;
              }

              const room = dbRooms[nextIndex];
              nextIndex += 1;
              await reconcileRoom(room.id);
            }
          },
        );

        await Promise.all(workers);
      } finally {
        processingRef.current = false;
      }
    };

    const teardownChannel = async () => {
      if (channel) {
        const activeChannel = channel;
        channel = null;
        await supabase.removeChannel(activeChannel);
      }

      await removeChatInboxChannels(supabase);
    };

    const subscribe = async () => {
      if (subscribingRef.current || cancelled) {
        return;
      }

      subscribingRef.current = true;

      try {
        const userId = await syncRealtimeAuth();
        if (cancelled || !userId) {
          return;
        }

        currentUserIdRef.current = userId;
        await teardownChannel();

        if (cancelled) {
          return;
        }

        const channelName = `chat-inbox:${userId}`;
        channel = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "chat_messages",
            },
            (payload) => {
              void processRow(payload.new as RealtimeChatMessageRow);
            },
          )
          .subscribe((status, err) => {
            if (status === "SUBSCRIBED") {
              void reconcileMissedMessages();
              return;
            }

            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              console.error(
                "[useChatRoomRealtime] channel",
                status,
                err?.message ?? "",
              );
            }
          });
      } finally {
        subscribingRef.current = false;
      }
    };

    void subscribe();

    let prevDbRoomIds = useHkCardVaultStore
      .getState()
      .chats.filter((room) => isDbChatRoomId(room.id))
      .map((room) => room.id)
      .sort()
      .join(",");
    let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribeStore = useHkCardVaultStore.subscribe((state) => {
      if (cancelled || !currentUserIdRef.current) {
        return;
      }

      const nextDbRoomIds = state.chats
        .filter((room) => isDbChatRoomId(room.id))
        .map((room) => room.id)
        .sort()
        .join(",");

      if (prevDbRoomIds === nextDbRoomIds) {
        return;
      }

      prevDbRoomIds = nextDbRoomIds;
      if (reconcileTimer) {
        clearTimeout(reconcileTimer);
      }
      reconcileTimer = setTimeout(() => {
        void reconcileMissedMessages();
      }, 500);
    });

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) {
        return;
      }

      if (session?.access_token) {
        void supabase.realtime.setAuth(session.access_token);
      }

      const nextUserId = session?.user?.id ?? null;
      if (!nextUserId) {
        currentUserIdRef.current = null;
        void teardownChannel();
        return;
      }

      if (nextUserId !== currentUserIdRef.current) {
        currentUserIdRef.current = nextUserId;
        void subscribe();
      }
    });

    return () => {
      cancelled = true;
      if (reconcileTimer) {
        clearTimeout(reconcileTimer);
      }
      unsubscribeStore();
      authSubscription.unsubscribe();
      void teardownChannel();
    };
  }, [enabled]);
}
