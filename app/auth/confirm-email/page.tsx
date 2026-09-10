import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  buildConfirmEmailPath,
  isUserEmailConfirmed,
} from "@/lib/auth/email-confirmation";
import { getRoleDefaultLandingPath } from "@/lib/auth/roles";
import { getOptionalAuthUser, resolveCurrentAuthRole } from "@/lib/auth/session";
import { ConfirmEmailPendingForm } from "./ConfirmEmailPendingForm";

export const metadata: Metadata = {
  title: "確認電郵 · HKCardVault",
  description: "請確認電郵以啟用 Cardvault HK 帳戶。",
};

function sanitizeNextPath(next: string | undefined): string | undefined {
  if (!next?.startsWith("/")) {
    return undefined;
  }

  return next;
}

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string }>;
}) {
  const { email: emailParam, next: nextParam } = await searchParams;
  const nextPath = sanitizeNextPath(nextParam);
  const user = await getOptionalAuthUser();

  if (user && isUserEmailConfirmed(user)) {
    const role = await resolveCurrentAuthRole();
    redirect(nextPath ?? getRoleDefaultLandingPath(role));
  }

  const email = (emailParam ?? user?.email ?? "").trim();
  if (!email) {
    redirect("/auth");
  }

  if (user && !isUserEmailConfirmed(user) && user.email !== email) {
    redirect(buildConfirmEmailPath(user.email));
  }

  return <ConfirmEmailPendingForm email={email} nextPath={nextPath} />;
}
