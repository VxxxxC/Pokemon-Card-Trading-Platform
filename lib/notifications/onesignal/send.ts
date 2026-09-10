import { getSiteUrl } from "@/lib/auth/site-url";
import { buildAbsoluteUrl } from "@/lib/notifications/email-urls";
import {
  getOneSignalAppId,
  isOneSignalConfigured,
} from "@/lib/notifications/onesignal/env";

export type SendOneSignalPushInput = {
  eventId: string;
  subscriptionIds?: string[];
  externalUserIds?: string[];
  heading: string;
  body: string;
  /** App-relative path, e.g. `/marketplace/product/uuid` */
  path?: string;
};

export type SendOneSignalPushResult =
  | {
      success: true;
      notificationId: string;
      targeting: "subscription_ids" | "external_id";
      skipped: false;
    }
  | { success: true; skipped: true; reason: string }
  | { success: false; error: string };

type OneSignalCreateNotificationResponse = {
  id?: string;
  errors?: string[] | Record<string, unknown>;
};

type OneSignalTargetBody =
  | {
      include_subscription_ids: string[];
    }
  | {
      include_aliases: { external_id: string[] };
      target_channel: "push";
    };

export function buildOneSignalLocalizedContent(
  text: string,
): Record<string, string> {
  return {
    en: text,
    "zh-Hant": text,
  };
}

function extractOneSignalErrors(
  payload: OneSignalCreateNotificationResponse | Record<string, never>,
): string | null {
  if (typeof payload !== "object" || payload === null || !("errors" in payload)) {
    return null;
  }

  const { errors } = payload;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.join(", ");
  }

  if (errors && typeof errors === "object" && Object.keys(errors).length > 0) {
    return JSON.stringify(errors);
  }

  return null;
}

export function parseOneSignalCreateResponse(
  payload: OneSignalCreateNotificationResponse | Record<string, never>,
  responseOk: boolean,
): { notificationId: string | null; error: string | null } {
  const apiError = extractOneSignalErrors(payload);
  if (apiError) {
    return { notificationId: null, error: apiError };
  }

  if (!responseOk) {
    return { notificationId: null, error: "OneSignal API request failed" };
  }

  const notificationId =
    typeof payload === "object" &&
    payload !== null &&
    "id" in payload &&
    typeof payload.id === "string"
      ? payload.id.trim()
      : "";

  if (!notificationId) {
    return {
      notificationId: null,
      error:
        "OneSignal returned empty notification id (subscription may be invalid, unsubscribed, or from another app)",
    };
  }

  return { notificationId, error: null };
}

async function postOneSignalNotification(
  target: OneSignalTargetBody,
  message: {
    eventId: string;
    heading: string;
    body: string;
    path?: string;
  },
): Promise<SendOneSignalPushResult> {
  const appId = getOneSignalAppId();
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) {
    return { success: true, skipped: true, reason: "OneSignal is not configured" };
  }

  const siteUrl = await getSiteUrl();
  const url =
    message.path && siteUrl
      ? buildAbsoluteUrl(siteUrl, message.path)
      : undefined;
  const iconUrl =
    siteUrl !== null ? buildAbsoluteUrl(siteUrl, "/default-icon.png") : undefined;

  const response = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      ...target,
      headings: buildOneSignalLocalizedContent(message.heading),
      contents: buildOneSignalLocalizedContent(message.body),
      chrome_web_icon: iconUrl,
      url,
      data: { eventId: message.eventId },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as
    | OneSignalCreateNotificationResponse
    | Record<string, never>;

  if (process.env.NODE_ENV === "development") {
    console.info("[OneSignal] create notification response", {
      ok: response.ok,
      status: response.status,
      target: "include_subscription_ids" in target ? "subscription_ids" : "external_id",
      payload,
    });
  }

  const parsed = parseOneSignalCreateResponse(payload, response.ok);
  if (parsed.error) {
    return { success: false, error: parsed.error };
  }

  return {
    success: true,
    notificationId: parsed.notificationId!,
    targeting:
      "include_subscription_ids" in target ? "subscription_ids" : "external_id",
    skipped: false,
  };
}

export async function sendOneSignalPush(
  input: SendOneSignalPushInput,
): Promise<SendOneSignalPushResult> {
  if (!isOneSignalConfigured()) {
    return { success: true, skipped: true, reason: "OneSignal is not configured" };
  }

  const subscriptionIds = (input.subscriptionIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  const externalUserIds = (input.externalUserIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (subscriptionIds.length === 0 && externalUserIds.length === 0) {
    return { success: true, skipped: true, reason: "No push targets" };
  }

  const message = {
    eventId: input.eventId,
    heading: input.heading,
    body: input.body,
    path: input.path,
  };

  if (subscriptionIds.length > 0) {
    const subscriptionResult = await postOneSignalNotification(
      { include_subscription_ids: subscriptionIds },
      message,
    );
    if (subscriptionResult.success && !subscriptionResult.skipped) {
      return subscriptionResult;
    }
    if (
      subscriptionResult.success &&
      subscriptionResult.skipped &&
      externalUserIds.length === 0
    ) {
      return subscriptionResult;
    }
    if (!subscriptionResult.success && externalUserIds.length === 0) {
      return subscriptionResult;
    }
  }

  if (externalUserIds.length > 0) {
    return postOneSignalNotification(
      {
        include_aliases: { external_id: externalUserIds },
        target_channel: "push",
      },
      message,
    );
  }

  return { success: true, skipped: true, reason: "No push targets" };
}
