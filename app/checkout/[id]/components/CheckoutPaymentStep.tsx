"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Stripe as StripeJs } from "@stripe/stripe-js";
import { toast } from "sonner";
import { getCheckoutPaymentStatus } from "@/app/actions/checkout";
import { isPaymentIntentAuthorized } from "@/lib/checkout/stripe-client";
import type { CheckoutSession } from "@/lib/checkout/types";
import { Spinner } from "@/components/ui/spinner";

const ESCROW_POLL_INTERVAL_MS = 2000;
const ESCROW_POLL_MAX_ATTEMPTS = 8;

type CheckoutPaymentStepProps = {
  session: CheckoutSession;
  clientSecret: string;
  stripePromise: Promise<StripeJs | null>;
  totalAmount: number;
};

function CheckoutEscrowPaymentForm({
  session,
  totalAmount,
}: {
  session: CheckoutSession;
  totalAmount: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);

  const pollCheckoutPaid = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < ESCROW_POLL_MAX_ATTEMPTS; attempt += 1) {
      const result = await getCheckoutPaymentStatus(session.orderId);
      if (result.success && result.data.isPaid) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, ESCROW_POLL_INTERVAL_MS));
    }
    return false;
  }, [session.orderId]);

  const handleConfirm = async () => {
    if (!stripe || !elements) {
      return;
    }

    setIsConfirming(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/${session.orderId}/success`,
      },
      redirect: "if_required",
    });

    if (error) {
      setIsConfirming(false);
      toast.error("付款未完成", {
        description: error.message ?? "請確認卡片資料後重試。",
      });
      return;
    }

    if (isPaymentIntentAuthorized(paymentIntent?.status)) {
      const settled = await pollCheckoutPaid();
      if (settled) {
        toast.success("付款已送出", {
          description:
            session.orderKind === "member"
              ? "平台已託管款項，請依指引將卡牌寄往平台倉庫。"
              : "資金正在進入平台託管，稍後即可於交易管理查看。",
        });
      } else {
        toast.info("付款處理中", {
          description: "已收到付款指令，正在等待金流確認並鎖定託管。",
        });
      }
      router.push(`/checkout/${session.orderId}/success`);
      return;
    }

    setIsConfirming(false);
    toast.info("付款仍待完成", {
      description: "請依指示完成驗證後再試。",
    });
  };

  return (
    <div className="space-y-3">
      <PaymentElement
        options={{
          layout: "tabs",
          wallets: { applePay: "never", googlePay: "never" },
          defaultValues: {
            billingDetails: {
              address: { country: "HK" },
            },
          },
        }}
      />
      <button
        type="button"
        disabled={isConfirming || !stripe || !elements}
        onClick={() => void handleConfirm()}
        className="w-full h-12 bg-brand text-[#1A1612] font-sans font-bold text-[14px] rounded-xl hover:bg-[#e8b896] active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer focus:outline-none"
      >
        {isConfirming ? (
          <>
            <Spinner className="text-[#1A1612] size-4 animate-spin" />
            <span>正在處理安全金流支付...</span>
          </>
        ) : (
          <span>確認支付 HK$ {totalAmount.toLocaleString()}</span>
        )}
      </button>
    </div>
  );
}

export function CheckoutPaymentStep({
  session,
  clientSecret,
  stripePromise,
  totalAmount,
}: CheckoutPaymentStepProps) {
  return (
    <div className="space-y-3">
      {session.variant === "member_auth" ? (
        <div className="rounded-xl border border-brand/25 bg-brand/10 px-4 py-3 text-[12px] leading-relaxed text-[#eae1da]">
          款項將全額託管於平台帳戶（卡價 + 鑑定服務費），付款後請依指引將卡牌寄往平台倉庫。
        </div>
      ) : null}

      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          locale: "zh-HK",
          appearance: {
            theme: "night",
            labels: "floating",
            variables: {
              colorPrimary: "#D4A574",
              colorBackground: "#1A1612",
              colorText: "#eae1da",
              colorDanger: "#ef4444",
              borderRadius: "12px",
            },
          },
        }}
      >
        <CheckoutEscrowPaymentForm session={session} totalAmount={totalAmount} />
      </Elements>
    </div>
  );
}
