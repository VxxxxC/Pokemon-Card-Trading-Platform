import type { MerchantTransferRow } from "@/lib/admin-payouts/types";

export function getMerchantTransferRowId(row: MerchantTransferRow): string {
  return row.orderId;
}
