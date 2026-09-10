const SYSTEM_CHAT_MESSAGES: Record<string, string> = {
  SYSTEM_OFFER_ACCEPTED: "賣家已接受出價，訂單已建立",
  SYSTEM_OFFER_REJECTED: "賣家已拒絕出價",
  SYSTEM_ORDER_COMPLETED: "交易已完成",
  SYSTEM_ORDER_CANCELLED: "訂單已取消",
};

export function formatModerationChatMessageContent(content: string): string {
  const trimmed = content.trim();
  const systemLabel = SYSTEM_CHAT_MESSAGES[trimmed];
  if (systemLabel) {
    return systemLabel;
  }

  if (trimmed.startsWith("[AUTH_REQUEST]")) {
    return trimmed.replace(/^\[AUTH_REQUEST\]\s*/, "").trim();
  }

  return trimmed;
}

export function isModerationChatSystemEvent(content: string): boolean {
  return content.trim().startsWith("SYSTEM_");
}

export function shortModerationRefId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}
