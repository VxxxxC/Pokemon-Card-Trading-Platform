import { afterAll, describe, expect, it } from "vitest";
import {
  getUserChatInboxLobby,
  ensureChatRoom,
  markChatRoomRead,
  sendMessage,
} from "@/app/actions/chat";
import {
  clearSessionCache,
  runAsBuyer,
  warmSession,
} from "../shared/auth-context";
import { authState } from "../shared/auth-state";
import { hasBaseIntegrationEnv } from "../shared/env";

const VALID_ROOM_UUID = "00000000-0000-4000-8000-000000000001";

describe("TC-M21 chat server actions — contract", () => {
  it("sendMessage rejects empty room id", async () => {
    const result = await sendMessage("", "hello");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("請先選擇聊天室");
    }
  });

  it("sendMessage rejects empty body", async () => {
    const result = await sendMessage(VALID_ROOM_UUID, "   ");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("訊息不能為空");
    }
  });

  it("sendMessage rejects overlong body", async () => {
    const result = await sendMessage(VALID_ROOM_UUID, "x".repeat(2001));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("訊息長度不可超過");
    }
  });

  it("markChatRoomRead rejects invalid room id format", async () => {
    const result = await markChatRoomRead("pending-seller-123");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("無效的聊天室");
    }
  });

  it("ensureChatRoom rejects non-uuid partner id", async () => {
    const result = await ensureChatRoom({
      partnerId: "pikachu",
      partnerPersona: "member",
      viewerPersona: "member",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("用戶 ID");
    }
  });

  it("ensureChatRoom rejects empty partner id", async () => {
    const result = await ensureChatRoom({
      partnerId: "",
      partnerPersona: "member",
      viewerPersona: "member",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("無效的對話對象");
    }
  });

  it("getUserChatInboxLobby handles guest session without throwing", async () => {
    authState.user = null;
    authState.supabase = null;

    const result = await getUserChatInboxLobby();
    if (result.success) {
      expect(result.data).toEqual([]);
    } else {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!hasBaseIntegrationEnv())(
  "TC-M21 chat server actions — smoke",
  () => {
    afterAll(async () => {
      await clearSessionCache();
    });

    it("buyer can load chat inbox lobby", async () => {
      await warmSession("buyer");

      const result = await runAsBuyer(async () => getUserChatInboxLobby());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.data)).toBe(true);
      }
    });

    it("buyer markChatRoomRead on unknown room returns structured error", async () => {
      await warmSession("buyer");

      const result = await runAsBuyer(async () =>
        markChatRoomRead(VALID_ROOM_UUID),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("標記已讀失敗");
      }
    });

    it("buyer sendMessage to unknown room returns RPC error without throwing", async () => {
      await warmSession("buyer");

      const result = await runAsBuyer(async () =>
        sendMessage(VALID_ROOM_UUID, "integration smoke ping"),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.length).toBeGreaterThan(0);
      }
    });
  },
);
