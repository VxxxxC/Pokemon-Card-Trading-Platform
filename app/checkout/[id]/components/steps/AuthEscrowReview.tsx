"use client";

import Link from "next/link";
import { MemberAuthOrderTimeline } from "@/app/components/user/MemberAuthOrderTimeline";
import { CheckoutCouponPicker } from "@/app/checkout/[id]/components/CheckoutCouponPicker";
import type { CheckoutSession } from "@/lib/checkout/types";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

type AuthEscrowReviewProps = {
  session: CheckoutSession;
  selectedCouponId?: string | null;
  onCouponChange?: (couponId: string | null) => void;
  paymentLocked?: boolean;
};

const MERCHANT_AUTH_STEPS = [
  "完成託管付款",
  "商戶寄送卡牌至平台倉庫",
  "展開鑑定工作",
  "鑑定通過後安排交付買家",
] as const;

export function AuthEscrowReview({
  session,
  selectedCouponId = null,
  onCouponChange,
  paymentLocked = false,
}: AuthEscrowReviewProps) {
  const isMember = session.variant === "member_auth";

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-white/[0.08] bg-bg-card/20 p-4 space-y-3">
        <h2 className={SECTION_TITLE_CLASS}>
          鑑定託管流程
        </h2>
        <p className="font-sans text-[12px] text-text-secondary leading-relaxed">
          {isMember
            ? "此筆交易已啟用平台第三方鑑定。付款後賣家寄卡至平台倉庫，鑑定通過後平台代發給買家。"
            : "此筆訂單已啟用平台鑑定。付款後商戶寄卡至平台倉庫，鑑定通過後安排交付。"}
        </p>
        {isMember ? (
          <MemberAuthOrderTimeline
            status="pending"
            escrowStatus="payment"
            paymentConfirmedAt={null}
            perspective="buy"
          />
        ) : (
          <ol className="font-sans text-[11.5px] text-text-secondary space-y-1.5 list-decimal pl-4">
            {MERCHANT_AUTH_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
        <p className="font-sans text-[11px] text-text-disabled leading-relaxed border-t border-white/[0.06] pt-3">
          平台確認收到卡牌後鑑定服務視為已開始，鑑定費一般不予退還；售後窗口與退款規則見{" "}
          <Link href="/terms" className="text-brand hover:underline">
            服務條款
          </Link>
          。
        </p>
      </section>

      {(session.variant === "merchant_auth" ||
        session.variant === "member_auth") &&
      onCouponChange ? (
        <section className="rounded-lg border border-white/[0.08] bg-bg-card/20 p-4 space-y-3">
          <h2 className={SECTION_TITLE_CLASS}>
            平台優惠券
          </h2>
          <CheckoutCouponPicker
            orderId={session.orderId}
            shippingMethod="sf"
            selectedCouponId={selectedCouponId}
            onSelectCoupon={onCouponChange}
            disabled={paymentLocked}
            useAuth
          />
        </section>
      ) : null}
    </div>
  );
}
