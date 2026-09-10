"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { getRoleDefaultLandingPath, getRoleSettingsPath } from "@/lib/auth/roles";
import { buildConfirmEmailPath } from "@/lib/auth/email-confirmation";
import { resolveCurrentAuthRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type AuthFormErrors,
  validateLoginFields,
  validatePasswordResetRequest,
  validatePasswordUpdate,
  validateProfilePasswordUpdate,
  validateRegisterFields,
} from "@/lib/auth/validation";
import {
  mapPasswordUpdateAuthError,
} from "@/lib/auth/password-errors";
import { getSiteUrl } from "@/lib/auth/site-url";
import { generateUniqueUsername } from "@/lib/auth/username";
import { enqueuePasswordChangedEmail } from "@/lib/notifications/enqueue-email";
import {
  buildSignupCallbackUrl,
  MEMBER_POST_CONFIRM_PATH,
  MERCHANT_APPLY_ONBOARDING_INTENT,
  MERCHANT_APPLY_POST_CONFIRM_PATH,
} from "@/lib/auth/post-confirm-paths";

type RegisterMemberAccountOptions = {
  postConfirmPath?: string;
  onboardingIntent?: string;
};

function parseRegisterFields(formData: FormData) {
  return {
    email: ((formData.get("email") as string | null) ?? "").trim(),
    password: (formData.get("password") as string | null) ?? "",
    confirmPassword: (formData.get("confirmPassword") as string | null) ?? "",
    agreeTerms: formData.get("agreeTerms") === "true",
  };
}

function mapAuthError(message: string): AuthFormErrors {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid email or password")
  ) {
    return { email: "電子郵件或密碼不正確" };
  }

  if (
    normalized.includes("user already registered") ||
    normalized.includes("already been registered") ||
    normalized.includes("email address is already")
  ) {
    return { email: "此電子郵件已被註冊" };
  }

  if (
    normalized.includes("email not confirmed") ||
    normalized.includes("email not verified")
  ) {
    return { email: "請先確認電郵後再登入" };
  }

  if (normalized.includes("password")) {
    return {
      password:
        "密碼至少 8 字元，且必須同時包含大寫英文、小寫英文、數字及特殊符號",
    };
  }

  return { email: "登入或註冊失敗，請稍後再試" };
}

async function isEmailTaken(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const normalized = email.toLowerCase();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    if (
      data.users.some((user) => user.email?.toLowerCase() === normalized)
    ) {
      return true;
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return false;
}

async function isProfileUsernameTaken(username: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username.trim())
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function assignGeneratedUsername(userId: string): Promise<void> {
  const admin = createAdminClient();
  const username = await generateUniqueUsername(isProfileUsernameTaken);
  const { error } = await admin
    .from("profiles")
    .update({ username })
    .eq("id", userId)
    .is("username", null);

  if (error) throw error;
}

export async function login(
  _prev: AuthFormErrors | null,
  formData: FormData,
): Promise<AuthFormErrors | null> {
  const fields = {
    email: ((formData.get("email") as string | null) ?? "").trim(),
    password: (formData.get("password") as string | null) ?? "",
  };

  const errors = validateLoginFields(fields);
  if (Object.keys(errors).length) return errors;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: fields.email,
    password: fields.password,
  });

  if (error) {
    return mapAuthError(error.message);
  }

  const role = await resolveCurrentAuthRole();
  redirect(getRoleDefaultLandingPath(role));
}

async function notifyPasswordChanged(user: {
  id: string;
  email?: string | null;
}): Promise<void> {
  if (!user.email) return;

  try {
    await enqueuePasswordChangedEmail({
      userId: user.id,
      email: user.email,
      transitionAt: Date.now(),
    });
  } catch {
    // Email enqueue is non-blocking for auth flows.
  }
}

async function registerMemberAccount(
  formData: FormData,
  options: RegisterMemberAccountOptions = {},
): Promise<
  | { ok: false; errors: AuthFormErrors }
  | { ok: true; needsEmailConfirmation: true; email: string }
  | { ok: true; needsEmailConfirmation: false }
> {
  const fields = parseRegisterFields(formData);
  const errors = validateRegisterFields(fields);
  if (Object.keys(errors).length) return { ok: false, errors };

  try {
    const emailTaken = await isEmailTaken(fields.email);

    if (emailTaken) {
      return { ok: false, errors: { email: "此電子郵件已被註冊" } };
    }
  } catch {
    return { ok: false, errors: { email: "無法驗證帳戶資料，請稍後再試" } };
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const postConfirmPath = options.postConfirmPath ?? MEMBER_POST_CONFIRM_PATH;
  const signupCallback = buildSignupCallbackUrl(siteUrl, postConfirmPath);
  const { data, error } = await supabase.auth.signUp({
    email: fields.email,
    password: fields.password,
    options: {
      emailRedirectTo: signupCallback,
      data: {
        display_name: fields.email.split("@")[0],
        role: "member",
        ...(options.onboardingIntent
          ? { onboarding_intent: options.onboardingIntent }
          : {}),
      },
    },
  });

  if (error) {
    return { ok: false, errors: mapAuthError(error.message) };
  }

  if (!data.user) {
    return { ok: false, errors: { email: "註冊失敗，請稍後再試" } };
  }

  try {
    await assignGeneratedUsername(data.user.id);
  } catch {
    return {
      ok: false,
      errors: { email: "帳戶已建立，但用戶名稱設定失敗，請聯絡客服" },
    };
  }

  const needsEmailConfirmation = !data.user.email_confirmed_at;
  if (needsEmailConfirmation) {
    if (data.session) {
      await supabase.auth.signOut();
    }

    return {
      ok: true,
      needsEmailConfirmation: true,
      email: fields.email,
    };
  }

  return { ok: true, needsEmailConfirmation: false };
}

async function redirectAfterRegistration(nextPath?: string): Promise<void> {
  if (nextPath?.startsWith("/")) {
    redirect(nextPath);
  }

  const role = await resolveCurrentAuthRole();
  redirect(getRoleDefaultLandingPath(role));
}

export async function registerAccount(
  prev: AuthFormErrors | null,
  formData: FormData,
): Promise<AuthFormErrors | null> {
  if (formData.get("isMerchant") === "true") {
    return registerMemberForMerchantApply(prev, formData);
  }

  return registerMember(prev, formData);
}

export async function registerMember(
  _prev: AuthFormErrors | null,
  formData: FormData,
): Promise<AuthFormErrors | null> {
  const result = await registerMemberAccount(formData);
  if (!result.ok) return result.errors;

  if (result.needsEmailConfirmation) {
    redirect(buildConfirmEmailPath(result.email));
  }

  await redirectAfterRegistration();
  return null;
}

/**
 * 「登記成為商戶」註冊分流：先建立普通 member 帳戶（role 不變），
 * 成功後直接帶去商戶 KYC 申請頁提交公司資料及文件。
 */
export async function registerMemberForMerchantApply(
  _prev: AuthFormErrors | null,
  formData: FormData,
): Promise<AuthFormErrors | null> {
  const result = await registerMemberAccount(formData, {
    postConfirmPath: MERCHANT_APPLY_POST_CONFIRM_PATH,
    onboardingIntent: MERCHANT_APPLY_ONBOARDING_INTENT,
  });
  if (!result.ok) return result.errors;

  if (result.needsEmailConfirmation) {
    redirect(
      `${buildConfirmEmailPath(result.email)}&next=${encodeURIComponent(MERCHANT_APPLY_POST_CONFIRM_PATH)}`,
    );
  }

  redirect(MERCHANT_APPLY_POST_CONFIRM_PATH);
}

export type ResendSignupConfirmationResult =
  | { status: "sent" }
  | { status: "error"; message: string };

export async function resendSignupConfirmationEmail(
  _prev: ResendSignupConfirmationResult | null,
  formData: FormData,
): Promise<ResendSignupConfirmationResult> {
  const email = ((formData.get("email") as string | null) ?? "").trim();
  const next = ((formData.get("next") as string | null) ?? "").trim();

  if (!email) {
    return { status: "error", message: "缺少電郵地址" };
  }

  try {
    const siteUrl = await getSiteUrl();
    const redirectTo = next.startsWith("/")
      ? buildSignupCallbackUrl(siteUrl, next)
      : buildSignupCallbackUrl(siteUrl, MEMBER_POST_CONFIRM_PATH);

    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      const normalized = error.message.toLowerCase();
      if (normalized.includes("rate limit")) {
        return { status: "error", message: "請求過於頻繁，請稍後再試" };
      }
      return { status: "error", message: "無法寄出驗證信，請稍後再試" };
    }
  } catch {
    return { status: "error", message: "無法寄出驗證信，請稍後再試" };
  }

  return { status: "sent" };
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error("登出失敗，請稍後再試");
  }

  redirect("/auth");
}

export type ForgotPasswordRequestResult =
  | { status: "sent" }
  | { status: "error"; errors: AuthFormErrors };

export async function requestForgotPassword(
  _prev: ForgotPasswordRequestResult | null,
  formData: FormData,
): Promise<ForgotPasswordRequestResult> {
  const email = ((formData.get("email") as string | null) ?? "").trim();
  const errors = validatePasswordResetRequest({ email });

  if (Object.keys(errors).length) {
    return { status: "error", errors };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      return {
        status: "error",
        errors: { email: "您已登入，請至帳戶設定更改密碼" },
      };
    }

    const siteUrl = await getSiteUrl();
    const nextPath = encodeURIComponent("/auth/forgot-password/complete");
    const redirectTo = `${siteUrl}/auth/callback?next=${nextPath}`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      const normalized = error.message.toLowerCase();
      if (normalized.includes("rate limit")) {
        return {
          status: "error",
          errors: { email: "請求過於頻繁，請稍後再試" },
        };
      }
      return {
        status: "error",
        errors: { email: "無法發送重設郵件，請稍後再試" },
      };
    }
  } catch {
    return {
      status: "error",
      errors: { email: "無法發送重設郵件，請稍後再試" },
    };
  }

  return { status: "sent" };
}

export async function completeForgotPassword(
  _prev: AuthFormErrors | null,
  formData: FormData,
): Promise<AuthFormErrors | null> {
  const fields = {
    password: (formData.get("password") as string | null) ?? "",
    confirmPassword: (formData.get("confirmPassword") as string | null) ?? "",
  };

  const errors = validatePasswordUpdate(fields);
  if (Object.keys(errors).length) return errors;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { password: "連結已失效，請重新申請忘記密碼" };
  }

  const { error } = await supabase.auth.updateUser({
    password: fields.password,
  });

  if (error) {
    return mapPasswordUpdateAuthError(error.message);
  }

  after(() => notifyPasswordChanged(user));

  const role = await resolveCurrentAuthRole();
  redirect(`${getRoleDefaultLandingPath(role)}?passwordUpdated=1`);
}

export async function updatePasswordFromProfile(
  _prev: AuthFormErrors | null,
  formData: FormData,
): Promise<AuthFormErrors | null> {
  const fields = {
    currentPassword: (formData.get("currentPassword") as string | null) ?? "",
    password: (formData.get("password") as string | null) ?? "",
    confirmPassword: (formData.get("confirmPassword") as string | null) ?? "",
  };

  const errors = validateProfilePasswordUpdate(fields);
  if (Object.keys(errors).length) return errors;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { password: "請先登入後再更改密碼" };
  }

  if (!user.email) {
    return { form: "無法驗證帳戶，請重新登入" };
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: fields.currentPassword,
  });

  if (verifyError) {
    return { currentPassword: "目前密碼不正確" };
  }

  const { error } = await supabase.auth.updateUser({
    password: fields.password,
  });

  if (error) {
    return mapPasswordUpdateAuthError(error.message);
  }

  after(() => notifyPasswordChanged(user));

  const role = await resolveCurrentAuthRole();
  redirect(`${getRoleSettingsPath(role)}?passwordUpdated=1`);
}
