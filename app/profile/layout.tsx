import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  buildConfirmEmailPath,
  isUserEmailConfirmed,
} from "@/lib/auth/email-confirmation";
import { isPublicProfilePath } from "@/lib/auth/roles";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

async function getRequestPathname(): Promise<string> {
  const headerList = await headers();
  return headerList.get("x-pathname") ?? "";
}

export default async function ProfileRootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = await getRequestPathname();
  if (isPublicProfilePath(pathname)) {
    return children;
  }

  if (!isSupabaseConfigured()) {
    redirect("/auth");
  }

  const user = await getOptionalAuthUser();
  if (!user) {
    redirect("/auth");
  }

  if (!isUserEmailConfirmed(user)) {
    redirect(buildConfirmEmailPath(user.email));
  }

  return children;
}
