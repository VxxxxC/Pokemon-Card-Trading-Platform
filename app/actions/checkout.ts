"use server";

import {
  getMerchantCheckoutPaymentStatus,
  loadMerchantCheckoutOrder,
} from "@/app/actions/merchant-checkout";
import {
  getMemberAuthPaymentStatus,
  loadMemberAuthCheckoutOrder,
} from "@/app/actions/member-auth-checkout";
import { mapMemberCheckoutToSession } from "@/lib/checkout/map-member-session";
import { mapMerchantCheckoutToSession } from "@/lib/checkout/map-merchant-session";
import type {
  CheckoutPaymentStatus,
  CheckoutSession,
} from "@/lib/checkout/types";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/** 統一結帳頁載入：商戶訂單優先，其次為會員鑑定託管訂單。 */
export async function loadCheckoutSession(
  orderIdOrNumber: string,
): Promise<ActionResult<CheckoutSession>> {
  const merchantResult = await loadMerchantCheckoutOrder(orderIdOrNumber);
  if (merchantResult.success) {
    return {
      success: true,
      data: mapMerchantCheckoutToSession(merchantResult.data),
    };
  }

  const memberResult = await loadMemberAuthCheckoutOrder(orderIdOrNumber);
  if (!memberResult.success) {
    return { success: false, error: memberResult.error };
  }

  if (!memberResult.data.useAuthentication) {
    return { success: false, error: "此訂單不支援線上結帳付款" };
  }

  return {
    success: true,
    data: mapMemberCheckoutToSession(memberResult.data),
  };
}

/** 付款成功頁輪詢：依訂單種類分支判斷是否已完成付款。 */
export async function getCheckoutPaymentStatus(
  orderIdOrNumber: string,
): Promise<ActionResult<CheckoutPaymentStatus>> {
  const merchantResult = await getMerchantCheckoutPaymentStatus(orderIdOrNumber);
  if (merchantResult.success) {
    return {
      success: true,
      data: {
        orderId: merchantResult.data.orderId,
        orderKind: "merchant",
        isPaid: merchantResult.data.escrowStatus !== "pending_payment",
        isProcessing: merchantResult.data.escrowStatus === "pending_payment",
        orderNumber: merchantResult.data.orderNumber,
        totalAmount: merchantResult.data.totalAmount,
      },
    };
  }

  const memberResult = await getMemberAuthPaymentStatus(orderIdOrNumber);
  if (!memberResult.success) {
    return memberResult;
  }

  const isPaid =
    memberResult.data.escrowStatus === "custody" &&
    memberResult.data.paymentConfirmedAt != null;

  return {
    success: true,
    data: {
      orderId: memberResult.data.orderId,
      orderKind: "member",
      isPaid,
      isProcessing:
        memberResult.data.escrowStatus === "payment" &&
        memberResult.data.paymentConfirmedAt == null,
      orderNumber: memberResult.data.orderNumber,
      totalAmount: memberResult.data.totalAmount,
    },
  };
}
