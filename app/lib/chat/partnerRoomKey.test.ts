import { describe, expect, test } from "bun:test";
import { buildPendingChatRoomId } from "@/app/lib/chat/constants";
import {
  findRoomByPartnerId,
  mergeChatRoomsWithDb,
} from "@/app/lib/chat/mergeChatRooms";
import { buildPartnerRoomKey } from "@/app/lib/chat/partnerRoomKey";
import type { ChatRoom } from "@/app/store/useHkCardVaultStore";
import { generateDeterministicRoomId } from "@/app/lib/utils/chatUtils";

const PARTNER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function makeRoom(
  overrides: Partial<ChatRoom> &
    Pick<ChatRoom, "id" | "partnerPersona"> & {
      viewerPersona?: ChatRoom["viewerPersona"];
    },
): ChatRoom {
  const partnerPersona = overrides.partnerPersona ?? "member";
  const viewerPersona = overrides.viewerPersona ?? "member";

  return {
    id: overrides.id,
    partnerId: overrides.partnerId ?? PARTNER_ID,
    partnerPersona,
    viewerPersona,
    partnerName: overrides.partnerName ?? "Test Partner",
    partnerAvatarUrl: overrides.partnerAvatarUrl ?? "/asset/default-avator.webp",
    partnerTier:
      overrides.partnerTier ??
      (partnerPersona === "merchant" ? "專業認證商戶" : "認證用戶"),
    lastMessage: overrides.lastMessage ?? "hello",
    unreadCount: overrides.unreadCount ?? 0,
    timestamp: overrides.timestamp ?? "2026-07-18T10:00:00.000Z",
    messages: overrides.messages ?? [],
  };
}

describe("partnerRoomKey", () => {
  test("buildPartnerRoomKey includes persona", () => {
    expect(buildPartnerRoomKey(PARTNER_ID, "merchant")).toBe(
      `${PARTNER_ID}:merchant`,
    );
  });

  test("buildPendingChatRoomId differs by persona", () => {
    expect(buildPendingChatRoomId(PARTNER_ID, "member")).not.toBe(
      buildPendingChatRoomId(PARTNER_ID, "merchant"),
    );
  });
});

describe("mergeChatRooms", () => {
  test("keeps separate rooms for same partner id with different personas", () => {
    const memberRoom = makeRoom({
      id: "11111111-1111-4111-8111-111111111111",
      partnerPersona: "member",
      partnerName: "Dual User",
      lastMessage: "member thread",
    });
    const merchantRoom = makeRoom({
      id: "22222222-2222-4222-8222-222222222222",
      partnerPersona: "merchant",
      partnerName: "Shop Name",
      lastMessage: "merchant thread",
    });

    const merged = mergeChatRoomsWithDb([], [memberRoom, merchantRoom]);

    expect(merged).toHaveLength(2);
    expect(merged.map((room) => room.id).sort()).toEqual(
      [memberRoom.id, merchantRoom.id].sort(),
    );
  });

  test("does not merge member-viewer and merchant-viewer rooms with the same partner name", () => {
    const memberViewerRoom = makeRoom({
      id: "11111111-1111-4111-8111-111111111111",
      viewerPersona: "member",
      partnerPersona: "merchant",
      partnerName: "Same Partner",
      lastMessage: "member-view thread",
      messages: [
        {
          id: "member-msg",
          sender: "them",
          text: "member-view message",
          timestamp: "2026-07-18T10:00:00.000Z",
        },
      ],
    });
    const merchantViewerRoom = makeRoom({
      id: "22222222-2222-4222-8222-222222222222",
      viewerPersona: "merchant",
      partnerPersona: "member",
      partnerName: "Same Partner",
      lastMessage: "merchant-view thread",
      messages: [
        {
          id: "merchant-msg",
          sender: "them",
          text: "merchant-view message",
          timestamp: "2026-07-18T10:01:00.000Z",
        },
      ],
    });

    const merged = mergeChatRoomsWithDb(
      [memberViewerRoom],
      [merchantViewerRoom],
    );

    expect(merged).toHaveLength(2);
    expect(
      merged.find((room) => room.viewerPersona === "member")?.messages,
    ).toHaveLength(1);
    expect(
      merged.find((room) => room.viewerPersona === "merchant")?.messages,
    ).toHaveLength(1);
  });

  test("preserves local unread when lobby sync prefers server but server lags", () => {
    const localRoom = makeRoom({
      id: "11111111-1111-4111-8111-111111111111",
      partnerPersona: "member",
      viewerPersona: "merchant",
      unreadCount: 1,
    });
    const dbRoom = makeRoom({
      id: "11111111-1111-4111-8111-111111111111",
      partnerPersona: "member",
      viewerPersona: "merchant",
      unreadCount: 0,
    });

    const merged = mergeChatRoomsWithDb([localRoom], [dbRoom], {
      preferServerUnread: true,
    });

    expect(merged[0]?.unreadCount).toBe(1);
  });

  test("findRoomByPartnerId respects persona", () => {
    const rooms = [
      makeRoom({
        id: "11111111-1111-4111-8111-111111111111",
        partnerPersona: "member",
      }),
      makeRoom({
        id: "22222222-2222-4222-8222-222222222222",
        partnerPersona: "merchant",
      }),
    ];

    expect(findRoomByPartnerId(rooms, PARTNER_ID, "merchant")?.id).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
    expect(findRoomByPartnerId(rooms, PARTNER_ID, "member")?.id).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });
});

describe("generateDeterministicRoomId", () => {
  test("persona tuple changes room id", () => {
    const memberSeller = generateDeterministicRoomId(
      "buyer-id",
      "member",
      PARTNER_ID,
      "member",
    );
    const merchantSeller = generateDeterministicRoomId(
      "buyer-id",
      "member",
      PARTNER_ID,
      "merchant",
    );

    expect(memberSeller).not.toBe(merchantSeller);
  });
});
