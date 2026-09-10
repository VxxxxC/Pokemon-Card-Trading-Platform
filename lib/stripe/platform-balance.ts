import type Stripe from "stripe";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe/env";

export type PlatformStripeBalance = {
  available: number;
  pending: number;
  currency: "HKD";
  lastSyncedAt: string;
};

export type PlatformStripeBalanceResult =
  | { ok: true; data: PlatformStripeBalance }
  | { ok: false; error: string };

const PREFERRED_CURRENCY = "hkd";

function pickBalanceAmount(
  entries: Stripe.Balance["available"] | Stripe.Balance["pending"],
): number {
  const hkdEntry = entries.find(
    (entry) => entry.currency.toLowerCase() === PREFERRED_CURRENCY,
  );
  const entry = hkdEntry ?? entries[0];
  if (!entry) {
    return 0;
  }

  return entry.amount / 100;
}

export async function getPlatformStripeBalance(): Promise<PlatformStripeBalanceResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe 未設定" };
  }

  try {
    const stripe = await getStripeClient();
    if (!stripe) {
      return { ok: false, error: "Stripe 未設定" };
    }

    const balance = await stripe.balance.retrieve();

    return {
      ok: true,
      data: {
        available: pickBalanceAmount(balance.available),
        pending: pickBalanceAmount(balance.pending),
        currency: "HKD",
        lastSyncedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("[getPlatformStripeBalance]", error);
    return { ok: false, error: "無法讀取 Stripe 餘額" };
  }
}
