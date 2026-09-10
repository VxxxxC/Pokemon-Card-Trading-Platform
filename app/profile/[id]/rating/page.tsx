"use client";

import React, {
  Suspense,
  use,
  useState,
  useSyncExternalStore,
  useCallback,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { IoChevronBack } from "react-icons/io5";
import { Pagination } from "@/app/components/ui/Pagination";
import { TopNav } from "@/app/components/navigation/TopNav";
import { MobileHeader } from "@/app/components/navigation/MobileHeader";
import { BottomNav } from "@/app/components/navigation/BottomNav";
import { PublicReviewPreviewCard } from "@/app/components/profile/PublicReviewPreviewCard";
import { usePublicProfileReviews } from "@/app/lib/hooks/usePublicProfileReviews";
import type { ReviewPersona, ReviewSortKey } from "@/app/lib/reviews/types";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PUBLIC_PROFILE_BACK_CLASS,
  PUBLIC_PROFILE_CARD_CLASS,
  PUBLIC_PROFILE_MAIN_CLASS,
  PUBLIC_PROFILE_SECTION_BODY_CLASS,
} from "../public-profile-ui";
import { PRODUCT_DETAIL_SECTION_TITLE_CLASS } from "@/app/marketplace/product/[id]/product-detail-ui";

interface PublicRatingPageProps {
  params: Promise<{ id: string }>;
}

const SORT_LABELS: Record<ReviewSortKey, string> = {
  "date-desc": "📅 日期：最新 → 最舊",
  "date-asc": "⏳ 日期：最舊 → 最新",
  "rating-desc": "🔥 評分：最高 → 最低",
  "rating-asc": "❄️ 評分：最低 → 最高",
};

function getSnapshot() {
  return typeof window !== "undefined" ? window.innerWidth : 1280;
}

function getServerSnapshot() {
  return 1280;
}

function subscribe(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

function parsePersona(value: string | null): ReviewPersona {
  return value === "merchant" ? "merchant" : "member";
}

function PublicRatingPageContent({ params }: PublicRatingPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const resolvedParams = use(params);
  const profileId = resolvedParams.id;
  const persona = parsePersona(searchParams.get("persona"));

  const viewportWidth = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const itemsPerPage = viewportWidth < 1280 ? 5 : 10;

  const [sortKey, setSortKey] = useState<ReviewSortKey>("date-desc");

  const {
    reviews,
    aggregateRating,
    publicReviewCount,
    totalCount,
    totalPages,
    page,
    isLoading,
    error,
    notFound,
    setPage,
  } = usePublicProfileReviews({
    profileId,
    persona,
    sort: sortKey,
    pageSize: itemsPerPage,
  });

  const handleSortChange = useCallback(
    (value: string | null) => {
      if (value) {
        setSortKey(value as ReviewSortKey);
      }
      setPage(1);
    },
    [setPage],
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      setPage(nextPage);
    },
    [setPage],
  );

  const safeCurrentPage = totalPages > 0 ? Math.min(page, totalPages) : 1;

  const displayRating = aggregateRating.toFixed(1);
  const displayReviewCount = publicReviewCount || totalCount;

  if (notFound) {
    return (
      <div className="min-h-dvh bg-[#17130f] text-[#eae1da] flex flex-col items-center justify-center">
        <h1 className="text-xl font-sans font-bold text-text-disabled">
          找不到此用戶檔案
        </h1>
        <Link
          href="/marketplace"
          className="text-brand text-sm mt-2 hover:underline"
        >
          ← 返回交易所大盤
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#17130f] flex flex-col text-[#eae1da]">
      <TopNav />
      <MobileHeader />

      <main className={PUBLIC_PROFILE_MAIN_CLASS}>
        <button
          type="button"
          onClick={() => router.back()}
          className={PUBLIC_PROFILE_BACK_CLASS}
        >
          <IoChevronBack className="size-3.5" />
          返回
        </button>

        <div id="rating-list" className={PUBLIC_PROFILE_CARD_CLASS}>
          <div
            className={`${PUBLIC_PROFILE_SECTION_BODY_CLASS} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/[0.06]`}
          >
            <div className="min-w-0">
              <h1 className={PRODUCT_DETAIL_SECTION_TITLE_CLASS}>
                全量信用評價歷史
              </h1>
              <p className="font-mono text-[12px] text-[#d4c4b7] mt-1">
                ⭐{" "}
                <span className="text-brand font-bold">{displayRating}</span>
                <span className="text-[#8A8680]">
                  {" "}
                  · {displayReviewCount} 則評價
                </span>
              </p>
            </div>

            <div className="shrink-0">
              <Select value={sortKey} onValueChange={handleSortChange}>
                <SelectTrigger className="w-44 h-9 bg-[#17130f] border-0 rounded-lg text-[#eae1da] text-[12px] focus:ring-0 focus:ring-offset-0 focus:border-brand/40">
                  <SelectValue placeholder="選擇排序方式">
                    {SORT_LABELS[sortKey]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-[#26211C] border border-white/10 rounded-lg text-[#eae1da]">
                  <SelectItem value="date-desc">📅 日期：最新 → 最舊</SelectItem>
                  <SelectItem value="date-asc">⏳ 日期：最舊 → 最新</SelectItem>
                  <SelectItem value="rating-desc">
                    🔥 評分：最高 → 最低
                  </SelectItem>
                  <SelectItem value="rating-asc">❄️ 評分：最低 → 最高</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={PUBLIC_PROFILE_SECTION_BODY_CLASS}>
            {error ? (
              <p className="font-sans text-[13px] text-warning mb-3">{error}</p>
            ) : null}

            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {reviews.length === 0 ? (
                  <p className="font-sans text-[13px] text-text-secondary text-center py-10">
                    暫無公開評價紀錄
                  </p>
                ) : (
                  reviews.map((review) => (
                    <PublicReviewPreviewCard
                      key={review.id}
                      review={review}
                      variant="embedded"
                    />
                  ))
                )}
              </div>
            )}

            {!isLoading && totalPages > 0 ? (
              <Pagination
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                itemLabel="筆評價"
                totalItems={totalCount}
                itemsPerPage={itemsPerPage}
                enableScroll={true}
                scrollBlock="start"
                scrollToViewId="rating-list"
                className="mt-3"
              />
            ) : null}
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

export default function PublicRatingPage(props: PublicRatingPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-[#17130f] flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        </div>
      }
    >
      <PublicRatingPageContent {...props} />
    </Suspense>
  );
}
