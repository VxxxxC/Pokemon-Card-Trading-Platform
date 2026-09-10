import type { AdminDashboardSystemService } from "@/lib/admin-dashboard/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformStripeBalance } from "@/lib/stripe/platform-balance";
import { isStripeConfigured } from "@/lib/stripe/env";

function measureLatency<T>(fn: () => Promise<T>): Promise<{ result: T; latency: number }> {
  const start = performance.now();
  return fn().then((result) => ({
    result,
    latency: Math.round(performance.now() - start),
  }));
}

async function probeSupabase(): Promise<AdminDashboardSystemService> {
  const base: Omit<AdminDashboardSystemService, "status" | "latency"> = {
    id: "supabase",
    name: "後台服務器",
    subName: "資料庫與認證引擎",
  };

  try {
    const { latency, result } = await measureLatency(async () => {
      const admin = createAdminClient();
      return admin
        .from("profiles")
        .select("id", { count: "exact", head: true });
    });

    if (result.error) {
      return { ...base, status: "offline", latency };
    }

    return { ...base, status: "online", latency };
  } catch {
    return { ...base, status: "offline", latency: 0 };
  }
}

async function probeStripe(): Promise<AdminDashboardSystemService> {
  const base: Omit<AdminDashboardSystemService, "status" | "latency"> = {
    id: "stripe",
    name: "支付託管",
    subName: "託管與撥款通道",
  };

  if (!isStripeConfigured()) {
    return { ...base, status: "degraded", latency: 0 };
  }

  try {
    const { latency, result } = await measureLatency(() =>
      getPlatformStripeBalance(),
    );

    if (result.ok) {
      return { ...base, status: "online", latency };
    }

    return { ...base, status: "offline", latency };
  } catch {
    return { ...base, status: "offline", latency: 0 };
  }
}

const CRAWLER_FRESHNESS_MS = 48 * 60 * 60 * 1000;

async function probeCrawler(): Promise<AdminDashboardSystemService> {
  const base: Omit<AdminDashboardSystemService, "status" | "latency"> = {
    id: "crawler",
    name: "爬蟲引擎",
    subName: "行情即時匯集",
  };

  try {
    const { latency, result } = await measureLatency(async () => {
      const admin = createAdminClient();
      return admin
        .from("product_grading_market_prices")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    });

    if (result.error) {
      return { ...base, status: "offline", latency };
    }

    const updatedAt = result.data?.updated_at;
    if (!updatedAt) {
      return { ...base, status: "degraded", latency };
    }

    const ageMs = Date.now() - Date.parse(updatedAt);
    if (Number.isNaN(ageMs)) {
      return { ...base, status: "degraded", latency };
    }

    return {
      ...base,
      status: ageMs <= CRAWLER_FRESHNESS_MS ? "online" : "degraded",
      latency,
    };
  } catch {
    return { ...base, status: "offline", latency: 0 };
  }
}

export async function runAdminDashboardHealthProbes(): Promise<
  AdminDashboardSystemService[]
> {
  const [supabase, stripe] = await Promise.all([
    probeSupabase(),
    probeStripe(),
  ]);

  const crawler = await probeCrawler();

  return [supabase, crawler, stripe];
}
