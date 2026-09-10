import {
  CHAT_UNREAD_DIGEST_COOLDOWN_HOURS,
  CHAT_UNREAD_DIGEST_RECENT_ACTIVITY_MINUTES,
} from "@/lib/notifications/push-config";

export function shouldSendChatUnreadDigest(unreadCount: number): boolean {
  return Number.isFinite(unreadCount) && unreadCount > 0;
}

export function shouldSkipChatDigestForRecentActivity(
  lastActiveAt: string | null | undefined,
  now: Date,
  recentActivityMinutes = CHAT_UNREAD_DIGEST_RECENT_ACTIVITY_MINUTES,
): boolean {
  if (!lastActiveAt) {
    return false;
  }

  const lastMs = Date.parse(lastActiveAt);
  if (!Number.isFinite(lastMs)) {
    return false;
  }

  const elapsedMs = now.getTime() - lastMs;
  return elapsedMs < recentActivityMinutes * 60 * 1000;
}

export function isChatDigestCooldownActive(
  lastPushedAt: string | null | undefined,
  now: Date,
  cooldownHours = CHAT_UNREAD_DIGEST_COOLDOWN_HOURS,
): boolean {
  if (!lastPushedAt) {
    return false;
  }

  const lastMs = Date.parse(lastPushedAt);
  if (!Number.isFinite(lastMs)) {
    return false;
  }

  const elapsedMs = now.getTime() - lastMs;
  return elapsedMs < cooldownHours * 60 * 60 * 1000;
}

export function buildChatUnreadDigestPushCopy(unreadCount: number): {
  heading: string;
  body: string;
} {
  return {
    heading: "你有未讀訊息",
    body: `你有 ${unreadCount} 則未讀訊息 — 打開收件匣查看`,
  };
}
