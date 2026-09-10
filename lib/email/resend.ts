import type { CreateEmailOptions } from "resend";
import { getResendApiKey, getResendFromEmail } from "@/lib/email/env";

export type SendTransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendTransactionalEmailResult =
  | { success: true; messageId: string }
  | { success: false; error: string };

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput,
): Promise<SendTransactionalEmailResult> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const payload: CreateEmailOptions = {
    from: getResendFromEmail(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  };

  const { data, error } = await resend.emails.send(payload);

  if (error) {
    return {
      success: false,
      error: error.message || "Resend send failed",
    };
  }

  const messageId = data?.id?.trim();
  if (!messageId) {
    return { success: false, error: "Resend returned no message id" };
  }

  return { success: true, messageId };
}
