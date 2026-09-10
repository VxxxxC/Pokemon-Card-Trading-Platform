"use client";

import { useState } from "react";
import {
  ADMIN_PAGE_TAB_CLASS,
  ADMIN_PAGE_TAB_NAV_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import MerchantConnectLedgerTab from "./components/MerchantConnectLedgerTab";
import FpsLedgerTab from "./components/FpsLedgerTab";
import PlatformBalanceSection from "./components/PlatformBalanceSection";
import {
  getMerchantTransferPendingCount,
  type AdminPayoutsPageData,
  type FpsBatchScheduleInfo,
  type FpsPayoutPage,
  type MerchantTransferPage,
} from "@/lib/admin-payouts/types";

type AdminPayoutsClientProps = {
  data: AdminPayoutsPageData | null;
  loadError: string | null;
  fpsBatchSchedule: FpsBatchScheduleInfo;
  initialMerchantPage: MerchantTransferPage;
  merchantLoadError?: string | null;
  initialFpsPage: FpsPayoutPage;
  fpsLoadError?: string | null;
};

export default function AdminPayoutsClient({
  data,
  loadError,
  fpsBatchSchedule,
  initialMerchantPage,
  merchantLoadError,
  initialFpsPage,
  fpsLoadError,
}: AdminPayoutsClientProps) {
  const [activeTab, setActiveTab] = useState<"fps" | "stripe">("fps");
  const [merchantTotal, setMerchantTotal] = useState(
    getMerchantTransferPendingCount(initialMerchantPage.statusCounts),
  );
  const [fpsTotal, setFpsTotal] = useState(
    initialFpsPage.statusCounts.incomplete,
  );

  return (
    <div className="space-y-5 pb-8">
      <header>
        <p className="font-sans text-[12px] text-text-secondary sm:text-[13px]">
          FPS 批次提現、商戶 Stripe 流水與平台餘額管控
        </p>
      </header>

      {loadError ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 font-sans text-[13px] text-warning">
          {loadError}
        </div>
      ) : null}

      <PlatformBalanceSection
        balance={data?.stripeBalance ?? null}
        error={data?.stripeBalanceError}
      />

      <nav
        className={ADMIN_PAGE_TAB_NAV_CLASS}
        aria-label="財務管控台檢視"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "fps"}
          onClick={() => setActiveTab("fps")}
          className={ADMIN_PAGE_TAB_CLASS(activeTab === "fps")}
        >
          FPS 批次
          <span
            className={`font-mono text-[10px] tabular-nums ${
              activeTab === "fps" ? "text-brand/80" : "text-text-disabled"
            }`}
          >
            {fpsTotal.toLocaleString("en-US")}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "stripe"}
          onClick={() => setActiveTab("stripe")}
          className={ADMIN_PAGE_TAB_CLASS(activeTab === "stripe")}
        >
          商戶流水
          <span
            className={`font-mono text-[10px] tabular-nums ${
              activeTab === "stripe" ? "text-brand/80" : "text-text-disabled"
            }`}
          >
            {merchantTotal.toLocaleString("en-US")}
          </span>
        </button>
      </nav>

      {activeTab === "fps" ? (
        <div className="space-y-4 border-b border-white/[0.08] pb-5">
          <p className="font-sans text-[11px] leading-relaxed text-text-disabled">
            週批 {fpsBatchSchedule.nextBatchDateLabel}（
            {fpsBatchSchedule.batchWeekdayLabel}）· 截止{" "}
            {fpsBatchSchedule.cutoffLabel}
          </p>

          <FpsLedgerTab
            initialPage={initialFpsPage}
            loadError={fpsLoadError ?? undefined}
            onTotalChange={setFpsTotal}
          />
        </div>
      ) : (
        <div className="space-y-4 border-b border-white/[0.08] pb-5">
          <MerchantConnectLedgerTab
            initialPage={initialMerchantPage}
            loadError={merchantLoadError ?? undefined}
            onTotalChange={setMerchantTotal}
          />
        </div>
      )}
    </div>
  );
}
