"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { toast } from "sonner";
import {
  createMemberAuthPaymentIntent,
  getMemberAuthPaymentStatus,
} from "@/app/actions/member-auth-checkout";
import { MemberAuthOrderInvoice } from "@/app/components/user/MemberAuthOrderInvoice";
import { Spinner } from "@/components/ui/spinner";

type MemberAuthStripePaymentPanelProps = {
  orderId: string;
  finalPrice: number;
  paymentAmount: number;
  disabled?: boolean;
  onSuccess: () => void;
};

const stripePromiseCache = new Map<string, Promise<StripeJs | null>>();

function getStripePromise(publishableKey: string): Promise<StripeJs | null> {
  const cached = stripePromiseCache.get(publishableKey);
  if (cached) {
    return cached;
  }
  const promise = loadStripe(publishableKey);
  stripePromiseCache.set(publishableKey, promise);
  return promise;
}

function isMemberAuthPaymentIntentAuthorized(
  status: string | undefined,
): boolean {
  return (
    status === "succeeded" ||
    status === "processing" ||
    status === "requires_capture"
  );
}

function MemberAuthEscrowPaymentForm({
  orderId,
  totalAmount,
  onSuccess,
}: {
  orderId: string;
  totalAmount: number;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isConfirming, setIsConfirming] = useState(false);

  const pollPaymentStatus = useCallback(async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const result = await getMemberAuthPaymentStatus(orderId);
      if (
        result.success &&
        result.data.escrowStatus === "custody" &&
        result.data.paymentConfirmedAt
      ) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return false;
  }, [orderId]);

  const handleConfirm = async () => {
    if (!stripe || !elements) {
      return;
    }

    setIsConfirming(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/profile/user/orderDetail/${orderId}`,
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

    if (isMemberAuthPaymentIntentAuthorized(paymentIntent?.status)) {
      const settled = await pollPaymentStatus();
      setIsConfirming(false);
      if (settled) {
        toast.success("付款成功，平台已託管款項");
        onSuccess();
      } else {
        toast.info("付款處理中", {
          description: "款項正在入帳，請稍後重新整理頁面。",
        });
        onSuccess();
      }
      return;
    }

    setIsConfirming(false);
    toast.info("付款仍待完成", {
      description: "請依指示完成驗證後再試。",
    });
  };

  return (
    <div className="space-y-3">
      <PaymentElement options={{ layout: "tabs" }} />
      <button
        type="button"
        disabled={isConfirming || !stripe || !elements}
        onClick={() => void handleConfirm()}
        className="w-full h-11 bg-brand text-[#1A1612] font-sans font-black text-[13px] rounded-xl hover:bg-[#e8b896] active:scale-[0.98] transition-all disabled:opacity-60"
      >
        {isConfirming ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Spinner className="size-4" />
            正在處理安全金流支付…
          </span>
        ) : (
          `確認支付 HK$ ${totalAmount.toLocaleString("zh-TW")}`
        )}
      </button>
    </div>
  );
}

export function MemberAuthStripePaymentPanel({
  orderId,
  finalPrice,
  paymentAmount,
  disabled = false,
  onSuccess,
}: MemberAuthStripePaymentPanelProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function initPayment() {
      setIsLoading(true);
      setLoadError(null);

      const result = await createMemberAuthPaymentIntent(orderId);
      if (cancelled) {
        return;
      }

      if (!result.success) {
        setLoadError(result.error);
        setIsLoading(false);
        return;
      }

      setClientSecret(result.data.clientSecret);
      setPublishableKey(result.data.publishableKey);
      setIsLoading(false);
    }

    void initPayment();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const stripePromise = useMemo(
    () => (publishableKey ? getStripePromise(publishableKey) : null),
    [publishableKey],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#17130f] px-4 py-8 text-[12px] text-text-disabled">
        <Spinner className="size-4 text-brand" />
        載入付款表單中…
      </div>
    );
  }

  if (loadError || !clientSecret || !stripePromise) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-[12px] text-error">
        {loadError ?? "無法載入付款服務"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand/25 bg-brand/10 px-4 py-3 text-[12px] leading-relaxed text-[#eae1da]">
        款項將全額託管於平台帳戶（卡價 + 鑑定服務費），付款後請依指引將卡牌寄往平台倉庫。
      </div>

      <MemberAuthOrderInvoice finalPrice={finalPrice} isSeller={false} />

      <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: { theme: "night", labels: "floating" },
          }}
        >
          <MemberAuthEscrowPaymentForm
            orderId={orderId}
            totalAmount={paymentAmount}
            onSuccess={onSuccess}
          />
        </Elements>
      </div>
    </div>
  );
}
