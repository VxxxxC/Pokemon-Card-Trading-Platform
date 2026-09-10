"use client";

import { Skeleton } from "@/components/ui/skeleton";

// 📈 1. PriceTicker Running Marquee Skeleton
export function PriceTickerSkeleton() {
  return (
    <div
      className="w-full h-9 bg-[#26211C] border-b border-white/5 flex items-center justify-start gap-6 px-4 overflow-hidden select-none"
      aria-label="最新平台成交"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 shrink-0 min-w-[140px]">
          {/* Circular coin indicator */}
          <Skeleton className="w-4 h-4 rounded-full bg-[#17130f]" />
          {/* Card Series text string stub */}
          <Skeleton className="h-3 bg-[#17130f] w-16 rounded" />
          {/* Price index value stub */}
          <Skeleton className="h-3 bg-[#17130f] w-10 rounded" />
        </div>
      ))}
    </div>
  );
}

// 📊 2. Product Detail 30-Day Historical Trend SVG Chart Skeleton
export function MarketChartSkeleton() {
  return (
    <div className="w-full min-h-[120px] bg-[#26211C] border border-[rgba(237,232,224,0.08)] rounded-xl p-3 flex flex-col justify-between">
      {/* Chart Top Metadata Bar */}
      <div className="flex justify-between items-center w-full">
        <Skeleton className="h-3.5 bg-[#17130f] w-1/4 rounded" />
        <Skeleton className="h-3 bg-[#17130f] w-20 rounded" />
      </div>

      {/* Simulated SVG Graph Background Grid Lines */}
      <div className="space-y-3 py-2 w-full opacity-40">
        <div className="h-px bg-[#17130f] w-full border-dashed border-b border-[rgba(237,232,224,0.1)]" />
        <div className="h-px bg-[#17130f] w-full border-dashed border-b border-[rgba(237,232,224,0.1)]" />
        <div className="h-px bg-[#17130f] w-full border-dashed border-b border-[rgba(237,232,224,0.1)]" />
      </div>

      {/* Chart Bottom X-Axis Axis Scale */}
      <div className="flex justify-between items-center w-full pt-1">
        <Skeleton className="h-2 bg-[#17130f] w-8 rounded" />
        <Skeleton className="h-2 bg-[#17130f] w-8 rounded" />
        <Skeleton className="h-2 bg-[#17130f] w-8 rounded" />
        <Skeleton className="h-2 bg-[#17130f] w-8 rounded" />
      </div>
    </div>
  );
}

// Product Detail market reference index card skeleton
export function MarketIndexSkeleton() {
  return (
    <div className="bg-[#26211C] p-3 rounded-xl border border-[rgba(237,232,224,0.08)] w-full">
      <Skeleton className="h-2.5 bg-[#17130f] w-48 rounded mb-3" />
      <Skeleton className="h-9 bg-[#17130f] w-36 rounded mb-2" />
      <Skeleton className="h-2.5 bg-[#17130f] w-24 rounded" />
    </div>
  );
}

// 🏛️ 3. Tokyo Market Box Reference Index Skeleton
export function TokyoIndexSkeleton() {
  return (
    <div className="bg-[#26211C] border border-[rgba(237,232,224,0.08)] rounded-xl p-5 space-y-4 w-full">
      {/* Title block stub */}
      <div className="space-y-1.5">
        <Skeleton className="h-4 bg-[#17130f] w-1/3 rounded-md" />
        <Skeleton className="h-2.5 bg-[#17130f] w-1/2 rounded" />
      </div>

      {/* Grid containing market index metrics rows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[#17130f] p-3 rounded-lg border border-white/5 flex items-center justify-between gap-4">
            <div className="space-y-1.5 flex-1 min-w-0">
              <Skeleton className="h-3 bg-[#26211C] w-3/4 rounded" />
              <Skeleton className="h-2.5 bg-[#26211C] w-1/2 rounded" />
            </div>
            <div className="text-right space-y-1.5 shrink-0">
              <Skeleton className="h-4 bg-[#26211C] w-14 rounded" />
              <Skeleton className="h-2.5 bg-[#26211C] w-8 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
