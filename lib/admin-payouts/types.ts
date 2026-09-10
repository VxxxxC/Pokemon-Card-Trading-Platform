export type AdminPayoutsStripeBalance = {
  available: number;
  pending: number;
  todayIn: number;
  currency: "HKD";
  lastSyncedAt: string;
};

export type MerchantTransferPayoutStatus =
  | "pending"
  | "held"
  | "processing"
  | "paid"
  | "failed"
  | "frozen";

export type MerchantTransferStatusFilter =
  | "all"
  | "paid"
  | "failed"
  | "processing"
  | "pending"
  | "held"
  | "frozen";

export type MerchantTransferSort =
  | "transferred_at-desc"
  | "transferred_at-asc"
  | "merchantName-asc"
  | "merchantName-desc";

export type MerchantTransferStatusCounts = {
  all: number;
  paid: number;
  processing: number;
  pending: number;
  failed: number;
  held: number;
  frozen: number;
};

export const EMPTY_MERCHANT_TRANSFER_STATUS_COUNTS: MerchantTransferStatusCounts =
  {
    all: 0,
    paid: 0,
    processing: 0,
    pending: 0,
    failed: 0,
    held: 0,
    frozen: 0,
  };

/** Tab badge: exclude successfully processed (paid) transfers. */
export function getMerchantTransferPendingCount(
  counts: MerchantTransferStatusCounts,
): number {
  return Math.max(0, counts.all - counts.paid);
}

export type MerchantTransferRow = {
  orderId: string;
  orderNumber: string;
  merchantId: string;
  stripeTransferId: string;
  merchantName: string;
  subAccountId: string;
  requiresAuthentication: boolean;
  itemSubtotal: number;
  commissionRateApplied: number | null;
  platformCommission: number;
  authFee: number;
  merchantPayoutAmount: number;
  payoutStatus: MerchantTransferPayoutStatus;
  payoutError: string | null;
  reconciliationWarning?: string;
  buyerConfirmedAt: string | null;
  buyerConfirmedAtIso: string | null;
  payoutHoldUntil: string | null;
  payoutHoldUntilIso: string | null;
  stripePaymentIntentId: string | null;
  transferredAt: string;
  transferredAtIso: string | null;
  /** @deprecated use transferredAt */
  createdAt: string;
};

export type MerchantTransferPage = {
  rows: MerchantTransferRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: MerchantTransferStatusCounts;
};

export type ListAdminMerchantTransfersInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  statusFilter?: MerchantTransferStatusFilter;
  sort?: MerchantTransferSort;
  dateFrom?: string;
  dateTo?: string;
};

export type ListAdminMerchantTransfersResult =
  | { success: true; data: MerchantTransferPage }
  | { success: false; error: string };

export type AdminPayoutsPageData = {
  stripeBalance: AdminPayoutsStripeBalance | null;
  stripeBalanceError?: string;
};

export type AdminPayoutsPageResult =
  | { success: true; data: AdminPayoutsPageData }
  | { success: false; error: string };

export type FpsBatchScheduleInfo = {
  batchWeekday: number;
  batchWeekdayLabel: string;
  nextBatchDateLabel: string;
  cutoffLabel: string;
};

export const MERCHANT_TRANSFERS_PAGE_SIZE = 10;
export const MERCHANT_TRANSFERS_MAX_PAGE_SIZE = 50;
export const MERCHANT_TRANSFERS_EXPORT_CAP = 2000;
export const MERCHANT_NAME_SORT_FETCH_CAP = 5000;

export type FpsPayoutRequestStatus =
  | "pending"
  | "ready"
  | "processing"
  | "completed"
  | "failed";

export type FpsPayoutStatusFilter =
  | "all"
  | "incomplete"
  | "completed"
  | "failed";

export type FpsPayoutSort =
  | "submittedAt-desc"
  | "submittedAt-asc"
  | "userName-asc"
  | "userName-desc";

export type FpsPayoutStatusCounts = {
  all: number;
  incomplete: number;
  completed: number;
  failed: number;
};

export const EMPTY_FPS_PAYOUT_STATUS_COUNTS: FpsPayoutStatusCounts = {
  all: 0,
  incomplete: 0,
  completed: 0,
  failed: 0,
};

export type FpsPayoutRow = {
  requestId: string;
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  amount: number;
  grossPayoutHkd: number;
  fpsTransferFeeHkd: number;
  fpsId: string;
  fpsName: string | null;
  status: FpsPayoutRequestStatus;
  submittedAt: string;
  submittedAtIso: string | null;
  adminFpsReference: string | null;
  paidAt: string | null;
};

export type FpsPayoutPage = {
  rows: FpsPayoutRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: FpsPayoutStatusCounts;
};

export type ListAdminPayoutRequestsInput = {
  page?: number;
  pageSize?: number;
  /** Server export path may raise page size cap (admin UI list should omit). */
  maxPageSize?: number;
  search?: string;
  statusFilter?: FpsPayoutStatusFilter;
  sort?: FpsPayoutSort;
  dateFrom?: string;
  dateTo?: string;
};

export type ListAdminPayoutRequestsResult =
  | { success: true; data: FpsPayoutPage }
  | { success: false; error: string };

export type FpsPayoutExportPayload = {
  rows: FpsPayoutRow[];
  totalMatching: number;
  exportedCount: number;
  exportCap: number;
  capped: boolean;
};

export type ListAdminPayoutRequestsExportResult =
  | { success: true; data: FpsPayoutExportPayload }
  | { success: false; error: string };

export const FPS_PAYOUT_REQUESTS_PAGE_SIZE = 10;
export const FPS_PAYOUT_REQUESTS_MAX_PAGE_SIZE = 50;
export const FPS_EXPORT_CAP = 2000;
export const FPS_EXPORT_CHUNK_SIZE = 200;
export const FPS_SELLER_NAME_SORT_FETCH_CAP = 5000;

export const FPS_INCOMPLETE_STATUSES: FpsPayoutRequestStatus[] = [
  "pending",
  "ready",
  "processing",
];
