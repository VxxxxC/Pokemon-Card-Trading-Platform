"use client";

import type { HomePriceTickerItem } from "@/lib/home/load-home-ticker";

interface PriceTickerProps {
  data?: HomePriceTickerItem[];
}

export function PriceTicker({ data = [] }: PriceTickerProps) {
  const records = data.length > 0 ? data : [];
  if (records.length === 0) {
    return null;
  }

  const items = [...records, ...records];

  return (
    <div
      className="w-full bg-bg-shell overflow-hidden h-9 flex items-center shrink-0 border-b border-[rgba(237,232,224,0.08)]"
      aria-label="最新平台成交"
      aria-live="off"
    >
      <div className="flex animate-ticker whitespace-nowrap">
        {items.map((item, i) => (
          <span
            key={`${item.id}-${i}`}
            className="inline-flex items-center gap-2 px-6 font-mono text-[12px] shrink-0"
          >
            <span className="text-text-disabled">{item.id}</span>
            <span className="text-text-primary font-medium">{item.name}</span>
            <span className="text-text-primary font-medium">
              HK$ {item.price.toLocaleString("zh-TW")}
            </span>
            {item.kind === "trade" || item.delta === 0 ? (
              <span className="text-success">成交</span>
            ) : (
              <span
                className={
                  item.direction === "up" ? "text-success" : "text-warning"
                }
              >
                {item.direction === "up" ? "▲" : "▼"} HK${" "}
                {item.delta.toLocaleString("zh-TW")}
              </span>
            )}
            <span className="text-text-disabled ml-1" aria-hidden="true">
              ·
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
