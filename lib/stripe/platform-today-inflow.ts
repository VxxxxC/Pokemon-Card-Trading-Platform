import type Stripe from "stripe";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe/env";

const HKT_TIME_ZONE = "Asia/Hong_Kong";
const PREFERRED_CURRENCY = "hkd";

export type PlatformStripeTodayInflowResult =
  | { ok: true; todayIn: number }
  | { ok: false; error: string; todayIn: 0 };

function getHktStartOfDayUnix(now = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: HKT_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return Math.floor(Date.UTC(year, month - 1, day, -8, 0, 0, 0) / 1000);
}

function sumPositiveHkdNet(
  transactions: Stripe.BalanceTransaction[],
): number {
  return transactions.reduce((total, tx) => {
    if (tx.currency.toLowerCase() !== PREFERRED_CURRENCY) {
      return total;
    }
    if (tx.net <= 0) {
      return total;
    }
    return total + tx.net / 100;
  }, 0);
}

export async function getPlatformStripeTodayInflow(): Promise<PlatformStripeTodayInflowResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe 未設定", todayIn: 0 };
  }

  try {
    const stripe = await getStripeClient();
    if (!stripe) {
      return { ok: false, error: "Stripe 未設定", todayIn: 0 };
    }

    const createdGte = getHktStartOfDayUnix();
    let startingAfter: string | undefined;
    let todayIn = 0;

    for (let page = 0; page < 20; page += 1) {
      const response = await stripe.balanceTransactions.list({
        limit: 100,
        created: { gte: createdGte },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      todayIn += sumPositiveHkdNet(response.data);

      if (!response.has_more || response.data.length === 0) {
        break;
      }

      startingAfter = response.data[response.data.length - 1]?.id;
      if (!startingAfter) {
        break;
      }
    }

    return { ok: true, todayIn };
  } catch (error) {
    console.error("[getPlatformStripeTodayInflow]", error);
    return { ok: false, error: "無法讀取今日入賬", todayIn: 0 };
  }
}
