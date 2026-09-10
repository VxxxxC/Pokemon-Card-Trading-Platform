import type { Tables } from "@/types/supabase";

export type OrderTimelineStep = {
  id: string;
  label: string;
  description: string;
};

export type MerchantAuthSellerEscrowStatus = NonNullable<
  Tables<"merchant_orders">["escrow_status"]
>;

export const MERCHANT_DIRECT_TIMELINE_STEPS: OrderTimelineStep[] = [
  {
    id: "payment",
    label: "訂單付款",
    description: "買家已完成付款",
  },
  {
    id: "fulfillment",
    label: "待發貨",
    description: "請安排發貨或面交",
  },
  {
    id: "shipped",
    label: "運送中",
    description: "等待買家確認收貨",
  },
  {
    id: "released",
    label: "已完成",
    description: "款項已撥至你的 Stripe Connect 帳戶",
  },
];

export const MERCHANT_DIRECT_BUYER_TIMELINE_STEPS: OrderTimelineStep[] = [
  {
    id: "payment",
    label: "訂單付款",
    description: "你已完成付款",
  },
  {
    id: "fulfillment",
    label: "待發貨",
    description: "等待商戶安排發貨或面交",
  },
  {
    id: "shipped",
    label: "運送中",
    description: "收到商品後請確認收貨",
  },
  {
    id: "released",
    label: "已完成",
    description: "交易已完成",
  },
];

export const MERCHANT_AUTH_SELLER_TIMELINE_STEPS: OrderTimelineStep[] = [
  {
    id: "pending_payment",
    label: "訂單付款",
    description: "等待買家完成付款",
  },
  {
    id: "payment_held",
    label: "待入庫",
    description: "請將卡牌寄往平台倉庫",
  },
  {
    id: "authenticating",
    label: "鑑定中",
    description: "平台正在進行鑑定流程",
  },
  {
    id: "authenticated",
    label: "鑑定完成，待買家確認收貨",
    description: "平台已將卡牌寄出",
  },
  {
    id: "completed",
    label: "已完成",
    description: "交易完成並進入撥款流程",
  },
];

export function getMerchantDirectTimelineSteps(
  shippingMethod?: string | null,
  payoutStatus?: string | null,
  perspective: "seller" | "buyer" = "seller",
): OrderTimelineStep[] {
  const sourceSteps =
    perspective === "buyer"
      ? MERCHANT_DIRECT_BUYER_TIMELINE_STEPS
      : MERCHANT_DIRECT_TIMELINE_STEPS;

  const base =
    shippingMethod === "meetup"
      ? sourceSteps.map((step) =>
          step.id === "fulfillment"
            ? perspective === "buyer"
              ? {
                  ...step,
                  label: "待面交",
                  description:
                    "請與商戶約定面交／自取，現場點清後確認完成",
                }
              : {
                  ...step,
                  label: "待面交",
                  description: "待面交／自取，買家確認後進入保留期",
                }
            : step,
        )
      : [...sourceSteps];

  if (payoutStatus === "held" || payoutStatus === "processing") {
    return [
      base[0],
      base[1],
      {
        id: "buyer_confirmed",
        label: perspective === "buyer" ? "已確認收貨" : "買家已確認",
        description:
          perspective === "buyer"
            ? "你已確認收到商品"
            : "款項保留於平台",
      },
      {
        id: "hold",
        label: "款項保留中",
        description:
          perspective === "buyer"
            ? "平台保留款項作售後保障（T+7）"
            : "T+7 售後期滿後撥至 Connect",
      },
      base[3],
    ];
  }

  return base;
}

export function getMerchantDirectTimelineStepIndex(
  escrowStatus: MerchantAuthSellerEscrowStatus | null,
  payoutStatus?: string | null,
): number {
  const steps = getMerchantDirectTimelineSteps(undefined, payoutStatus, "seller");

  if (escrowStatus === "completed_and_transferred") {
    if (payoutStatus === "paid") {
      return steps.length;
    }
    return payoutStatus === "held" || payoutStatus === "processing" ? 4 : 3;
  }
  if (payoutStatus === "held" || payoutStatus === "processing") {
    return 3;
  }

  switch (escrowStatus) {
    case "pending_payment":
      return 0;
    case "payment_held":
      return 1;
    case "shipped":
      return 2;
    case "refunded":
      return -1;
    default:
      return 0;
  }
}

export function getMerchantDirectBuyerTimelineStepIndex(
  escrowStatus: MerchantAuthSellerEscrowStatus | null,
  payoutStatus?: string | null,
): number {
  const steps = getMerchantDirectTimelineSteps(undefined, payoutStatus, "buyer");

  if (escrowStatus === "refunded") {
    return -1;
  }
  if (escrowStatus === "completed_and_transferred") {
    return steps.length;
  }
  if (payoutStatus === "held" || payoutStatus === "processing") {
    return 3;
  }
  if (escrowStatus === "shipped") {
    return 2;
  }
  if (escrowStatus === "payment_held") {
    return 1;
  }
  if (escrowStatus === "authenticated") {
    return 2;
  }
  return 0;
}

export function getMerchantAuthSellerTimelineSteps(
  payoutStatus?: string | null,
): OrderTimelineStep[] {
  const base = [...MERCHANT_AUTH_SELLER_TIMELINE_STEPS];

  if (payoutStatus === "held" || payoutStatus === "processing") {
    return [
      base[0],
      base[1],
      base[2],
      base[3],
      {
        id: "buyer_confirmed",
        label: "買家已確認",
        description: "款項保留於平台",
      },
      {
        id: "hold",
        label: "款項保留中",
        description: "T+7 售後期滿後撥至 Connect",
      },
      base[4],
    ];
  }

  return base;
}

export function getMerchantAuthSellerTimelineStepIndex(
  escrowStatus: MerchantAuthSellerEscrowStatus | null,
  payoutStatus?: string | null,
): number {
  const steps = getMerchantAuthSellerTimelineSteps(payoutStatus);
  const held = payoutStatus === "held" || payoutStatus === "processing";

  if (escrowStatus === "completed_and_transferred") {
    if (payoutStatus === "paid") {
      return steps.length;
    }
    return held ? 6 : 4;
  }
  if (held) {
    return 5;
  }

  switch (escrowStatus) {
    case "pending_payment":
      return 0;
    case "payment_held":
      return 1;
    case "authenticating":
      return 2;
    case "authenticated":
      return 3;
    case "refunded":
      return -1;
    default:
      return 0;
  }
}
