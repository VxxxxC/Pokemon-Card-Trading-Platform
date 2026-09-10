import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";

export function isPkceAuthToken(token: string): boolean {
  return token.startsWith("pkce_");
}

type AuthCallbackSupabaseClient = Pick<SupabaseClient, "auth">;

function buildVerifyOtpTypeCandidates(type: string): EmailOtpType[] {
  const primary = type.trim() as EmailOtpType;
  const candidates: EmailOtpType[] = [primary];

  if (primary === "signup") {
    candidates.push("email");
  } else if (primary === "magiclink") {
    candidates.push("email");
  }

  return candidates.filter(
    (candidate, index) =>
      candidates.indexOf(candidate) === index && candidate.length > 0,
  );
}

async function verifyTokenHashSession(
  supabase: AuthCallbackSupabaseClient,
  tokenHash: string,
  type: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let lastMessage = "Email link is invalid or has expired";

  for (const otpType of buildVerifyOtpTypeCandidates(type)) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });

    if (!error && data.session) {
      return { ok: true };
    }

    if (error?.message) {
      lastMessage = error.message;
    }
  }

  return { ok: false, message: lastMessage };
}

export async function establishAuthCallbackSession(
  supabase: AuthCallbackSupabaseClient,
  input: {
    code?: string | null;
    tokenHash?: string | null;
    type?: string | null;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const code = input.code?.trim();
  const tokenHash = input.tokenHash?.trim();
  const type = input.type?.trim();

  // PKCE email links must use verifyOtp (server POST /verify), not code exchange.
  if (tokenHash && type) {
    return verifyTokenHashSession(supabase, tokenHash, type);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  return { ok: false, message: "missing auth callback parameters" };
}

export function shouldRedirectToPasswordResetComplete(
  type: string | null,
  nextPath?: string | null,
): boolean {
  if (type?.trim() === "recovery") {
    return true;
  }

  const next = nextPath?.trim() ?? "";
  return next.startsWith("/auth/forgot-password");
}
