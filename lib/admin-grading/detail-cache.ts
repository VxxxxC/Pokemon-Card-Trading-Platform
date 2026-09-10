import type { AdminGradingQueueRow } from "@/app/actions/admin-grading";

function detailRowKey(orderKind: string, orderId: string): string {
  return `admin-grading-detail:${orderKind}:${orderId}`;
}

export function stashAdminGradingDetailRow(row: AdminGradingQueueRow): void {
  try {
    sessionStorage.setItem(
      detailRowKey(row.order_kind, row.order_id),
      JSON.stringify(row),
    );
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function readStashedAdminGradingDetailRow(
  orderKind: string,
  orderId: string,
): AdminGradingQueueRow | null {
  try {
    const raw = sessionStorage.getItem(detailRowKey(orderKind, orderId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as AdminGradingQueueRow;
  } catch {
    return null;
  }
}
