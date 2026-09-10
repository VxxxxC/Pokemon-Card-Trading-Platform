import type { Message } from "@/app/store/useHkCardVaultStore";
import {
  isSystemOfferAcceptedText,
  isSystemOfferRejectedText,
} from "@/app/lib/chat/offerSystemMessageCopy";

function collectOfferCardIds(messages: Message[]): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    const offerId = message.specialData?.offerId;
    if (message.type === "special_transaction" && offerId) {
      ids.add(offerId);
    }
  }
  return ids;
}

function isRedundantOfferSystemBubble(
  message: Message,
  offerCardIds: Set<string>,
): boolean {
  if (message.sender !== "system") {
    return false;
  }

  const isOfferStatusCopy =
    isSystemOfferAcceptedText(message.text) ||
    isSystemOfferRejectedText(message.text);
  if (!isOfferStatusCopy) {
    return false;
  }

  if (!message.offerId) {
    return false;
  }

  return offerCardIds.has(message.offerId);
}

/** Hide center system bubbles when the same offer already has an OfferCard in-thread. */
export function filterRedundantOfferSystemMessages(messages: Message[]): Message[] {
  const offerCardIds = collectOfferCardIds(messages);
  if (offerCardIds.size === 0) {
    return messages;
  }

  return messages.filter(
    (message) => !isRedundantOfferSystemBubble(message, offerCardIds),
  );
}
