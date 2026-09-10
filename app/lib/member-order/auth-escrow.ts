import type { Enums } from "@/types/supabase";
import type { MemberOrderDbStatus } from "@/app/lib/member-order/p2p";
import type { EscrowStep } from "@/app/lib/types/rbac";

export type MemberEscrowStatus = Enums<"member_escrow_status">;

export type MemberAuthOrderActions = {
  canPay: boolean;
  canSubmitInbound: boolean;
  canConfirmReceipt: boolean;
  canCancel: boolean;
};

export type MemberAuthEscrowStepIndexOptions = {
  perspective?: "buy" | "sell";
  sellerPayoutStatus?: Enums<"member_seller_payout_status"> | null;
  fpsPayoutRequestStatus?: string | null;
};

const MEMBER_AUTH_ESCROW_STEP_COUNT = 5;

export function isMemberAuthSellerPayoutComplete(
  sellerPayoutStatus?: Enums<"member_seller_payout_status"> | null,
  fpsPayoutRequestStatus?: string | null,
): boolean {
  return (
    sellerPayoutStatus === "paid" || fpsPayoutRequestStatus === "completed"
  );
}

export function getMemberAuthSellerReleasedStepCopy(payoutComplete: boolean): {
  label: string;
  description: string;
} {
  if (payoutComplete) {
    return {
      label: "已撥款",
      description: "款項已透過轉數快撥至你的收款帳戶",
    };
  }

  return {
    label: "訂單完成，即將撥款",
    description: "交易完成，平台將透過轉數快撥款至你的收款帳戶",
  };
}

export function getAuthEscrowStepIndexFromStatus(
  escrowStatus: MemberEscrowStatus | null | undefined,
  orderStatus: MemberOrderDbStatus | null | undefined,
  options: MemberAuthEscrowStepIndexOptions = {},
): number {
  if (orderStatus === "cancelled" || escrowStatus === "cancelled") {
    return -1;
  }

  if (orderStatus === "completed" || escrowStatus === "released") {
    const sellerPayoutComplete = isMemberAuthSellerPayoutComplete(
      options.sellerPayoutStatus,
      options.fpsPayoutRequestStatus,
    );
    const isFullyComplete =
      options.perspective === "buy" || sellerPayoutComplete;
    return isFullyComplete ? MEMBER_AUTH_ESCROW_STEP_COUNT : 4;
  }

  switch (escrowStatus) {
    case "payment":
      return 0;
    case "custody":
      return 1;
    case "grading":
      return 2;
    case "shipped":
      return 3;
    default:
      return 0;
  }
}

export function getMemberAuthOrderActions(input: {
  persona: "buy" | "sell";
  useAuthentication: boolean;
  escrowStatus: MemberEscrowStatus | null | undefined;
  status: MemberOrderDbStatus | null | undefined;
  platformReceivedAt?: string | null;
  paymentCaptureStatus?: string | null;
}): MemberAuthOrderActions {
  const {
    persona,
    useAuthentication,
    escrowStatus,
    status,
    platformReceivedAt,
    paymentCaptureStatus,
  } = input;

  if (!useAuthentication || status !== "pending") {
    return {
      canPay: false,
      canSubmitInbound: false,
      canConfirmReceipt: false,
      canCancel: false,
    };
  }

  const gradingLocked =
    Boolean(platformReceivedAt) ||
    escrowStatus === "grading" ||
    escrowStatus === "shipped" ||
    paymentCaptureStatus === "auth_fee_captured" ||
    paymentCaptureStatus === "fully_captured";

  return {
    canPay: persona === "buy" && escrowStatus === "payment",
    canSubmitInbound: persona === "sell" && escrowStatus === "custody",
    canConfirmReceipt:
      persona === "buy" &&
      escrowStatus === "shipped" &&
      paymentCaptureStatus === "fully_captured",
    canCancel:
      persona === "sell" &&
      !gradingLocked &&
      (escrowStatus === "payment" || escrowStatus === "custody"),
  };
}

export function getAuthEscrowStatusLabel(
  escrowStatus: MemberEscrowStatus | null | undefined,
): string {
  switch (escrowStatus) {
    case "payment":
      return "待付款";
    case "custody":
      return "待寄平台";
    case "grading":
      return "鑑定中";
    case "shipped":
      return "運送中";
    case "released":
      return "已釋放";
    case "cancelled":
      return "已取消";
    default:
      return "進行中";
  }
}

export const MEMBER_AUTH_ESCROW_SELLER_STEPS: EscrowStep[] = [
  {
    id: "payment",
    label: "已付款",
    description: "買家完成卡價與鑑定服務費付款",
  },
  {
    id: "custody",
    label: "保管中",
    description: "請將卡牌寄往平台倉庫",
  },
  {
    id: "grading",
    label: "鑑定中",
    description: "平台正在進行鑑定流程",
  },
  {
    id: "shipped",
    label: "已發貨",
    description: "鑑定完成，已將卡牌寄出。待買家確認收貨",
  },
  {
    id: "released",
    label: "訂單完成，即將撥款",
    description: "交易完成，平台將透過轉數快撥款至你的收款帳戶",
  },
];

export const MEMBER_AUTH_ESCROW_BUYER_STEPS: EscrowStep[] = [
  {
    id: "payment",
    label: "已付款",
    description: "你已完成卡價與鑑定服務費付款",
  },
  {
    id: "custody",
    label: "保管中",
    description: "等待賣家將卡牌寄往平台倉庫",
  },
  {
    id: "grading",
    label: "鑑定中",
    description: "平台正在進行鑑定流程",
  },
  {
    id: "shipped",
    label: "已發貨",
    description: "鑑定完成，已將卡牌寄出。收到後請確認收貨",
  },
  {
    id: "released",
    label: "已完成",
    description: "交易完成",
  },
];

export function getMemberAuthEscrowTimelineSteps(
  perspective: "buy" | "sell",
): EscrowStep[] {
  return perspective === "buy"
    ? MEMBER_AUTH_ESCROW_BUYER_STEPS
    : MEMBER_AUTH_ESCROW_SELLER_STEPS;
}
