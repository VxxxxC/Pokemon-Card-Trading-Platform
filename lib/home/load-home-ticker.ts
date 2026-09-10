import { unstable_cache } from "next/cache";
import { HOME_TICKER_CACHE_SECONDS, HOME_TICKER_LIMIT } from "@/lib/home/constants";
import { getHomeTickerFallbackItems } from "@/lib/home/home-ticker-fallback";
import { homePerfLog } from "@/lib/home/perf-log";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createPublicClient } from "@/lib/supabase/public";

export type HomePriceTickerItem = {
  id: string;
  name: string;
  price: number;
  delta: number;
  direction: "up" | "down";
  /** `trade` = completed platform sale; legacy market rows may omit. */
  kind?: "trade" | "market";
};

type HomeTradeTickerRow = {
  trade_id: string;
  card_code: string;
  product_name: string;
  price_hkd: number;
  completed_at: string;
};

type HomeTradeTickerRpcClient = {
  rpc(
    fn: "rpc_list_home_trade_ticker",
    args: { p_limit: number },
  ): Promise<{
    data: HomeTradeTickerRow[] | null;
    error: { message: string } | null;
  }>;
};

export function mapHomeTradeTickerRows(
  rows: HomeTradeTickerRow[],
  limit: number,
): HomePriceTickerItem[] {
  const items: HomePriceTickerItem[] = [];

  for (const row of rows) {
    const price = Number(row.price_hkd);
    if (!Number.isFinite(price) || price <= 0) continue;

    const cardCode = row.card_code?.trim();
    const name = row.product_name?.trim();
    if (!cardCode || !name) continue;

    items.push({
      id: cardCode,
      name,
      price: Math.round(price),
      delta: 0,
      direction: "up",
      kind: "trade",
    });

    if (items.length >= limit) break;
  }

  return items;
}

async function fetchHomeTradeTickerItems(
  limit: number,
): Promise<HomePriceTickerItem[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const startedAt = Date.now();

  try {
    const supabase = createPublicClient() as unknown as HomeTradeTickerRpcClient;
    const { data, error } = await supabase.rpc("rpc_list_home_trade_ticker", {
      p_limit: limit,
    });

    if (error || !data?.length) {
      homePerfLog(`ticker.trades=empty ${Date.now() - startedAt}ms`);
      return [];
    }

    const items = mapHomeTradeTickerRows(data, limit);
    homePerfLog(`ticker.trades=${items.length} ${Date.now() - startedAt}ms`);
    return items;
  } catch (error) {
    console.warn("[loadHomePriceTickerItems]", error);
    return [];
  }
}

const getCachedHomeTradeTickerItems = unstable_cache(
  async (limit: number) => fetchHomeTradeTickerItems(limit),
  ["home-trade-ticker", String(HOME_TICKER_LIMIT)],
  { revalidate: HOME_TICKER_CACHE_SECONDS },
);

export async function loadHomePriceTickerItems(
  limit = HOME_TICKER_LIMIT,
): Promise<HomePriceTickerItem[]> {
  const safeLimit = Math.max(1, Math.min(limit, 24));
  const liveItems = isSupabaseConfigured()
    ? await getCachedHomeTradeTickerItems(safeLimit).catch(() =>
        fetchHomeTradeTickerItems(safeLimit),
      )
    : [];

  if (liveItems.length > 0) {
    return liveItems;
  }

  return getHomeTickerFallbackItems(safeLimit);
}
