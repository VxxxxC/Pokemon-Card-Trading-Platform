import { getPlatformAuthFeeForDisplay } from "@/app/actions/admin-settings";
import { DEFAULT_AUTH_FEE_HKD } from "@/lib/platform/auth-escrow-config";

export async function fetchPlatformAuthFeeHkd(): Promise<number> {
  const result = await getPlatformAuthFeeForDisplay();
  if (!result.success) {
    return DEFAULT_AUTH_FEE_HKD;
  }
  return result.data.authFeeHkd;
}

export function resolveAuthFeeFromRow(
  authFeeFromRow: number,
  requiresAuth: boolean,
  platformAuthFeeHkd: number,
): number {
  if (!requiresAuth) {
    return 0;
  }
  if (authFeeFromRow > 0) {
    return authFeeFromRow;
  }
  return platformAuthFeeHkd;
}
