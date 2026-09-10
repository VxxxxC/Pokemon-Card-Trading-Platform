import { DEFAULT_RESEND_FROM } from "@/lib/email/constants";

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function getResendApiKey(): string | null {
  const key = process.env.RESEND_API_KEY?.trim();
  return key || null;
}

export function getResendFromEmail(): string {
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  return from || DEFAULT_RESEND_FROM;
}

export function assertEmailWorkerEnvironment():
  | { ok: true }
  | { ok: false; error: string } {
  if (!isResendConfigured()) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return {
      ok: false,
      error: "Supabase admin credentials are not configured",
    };
  }

  return { ok: true };
}
