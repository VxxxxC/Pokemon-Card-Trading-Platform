import { describe, expect, it } from "vitest";
import {
  buildEnsureChatRoomLookupTuples,
  findChatRoomByPartyTuples,
} from "@/lib/chat/ensure-chat-room-lookup";

const VIEWER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PARTNER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("ensure-chat-room-lookup", () => {
  it("builds forward and reverse persona tuples", () => {
    expect(
      buildEnsureChatRoomLookupTuples(
        VIEWER_ID,
        PARTNER_ID,
        "member",
        "merchant",
      ),
    ).toEqual([
      {
        buyerId: VIEWER_ID,
        buyerPersona: "member",
        sellerId: PARTNER_ID,
        sellerPersona: "merchant",
      },
      {
        buyerId: PARTNER_ID,
        buyerPersona: "merchant",
        sellerId: VIEWER_ID,
        sellerPersona: "member",
      },
    ]);
  });

  it("finds an existing room regardless of buyer/seller orientation", () => {
    const existing = {
      buyerId: PARTNER_ID,
      buyerPersona: "merchant" as const,
      sellerId: VIEWER_ID,
      sellerPersona: "member" as const,
    };

    const match = findChatRoomByPartyTuples(
      [existing],
      VIEWER_ID,
      PARTNER_ID,
      "member",
      "merchant",
    );

    expect(match).toEqual(existing);
  });
});
