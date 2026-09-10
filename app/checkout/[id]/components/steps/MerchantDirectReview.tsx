"use client";

import Link from "next/link";
import { CheckoutProductCard } from "@/app/checkout/[id]/components/CheckoutProductCard";
import { Switch } from "@/components/ui/switch";
import { CheckoutCouponPicker } from "@/app/checkout/[id]/components/CheckoutCouponPicker";
import type {
  MerchantDirectCheckoutSession,
  MerchantDirectFormState,
} from "@/lib/checkout/types";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

type MerchantDirectReviewProps = {
  session: MerchantDirectCheckoutSession;
  form: MerchantDirectFormState;
  onFormChange: (patch: Partial<MerchantDirectFormState>) => void;
  paymentLocked: boolean;
  selectedCouponId: string | null;
  onCouponChange: (couponId: string | null) => void;
  authFee: number;
};

export function MerchantDirectReview({
  session,
  form,
  onFormChange,
  paymentLocked,
  selectedCouponId,
  onCouponChange,
  authFee,
}: MerchantDirectReviewProps) {
  const showDirectDeliverySection = !form.authServiceEnabled;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-white/[0.08] bg-bg-card/20 p-4 space-y-3">
        <h2 className={SECTION_TITLE_CLASS}>
          商品資訊
        </h2>
        <CheckoutProductCard session={session} />
      </section>

      {showDirectDeliverySection ? (
        <section className="rounded-lg border border-white/[0.08] bg-bg-card/20 p-4 space-y-4">
          <div className="space-y-1">
            <h2 className={SECTION_TITLE_CLASS}>
              交收方式
            </h2>
            <p className="font-sans text-[11px] text-text-disabled leading-relaxed">
              快遞由商戶出貨時安排；面交／自取地點可於訂單內與商戶協調。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onFormChange({ shippingType: "sf" })}
              className={`h-11 rounded-xl border font-sans text-[13px] font-semibold transition-all ${form.shippingType === "sf" ? "bg-brand/10 border-brand text-brand" : "bg-[#17130f] border-white/10 text-[#d4c4b7]"}`}
            >
              快遞寄貨
            </button>
            <button
              type="button"
              onClick={() => onFormChange({ shippingType: "meetup" })}
              className={`h-11 rounded-xl border font-sans text-[13px] font-semibold transition-all ${form.shippingType === "meetup" ? "bg-brand/10 border-brand text-brand" : "bg-[#17130f] border-white/10 text-[#d4c4b7]"}`}
            >
              面交／自取
            </button>
          </div>

          {form.shippingType === "sf" ? (
            <div className="space-y-3 pt-1 font-sans text-[13px]">
              <div>
                <label
                  htmlFor="p-tel"
                  className="font-mono text-[11px] text-[#d4c4b7] block mb-1"
                >
                  聯絡電話 *
                </label>
                <input
                  id="p-tel"
                  type="tel"
                  maxLength={8}
                  value={form.buyerPhone}
                  onChange={(event) =>
                    onFormChange({ buyerPhone: event.target.value })
                  }
                  placeholder="91234567"
                  className="w-full h-10 bg-[#17130f] border border-white/10 rounded-xl px-3 text-[#eae1da] font-mono"
                />
              </div>
              <div>
                <label
                  htmlFor="p-addr"
                  className="font-mono text-[11px] text-[#d4c4b7] block mb-1"
                >
                  收件地址／自提點 *
                </label>
                <textarea
                  id="p-addr"
                  rows={2}
                  value={form.courierDeliveryAddress}
                  onChange={(event) =>
                    onFormChange({ courierDeliveryAddress: event.target.value })
                  }
                  placeholder="例：九龍塘站順豐智能櫃、或完整收件地址"
                  className="w-full bg-[#17130f] border border-white/10 rounded-xl p-3 text-[#eae1da] resize-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 pt-1 font-sans text-[13px]">
              <div>
                <label
                  htmlFor="p-tel-meet"
                  className="font-mono text-[11px] text-[#d4c4b7] block mb-1"
                >
                  聯絡電話 *
                </label>
                <input
                  id="p-tel-meet"
                  type="tel"
                  maxLength={8}
                  value={form.buyerPhone}
                  onChange={(event) =>
                    onFormChange({ buyerPhone: event.target.value })
                  }
                  placeholder="91234567"
                  className="w-full h-10 bg-[#17130f] border border-white/10 rounded-xl px-3 text-[#eae1da] font-mono"
                />
              </div>
              <div>
                <label
                  htmlFor="p-meet"
                  className="font-mono text-[11px] text-[#d4c4b7] block mb-1"
                >
                  面交備註（選填）
                </label>
                <input
                  id="p-meet"
                  type="text"
                  value={form.meetupNote}
                  onChange={(event) =>
                    onFormChange({ meetupNote: event.target.value })
                  }
                  placeholder="可於訂單內與商戶約定時間地點"
                  className="w-full h-10 bg-[#17130f] border border-white/10 rounded-xl px-3 text-[#eae1da]"
                />
              </div>
            </div>
          )}
        </section>
      ) : null}

      <section className="rounded-lg border border-white/[0.08] bg-bg-card/20 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-1">
            <h2 className={SECTION_TITLE_CLASS}>
              平台鑑定服務
            </h2>
            <p className="font-sans text-[12px] text-text-secondary leading-relaxed">
              第三方官方認證、複驗品相及防偽包裝
            </p>
          </div>
          <Switch
            checked={form.authServiceEnabled}
            onCheckedChange={(checked) => {
              onFormChange({ authServiceEnabled: checked });
              if (checked) {
                onCouponChange(null);
              }
            }}
            disabled={!session.listingAcceptsAuthentication || paymentLocked}
            className="data-checked:bg-brand data-unchecked:bg-[#39342f]"
          />
        </div>
        {!session.listingAcceptsAuthentication ? (
          <p className="mt-2 font-sans text-[11px] text-text-disabled">
            此賣家未開放平台鑑定加購服務。
          </p>
        ) : null}
        {form.authServiceEnabled ? (
          <div className="mt-3 rounded-lg border border-brand/20 bg-[#17130f] p-3 space-y-2">
            <p className="font-sans text-[11px] text-brand leading-relaxed">
              鑑定服務已啟用：第三方鑑定機構將檢測品相並提供認證報告。鑑定費 HK$
              {authFee} 將計入訂單總額。
            </p>
            <p className="font-sans text-[11px] text-text-disabled leading-relaxed">
              鑑定服務開始後鑑定費一般不予退還；售後窗口與規則見{" "}
              <Link href="/terms" className="text-brand hover:underline">
                服務條款
              </Link>
              。
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-white/[0.08] bg-bg-card/20 p-4 space-y-3">
        <label
          htmlFor="p-rem"
          className={`${SECTION_TITLE_CLASS} block`}
        >
          給賣家備註
        </label>
        <textarea
          id="p-rem"
          rows={3}
          value={form.buyerRemark}
          onChange={(event) =>
            onFormChange({ buyerRemark: event.target.value })
          }
          placeholder="例：請賣家發貨時加固氣泡紙，避免壓傷卡盒。"
          className="w-full bg-[#17130f] border border-white/10 rounded-xl p-3 font-sans text-[13px] text-[#eae1da] resize-none"
        />
      </section>

      <section className="rounded-lg border border-white/[0.08] bg-bg-card/20 p-4 space-y-3">
        <h2 className={SECTION_TITLE_CLASS}>
          平台優惠券
        </h2>
        <CheckoutCouponPicker
          orderId={session.orderId}
          shippingMethod={form.authServiceEnabled ? "sf" : form.shippingType}
          selectedCouponId={selectedCouponId}
          onSelectCoupon={onCouponChange}
          disabled={paymentLocked}
          useAuth={form.authServiceEnabled}
        />
      </section>
    </div>
  );
}
