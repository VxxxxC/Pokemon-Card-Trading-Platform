import { describe, expect, it } from "vitest";
import {
  isViewingChatThread,
  shouldIncrementUnreadForInboundMessage,
} from "@/lib/chat/viewing-chat-thread";

describe("viewing-chat-thread", () => {
  it("counts unread when chat is closed", () => {
    expect(
      shouldIncrementUnreadForInboundMessage(
        {
          isChatOpen: false,
          activeRoomId: "room-1",
          mobileView: "LIST",
        },
        "room-1",
        "them",
      ),
    ).toBe(true);
  });

  it("does not count unread on mobile when lobby list is open", () => {
    expect(
      isViewingChatThread(
        {
          isChatOpen: true,
          activeRoomId: "room-1",
          mobileView: "LIST",
        },
        "room-1",
      ),
    ).toBe(false);

    expect(
      shouldIncrementUnreadForInboundMessage(
        {
          isChatOpen: true,
          activeRoomId: "room-1",
          mobileView: "LIST",
        },
        "room-1",
        "them",
      ),
    ).toBe(true);
  });

  it("does not count unread when mobile thread is open", () => {
    expect(
      shouldIncrementUnreadForInboundMessage(
        {
          isChatOpen: true,
          activeRoomId: "room-1",
          mobileView: "CHAT",
        },
        "room-1",
        "them",
      ),
    ).toBe(false);
  });

  it("ignores outbound messages", () => {
    expect(
      shouldIncrementUnreadForInboundMessage(
        {
          isChatOpen: false,
          activeRoomId: "",
          mobileView: "LIST",
        },
        "room-1",
        "me",
      ),
    ).toBe(false);
  });

  it("counts inbound system offer accept/reject when not viewing thread", () => {
    expect(
      shouldIncrementUnreadForInboundMessage(
        {
          isChatOpen: false,
          activeRoomId: "",
          mobileView: "LIST",
        },
        "room-1",
        "system",
        { countSystemTransaction: true },
      ),
    ).toBe(true);
  });
});
