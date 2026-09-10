import type { Tables } from "@/types/supabase";
import { getAuthEscrowStepIndexFromStatus } from "@/app/lib/member-order/auth-escrow";
import { formatTradeGradeLabel } from "@/lib/marketplace/listing-display";
import type { MemberEscrowStatus } from "@/app/lib/member-order/auth-escrow";

export type MemberOrderDbStatus = NonNullable<
  Tables<"member_orders">["status"]
>;

export type P2pTimelineTone = "active" | "success" | "muted";

export type P2pTimelineStep = {
  label: string;
  description: string;
  tone: P2pTimelineTone;
};

const PENDING_STATUSES = new Set<MemberOrderDbStatus>([
  "pending",
  "meetup_arranged",
]);

/**
 * Face-to-face meetup detail UI when the order did not opt into platform authentication.
 */
export function isMeetupOnlyMemberOrder(useAuthentication: boolean): boolean {
  return !useAuthentication;
}

export function getAuthEscrowStepIndex(
  status: MemberOrderDbStatus | null | undefined,
  escrowStatus?: MemberEscrowStatus | null,
): number {
  if (escrowStatus) {
    return getAuthEscrowStepIndexFromStatus(escrowStatus, status);
  }

  if (status === "completed") {
    return 4;
  }

  if (status === "cancelled") {
    return -1;
  }

  if (status === "meetup_arranged") {
    return 1;
  }

  return 0;
}

export const MEMBER_AUTH_SHIPPING_FEE = 30;
export const MEMBER_AUTH_PLATFORM_SUBSIDY = 30;
export { DEFAULT_AUTH_FEE_HKD as MEMBER_AUTH_SERVICE_FEE } from "@/lib/platform/auth-escrow-config";

export function isPendingMemberOrderStatus(
  status: MemberOrderDbStatus | null | undefined,
): boolean {
  return status != null && PENDING_STATUSES.has(status);
}

export function getP2pTimelineStep(
  status: MemberOrderDbStatus | null | undefined,
): P2pTimelineStep {
  switch (status) {
    case "completed":
      return {
        label: "已完成",
        description: "交易已順利結束",
        tone: "success",
      };
    case "cancelled":
      return {
        label: "已取消",
        description: "交易已中止",
        tone: "muted",
      };
    case "meetup_arranged":
    case "pending":
    default:
      return {
        label: "進行中",
        description:
          "買賣雙方約定時間交收，請在面交現場點清錢貨後由買家確認結案",
        tone: "active",
      };
  }
}

export function formatListingGrade(input: {
  gradingCompany: string;
  gradingScore: string | null;
}): string {
  return formatTradeGradeLabel(input.gradingCompany, input.gradingScore);
}

export function formatMemberOrderDateTime(
  createdAt: string | null | undefined,
): string {
  if (!createdAt) {
    return "";
  }

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
