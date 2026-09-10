import type { Metadata } from "next";
import { AuthFormShell } from "@/app/auth/AuthFormShell";
import { formatHongKongDateTimeSlash } from "@/lib/datetime/hong-kong";
import { SuspendedAccountClient } from "./SuspendedAccountClient";

export const metadata: Metadata = {
  title: "帳戶已限制",
  description: "您的 HKCardVault 帳戶已被暫停或封禁。",
};

type PageProps = {
  searchParams: Promise<{ type?: string; until?: string }>;
};

export default async function SuspendedAccountPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const restrictionType = params.type === "ban" ? "ban" : "suspend";
  const endsAt = params.until?.trim() || null;

  return (
    <AuthFormShell
      title={restrictionType === "ban" ? "帳戶已封禁" : "帳戶已暫停"}
      description={
        restrictionType === "ban"
          ? "此帳戶因違反平台規則已被永久封禁。如有疑問請聯絡客服。"
          : endsAt
            ? `此帳戶暫時無法使用，預計恢復時間：${formatHongKongDateTimeSlash(endsAt)}。`
            : "此帳戶暫時無法使用，請稍後再試或聯絡客服。"
      }
    >
      <SuspendedAccountClient />
    </AuthFormShell>
  );
}
