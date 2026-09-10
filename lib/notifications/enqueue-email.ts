import { getSiteUrl } from "@/lib/auth/site-url";
import { resolveEmailLogoUrl } from "@/lib/email/layout";
import { isEmailEnabledForUser } from "@/lib/notifications/notification-prefs";
import { renderEmailTemplate } from "@/lib/notifications/email-templates";
import { createAdminClient } from "@/lib/supabase/admin";

export type EnqueueTransactionalEmailInput = {
  eventId: string;
  templateKey: string;
  toEmail: string;
  idempotencyKey: string;
  recipientUserId?: string;
  payload?: Record<string, unknown>;
  subject?: string;
  html?: string;
  text?: string;
};

export type EnqueueTransactionalEmailResult =
  | { success: true; data: { id: string; duplicate: boolean } }
  | { success: false; error: string };

type EmailOutboxInsertClient = {
  from(table: "notification_email_outbox"): {
    insert(
      row: Record<string, unknown>,
    ): {
      select(columns: string): {
        maybeSingle(): Promise<{
          data: { id: string } | null;
          error: { code?: string; message: string } | null;
        }>;
      };
    };
  };
};

function buildEmailContent(input: EnqueueTransactionalEmailInput): {
  subject: string;
  html: string;
  text?: string;
} | null {
  if (input.subject && input.html) {
    return {
      subject: input.subject,
      html: input.html,
      text: input.text,
    };
  }

  const rendered = renderEmailTemplate({
    templateKey: input.templateKey,
    payload: input.payload,
  });

  if (!rendered) {
    return null;
  }

  return rendered;
}

export async function enqueueTransactionalEmail(
  input: EnqueueTransactionalEmailInput,
): Promise<EnqueueTransactionalEmailResult> {
  const toEmail = input.toEmail.trim();
  const idempotencyKey = input.idempotencyKey.trim();

  if (!toEmail || !idempotencyKey) {
    return { success: false, error: "缺少收件人或 idempotency key" };
  }

  const recipientUserId =
    input.recipientUserId ??
    (typeof input.payload?.recipientUserId === "string"
      ? input.payload.recipientUserId
      : typeof input.payload?.userId === "string"
        ? input.payload.userId
        : undefined);

  if (recipientUserId) {
    const enabled = await isEmailEnabledForUser(recipientUserId, input.eventId);
    if (!enabled) {
      if (process.env.NODE_ENV === "development") {
        console.info(
          "[enqueue-email]",
          input.eventId,
          "skipped",
          "notification_pref_disabled",
          recipientUserId,
        );
      }
      return {
        success: true,
        data: { id: `pref-skipped:${idempotencyKey}`, duplicate: false },
      };
    }
  }

  const content = buildEmailContent(input);
  if (!content) {
    return {
      success: false,
      error: `未知 email template: ${input.templateKey}`,
    };
  }

  const admin = createAdminClient() as unknown as EmailOutboxInsertClient;

  const { data, error } = await admin
    .from("notification_email_outbox")
    .insert({
      idempotency_key: idempotencyKey,
      event_id: input.eventId,
      template_key: input.templateKey,
      to_email: toEmail,
      subject: content.subject,
      html_body: content.html,
      text_body: content.text ?? null,
      payload: input.payload ?? {},
      status: "pending",
      next_attempt_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return {
        success: true,
        data: { id: idempotencyKey, duplicate: true },
      };
    }

    return {
      success: false,
      error: error.message || "無法寫入 email outbox",
    };
  }

  if (!data?.id) {
    return { success: false, error: "無法寫入 email outbox" };
  }

  return {
    success: true,
    data: { id: data.id, duplicate: false },
  };
}

export async function enqueuePasswordChangedEmail(args: {
  userId: string;
  email: string;
  transitionAt?: number;
}): Promise<EnqueueTransactionalEmailResult> {
  const transitionAt = args.transitionAt ?? Date.now();
  const siteUrl = await getSiteUrl();
  return enqueueTransactionalEmail({
    eventId: "E-ACC-04",
    templateKey: "acc.password_changed",
    toEmail: args.email,
    idempotencyKey: `E-ACC-04:${args.userId}:${transitionAt}`,
    payload: {
      userId: args.userId,
      transitionAt,
      logoUrl: resolveEmailLogoUrl(siteUrl),
    },
  });
}
