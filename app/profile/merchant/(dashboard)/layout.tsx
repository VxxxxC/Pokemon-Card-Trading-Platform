import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "商戶總覽 — HKCardVault",
  description: "查看銷售統計、待處理訂單及商戶概覽",
};

export default function MerchantDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
