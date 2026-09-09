"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { DASHBOARD_SECTION_TITLE_CLASS } from "@/app/profile/dashboard-ui";
import type { UserTradingOrder } from "@/app/actions/orders";
import { Pagination } from "@/app/components/ui/Pagination";
import { UserOrderRow, OrderRowChip } from "@/app/components/user/UserOrderRow";
import { TradingFilterResetButton } from "@/app/components/trading/TradingFilterResetButton";
import { TradingSegmentedFilter, type SegmentedFilterOption } from "@/app/components/trading/TradingSegmentedFilter";
import {
  hasActiveMemberTradingFilters,
  useTradingFiltersStore,
} from "@/app/store/useTradingFiltersStore";
import {
  useUserTrading,
  type TradingInitialData,
} from "@/app/lib/hooks/useUserTrading";
import { getMemberAuthOrderActions } from "@/app/lib/member-order/auth-escrow";
import { mapTradingOrderToSaleOrder } from "@/app/lib/member-order/map-sale-order";
import {
  PERSONA_OPTIONS,
  PENDING_ACTION_STATUSES,
  STATUS_OPTIONS,
  TAB_STATUS_FROM_PARAM,
  type PersonaFilter,
  type TabStatusFilter,
} from "@/lib/member-order/constants";
import { cn } from "@/lib/utils";
import { isMerchantPaymentExpired } from "@/lib/merchant-checkout/pending-payment-expiry";

const ReviewModal = dynamic(
  () =>
    import("@/app/components/trading/ReviewModal").then(
      (module) => module.ReviewModal,
    ),
  { ssr: false },
);

type ActiveReviewState = {
  orderId: string;
  revieweeId: string;
} | null;

type UserTradingClientProps = {
  initialData: TradingInitialData;
  initialTabStatus: TabStatusFilter;
  bootstrapError?: string;
};

function renderStatusBadge(order: UserTradingOrder) {
  if (
    order.merchantEscrowStatus === "refunded" &&
    order.orderKind === "merchant"
  ) {
    return <OrderRowChip tone="buy">付款已過期</OrderRowChip>;
  }

  if (order.pendingPayment) {
    const expired = order.paymentExpiresAt
      ? isMerchantPaymentExpired(order.paymentExpiresAt)
      : false;
    if (expired) {
      return <OrderRowChip tone="buy">付款已過期</OrderRowChip>;
    }
    return <OrderRowChip tone="warning">待付款</OrderRowChip>;
  }

  if (
    order.orderKind === "merchant" &&
    !order.useAuthentication &&
    order.status === "pending"
  ) {
    switch (order.merchantEscrowStatus) {
      case "payment_held":
        return <OrderRowChip tone="blue">待發貨</OrderRowChip>;
      case "shipped":
        return <OrderRowChip tone="blue">運送中</OrderRowChip>;
      default:
        break;
    }
  }

  if (order.useAuthentication && order.status === "pending" && order.escrowStatus) {
    switch (order.escrowStatus) {
      case "payment":
        return <OrderRowChip tone="warning">待付款</OrderRowChip>;
      case "custody":
        return <OrderRowChip tone="blue">待寄平台</OrderRowChip>;
      case "grading":
        return <OrderRowChip tone="grading">鑑定中</OrderRowChip>;
      case "shipped":
        return <OrderRowChip tone="blue">運送中</OrderRowChip>;
      default:
        return <OrderRowChip tone="warning">待處理</OrderRowChip>;
    }
  }

  switch (order.status ?? "") {
    case "pending":
    case "meetup_arranged":
      return <OrderRowChip tone="warning">待處理</OrderRowChip>;
    case "completed":
      return <OrderRowChip tone="success">已完成</OrderRowChip>;
    case "cancelled":
      return <OrderRowChip tone="destructive">已取消</OrderRowChip>;
    default:
      return null;
  }
}

function TradingPersonaUnderlineTabs({
  options,
  value,
  onChange,
}: {
  options: SegmentedFilterOption<PersonaFilter>[];
  value: PersonaFilter;
  onChange: (next: PersonaFilter) => void;
}) {
  return (
    <nav
      className="flex gap-0 min-w-0 overflow-x-auto scrollbar-none"
      aria-label="買賣方向篩選"
    >
      {options.map((option) => {
        const isActive = value === option.value;
        const displayLabel =
          option.value === "all"
            ? option.label
            : option.count > 0
              ? `${option.label} (${option.count})`
              : option.label;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "shrink-0 px-2 py-1 font-mono text-[10px] font-medium border-b-2 -mb-px transition-colors cursor-pointer",
              isActive
                ? "text-brand border-brand"
                : "text-text-secondary border-transparent hover:text-text-primary",
            )}
          >
            {displayLabel}
          </button>
        );
      })}
    </nav>
  );
}

export function UserTradingClient({
  initialData,
  bootstrapError,
}: UserTradingClientProps) {
  const searchParams = useSearchParams();
  const persona = useTradingFiltersStore((state) => state.member.persona);
  const tabStatus = useTradingFiltersStore((state) => state.member.tabStatus);
  const searchQuery = useTradingFiltersStore((state) => state.member.searchQuery);
  const setPersona = useTradingFiltersStore((state) => state.setMemberPersona);
  const setTabStatus = useTradingFiltersStore((state) => state.setMemberTabStatus);
  const setSearchQuery = useTradingFiltersStore((state) => state.setMemberSearchQuery);
  const resetMemberFilters = useTradingFiltersStore((state) => state.resetMemberFilters);
  const hasActiveFilters = useTradingFiltersStore((state) =>
    hasActiveMemberTradingFilters(state.member),
  );
  const [activeReview, setActiveReview] = useState<ActiveReviewState>(null);

  const {
    orders,
    paginationMeta,
    filterCounts,
    isLoading,
    isRefreshing,
    error: fetchError,
    refetch,
    setPage,
  } = useUserTrading({
    persona,
    tabStatus,
    searchQuery,
    initialData,
  });

  useEffect(() => {
    const queryFilter = searchParams.get("filter");
    if (queryFilter && TAB_STATUS_FROM_PARAM[queryFilter]) {
      const nextStatus = TAB_STATUS_FROM_PARAM[queryFilter];
      queueMicrotask(() => setTabStatus(nextStatus));
    }
  }, [searchParams, setTabStatus]);

  const handleOpenReview = useCallback(
    (orderId: string, revieweeId: string) => {
      setActiveReview({ orderId, revieweeId });
    },
    [],
  );

  const handleCloseReview = useCallback(() => {
    setActiveReview(null);
    refetch();
  }, [refetch]);

  const handleRefreshOrders = useCallback(() => {
    refetch();
  }, [refetch]);

  const needsAction = filterCounts.needsAction;
  const displayError = bootstrapError ?? fetchError;

  const statusSegmentOptions = STATUS_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    count: filterCounts.status[option.value],
  }));

  const personaSegmentOptions = PERSONA_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    count: filterCounts.persona[option.value],
  }));

  return (
    <>
      <div
        className={`animate-fadeIn${isRefreshing ? " opacity-80 pointer-events-none" : ""}`}
      >
        {needsAction > 0 ? (
          <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-[rgba(239,68,68,0.06)] border border-warning/25 rounded-lg">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 mt-0.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="font-sans text-[12px] text-text-primary leading-snug">
              <span className="font-semibold text-warning">
                {needsAction} 件交易
              </span>{" "}
              需要處理：付款、寄卡或確認收貨。
            </p>
          </div>
        ) : null}

        {displayError ? (
          <div className="mb-3 px-3 py-2 bg-[rgba(239,68,68,0.06)] border border-warning/25 rounded-lg">
            <p className="font-sans text-[12px] text-warning">
              無法載入線上訂單：{displayError}
            </p>
          </div>
        ) : null}

        <section
          id="orders-list"
          aria-labelledby="user-trading-heading"
          className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]"
        >
          <div className="px-3 py-2.5 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-disabled pointer-events-none"
                aria-hidden
              />
              <input
                id="user-order-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="訂單編號、卡牌、卡號、系列或對手…"
                className="w-full h-9 pl-9 pr-9 bg-bg-page/50 border border-[rgba(237,232,224,0.08)] rounded-lg font-sans text-[13px] text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-brand/30 transition-colors"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-disabled hover:text-text-primary transition-colors focus:outline-none"
                  aria-label="清除搜尋"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
            <h2
              id="user-trading-heading"
              className={`${DASHBOARD_SECTION_TITLE_CLASS} min-w-0 truncate`}
            >
              交易管理
            </h2>
          </div>

          <div className="px-3 py-2 sm:px-4 border-b border-[rgba(237,232,224,0.06)] space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p
                  className="font-mono text-[9px] text-text-disabled tracking-wide"
                  id="user-trading-status-filter-label"
                >
                  訂單狀態
                </p>
                <TradingFilterResetButton
                  hasActiveFilters={hasActiveFilters}
                  onReset={resetMemberFilters}
                />
              </div>
              <TradingSegmentedFilter
                options={statusSegmentOptions}
                value={tabStatus}
                onChange={setTabStatus}
                columns={4}
                pendingValue="pending"
                ariaLabelledBy="user-trading-status-filter-label"
              />
            </div>

            <TradingPersonaUnderlineTabs
              options={personaSegmentOptions}
              value={persona}
              onChange={setPersona}
            />
          </div>

          <div className="px-2 sm:px-3 py-2.5 min-h-[12rem] space-y-2.5">
            {isLoading && orders.length === 0 ? (
              <div className="py-12 flex justify-center">
                <div className="w-7 h-7 rounded-full border-2 border-brand border-t-transparent animate-spin" />
              </div>
            ) : orders.length === 0 ? (
              <p className="font-sans text-[13px] text-text-disabled py-12 text-center">
                沒有符合篩選的訂單記錄。
              </p>
            ) : (
              orders.map((order) => {
                const authActions = order.useAuthentication
                  ? getMemberAuthOrderActions({
                      persona: order.persona,
                      useAuthentication: order.useAuthentication,
                      escrowStatus: order.escrowStatus,
                      status: order.status,
                    })
                  : null;

                return (
                  <UserOrderRow
                    key={order.id}
                    order={mapTradingOrderToSaleOrder(order)}
                    detailOrderId={order.id}
                    orderNumber={order.orderNumber}
                    statusBadge={renderStatusBadge(order)}
                    onOpenReview={handleOpenReview}
                    dbOrderContext={{
                      orderKind: order.orderKind,
                      orderId: order.id,
                      revieweeId: order.counterparty.id,
                      dbStatus: order.status ?? "",
                      hasReviewedByMe: order.hasReviewedByMe,
                      useAuthentication: order.useAuthentication,
                      escrowStatus: order.escrowStatus,
                      canPay: authActions?.canPay ?? false,
                      pendingPayment: order.pendingPayment,
                      paymentExpiresAt: order.paymentExpiresAt,
                      canCompleteMerchantPurchase: order.canCompleteMerchantPurchase,
                      canCancel:
                        authActions?.canCancel ??
                        (order.persona === "sell" &&
                          PENDING_ACTION_STATUSES.has(order.status ?? "")),
                      onRefresh: handleRefreshOrders,
                    }}
                  />
                );
              })
            )}
          </div>

          {paginationMeta.total > 0 ? (
            <div className="px-3 pb-2 sm:px-4">
              <Pagination
                currentPage={paginationMeta.page}
                totalPages={paginationMeta.totalPages}
                onPageChange={(nextPage) => setPage(nextPage)}
                itemLabel="筆訂單記錄"
                totalItems={paginationMeta.total}
                itemsPerPage={paginationMeta.pageSize}
                enableScroll={true}
                scrollBlock="start"
                scrollToViewId="orders-list"
              />
            </div>
          ) : null}
        </section>
      </div>

      {activeReview ? (
        <ReviewModal
          isOpen={activeReview !== null}
          onClose={handleCloseReview}
          orderId={activeReview.orderId}
          revieweeId={activeReview.revieweeId}
        />
      ) : null}
    </>
  );
}
