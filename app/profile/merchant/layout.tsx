import type { ReactNode } from "react";
import { MerchantProfileShell } from "@/app/components/profile/MerchantProfileShell";

export default function MerchantProfileLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <MerchantProfileShell>{children}</MerchantProfileShell>;
}
