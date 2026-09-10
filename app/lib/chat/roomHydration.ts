import { isDbChatRoomId } from "@/app/lib/chat/constants";
import type { ChatRoom } from "@/app/store/useHkCardVaultStore";

export function roomNeedsThreadHydration(room: ChatRoom | undefined): boolean {
  if (!room || !isDbChatRoomId(room.id)) {
    return false;
  }

  return room.threadHydrated !== true;
}

export function roomHasPersistedThreadTail(room: ChatRoom | undefined): boolean {
  if (!room || room.threadHydrated !== true) {
    return false;
  }

  return room.messages.some((message) => !message.id.startsWith("opt-"));
}
