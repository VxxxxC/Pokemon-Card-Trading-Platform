import type { Metadata } from "next";
import { use } from "react";
import { MerchantFinancePageData } from "./MerchantFinancePageData";

export const metadata: Metadata = {
  title: "資金金流 — HKCardVault",
  description: "查看本月總收入、資金流水記錄及 Stripe Connect 帳戶",
};

type MerchantFinancePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function MerchantFinancePage({
  searchParams,
}: MerchantFinancePageProps) {
  const params = use(searchParams);
  return <MerchantFinancePageData searchParams={params} />;
}
