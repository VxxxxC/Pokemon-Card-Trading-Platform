import { createMerchantOrderPaymentIntent } from "@/app/actions/merchant-checkout";
import { createMemberAuthPaymentIntent } from "@/app/actions/member-auth-checkout";
import type {
  CheckoutSession,
  MerchantDirectFormState,
} from "@/lib/checkout/types";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type CheckoutPaymentIntentResult = {
  clientSecret: string;
  publishableKey: string;
  totalAmount: number;
  platformSubsidyAmount?: number;
};

export async function prepareCheckoutPayment(
  session: CheckoutSession,
  form?: MerchantDirectFormState,
  options?: { userRewardId?: string | null },
): Promise<ActionResult<CheckoutPaymentIntentResult>> {
  if (session.variant === "member_auth") {
    const result = await createMemberAuthPaymentIntent(session.orderId, {
      userRewardId: options?.userRewardId,
    });
    if (!result.success) {
      return result;
    }
    return {
      success: true,
      data: {
        clientSecret: result.data.clientSecret,
        publishableKey: result.data.publishableKey,
        totalAmount: result.data.buyerTotalAmount,
        platformSubsidyAmount: result.data.platformSubsidyAmount,
      },
    };
  }

  const useAuth =
    session.variant === "merchant_auth" ||
    Boolean(form?.authServiceEnabled);

  const shippingMethod =
    session.variant === "merchant_direct"
      ? (form?.shippingType ?? session.shippingMethod ?? "sf")
      : "sf";

  const result = await createMerchantOrderPaymentIntent(session.orderId, {
    shippingMethod,
    useAuth,
    userRewardId: options?.userRewardId,
    deliveryDetails: {
      sfAddress: form?.courierDeliveryAddress,
      buyerPhone: form?.buyerPhone,
      meetupDetail: form?.meetupNote,
      buyerRemark: form?.buyerRemark,
    },
  });

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    data: {
      clientSecret: result.data.clientSecret,
      publishableKey: result.data.publishableKey,
      totalAmount: result.data.buyerTotalAmount,
      platformSubsidyAmount: result.data.platformSubsidyAmount,
    },
  };
}
