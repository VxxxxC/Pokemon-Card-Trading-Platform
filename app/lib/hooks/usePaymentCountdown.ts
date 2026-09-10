"use client";

import { useSyncExternalStore } from "react";
import {
  formatPaymentCountdown,
  getMerchantPaymentCountdownMs,
  isMerchantPaymentExpiringSoon,
} from "@/lib/merchant-checkout/pending-payment-expiry";

function subscribeToPaymentCountdown(onStoreChange: () => void) {
  const intervalId = window.setInterval(onStoreChange, 1000);
  return () => window.clearInterval(intervalId);
}

export function usePaymentCountdown(expiresAt: string | null | undefined) {
  const countdownLabel = useSyncExternalStore(
    subscribeToPaymentCountdown,
    () => (expiresAt ? formatPaymentCountdown(expiresAt) : ""),
    () => (expiresAt ? formatPaymentCountdown(expiresAt) : ""),
  );

  const isExpired = useSyncExternalStore(
    subscribeToPaymentCountdown,
    () => (expiresAt ? getMerchantPaymentCountdownMs(expiresAt) <= 0 : false),
    () => (expiresAt ? getMerchantPaymentCountdownMs(expiresAt) <= 0 : false),
  );

  const isExpiringSoon = useSyncExternalStore(
    subscribeToPaymentCountdown,
    () => (expiresAt ? isMerchantPaymentExpiringSoon(expiresAt) : false),
    () => (expiresAt ? isMerchantPaymentExpiringSoon(expiresAt) : false),
  );

  return { countdownLabel, isExpired, isExpiringSoon };
}
