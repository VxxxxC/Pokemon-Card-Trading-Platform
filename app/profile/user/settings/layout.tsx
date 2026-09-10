import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ProfileSubpageShell } from "@/app/components/profile/ProfileSubpageShell";
import { UserProfileDashboardShell } from "@/app/components/rewards/UserProfileDashboardShell";

export const metadata: Metadata = {
  title: "帳戶設定 — HKCardVault",
  description: "管理個人資料、收款資料與帳戶安全",
};

export default function UserSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ProfileSubpageShell>
      <UserProfileDashboardShell>{children}</UserProfileDashboardShell>
    </ProfileSubpageShell>
  );
}
