export type NotificationPrefCategory =
  | "transactional"
  | "market_alerts"
  | "rewards"
  | "chat_digest"
  | "mandatory";

export type NotificationPreferenceField =
  | "push_transactional"
  | "push_market_alerts"
  | "push_chat_digest"
  | "push_rewards"
  | "email_transactional"
  | "email_market_alerts"
  | "email_rewards";

export type NotificationPrefRecord = {
  push_transactional: boolean;
  push_market_alerts: boolean;
  push_chat_digest: boolean;
  push_rewards: boolean;
  email_transactional: boolean;
  email_market_alerts: boolean;
  email_rewards: boolean;
};

export function classifyPushEvent(eventId: string): NotificationPrefCategory {
  if (eventId.startsWith("P-MOD-") || eventId.startsWith("P-ACC-")) {
    return "mandatory";
  }
  if (
    eventId.startsWith("P-OFF-") ||
    eventId.startsWith("P-ORD-") ||
    eventId.startsWith("P-GRD-")
  ) {
    return "transactional";
  }
  if (eventId.startsWith("P-WIS-")) {
    return "market_alerts";
  }
  if (eventId.startsWith("P-RWD-")) {
    return "rewards";
  }
  if (eventId.startsWith("P-CHT-")) {
    return "chat_digest";
  }
  return "mandatory";
}

export function classifyEmailEvent(eventId: string): NotificationPrefCategory {
  if (eventId.startsWith("E-ACC-") || eventId.startsWith("E-MOD-")) {
    return "mandatory";
  }
  if (eventId.startsWith("E-RWD-")) {
    return "rewards";
  }
  if (eventId.startsWith("E-WIS-")) {
    return "market_alerts";
  }
  if (
    eventId.startsWith("E-OFF-") ||
    eventId.startsWith("E-ORD-") ||
    eventId.startsWith("E-GRD-") ||
    eventId.startsWith("E-REF-") ||
    eventId.startsWith("E-PAY-") ||
    eventId.startsWith("E-MCH-")
  ) {
    return "transactional";
  }
  return "mandatory";
}

export function pushPrefFieldForCategory(
  category: NotificationPrefCategory,
): keyof NotificationPrefRecord | null {
  switch (category) {
    case "transactional":
      return "push_transactional";
    case "market_alerts":
      return "push_market_alerts";
    case "chat_digest":
      return "push_chat_digest";
    case "rewards":
      return "push_rewards";
    default:
      return null;
  }
}

export function emailPrefFieldForCategory(
  category: NotificationPrefCategory,
): keyof NotificationPrefRecord | null {
  switch (category) {
    case "transactional":
      return "email_transactional";
    case "market_alerts":
      return "email_market_alerts";
    case "rewards":
      return "email_rewards";
    default:
      return null;
  }
}
