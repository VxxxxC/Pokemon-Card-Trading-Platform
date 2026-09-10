"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { IoChevronBack } from "react-icons/io5";
import { toast } from "sonner";
import { loadCheckoutSession } from "@/app/actions/checkout";
import { listCheckoutEligibleCoupons } from "@/app/actions/checkout-coupons";
import { CheckoutOrderSummary } from "@/app/checkout/[id]/components/CheckoutOrderSummary";
import { CheckoutPaymentStep } from "@/app/checkout/[id]/components/CheckoutPaymentStep";
import { CheckoutWizardStepper } from "@/app/checkout/[id]/components/CheckoutWizardStepper";
import { CheckoutReviewStep } from "@/app/checkout/[id]/components/steps/CheckoutReviewStep";
import { usePaymentCountdown } from "@/app/lib/hooks/usePaymentCountdown";
import { resolveCheckoutDisplayPricing } from "@/lib/checkout/compute-pricing";
import { prepareCheckoutPayment } from "@/lib/checkout/prepare-payment";
import { getStripePromise } from "@/lib/checkout/stripe-client";
import type {
  CheckoutSession,
  MerchantDirectFormState,
} from "@/lib/checkout/types";
import { CHECKOUT_VARIANT_CONFIG } from "@/lib/checkout/variant-config";
import { validateMerchantDirectForm } from "@/lib/checkout/validate-merchant-direct";
import { Spinner } from "@/components/ui/spinner";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

const stripePaymentAvailable =
  typeof process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY === "string" &&
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.trim().length > 0;

type CheckoutClientProps = {
  orderId: string;
};

function buildInitialMerchantDirectForm(
  session: CheckoutSession,
): MerchantDirectFormState {
  const shippingMethod =
    session.variant === "merchant_direct"
      ? (session.shippingMethod ?? "sf")
      : "sf";
  const requiresAuth =
    session.variant === "merchant_direct" && session.requiresAuthentication;

  return {
    shippingType: shippingMethod,
    buyerPhone: "",
    courierDeliveryAddress: "",
    meetupNote: "",
    buyerRemark: "",
    authServiceEnabled: Boolean(requiresAuth),
  };
}

export function CheckoutClient({ orderId }: CheckoutClientProps) {
  const router = useRouter();
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const [step, setStep] = useState<1 | 2>(1);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [merchantDirectForm, setMerchantDirectForm] =
    useState<MerchantDirectFormState | null>(null);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [couponPreviewSubsidy, setCouponPreviewSubsidy] = useState(0);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadOrder = async () => {
      const result = await loadCheckoutSession(orderId);
      if (cancelled) {
        return;
      }

      if (!result.success) {
        setLoadError(result.error);
        setSession(null);
        setIsLoadingOrder(false);
        return;
      }

      setSession(result.data);
      setMerchantDirectForm(buildInitialMerchantDirectForm(result.data));
      setLoadError(null);
      setIsLoadingOrder(false);
    };

    void loadOrder();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const stripeInstance = useMemo(
    () => (publishableKey ? getStripePromise(publishableKey) : null),
    [publishableKey],
  );

  const { countdownLabel, isExpired, isExpiringSoon } = usePaymentCountdown(
    session?.paymentExpiresAt ?? null,
  );

  const variantConfig = session
    ? CHECKOUT_VARIANT_CONFIG[session.variant]
    : null;

  const pricing = session
    ? resolveCheckoutDisplayPricing(
        session,
        session.variant === "merchant_direct" ? merchantDirectForm ?? undefined : undefined,
        { platformSubsidy: couponPreviewSubsidy },
      )
    : {
        shippingFee: 0,
        inboundShippingFee: 0,
        outboundShippingFee: 0,
        authFee: 0,
        grossTotalAmount: 0,
        platformSubsidy: 0,
        totalAmount: 0,
      };

  const isAuthEscrowVariant =
    session?.variant === "member_auth" ||
    session?.variant === "merchant_auth" ||
    (session?.variant === "merchant_direct" &&
      Boolean(merchantDirectForm?.authServiceEnabled));

  const shippingLabel =
    session?.variant === "merchant_direct" && merchantDirectForm
      ? `運費（${merchantDirectForm.shippingType === "sf" ? "快遞寄貨" : "面交／自取"}）`
      : "運費";

  const showShippingRow =
    session?.variant === "merchant_direct" &&
    merchantDirectForm &&
    !merchantDirectForm.authServiceEnabled;

  const extraShippingNote =
    session?.variant === "merchant_direct" &&
    merchantDirectForm?.shippingType === "sf" &&
    session.listingExtraShippingFee > 0
      ? `基本運費 HK$ ${session.baseCourierShippingFee} + 附加運費 HK$ ${session.listingExtraShippingFee}`
      : null;

  const handleMerchantDirectFormChange = (
    patch: Partial<MerchantDirectFormState>,
  ) => {
    setMerchantDirectForm((current) => (current ? { ...current, ...patch } : current));
    if (patch.shippingType || patch.authServiceEnabled) {
      setSelectedCouponId(null);
      setCouponPreviewSubsidy(0);
    }
  };

  const handleCouponChange = (couponId: string | null) => {
    setSelectedCouponId(couponId);
    if (!couponId) {
      setCouponPreviewSubsidy(0);
    }
  };

  const merchantCouponUseAuth =
    session?.variant === "merchant_auth" ||
    (session?.variant === "merchant_direct" &&
      Boolean(merchantDirectForm?.authServiceEnabled));

  useEffect(() => {
    if (!session || !selectedCouponId) {
      return;
    }

    if (
      session.variant !== "merchant_auth" &&
      session.variant !== "merchant_direct" &&
      session.variant !== "member_auth"
    ) {
      return;
    }

    if (session.variant === "merchant_direct" && !merchantDirectForm) {
      return;
    }

    let cancelled = false;

    const syncCouponPreview = async () => {
      const result = await listCheckoutEligibleCoupons(session.orderId, {
        shippingMethod:
          session.variant === "member_auth" ||
          session.variant === "merchant_auth" ||
          merchantCouponUseAuth
            ? "sf"
            : merchantDirectForm?.shippingType ?? "sf",
        useAuth:
          session.variant === "member_auth" ||
          session.variant === "merchant_auth" ||
          merchantCouponUseAuth,
      });

      if (cancelled || !result.success) {
        return;
      }

      const selected = result.data.find((coupon) => coupon.id === selectedCouponId);
      setCouponPreviewSubsidy(
        selected?.eligible ? Number(selected.previewSubsidy ?? 0) : 0,
      );
    };

    void syncCouponPreview();

    return () => {
      cancelled = true;
    };
  }, [
    merchantCouponUseAuth,
    merchantDirectForm,
    selectedCouponId,
    session,
  ]);

  const handleProceedToPayment = async () => {
    if (!session) {
      return;
    }

    if (session.paymentExpiresAt && isExpired) {
      toast.error("付款期限已過", {
        description: "此訂單已逾期，請返回市集重新下單。",
      });
      return;
    }

    if (session.variant === "merchant_direct" && merchantDirectForm) {
      const validationError = validateMerchantDirectForm(
        merchantDirectForm,
        variantConfig?.showFulfillmentForm ?? true,
      );
      if (validationError) {
        toast.error("資料未補全", { description: validationError });
        return;
      }
    }

    if (session.variant === "member_auth" && !stripePaymentAvailable) {
      toast.error("付款服務尚未設定", {
        description: "請設定 NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY 與 STRIPE_SECRET_KEY 後再試。",
      });
      return;
    }

    setIsPreparingPayment(true);
    toast.info("正在建立安全託管付款...", {
      description: "託管協定成立中，正在調用 Stripe 安全金流網絡...",
      duration: 2000,
    });

    const result = await prepareCheckoutPayment(
      session,
      session.variant === "merchant_direct" ? merchantDirectForm ?? undefined : undefined,
      {
        userRewardId:
          session.variant === "merchant_auth" ||
          session.variant === "merchant_direct" ||
          session.variant === "member_auth"
            ? selectedCouponId
            : null,
      },
    );

    setIsPreparingPayment(false);

    if (!result.success) {
      if (
        (session.variant === "merchant_direct" ||
          session.variant === "merchant_auth" ||
          session.variant === "member_auth") &&
        /優惠券.*過期|已過期/.test(result.error)
      ) {
        setSelectedCouponId(null);
        setCouponPreviewSubsidy(0);
      }
      toast.error("無法建立託管付款", { description: result.error });
      return;
    }

    setPublishableKey(result.data.publishableKey);
    setClientSecret(result.data.clientSecret);
    if (result.data.platformSubsidyAmount != null) {
      setCouponPreviewSubsidy(result.data.platformSubsidyAmount);
    }
    setSession((current) =>
      current
        ? {
            ...current,
            pricing: {
              ...current.pricing,
              totalAmount: result.data.totalAmount,
            },
          }
        : current,
    );
    setStep(2);
    toast.success("託管付款已建立", {
      description: `請輸入付款資料以完成 HK$ ${result.data.totalAmount.toLocaleString()} 支付。`,
    });
  };

  const handleBackToReview = () => {
    setStep(1);
    setClientSecret(null);
    setPublishableKey(null);
  };

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-[#17130f] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  if (isLoadingOrder) {
    return (
      <div className="min-h-screen bg-[#17130f] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session || !merchantDirectForm) {
    return (
      <div className="min-h-screen bg-[#17130f] text-[#eae1da] flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-sans text-[14px] text-[#d4c4b7]">
          {loadError ?? "找不到此結帳訂單"}
        </p>
        <button
          type="button"
          onClick={() => router.push("/profile/user/trading")}
          className="h-11 px-5 rounded-xl bg-brand text-[#1A1612] font-sans font-bold text-[13.5px] focus:outline-none"
        >
          前往交易管理
        </button>
      </div>
    );
  }

  const orderReference = session.orderNumber ?? session.orderId;

  return (
    <div className="min-h-screen bg-[#17130f] text-[#eae1da] p-4 lg:p-8">
      <div className="max-w-[1000px] mx-auto space-y-6 pb-24">
        <button
          type="button"
          onClick={() => (step === 2 ? handleBackToReview() : router.back())}
          className="h-8 px-2.5 rounded-lg bg-[#1A1612] font-sans text-[12px] font-medium text-brand focus:outline-none"
        >
          <IoChevronBack />
        </button>

        <div className="space-y-3 border-b border-white/[0.08] pb-4">
          <h1 className="font-sans text-[20px] font-bold text-text-primary md:text-[22px]">
            {step === 1 ? "訂單確認" : "安全託管付款"}
          </h1>
          <p className="font-mono text-[11px] text-text-disabled">
            訂單號碼 {orderReference}
          </p>
          <CheckoutWizardStepper variant={session.variant} step={step} />
        </div>

        {!session.isPayable ? (
          <div className="rounded-lg border border-brand/20 bg-bg-card/20 p-4">
            <p className="font-sans text-[12.5px] text-brand">
              此訂單已完成付款或已進入下一階段，無法重複支付。
            </p>
          </div>
        ) : null}

        {session.isPayable && session.paymentExpiresAt ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/20 bg-bg-card/20 px-4 py-3">
            <p className="font-sans text-[12px] text-text-secondary">
              請於 48 小時內完成託管付款，逾期將自動取消
            </p>
            <p
              className={
                isExpired || isExpiringSoon
                  ? "font-mono text-[11px] text-warning"
                  : "font-mono text-[11px] text-brand"
              }
            >
              {isExpired ? "付款期限已過" : countdownLabel}
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
          <div className="lg:col-span-7 space-y-4">
            {step === 1 ? (
              <CheckoutReviewStep
                session={session}
                merchantDirectForm={merchantDirectForm}
                onMerchantDirectFormChange={handleMerchantDirectFormChange}
                paymentLocked={clientSecret !== null}
                selectedCouponId={selectedCouponId}
                onCouponChange={handleCouponChange}
                authFee={pricing.authFee}
              />
            ) : (
              <section className="rounded-lg border border-white/[0.08] bg-bg-card/20 p-4 space-y-2">
                <h2 className={SECTION_TITLE_CLASS}>
                  輸入付款資料
                </h2>
                <p className="font-sans text-[12px] text-text-secondary leading-relaxed">
                  請確認訂單金額後完成 Stripe 安全託管付款。如需修改交收或鑑定選項，請返回上一步。
                </p>
              </section>
            )}
          </div>

          <div className="lg:col-span-5 space-y-4">
            <CheckoutOrderSummary
              session={session}
              shippingFee={pricing.shippingFee}
              inboundShippingFee={pricing.inboundShippingFee}
              outboundShippingFee={pricing.outboundShippingFee}
              authFee={pricing.authFee}
              totalAmount={pricing.totalAmount}
              platformSubsidyAmount={pricing.platformSubsidy}
              shippingLabel={shippingLabel}
              showShippingRow={Boolean(showShippingRow)}
              showAuthEscrowShippingRows={isAuthEscrowVariant}
              showAuthFeeRow={
                session.variant === "merchant_auth" ||
                session.variant === "member_auth" ||
                (session.variant === "merchant_direct" &&
                  Boolean(merchantDirectForm?.authServiceEnabled))
              }
              extraShippingNote={extraShippingNote}
            >
              {step === 1 ? (
                <button
                  type="button"
                  disabled={
                    isPreparingPayment || !session.isPayable || isExpired
                  }
                  onClick={() => void handleProceedToPayment()}
                  className="w-full h-12 bg-brand text-[#1A1612] font-sans font-bold text-[14px] rounded-xl hover:bg-[#e8b896] active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer focus:outline-none"
                >
                  {isPreparingPayment ? (
                    <>
                      <Spinner className="text-[#1A1612] size-4 animate-spin" />
                      <span>正在處理安全金流支付...</span>
                    </>
                  ) : (
                    <span>繼續付款</span>
                  )}
                </button>
              ) : clientSecret && stripeInstance ? (
                <CheckoutPaymentStep
                  session={session}
                  clientSecret={clientSecret}
                  stripePromise={stripeInstance}
                  totalAmount={pricing.totalAmount}
                />
              ) : (
                <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-text-disabled">
                  <Spinner className="size-4 text-brand" />
                  載入付款表單中…
                </div>
              )}
            </CheckoutOrderSummary>
          </div>
        </div>
      </div>
    </div>
  );
}
