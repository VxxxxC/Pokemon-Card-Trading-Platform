import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "店舖設定 — HKCardVault",
  description: "管理店舖資料、運費與帳戶安全",
};

export default function MerchantSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
