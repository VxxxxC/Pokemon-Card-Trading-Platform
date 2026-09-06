import { useHkCardVaultStore } from "@/app/store/useHkCardVaultStore";

export function resetChatSessionState(): void {
  useHkCardVaultStore.setState({
    chats: [],
    offers: {},
    activeRoomId: "",
    mobileView: "LIST",
  });
}
