"use client";

import { refreshAdminStripeBalance } from "@/app/actions/admin-payouts";
import type { AdminPayoutsStripeBalance } from "@/lib/admin-payouts/types";
import { formatAdminDateTime } from "@/lib/admin-payouts/format";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

type PlatformBalanceSectionProps = {
  balance: AdminPayoutsStripeBalance | null;
  error?: string | null;
};

function formatHkd(amount: number): string {
  return `HK$ ${amount.toLocaleString("zh-TW")}`;
}

export default function PlatformBalanceSection({
  balance,
  error,
}: PlatformBalanceSectionProps) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();

  const available = balance?.available ?? 0;
  const pending = balance?.pending ?? 0;
  const lastSyncedAt = balance?.lastSyncedAt
    ? formatAdminDateTime(balance.lastSyncedAt)
    : "—";

  const handleRefresh = () => {
    startTransition(async () => {
      const result = await refreshAdminStripeBalance();
      if (result.success) {
        toast.success("已重新整理 Stripe 帳戶餘額");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <section className="space-y-3 pb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className={SECTION_TITLE_CLASS}>
            Stripe 平台餘額
          </h2>
          <p className="mt-0.5 hidden font-sans text-[11px] text-text-secondary sm:block">
            Connect 主帳戶即時資金
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="font-mono text-[10px] text-text-disabled">
            同步 {lastSyncedAt}
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="重新整理"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-brand/10 hover:text-brand active:scale-[0.98] disabled:opacity-60"
          >
            <RefreshCw
              className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {error ? (
        <p className="font-sans text-[11px] text-warning">{error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div className="rounded-lg border border-white/[0.08] bg-bg-card/30 px-2 py-2 sm:px-3 sm:py-2.5">
          <span className="block font-sans text-[10px] text-text-disabled">
            可用
          </span>
          <span className="mt-0.5 block truncate font-mono text-[13px] font-bold leading-tight text-brand sm:text-[18px]">
            {formatHkd(available)}
          </span>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-bg-card/30 px-2 py-2 sm:px-3 sm:py-2.5">
          <span className="block font-sans text-[10px] text-text-disabled">
            待結算
          </span>
          <span className="mt-0.5 block truncate font-mono text-[13px] font-bold leading-tight text-text-primary sm:text-[18px]">
            {formatHkd(pending)}
          </span>
        </div>
      </div>
    </section>
  );
}
