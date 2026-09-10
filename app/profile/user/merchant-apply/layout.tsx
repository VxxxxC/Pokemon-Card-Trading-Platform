import type { ReactNode } from "react";
import { ProfileSubpageShell } from "@/app/components/profile/ProfileSubpageShell";

export default function MerchantApplyLayout({ children }: { children: ReactNode }) {
  return <ProfileSubpageShell>{children}</ProfileSubpageShell>;
}
