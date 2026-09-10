import type {
  FpsPayoutRequestStatus,
  MerchantTransferPayoutStatus,
} from "@/lib/admin-payouts/types";
import { formatHongKongDateTime } from "@/lib/datetime/hong-kong";

export function formatAdminHkd(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) {
    return "HK$ 0";
  }
  return `HK$ ${value.toLocaleString("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatAdminDateTime(iso: string | null | undefined): string {
  return formatHongKongDateTime(iso);
}

export function formatStripeSyncLabel(iso: string): string {
  return formatAdminDateTime(iso).replace(" ", " ");
}

export function formatCommissionRate(
  rate: number | null | undefined,
): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) {
    return "—";
  }
  return `${(rate * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

export function formatOrderAuthType(requiresAuthentication: boolean): string {
  return requiresAuthentication ? "鑑定" : "非鑑定";
}

const PAYOUT_STATUS_LABELS: Record<MerchantTransferPayoutStatus, string> = {
  pending: "待撥款",
  held: "款項保留中（T+7）",
  processing: "處理中",
  paid: "已成功",
  failed: "已失敗",
  frozen: "撥款凍結",
};

const PAYOUT_STATUS_BADGE_CLASSES: Record<MerchantTransferPayoutStatus, string> =
  {
    pending: "text-brand bg-[rgba(212,165,116,0.12)] border-brand/20",
    held: "text-brand bg-[rgba(212,165,116,0.12)] border-brand/20",
    processing: "text-brand bg-[rgba(212,165,116,0.12)] border-brand/20",
    paid: "text-success bg-[rgba(16,185,129,0.12)] border-success/20",
    failed: "text-warning bg-[rgba(239,68,68,0.10)] border-warning/20",
    frozen: "text-warning bg-[rgba(239,68,68,0.10)] border-warning/20",
  };

export function formatPayoutStatusLabel(
  status: MerchantTransferPayoutStatus,
): string {
  return PAYOUT_STATUS_LABELS[status] ?? status;
}

export function getPayoutStatusBadgeClass(
  status: MerchantTransferPayoutStatus,
): string {
  return PAYOUT_STATUS_BADGE_CLASSES[status] ?? PAYOUT_STATUS_BADGE_CLASSES.pending;
}

const FPS_PAYOUT_STATUS_LABELS: Record<FpsPayoutRequestStatus, string> = {
  pending: "待處理",
  ready: "待撥款",
  processing: "處理中",
  completed: "已完成",
  failed: "已駁回",
};

const FPS_PAYOUT_STATUS_BADGE_CLASSES: Record<FpsPayoutRequestStatus, string> =
  {
    pending: "text-warning bg-[rgba(239,68,68,0.10)] border-warning/20",
    ready: "text-warning bg-[rgba(239,68,68,0.10)] border-warning/20",
    processing: "text-brand bg-[rgba(212,165,116,0.12)] border-brand/20",
    completed: "text-success bg-[rgba(16,185,129,0.12)] border-success/20",
    failed: "text-warning bg-[rgba(239,68,68,0.10)] border-warning/20",
  };

export function formatFpsPayoutStatusLabel(
  status: FpsPayoutRequestStatus,
): string {
  return FPS_PAYOUT_STATUS_LABELS[status] ?? status;
}

export function getFpsPayoutStatusBadgeClass(
  status: FpsPayoutRequestStatus,
): string {
  return (
    FPS_PAYOUT_STATUS_BADGE_CLASSES[status] ??
    FPS_PAYOUT_STATUS_BADGE_CLASSES.pending
  );
}

export function isFpsPayoutIncomplete(
  status: FpsPayoutRequestStatus,
): boolean {
  return status === "pending" || status === "ready" || status === "processing";
}
