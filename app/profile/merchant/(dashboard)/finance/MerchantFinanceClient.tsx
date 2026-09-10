"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import type {
  MerchantFinanceSettlementsPage,
  MerchantFinanceSettlement,
  MerchantFinanceSort,
  MerchantFinanceStatusFilter,
} from "@/app/actions/merchant-finance";
import { Pagination } from "@/app/components/ui/Pagination";
import {
  buildMerchantFinanceHref,
  type MerchantFinanceQuery,
} from "@/lib/merchant-finance/query-params";
import {
  formatPayoutStatusLabel,
  getPayoutStatusBadgeClass,
} from "@/lib/admin-payouts/format";
import type { MerchantTransferPayoutStatus } from "@/lib/admin-payouts/types";
import {
  formatMerchantPayoutHoldUntilLabel,
  formatMerchantPayoutStatusLabel,
} from "@/lib/merchant-order/merchant-payout-hold";
import { truncateStripeId } from "@/lib/stripe/display";
import { cn } from "@/lib/utils";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

type MerchantFinanceClientProps = {
  stripeConnected: boolean;
  stripeAccountId: string | null;
  stripeAccountLabel: string | null;
  query: MerchantFinanceQuery;
  settlementsPage: MerchantFinanceSettlementsPage;
  loadError: string | null;
};

const STATUS_FILTERS: { value: MerchantFinanceStatusFilter; label: string }[] =
  [
    { value: "all", label: "全部" },
    { value: "paid", label: "已撥款" },
    { value: "held", label: "待撥款" },
    { value: "processing", label: "處理中" },
    { value: "failed", label: "失敗" },
  ];

const SORT_OPTIONS: { value: MerchantFinanceSort; label: string }[] = [
  { value: "transferred_at-desc", label: "最新優先" },
  { value: "transferred_at-asc", label: "最舊優先" },
];

const filterInputClass =
  "h-9 px-3 rounded-lg bg-bg-page/50 border border-[rgba(237,232,224,0.08)] font-sans text-[12px] text-text-primary w-full focus:outline-none focus:border-brand/30 transition-colors";

const filterDateInputClass = cn(
  filterInputClass,
  "input-date-theme font-mono text-[11px] min-w-0",
);

function formatSettlementDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function normalizePayoutStatus(status: string): MerchantTransferPayoutStatus {
  if (
    status === "pending" ||
    status === "held" ||
    status === "processing" ||
    status === "paid" ||
    status === "failed" ||
    status === "frozen"
  ) {
    return status;
  }
  return "pending";
}

async function copyStripeId(label: string, id: string) {
  try {
    await navigator.clipboard.writeText(id);
    toast.success(`已複製 ${label}`);
  } catch {
    toast.error("複製失敗");
  }
}

function formatTransferLabel(tx: MerchantFinanceSettlement): string {
  if (tx.stripeTransferId) {
    return truncateStripeId(tx.stripeTransferId);
  }
  if (tx.payoutStatus === "held") {
    return "待 T+7 後撥款";
  }
  if (tx.payoutStatus === "processing") {
    return "處理中";
  }
  return "—";
}

function formatSettlementStatusLabel(tx: MerchantFinanceSettlement): string {
  if (tx.payoutStatus === "held" || tx.payoutStatus === "frozen") {
    return formatMerchantPayoutStatusLabel(tx.payoutStatus);
  }
  return formatPayoutStatusLabel(normalizePayoutStatus(tx.payoutStatus));
}

function CopyIdButton({
  label,
  id,
}: {
  label: string;
  id: string;
}) {
  return (
    <button
      type="button"
      onClick={() => copyStripeId(label, id)}
      className="ml-1.5 text-text-disabled hover:text-brand transition-colors focus:outline-none"
    >
      複製
    </button>
  );
}

function SettlementRow({ tx }: { tx: MerchantFinanceSettlement }) {
  const payoutStatus = normalizePayoutStatus(tx.payoutStatus);

  return (
    <div className="px-3.5 py-3 sm:px-4 hover:bg-bg-elevated/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/profile/merchant/orderDetail/${tx.orderId}`}
            className="block min-w-0"
          >
            <p className="font-sans text-[13px] font-medium text-text-primary truncate hover:text-brand transition-colors">
              {tx.orderNumber ? `#${tx.orderNumber}` : "商戶訂單撥款"}
              {tx.cardName ? ` · ${tx.cardName}` : ""}
            </p>
          </Link>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="font-mono text-[10px] text-text-secondary tabular-nums">
              {formatSettlementDate(tx.paidAt)}
            </p>
            <span
              className={cn(
                "inline-block font-mono text-[9px] px-2 py-0.5 rounded border",
                getPayoutStatusBadgeClass(payoutStatus),
              )}
            >
              {formatSettlementStatusLabel(tx)}
            </span>
          </div>
        </div>
        <p className="font-mono font-semibold text-[14px] shrink-0 text-brand tabular-nums">
          +HK$ {tx.amount.toLocaleString("zh-TW")}
        </p>
      </div>

      {tx.payoutStatus === "held" && tx.payoutHoldUntil ? (
        <p className="font-mono text-[10px] text-text-disabled mt-1.5">
          預計撥款：{formatMerchantPayoutHoldUntilLabel(tx.payoutHoldUntil)}
        </p>
      ) : null}

      <div className="mt-2 space-y-0.5 font-mono text-[10px] text-text-secondary">
        <p>
          Transfer <span className="text-brand">{formatTransferLabel(tx)}</span>
          {tx.stripeTransferId ? (
            <CopyIdButton label="Transfer ID" id={tx.stripeTransferId} />
          ) : null}
        </p>
        <p>
          Payment Intent{" "}
          <span className="text-brand">
            {truncateStripeId(tx.stripePaymentIntentId)}
          </span>
          {tx.stripePaymentIntentId ? (
            <CopyIdButton
              label="Payment Intent"
              id={tx.stripePaymentIntentId}
            />
          ) : null}
        </p>
        <p className="text-text-disabled">
          {tx.commissionAmount != null
            ? `平台費 HK$ ${tx.commissionAmount.toLocaleString("zh-TW")} · 實收 HK$ ${tx.amount.toLocaleString("zh-TW")}`
            : `實收 HK$ ${tx.amount.toLocaleString("zh-TW")}`}
        </p>
      </div>

      {tx.payoutStatus === "failed" && tx.payoutError ? (
        <p
          className="font-mono text-[10px] text-warning mt-1.5 truncate"
          title={tx.payoutError}
        >
          {tx.payoutError}
        </p>
      ) : null}
    </div>
  );
}

export function MerchantFinanceClient({
  stripeConnected,
  stripeAccountId,
  stripeAccountLabel,
  query,
  settlementsPage,
  loadError,
}: MerchantFinanceClientProps) {
  const router = useRouter();
  const { rows, total, page, totalPages, monthEarned } = settlementsPage;

  return (
    <div className="space-y-4 animate-fadeIn text-text-primary">
      <section
        aria-labelledby="finance-summary-heading"
        className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]"
      >
        <h2 id="finance-summary-heading" className="sr-only">
          資金概覽
        </h2>
        <div className="px-3.5 py-3.5 sm:px-4 sm:py-4">
          <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary leading-tight">
            本月撥款收入（已結算）
          </p>
          <p className="font-mono font-bold text-[22px] sm:text-[26px] text-brand leading-tight mt-1 tabular-nums">
            HK$ {monthEarned.toLocaleString("zh-TW")}
          </p>
          <p className="font-mono text-[10px] text-text-disabled mt-1">
            以平台訂單撥款記錄為準
          </p>
        </div>
      </section>

      <section
        aria-labelledby="tx-heading"
        className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card overflow-hidden"
      >
        <div className="px-3.5 py-2.5 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
          <h2
            id="tx-heading"
            className={SECTION_TITLE_CLASS}
          >
            撥款記錄（{total}）
          </h2>
        </div>

        <div className="px-3.5 py-3 sm:px-4 border-b border-[rgba(237,232,224,0.06)] space-y-3">
          <form
            method="get"
            action="/profile/merchant/finance"
            className="space-y-2"
          >
            <input type="hidden" name="page" value="1" />
            {query.statusFilter !== "all" ? (
              <input type="hidden" name="status" value={query.statusFilter} />
            ) : null}
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                type="search"
                name="search"
                defaultValue={query.search ?? ""}
                placeholder="訂單編號 / Transfer ID"
                className={filterInputClass}
              />
              <select
                name="sort"
                defaultValue={query.sort}
                className={cn(
                  filterInputClass,
                  "w-[92px] px-2 font-mono text-[11px]",
                )}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input
                type="date"
                name="dateFrom"
                defaultValue={query.dateFrom ?? ""}
                className={filterDateInputClass}
              />
              <input
                type="date"
                name="dateTo"
                defaultValue={query.dateTo ?? ""}
                className={filterDateInputClass}
              />
              <button
                type="submit"
                className="h-9 px-3 rounded-lg border border-brand/30 font-mono text-[11px] font-bold text-brand bg-[rgba(212,165,116,0.06)] hover:bg-[rgba(212,165,116,0.1)] transition-colors shrink-0"
              >
                套用篩選
              </button>
            </div>
          </form>

          <div className="flex gap-1.5 flex-wrap">
            {STATUS_FILTERS.map((filter) => {
              const isActive = query.statusFilter === filter.value;
              return (
                <Link
                  key={filter.value}
                  href={buildMerchantFinanceHref(query, {
                    statusFilter: filter.value,
                    page: 1,
                  })}
                  className={cn(
                    "font-mono text-[10px] px-2.5 py-1 rounded-md border transition-colors",
                    isActive
                      ? "text-brand border-brand/40 bg-[rgba(212,165,116,0.08)] font-bold"
                      : "text-text-secondary border-[rgba(237,232,224,0.08)] hover:text-text-primary hover:bg-bg-elevated/60",
                  )}
                >
                  {filter.label}
                </Link>
              );
            })}
          </div>
        </div>

        {loadError ? (
          <p className="px-3.5 py-8 sm:px-4 text-center font-sans text-[12px] text-warning">
            {loadError}
          </p>
        ) : rows.length === 0 ? (
          <div
            className="px-4 py-10 sm:py-12 text-center"
            role="status"
          >
            <div
              className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-brand/20 bg-bg-page/60"
              aria-hidden
            >
              <Wallet className="h-5 w-5 text-brand/70" strokeWidth={1.5} />
            </div>
            <p className="font-sans font-semibold text-[13px] text-text-primary">
              尚無撥款記錄
            </p>
            <p className="font-sans text-[12px] text-text-disabled mt-1 max-w-xs mx-auto leading-relaxed">
              訂單完成撥款後，資金流水將顯示於此
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(237,232,224,0.06)]">
            {rows.map((tx) => (
              <SettlementRow key={tx.orderId} tx={tx} />
            ))}
          </div>
        )}

        {totalPages > 1 || total > 0 ? (
          <div className="border-t border-[rgba(237,232,224,0.06)] px-3.5 py-2 sm:px-4">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(nextPage) => {
                router.push(buildMerchantFinanceHref(query, { page: nextPage }));
              }}
              itemLabel="筆撥款"
              totalItems={total}
              itemsPerPage={query.pageSize}
              hideControls={totalPages <= 1}
              enableScroll={false}
            />
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="stripe-heading"
        className="rounded-xl border border-[rgba(99,91,255,0.22)] bg-bg-card overflow-hidden"
      >
        <div className="px-3.5 py-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className="w-10 h-10 rounded-lg bg-[rgba(99,91,255,0.12)] border border-[rgba(99,91,255,0.25)] flex items-center justify-center shrink-0"
              aria-hidden
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#635bff">
                <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2
                id="stripe-heading"
                className={SECTION_TITLE_CLASS}
              >
                Stripe Connect 帳戶
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-md border font-bold",
                    stripeConnected
                      ? "text-success bg-[rgba(16,185,129,0.12)] border-success/20"
                      : "text-brand bg-brand/10 border-brand/20",
                  )}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      stripeConnected ? "bg-success" : "bg-brand",
                    )}
                    aria-hidden
                  />
                  {stripeConnected ? "已連結 · Express 帳戶" : "待完成收款設定"}
                </span>
              </div>
              {stripeAccountLabel ? (
                <p className="font-mono text-[10px] text-text-secondary mt-1 truncate">
                  帳戶 ID：{stripeAccountLabel}
                </p>
              ) : null}
            </div>
          </div>

          {stripeConnected ? (
            <a
              href="/api/stripe/connect/dashboard"
              className="inline-flex items-center justify-center gap-1 font-mono text-[10px] text-[#635bff] bg-[rgba(99,91,255,0.10)] px-3 py-2 rounded-lg border border-[rgba(99,91,255,0.25)] font-bold hover:bg-[rgba(99,91,255,0.16)] transition-colors shrink-0 w-full sm:w-auto"
            >
              管理 Stripe 收款 →
            </a>
          ) : (
            <a
              href="/api/stripe/connect/onboard"
              className="inline-flex items-center justify-center gap-1 font-mono text-[10px] text-brand bg-brand/10 px-3 py-2 rounded-lg border border-brand/20 font-bold hover:bg-brand/15 transition-colors shrink-0 w-full sm:w-auto"
            >
              完成 Stripe 收款設定 →
            </a>
          )}
        </div>
        {stripeAccountId ? (
          <p className="sr-only">Stripe account id {stripeAccountId}</p>
        ) : null}
      </section>
    </div>
  );
}
