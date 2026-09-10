import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthFormShell } from "@/app/auth/AuthFormShell";
import {
  buildConfirmEmailPath,
  isUserEmailConfirmed,
} from "@/lib/auth/email-confirmation";
import {
  MERCHANT_APPLY_POST_CONFIRM_PATH,
  resolvePostConfirmPathFromAuth,
  sanitizePostConfirmPath,
} from "@/lib/auth/post-confirm-paths";
import { getOptionalAuthUser, resolveCurrentAuthRole } from "@/lib/auth/session";
import { enqueueAccountEmailVerifiedEmail } from "@/lib/notifications/account-emails";
import { EmailConfirmedClient } from "./EmailConfirmedClient";

export const metadata: Metadata = {
  title: "電郵已確認 · HKCardVault",
  description: "你的 Cardvault HK 帳戶電郵已成功確認。",
};

export default async function EmailConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: nextParam } = await searchParams;
  const nextPath = sanitizePostConfirmPath(nextParam);
  const user = await getOptionalAuthUser();

  if (!user) {
    redirect(`/auth?redirect=${encodeURIComponent(nextPath)}`);
  }

  if (!isUserEmailConfirmed(user)) {
    redirect(buildConfirmEmailPath(user.email));
  }

  const role = await resolveCurrentAuthRole();
  const profileRole =
    role === "ADMIN" ? "admin" : role === "MERCHANT" ? "merchant" : "member";
  const resolvedNext = resolvePostConfirmPathFromAuth(
    user,
    nextPath,
    profileRole,
  );
  const backLabel =
    resolvedNext === MERCHANT_APPLY_POST_CONFIRM_PATH
      ? "繼續商戶入駐申請"
      : "進入會員中心";

  await enqueueAccountEmailVerifiedEmail(user.id);

  return (
    <AuthFormShell
      title="電郵已確認"
      description="歡迎加入 Cardvault HK，你的帳戶已可正常使用。"
      backHref={resolvedNext}
      backLabel={backLabel}
    >
      <Suspense fallback={null}>
        <EmailConfirmedClient nextPath={resolvedNext} />
      </Suspense>
    </AuthFormShell>
  );
}
