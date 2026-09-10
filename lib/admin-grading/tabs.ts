export type AdminGradingTab =
  | "awaiting_intake"
  | "grading"
  | "awaiting_outbound"
  | "awaiting_settlement"
  | "closed";

export const ADMIN_GRADING_TABS: AdminGradingTab[] = [
  "awaiting_intake",
  "grading",
  "awaiting_outbound",
  "awaiting_settlement",
  "closed",
];

type GradingTabInferRow = {
  order_kind: "member" | "merchant";
  escrow_status: string;
  inbound_tracking_no: string | null;
  auth_result: string | null;
  fault_party: string | null;
  seller_settlement_status: string | null;
  outbound_tracking_no: string | null;
  recovery_remaining_hkd: number | null;
};

export function isAdminGradingTab(
  value: string | undefined,
): value is AdminGradingTab {
  return ADMIN_GRADING_TABS.includes(value as AdminGradingTab);
}

export function inferAdminGradingTab(row: GradingTabInferRow): AdminGradingTab {
  if (row.order_kind === "member") {
    if (row.escrow_status === "custody" && row.inbound_tracking_no) {
      return "awaiting_intake";
    }
    if (row.escrow_status === "grading") {
      return "grading";
    }
    if (row.escrow_status === "shipped" && row.auth_result === "passed") {
      return "awaiting_outbound";
    }
  } else {
    if (row.escrow_status === "payment_held" && row.inbound_tracking_no) {
      return "awaiting_intake";
    }
    if (row.escrow_status === "authenticating") {
      return "grading";
    }
    if (row.escrow_status === "authenticated" && row.auth_result === "passed") {
      return "awaiting_outbound";
    }
  }

  if (row.auth_result === "failed" && row.fault_party === "seller") {
    if (
      row.seller_settlement_status === "pending" ||
      (row.seller_settlement_status === "cleared" &&
        !row.outbound_tracking_no?.trim()) ||
      (row.order_kind === "merchant" &&
        row.seller_settlement_status === "cleared" &&
        Number(row.recovery_remaining_hkd ?? 0) > 0)
    ) {
      return "awaiting_settlement";
    }
  }

  return "closed";
}
