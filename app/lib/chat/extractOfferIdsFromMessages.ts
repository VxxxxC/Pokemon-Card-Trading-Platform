import type { Message } from "@/app/store/useHkCardVaultStore";

export function extractOfferIdsFromMessages(messages: Message[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    const offerId = message.specialData?.offerId;
    if (message.type === "special_transaction" && offerId) {
      ids.add(offerId);
    }
  }
  return [...ids];
}
