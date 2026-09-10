"use client";

import React, { useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Pagination as PaginationPrimitive,
  PaginationContent,
  PaginationItem,
  PaginationEllipsis,
} from "@/components/ui/pagination";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Optional label shown in the info strip (e.g. "件商品" / "筆掛單") */
  itemLabel?: string;
  /** Total number of items (for the info strip) */
  totalItems?: number;
  /** Items per page (for the info strip) */
  itemsPerPage?: number;
  /** 🟢 全新高能加裝：是否隱藏 [上一頁] / [下一頁] 按鈕，用於規避局部滾動條衝突 */
  hideControls?: boolean;
  /** 🟢 Scroll Gate: Controls window/container automatic scroll-recenter mechanics.
   *  Defaults to `true`. Pass `false` to bypass ALL scroll side-effects — pure
   *  in-place client-side data state slicing with zero viewport displacement. */
  enableScroll?: boolean;
  /** Hide the summary line above page controls (use when totals are shown elsewhere). */
  showInfoStrip?: boolean;
  className?: string;
  scrollToViewId?: string;
  scrollBlock?: ScrollLogicalPosition;
}

/** Generates a compact page-number window with optional ellipsis entries. */
function buildPageWindow(
  current: number,
  total: number,
  maxVisible = 7,
): (number | "ellipsis")[] {
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [];

  if (maxVisible <= 5) {
    if (current <= 2) {
      pages.push(1, 2, 3, "ellipsis", total);
    } else if (current >= total - 1) {
      pages.push(1, "ellipsis", total - 2, total - 1, total);
    } else {
      pages.push(1, "ellipsis", current, "ellipsis", total);
    }
    return pages;
  }

  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, "ellipsis", total);
  } else if (current >= total - 3) {
    pages.push(
      1,
      "ellipsis",
      total - 4,
      total - 3,
      total - 2,
      total - 1,
      total,
    );
  } else {
    pages.push(
      1,
      "ellipsis",
      current - 1,
      current,
      current + 1,
      "ellipsis",
      total,
    );
  }

  return pages;
}

const MOBILE_PAGINATION_QUERY = "(max-width: 639px)";

function subscribeMobilePagination(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_PAGINATION_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getMobilePaginationSnapshot() {
  return window.matchMedia(MOBILE_PAGINATION_QUERY).matches;
}

function getMobilePaginationServerSnapshot() {
  return true;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  itemLabel = "筆記錄",
  totalItems,
  itemsPerPage,
  hideControls = false,
  enableScroll = true, // 🟢 預設開啟：保持全站原有平滑回頂行為不變
  showInfoStrip = true,
  className,
  scrollToViewId,
  scrollBlock = "nearest",
}: PaginationProps) {
  const isMobilePagination = useSyncExternalStore(
    subscribeMobilePagination,
    getMobilePaginationSnapshot,
    getMobilePaginationServerSnapshot,
  );

  // Do not render when there's nothing to paginate
  if (totalPages <= 1) return null;

  const pages = buildPageWindow(
    currentPage,
    totalPages,
    isMobilePagination ? 5 : 7,
  );

  // Compute the visible slice range for the info strip
  const rangeStart =
    totalItems != null && itemsPerPage != null
      ? (currentPage - 1) * itemsPerPage + 1
      : null;
  const rangeEnd =
    totalItems != null && itemsPerPage != null
      ? Math.min(currentPage * itemsPerPage, totalItems)
      : null;

  // 收束分頁行為，點擊時伴隨 smooth 回頂 / 對焦
  const handlePageAction = (targetPage: number) => {
    onPageChange(targetPage);

    // 🟢 Scroll Gate 防線：如果傳入 false，全面切斷滾動副作用，原地就地切片
    if (!enableScroll) return;

    setTimeout(() => setOnScroll(), 200);

    function setOnScroll() {
      if (typeof window !== "undefined") {
        const customId = document.getElementById(scrollToViewId!);
        if (customId) {
          // 🎯 盤口詳情頁專屬：精準平滑對焦回盤口頂部
          customId.scrollIntoView({ behavior: "smooth", block: scrollBlock });
        } else {
          // 🎯 大盤市場專屬：回歸標準全域置頂
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    }
  };

  return (
    <div
      className={`flex w-full max-w-full flex-col items-center gap-2 overflow-hidden pt-3 ${className ?? ""}`}
    >
      {showInfoStrip &&
        rangeStart != null &&
        rangeEnd != null &&
        totalItems != null && (
        <p className="font-mono text-[10px] text-text-disabled select-none text-center">
          顯示第 <span className="text-brand font-bold">{rangeStart}</span>–
          <span className="text-brand font-bold">{rangeEnd}</span>
          <span className="text-text-disabled/70"> / {totalItems} {itemLabel}</span>
        </p>
      )}

      <div className="w-full max-w-full overflow-x-auto scrollbar-none">
        <PaginationPrimitive className="mx-auto w-max max-w-full">
          <PaginationContent className="flex-nowrap justify-center gap-1">
          {!hideControls && (
            <PaginationItem>
              <button
                type="button"
                onClick={() => handlePageAction(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="flex items-center justify-center gap-1 h-8 min-w-8 px-2 sm:px-3 shrink-0 whitespace-nowrap rounded-md font-sans font-semibold text-[11px] border border-[rgba(237,232,224,0.08)] bg-bg-card text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.97] select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-brand/40"
                aria-label="上一頁"
              >
                <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
                <span className="hidden sm:inline">上一頁</span>
              </button>
            </PaginationItem>
          )}

          {pages.map((page, idx) =>
            page === "ellipsis" ? (
              <PaginationItem key={`ell-${idx}`}>
                <PaginationEllipsis className="text-text-disabled w-7 h-8 sm:w-8" />
              </PaginationItem>
            ) : (
              <PaginationItem key={page}>
                <button
                  type="button"
                  onClick={() => handlePageAction(page)}
                  aria-current={currentPage === page ? "page" : undefined}
                  className={`w-7 h-8 sm:w-8 rounded-md font-mono text-[11px] sm:text-[12px] font-bold border transition-all select-none focus:outline-none active:scale-[0.95] ${
                    currentPage === page
                      ? "bg-brand text-[#1A1612] border-brand"
                      : "bg-bg-card text-text-secondary border-[rgba(237,232,224,0.08)] hover:bg-bg-elevated hover:border-brand/30 hover:text-text-primary"
                  }`}
                >
                  {page}
                </button>
              </PaginationItem>
            ),
          )}

          {!hideControls && (
            <PaginationItem>
              <button
                type="button"
                onClick={() =>
                  handlePageAction(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage === totalPages}
                className="flex items-center justify-center gap-1 h-8 min-w-8 px-2 sm:px-3 shrink-0 whitespace-nowrap rounded-md font-sans font-semibold text-[11px] border border-[rgba(237,232,224,0.08)] bg-bg-card text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.97] select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-brand/40"
                aria-label="下一頁"
              >
                <span className="hidden sm:inline">下一頁</span>
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
              </button>
            </PaginationItem>
          )}
        </PaginationContent>
      </PaginationPrimitive>
      </div>
    </div>
  );
}
