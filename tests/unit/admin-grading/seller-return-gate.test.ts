import { describe, expect, it } from "vitest";

import type { AdminGradingQueueRow } from "@/app/actions/admin-grading";
import {
  canAdminSubmitSellerReturn,
  isGradingSettlementStepComplete,
  merchantRecoveryBlocksReturn,
} from "@/app/admin/grading/admin-grading-workbench-ui";

function merchantRow(
  overrides: Partial<AdminGradingQueueRow> = {},
): AdminGradingQueueRow {
  return {
    order_kind: "merchant",
    order_id: "order-1",
    order_number: "ORD-TEST",
    auth_result: "failed",
    fault_party: "seller",
    seller_settlement_status: "cleared",
    recovery_total_hkd: 19098,
    recovery_applied_hkd: 0,
    recovery_remaining_hkd: 19098,
    escrow_status: "refunded",
    outbound_tracking_no: null,
    ...overrides,
  } as AdminGradingQueueRow;
}

describe("merchant seller return gate", () => {
  it("blocks return while recovery remains outstanding", () => {
    const row = merchantRow();
    expect(merchantRecoveryBlocksReturn(row)).toBe(true);
    expect(canAdminSubmitSellerReturn(row)).toBe(false);
    expect(isGradingSettlementStepComplete(row)).toBe(false);
  });

  it("allows return after recovery is fully applied", () => {
    const row = merchantRow({
      recovery_applied_hkd: 19098,
      recovery_remaining_hkd: 0,
    });
    expect(merchantRecoveryBlocksReturn(row)).toBe(false);
    expect(canAdminSubmitSellerReturn(row)).toBe(true);
    expect(isGradingSettlementStepComplete(row)).toBe(true);
  });
});
