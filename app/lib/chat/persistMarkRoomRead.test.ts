import { describe, expect, test } from "bun:test";
import { getRoomIdsToMarkRead } from "@/app/lib/chat/persistMarkRoomRead";
import type { ChatRoom } from "@/app/store/useHkCardVaultStore";

const PARTNER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function makeRoom(
  overrides: Partial<ChatRoom> &
    Pick<ChatRoom, "id" | "viewerPersona" | "partnerPersona">,
): ChatRoom {
  const partnerPersona = overrides.partnerPersona ?? "member";

  return {
    id: overrides.id,
    partnerId: overrides.partnerId ?? PARTNER_ID,
    partnerPersona,
    viewerPersona: overrides.viewerPersona,
    partnerName: overrides.partnerName ?? "Partner",
    partnerAvatarUrl: "/asset/default-avator.webp",
    partnerTier:
      partnerPersona === "merchant" ? "專業認證商戶" : "認證用戶",
    lastMessage: "hello",
    unreadCount: overrides.unreadCount ?? 1,
    timestamp: "2026-07-18T10:00:00.000Z",
    messages: [],
  };
}

describe("getRoomIdsToMarkRead", () => {
  test("marks only the member-viewer room when reading member thread", () => {
    const memberRoom = makeRoom({
      id: "11111111-1111-4111-8111-111111111111",
      viewerPersona: "member",
      partnerPersona: "merchant",
    });
    const merchantRoom = makeRoom({
      id: "22222222-2222-4222-8222-222222222222",
      viewerPersona: "merchant",
      partnerPersona: "member",
    });

    expect(
      getRoomIdsToMarkRead([memberRoom, merchantRoom], memberRoom.id),
    ).toEqual([memberRoom.id]);
  });

  test("marks only the merchant-viewer room when reading merchant thread", () => {
    const memberRoom = makeRoom({
      id: "11111111-1111-4111-8111-111111111111",
      viewerPersona: "member",
      partnerPersona: "merchant",
    });
    const merchantRoom = makeRoom({
      id: "22222222-2222-4222-8222-222222222222",
      viewerPersona: "merchant",
      partnerPersona: "member",
    });

    expect(
      getRoomIdsToMarkRead([memberRoom, merchantRoom], merchantRoom.id),
    ).toEqual([merchantRoom.id]);
  });
});
