"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getGamificationStats,
  listPointsRedemptionCatalog,
  redeemPointsCatalogItem,
} from "@/app/actions/rewards";
import { useIsMemberPersonaActive } from "@/app/lib/hooks/useIsMemberPersonaActive";
import type { PointsRedemptionCatalogView } from "@/lib/admin-rewards/types";
import { Pagination } from "@/app/components/ui/Pagination";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

type PointsRedemptionSectionProps = {
  onRedeemed?: () => void;
  paginated?: boolean;
  showHeading?: boolean;
  itemsPerPage?: number;
};

type PointsSort = "points_asc" | "points_desc" | "stock_desc";

const POINTS_PAGE_SIZE = 6;

function sortPointsCatalog(
  items: PointsRedemptionCatalogView[],
  sort: PointsSort,
): PointsRedemptionCatalogView[] {
  const sorted = [...items];
  if (sort === "points_desc") {
    sorted.sort((a, b) => b.pointsCost - a.pointsCost);
    return sorted;
  }
  if (sort === "stock_desc") {
    sorted.sort((a, b) => b.stock - a.stock);
    return sorted;
  }
  sorted.sort((a, b) => a.pointsCost - b.pointsCost);
  return sorted;
}

function catalogStubLabel(item: PointsRedemptionCatalogView): string {
  if (item.template.type === "free_shipping") {
    const cap = Number(item.template.rewardValue.max_subsidy_hkd ?? 0);
    return cap > 0 ? `HK$${cap}` : "免運";
  }

  const amount = Number(item.template.rewardValue.amount_hkd ?? 0);
  return amount > 0 ? `HK$${amount}` : `${item.pointsCost}`;
}

function catalogStubHint(item: PointsRedemptionCatalogView): string {
  if (item.template.type === "free_shipping") {
    return "免運";
  }

  const amount = Number(item.template.rewardValue.amount_hkd ?? 0);
  return amount > 0 ? "折扣" : "PTS";
}

function showCatalogSubtitle(item: PointsRedemptionCatalogView): boolean {
  const title = item.template.title?.trim() ?? "";
  const description = item.template.description?.trim() ?? "";
  return description.length > 0 && description !== title;
}

export function PointsRedemptionSection({
  onRedeemed,
  paginated = false,
  showHeading = true,
  itemsPerPage = POINTS_PAGE_SIZE,
}: PointsRedemptionSectionProps) {
  const isMemberPersonaActive = useIsMemberPersonaActive();
  const [items, setItems] = useState<PointsRedemptionCatalogView[]>([]);
  const [sort, setSort] = useState<PointsSort>("points_asc");
  const [page, setPage] = useState(1);
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshCatalog = useCallback(async () => {
    const [catalogResult, statsResult] = await Promise.all([
      listPointsRedemptionCatalog(),
      getGamificationStats(),
    ]);

    if (!catalogResult.success) {
      setItems([]);
      setLoadError(catalogResult.error);
      setIsLoading(false);
      return;
    }

    setItems(catalogResult.data);
    setLoadError(null);
    setIsLoading(false);

    if (statsResult.success) {
      setPointsBalance(statsResult.data.pointsBalance);
    } else if (catalogResult.data[0]) {
      setPointsBalance(catalogResult.data[0].userPointsBalance);
    }
  }, []);

  useEffect(() => {
    if (!isMemberPersonaActive) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      await refreshCatalog();
      if (cancelled) {
        return;
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isMemberPersonaActive, refreshCatalog]);

  if (!isMemberPersonaActive) {
    return null;
  }

  const handleRedeem = (item: PointsRedemptionCatalogView) => {
    if (!item.canRedeem || isPending) {
      return;
    }

    setRedeemingId(item.catalogId);
    startTransition(async () => {
      const result = await redeemPointsCatalogItem(item.catalogId);
      setRedeemingId(null);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("兌換成功，優惠券已加入錢包");
      setPointsBalance(result.data.pointsBalance);
      await refreshCatalog();
      onRedeemed?.();
    });
  };

  if (isLoading) {
    return (
      <section className="flex items-center gap-2 py-6 text-[12px] text-text-secondary">
        <Spinner className="size-4 text-brand" />
        載入積分商城…
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="py-6 text-[12px] text-text-secondary">
        {loadError}
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="py-10 text-center text-[12px] text-text-disabled">
        積分商城暫無可兌換商品
      </section>
    );
  }

  const sortedItems = sortPointsCatalog(items, sort);
  const totalPages = paginated
    ? Math.max(1, Math.ceil(sortedItems.length / itemsPerPage))
    : 1;
  const safePage = Math.min(page, totalPages);
  const visibleItems = paginated
    ? sortedItems.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage)
    : sortedItems;

  return (
    <section className="space-y-4">
      {showHeading ? (
        <div>
          <h3 className={SECTION_TITLE_CLASS}>
            積分商城
          </h3>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {paginated ? (
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as PointsSort);
              setPage(1);
            }}
            className="h-8 rounded-lg border border-white/[0.06] bg-bg-card px-2 font-sans text-[11px] text-text-primary"
          >
            <option value="points_asc">積分由低至高</option>
            <option value="points_desc">積分由高至低</option>
            <option value="stock_desc">庫存優先</option>
          </select>
        ) : (
          <div />
        )}
        {pointsBalance != null ? (
          <p className="font-mono text-[11px] text-brand">
            可用積分 {pointsBalance.toLocaleString()} PTS
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {visibleItems.map((item) => {
          const soldOut = item.stock <= 0;
          const atUserLimit =
            item.maxRedemptionsPerUser != null &&
            item.userRedemptionCount >= item.maxRedemptionsPerUser;
          const showSubtitle = showCatalogSubtitle(item);

          return (
            <div
              key={item.catalogId}
              className="overflow-hidden rounded-xl border border-white/[0.08] bg-bg-card"
            >
              <div className="flex items-stretch">
                <div className="relative flex w-[4.5rem] shrink-0 flex-col items-center justify-center px-2 py-3.5">
                  <div className="absolute left-1.5 top-3 bottom-3 w-0.5 rounded-full bg-brand/70" />
                  <p className="text-center font-mono text-[13px] font-bold leading-tight tabular-nums text-brand">
                    {catalogStubLabel(item)}
                  </p>
                  <p className="mt-1 text-center font-sans text-[9px] leading-tight text-text-disabled">
                    {catalogStubHint(item)}
                  </p>
                </div>

                <div className="min-w-0 flex-1 border-l border-dashed border-white/10 py-3 pr-3 pl-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="min-w-0 font-sans text-[14px] font-bold leading-snug text-text-primary line-clamp-2">
                      {item.template.title}
                    </h4>
                    <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-brand">
                      {item.pointsCost.toLocaleString()} PTS
                    </span>
                  </div>

                  {showSubtitle ? (
                    <p className="mt-0.5 font-sans text-[12px] leading-snug text-brand line-clamp-2">
                      {item.template.description}
                    </p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-sans text-[10px] text-text-disabled">
                    <span>{soldOut ? "已兌完" : `剩餘 ${item.stock}`}</span>
                    {item.maxRedemptionsPerUser != null ? (
                      <span>
                        已兌 {item.userRedemptionCount}/{item.maxRedemptionsPerUser}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.06] px-3 py-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!item.canRedeem || isPending}
                  onClick={() => handleRedeem(item)}
                  className="h-9 w-full"
                >
                  {redeemingId === item.catalogId ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="size-4" />
                      兌換中…
                    </span>
                  ) : soldOut ? (
                    "已兌完"
                  ) : atUserLimit ? (
                    "已達上限"
                  ) : (
                    "兌換"
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {paginated ? (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          itemLabel="件商品"
          totalItems={sortedItems.length}
          itemsPerPage={itemsPerPage}
          hideControls={totalPages <= 1}
          enableScroll={false}
        />
      ) : null}
    </section>
  );
}
