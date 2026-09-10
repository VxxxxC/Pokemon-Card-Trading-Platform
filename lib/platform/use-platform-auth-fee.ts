"use client";

import { useEffect, useState } from "react";

import { getPlatformAuthFeeForDisplay } from "@/app/actions/admin-settings";
import { DEFAULT_AUTH_FEE_HKD } from "@/lib/platform/auth-escrow-config";

export function usePlatformAuthFee(): number {
  const [authFeeHkd, setAuthFeeHkd] = useState(DEFAULT_AUTH_FEE_HKD);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await getPlatformAuthFeeForDisplay();
      if (cancelled || !result.success) {
        return;
      }
      setAuthFeeHkd(result.data.authFeeHkd);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return authFeeHkd;
}
