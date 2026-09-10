import type { HomePriceTickerItem } from "@/lib/home/load-home-ticker";

/** Demo marquee rows when the platform has no completed trades yet (no P-B02 Charizard set). */
const HOME_TICKER_FALLBACK_SOURCE: HomePriceTickerItem[] = [
  {
    id: "sv6a-109",
    name: "月亮伊布 ex SAR",
    price: 1900,
    delta: 0,
    direction: "up",
    kind: "trade",
  },
  {
    id: "sv2a-215",
    name: "皮卡丘 AR",
    price: 425,
    delta: 0,
    direction: "up",
    kind: "trade",
  },
  {
    id: "sv4a-331",
    name: "夢幻 ex SAR",
    price: 1680,
    delta: 0,
    direction: "up",
    kind: "trade",
  },
  {
    id: "sv8a-222",
    name: "奇樹 SAR",
    price: 980,
    delta: 0,
    direction: "up",
    kind: "trade",
  },
  {
    id: "sv7a-131",
    name: "沙奈朵 ex SAR",
    price: 720,
    delta: 0,
    direction: "up",
    kind: "trade",
  },
  {
    id: "sv5a-086",
    name: "密勒頓 ex SAR",
    price: 540,
    delta: 0,
    direction: "up",
    kind: "trade",
  },
];

export function getHomeTickerFallbackItems(
  limit = 8,
): HomePriceTickerItem[] {
  const safeLimit = Math.max(1, Math.min(limit, HOME_TICKER_FALLBACK_SOURCE.length));
  return HOME_TICKER_FALLBACK_SOURCE.slice(0, safeLimit);
}
