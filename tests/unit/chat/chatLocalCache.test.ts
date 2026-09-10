import { describe, expect, it, beforeEach } from "vitest";
import { CHAT_THREAD_PAGE_SIZE } from "@/app/lib/chat/constants";
import {
  buildChatLocalCacheKey,
  clearChatLocalCacheForUser,
  readChatLocalCache,
  writeChatLocalCache,
} from "@/app/lib/chat/chatLocalCache";
import { appendDeltaMessagesToRoom } from "@/app/lib/chat/mergeChatRooms";
import type { ChatRoom, Message } from "@/app/store/useHkCardVaultStore";

function createRoom(
  id: string,
  messages: Message[],
  options?: Partial<ChatRoom>,
): ChatRoom {
  return {
    id,
    partnerId: "partner-1",
    partnerName: "Partner",
    partnerAvatarUrl: "",
    partnerTier: "Member",
    lastMessage: messages.at(-1)?.text ?? "尚無訊息",
    unreadCount: 0,
    timestamp: messages.at(-1)?.timestamp ?? "2026-01-01T00:00:00.000Z",
    messages,
    threadHydrated: true,
    threadHasMoreOlder: false,
    ...options,
  };
}

describe("chatLocalCache", () => {
  const userId = "user-123";
  const persona = "member" as const;
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
          removeItem: (key: string) => {
            storage.delete(key);
          },
          key: (index: number) => [...storage.keys()][index] ?? null,
          get length() {
            return storage.size;
          },
          clear: () => storage.clear(),
        },
      },
      configurable: true,
    });
  });

  it("writes and reads inbox with persona-scoped key", () => {
    const room = createRoom("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", [
      {
        id: "msg-1",
        sender: "them",
        text: "hello",
        timestamp: "2026-01-01T10:00:00.000Z",
        type: "text",
      },
    ]);

    writeChatLocalCache(userId, persona, [room]);

    const restored = readChatLocalCache(userId, persona);
    expect(restored?.length).toBe(1);
    expect(restored?.[0].messages[0]?.text).toBe("hello");
    expect(buildChatLocalCacheKey(userId, persona)).toContain(userId);
  });

  it("strips optimistic messages and caps hydrated thread size", () => {
    const messages: Message[] = Array.from({ length: CHAT_THREAD_PAGE_SIZE + 5 }, (_, index) => ({
      id: `msg-${index}`,
      sender: "them",
      text: `m-${index}`,
      timestamp: `2026-01-01T10:${String(index).padStart(2, "0")}:00.000Z`,
      type: "text",
    }));
    messages.push({
      id: "opt-1",
      sender: "me",
      text: "pending",
      timestamp: "2026-01-02T00:00:00.000Z",
      type: "text",
    });

    const room = createRoom("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", messages);
    writeChatLocalCache(userId, persona, [room]);

    const restored = readChatLocalCache(userId, persona)?.[0];
    expect(restored?.messages.some((message) => message.id.startsWith("opt-"))).toBe(
      false,
    );
    expect(restored?.messages.length).toBe(CHAT_THREAD_PAGE_SIZE);
    expect(restored?.messages.at(-1)?.id).toBe(`msg-${CHAT_THREAD_PAGE_SIZE + 4}`);
  });

  it("clears all persona keys for a user", () => {
    writeChatLocalCache(userId, "member", [
      createRoom("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", []),
    ]);
    writeChatLocalCache(userId, "merchant", [
      createRoom("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", []),
    ]);

    clearChatLocalCacheForUser(userId);

    expect(readChatLocalCache(userId, "member")).toBeNull();
    expect(readChatLocalCache(userId, "merchant")).toBeNull();
  });
});

describe("appendDeltaMessagesToRoom", () => {
  it("appends unique delta messages and updates tail metadata", () => {
    const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const rooms = [
      createRoom(roomId, [
        {
          id: "msg-1",
          sender: "them",
          text: "old",
          timestamp: "2026-01-01T10:00:00.000Z",
          type: "text",
        },
      ]),
    ];

    const merged = appendDeltaMessagesToRoom(rooms, roomId, [
      {
        id: "msg-2",
        sender: "them",
        text: "new",
        timestamp: "2026-01-01T10:01:00.000Z",
        type: "text",
      },
    ]);

    expect(merged[0].messages.map((message) => message.id)).toEqual([
      "msg-1",
      "msg-2",
    ]);
    expect(merged[0].lastMessage).toBe("new");
    expect(merged[0].threadHydrated).toBe(true);
  });

  it("dedupes messages by id", () => {
    const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const rooms = [
      createRoom(roomId, [
        {
          id: "msg-1",
          sender: "them",
          text: "old",
          timestamp: "2026-01-01T10:00:00.000Z",
          type: "text",
        },
      ]),
    ];

    const merged = appendDeltaMessagesToRoom(rooms, roomId, [
      {
        id: "msg-1",
        sender: "them",
        text: "dup",
        timestamp: "2026-01-01T10:00:00.000Z",
        type: "text",
      },
    ]);

    expect(merged[0].messages.length).toBe(1);
  });
});
