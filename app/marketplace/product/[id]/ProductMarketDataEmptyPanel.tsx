"use client";

import {
  PRODUCT_DETAIL_PANEL_CLASS,
  PRODUCT_DETAIL_SECTION_TITLE_CLASS,
} from "./product-detail-ui";

type ProductMarketDataEmptyPanelProps = {
  title: string;
  message: string;
  compact?: boolean;
  badge?: string;
};

export function ProductMarketDataEmptyPanel({
  title,
  message,
  compact = false,
  badge,
}: ProductMarketDataEmptyPanelProps) {
  return (
    <div
      className={`${PRODUCT_DETAIL_PANEL_CLASS} ${
        compact ? "p-3" : "p-4"
      } space-y-2`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className={PRODUCT_DETAIL_SECTION_TITLE_CLASS}>{title}</h3>
        {badge ? (
          <span className="font-mono text-[10px] text-brand font-bold shrink-0">
            {badge}
          </span>
        ) : null}
      </div>

      <div
        className={`flex items-center gap-3 text-left ${
          compact ? "py-2" : "py-3"
        }`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand/20 bg-[#1A1612]">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-brand/70"
            aria-hidden
          >
            <path d="M3 3v18h18" />
            <path d="M7 16l4-6 4 3 5-7" />
          </svg>
        </div>
        <p className="font-sans text-[12px] text-text-disabled leading-relaxed min-w-0">
          {message}
        </p>
      </div>
    </div>
  );
}
