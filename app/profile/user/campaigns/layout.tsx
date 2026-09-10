import type { ReactNode } from "react";
import { ProfileSubpageShell } from "@/app/components/profile/ProfileSubpageShell";

export default function MemberCampaignsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <ProfileSubpageShell>{children}</ProfileSubpageShell>;
}
