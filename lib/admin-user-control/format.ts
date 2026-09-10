import type { PlatformUserKycStatus } from "@/lib/admin-user-control/types";
import { formatHongKongDateTime } from "@/lib/datetime/hong-kong";

export function formatPlatformUserDateTime(
  iso: string | null | undefined,
): string {
  return formatHongKongDateTime(iso);
}

export function formatPlatformUserHandle(
  username: string | null,
  shopHandle: string | null,
): string {
  const handle = shopHandle?.trim() || username?.trim();
  if (!handle) {
    return "—";
  }

  return handle.startsWith("@") ? handle : `@${handle}`;
}

export function formatPlatformUserKycLabel(
  status: PlatformUserKycStatus,
): string {
  if (status === "verified") {
    return "已認證";
  }
  if (status === "pending") {
    return "待審核";
  }
  if (status === "rejected") {
    return "已拒絕";
  }
  return "未申請";
}
