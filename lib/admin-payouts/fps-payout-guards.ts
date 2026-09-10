import type { FpsPayoutRequestStatus } from "@/lib/admin-payouts/types";

export function isFpsPayoutBlockedForComplete(row: {
  status: FpsPayoutRequestStatus;
  fpsId: string;
  fpsName: string | null;
}): boolean {
  if (row.status === "pending") {
    return true;
  }

  const fpsId = row.fpsId.trim();
  if (fpsId === "PENDING_FPS" || fpsId.startsWith("PENDING_FPS")) {
    return true;
  }

  const fpsName = row.fpsName?.trim() ?? "";
  if (fpsName === "PENDING_FPS_NAME") {
    return true;
  }

  return false;
}
