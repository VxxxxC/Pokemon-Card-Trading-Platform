import { sendTransactionalEmail } from "@/lib/email/resend";
import { createAdminClient } from "@/lib/supabase/admin";

const BATCH_LIMIT = 25;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

export type EmailOutboxRow = {
  id: string;
  to_email: string;
  subject: string;
  html_body: string;
  text_body: string | null;
  attempts: number;
  max_attempts: number;
};

export type ProcessEmailOutboxResult = {
  scanned: number;
  sent: number;
  failed: number;
  dead: number;
  errors: string[];
};

type EmailOutboxWorkerClient = {
  from(table: "notification_email_outbox"): {
    select(columns: string): {
      in(
        column: string,
        values: string[],
      ): {
        lte(
          column: string,
          value: string,
        ): {
          order(
            column: string,
            options: { ascending: boolean },
          ): {
            limit(count: number): Promise<{
              data: EmailOutboxRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    update(row: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{
        error: { message: string } | null;
      }>;
    };
  };
};

function computeNextAttemptAt(attempts: number): string {
  const delay =
    RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)] ??
    RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  return new Date(Date.now() + delay).toISOString();
}

export async function processEmailOutboxBatch(): Promise<ProcessEmailOutboxResult> {
  const admin = createAdminClient() as unknown as EmailOutboxWorkerClient;
  const now = new Date().toISOString();

  const { data: rows, error: listError } = await admin
    .from("notification_email_outbox")
    .select(
      "id,to_email,subject,html_body,text_body,attempts,max_attempts",
    )
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", now)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (listError) {
    throw new Error(listError.message);
  }

  const candidates = rows ?? [];
  let sent = 0;
  let failed = 0;
  let dead = 0;
  const errors: string[] = [];

  for (const row of candidates) {
    const sendResult = await sendTransactionalEmail({
      to: row.to_email,
      subject: row.subject,
      html: row.html_body,
      text: row.text_body ?? undefined,
    });

    if (sendResult.success) {
      const { error: updateError } = await admin
        .from("notification_email_outbox")
        .update({
          status: "sent",
          attempts: row.attempts + 1,
          last_error: null,
          resend_message_id: sendResult.messageId,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updateError) {
        errors.push(`${row.id}: ${updateError.message}`);
        continue;
      }

      sent += 1;
      continue;
    }

    const nextAttempts = row.attempts + 1;
    const isDead = nextAttempts >= row.max_attempts;

    const { error: failUpdateError } = await admin
      .from("notification_email_outbox")
      .update({
        status: isDead ? "dead" : "failed",
        attempts: nextAttempts,
        last_error: sendResult.error,
        next_attempt_at: isDead ? now : computeNextAttemptAt(nextAttempts),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (failUpdateError) {
      errors.push(`${row.id}: ${failUpdateError.message}`);
      continue;
    }

    if (isDead) {
      dead += 1;
    } else {
      failed += 1;
    }

    errors.push(`${row.id}: ${sendResult.error}`);
  }

  return {
    scanned: candidates.length,
    sent,
    failed,
    dead,
    errors,
  };
}
