"use client";

import Image from "next/image";
import Link from "next/link";
import type { WishlistEntry } from "@/app/lib/wishlist/types";
import {
  resolveWishlistAlertTag,
  resolveWishlistDisplayValue,
} from "@/lib/wishlist/pricing";
import {
  getSparklinePoints,
  hasWishlistTrendData,
} from "@/lib/wishlist/sparkline";
import {
  HOME_HORIZONTAL_CARD_CLASS,
  HOME_HORIZONTAL_CARD_IMAGE_CLASS,
  HOME_HORIZONTAL_CARD_SIZES,
  HOME_SECTION_HEADER_ROW_CLASS,
  HOME_SECTION_LINK_CLASS,
  HOME_SECTION_TITLE_CLASS,
  HOME_WISHLIST_SECTION_CLASS,
} from "@/app/components/home/home-section-ui";
import { useIsMemberPersonaActive } from "@/app/lib/hooks/useIsMemberPersonaActive";

interface TrackedCardProps {
  productId: string;
  name: string;
  cardCode: string;
  currentPrice: number | null;
  trend30d: number | null;
  sparklinePoints: string;
  sparklineDirection: "up" | "down";
  hasTrend: boolean;
  alertTag?: string | null;
  trackedDiffLabel?: string | null;
  image: string;
}

function Sparkline({
  points,
  direction,
  hasTrend,
}: {
  points: string;
  direction: "up" | "down";
  hasTrend: boolean;
}) {
  if (!hasTrend) {
    return (
      <span className="font-mono text-[10px] text-text-disabled">—</span>
    );
  }

  const color = direction === "up" ? "#10b981" : "#ef4444";
  return (
    <svg
      width="48"
      height="24"
      viewBox="0 0 64 32"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WishlistCardSkeleton() {
  return (
    <div
      className={`${HOME_HORIZONTAL_CARD_CLASS} animate-pulse`}
    >
      <div className={`${HOME_HORIZONTAL_CARD_IMAGE_CLASS} bg-linear-to-b from-[#26211C] via-[#2e2925] to-[#26211C]`} />
      <div className="p-2.5 space-y-1.5">
        <div className="h-3 bg-bg-elevated rounded animate-pulse w-3/4" />
        <div className="h-2.5 bg-bg-elevated rounded animate-pulse w-1/2" />
        <div className="h-3.5 bg-bg-elevated rounded animate-pulse w-2/3" />
      </div>
    </div>
  );
}

function mapEntryToTrackedCard(entry: WishlistEntry): TrackedCardProps {
  const resolved = resolveWishlistDisplayValue(entry);
  const hasTrend = hasWishlistTrendData(entry.trend30d, entry.chartPoints);
  const trend30d = entry.trend30d ?? 0;
  const trackedDiffLabel =
    resolved.source === "platform" &&
    resolved.value != null &&
    entry.trackedPrice != null
      ? (() => {
          const diff = resolved.value - entry.trackedPrice;
          const sign = diff >= 0 ? "+" : "";
          return `${sign}HK$ ${Math.abs(diff).toLocaleString("en-HK")} 自追蹤`;
        })()
      : null;

  return {
    productId: entry.productId,
    name: entry.name,
    cardCode: entry.cardCode || entry.displayId || entry.productId,
    currentPrice: resolved.value,
    trend30d: entry.trend30d,
    sparklinePoints: getSparklinePoints(entry.chartPoints),
    sparklineDirection: trend30d >= 0 ? "up" : "down",
    hasTrend,
    alertTag: resolveWishlistAlertTag(entry, resolved),
    trackedDiffLabel,
    image: entry.imageUrl?.trim() || "",
  };
}

function WishlistCardItem({ card }: { card: TrackedCardProps }) {
  const formattedPrice =
    card.currentPrice != null
      ? `HK$ ${card.currentPrice.toLocaleString("en-HK")}`
      : "暫無報價";
  const trendSign = (card.trend30d ?? 0) >= 0 ? "▲" : "▼";
  const trendFormatted =
    card.trend30d != null
      ? `${trendSign} ${Math.abs(card.trend30d).toFixed(1)}%`
      : "—";

  return (
    <Link
      href={`/marketplace/product/${card.productId}`}
      className={`${HOME_HORIZONTAL_CARD_CLASS} hover:border-brand/30 hover:shadow-[0_8px_24px_rgba(0,0,0,0.60)] transition-all active:scale-[0.98] block`}
    >
      <div className={HOME_HORIZONTAL_CARD_IMAGE_CLASS}>
        {card.image ? (
          <Image
            src={card.image}
            alt={card.name}
            fill
            className="object-cover"
            sizes={HOME_HORIZONTAL_CARD_SIZES}
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-text-disabled px-2 text-center">
            {card.name}
          </span>
        )}
        {card.alertTag && (
          <span className="absolute top-2 left-2 font-mono text-[10px] md:text-[11px] font-bold text-[#17130f] bg-brand px-2 py-0.5 rounded-sm leading-none shadow-sm">
            {card.alertTag}
          </span>
        )}
      </div>

      <div className="p-3">
        <p className="font-sans font-bold text-[13px] md:text-base text-text-primary truncate mb-0.5">
          {card.name}
        </p>
        <p className="font-mono text-[10px] md:text-[11px] text-text-disabled mb-2">
          {card.cardCode}
        </p>
        <div className="flex items-center justify-between gap-1">
          <div>
            <p className="font-mono font-bold text-[14px] md:text-lg text-brand leading-none">
              {formattedPrice}
            </p>
            <span
              className={`font-mono text-[10px] md:text-[11px] font-bold mt-1 block ${
                card.trend30d != null && card.trend30d >= 0
                  ? "text-success"
                  : card.trend30d != null
                    ? "text-warning"
                    : "text-text-disabled"
              }`}
            >
              {trendFormatted}
            </span>
            {card.trackedDiffLabel ? (
              <span className="font-mono text-[10px] text-text-secondary mt-0.5 block">
                {card.trackedDiffLabel}
              </span>
            ) : null}
          </div>
          <Sparkline
            points={card.sparklinePoints}
            direction={card.sparklineDirection}
            hasTrend={card.hasTrend}
          />
        </div>
      </div>
    </Link>
  );
}

interface WishlistTickerProps {
  entries?: WishlistEntry[];
  isLoading?: boolean;
}

export function WishlistTicker({
  entries = [],
  isLoading = false,
}: WishlistTickerProps) {
  const isMemberPersonaActive = useIsMemberPersonaActive();

  if (!isMemberPersonaActive) {
    return null;
  }

  const cards = entries.map(mapEntryToTrackedCard);

  return (
    <section
      aria-labelledby="wishlist-ticker-heading"
      className={HOME_WISHLIST_SECTION_CLASS}
    >
      <div className={HOME_SECTION_HEADER_ROW_CLASS}>
        <h2
          id="wishlist-ticker-heading"
          className={`${HOME_SECTION_TITLE_CLASS} flex items-center gap-1.5`}
        >
          <span className="text-brand" aria-hidden="true">★</span>
          我的心水情報
        </h2>
        <Link
          href="/profile/user/collection"
          className={HOME_SECTION_LINK_CLASS}
        >
          管理 →
        </Link>
      </div>
      <div className="flex overflow-x-auto gap-3 scrollbar-none pb-1 -mx-1 px-1">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <WishlistCardSkeleton key={i} />
            ))
          : cards.length > 0
            ? cards.map((card, index) => (
                <WishlistCardItem
                  key={`${entries[index]?.productId}-${entries[index]?.gradingCompany}-${entries[index]?.gradingScore}`}
                  card={card}
                />
              ))
            : (
                <p className="font-sans text-[13px] text-text-secondary py-4">
                  尚未加入心水卡牌，前往市集按 ★ 追蹤。
                </p>
              )}
      </div>
    </section>
  );
}
