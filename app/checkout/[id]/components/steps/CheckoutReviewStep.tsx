"use client";

import type {
  CheckoutSession,
  MerchantDirectFormState,
} from "@/lib/checkout/types";
import { CheckoutProductCard } from "@/app/checkout/[id]/components/CheckoutProductCard";
import { AuthEscrowReview } from "@/app/checkout/[id]/components/steps/AuthEscrowReview";
import { MerchantDirectReview } from "@/app/checkout/[id]/components/steps/MerchantDirectReview";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

type CheckoutReviewStepProps = {
  session: CheckoutSession;
  merchantDirectForm: MerchantDirectFormState;
  onMerchantDirectFormChange: (patch: Partial<MerchantDirectFormState>) => void;
  paymentLocked: boolean;
  selectedCouponId: string | null;
  onCouponChange: (couponId: string | null) => void;
  authFee: number;
};

function ProductSummarySection({ session }: { session: CheckoutSession }) {
  return (
    <section className="rounded-lg border border-white/[0.08] bg-bg-card/20 p-4 space-y-3">
      <h2 className={SECTION_TITLE_CLASS}>
        商品資訊
      </h2>
      <CheckoutProductCard session={session} />
    </section>
  );
}

export function CheckoutReviewStep({
  session,
  merchantDirectForm,
  onMerchantDirectFormChange,
  paymentLocked,
  selectedCouponId,
  onCouponChange,
  authFee,
}: CheckoutReviewStepProps) {
  if (session.variant === "merchant_direct") {
    return (
      <MerchantDirectReview
        session={session}
        form={merchantDirectForm}
        onFormChange={onMerchantDirectFormChange}
        paymentLocked={paymentLocked}
        selectedCouponId={selectedCouponId}
        onCouponChange={onCouponChange}
        authFee={authFee}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ProductSummarySection session={session} />
      <AuthEscrowReview
        session={session}
        selectedCouponId={selectedCouponId}
        onCouponChange={onCouponChange}
        paymentLocked={paymentLocked}
      />
    </div>
  );
}
