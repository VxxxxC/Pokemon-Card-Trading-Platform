"use client";

import { useEffect, useState } from "react";
import {
  listCheckoutEligibleCoupons,
  type CheckoutEligibleCoupon,
} from "@/app/actions/checkout-coupons";
import type { MerchantShippingMethod } from "@/lib/merchant-checkout/pricing";
import { Spinner } from "@/components/ui/spinner";

type CheckoutCouponPickerProps = {
  orderId: string;
  shippingMethod: MerchantShippingMethod;
  selectedCouponId: string | null;
  onSelectCoupon: (couponId: string | null) => void;
  disabled?: boolean;
  useAuth?: boolean;
};

function couponLabel(coupon: CheckoutEligibleCoupon): string {
  if (coupon.type === "free_shipping") {
    const cap = Number(coupon.rewardValue.max_subsidy_hkd ?? 0);
    return cap > 0 ? `免運（最高 HK$${cap}）` : "免運券";
  }

  const amount = Number(coupon.rewardValue.amount_hkd ?? 0);
  return amount > 0 ? `折扣 HK$${amount}` : coupon.title;
}

export function CheckoutCouponPicker({
  orderId,
  shippingMethod,
  selectedCouponId,
  onSelectCoupon,
  disabled = false,
  useAuth = false,
}: CheckoutCouponPickerProps) {
  const [coupons, setCoupons] = useState<CheckoutEligibleCoupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadCoupons = async () => {
      setIsLoading(true);
      setLoadError(null);

      const result = await listCheckoutEligibleCoupons(orderId, {
        shippingMethod,
        useAuth,
      });

      if (cancelled) {
        return;
      }

      if (!result.success) {
        setCoupons([]);
        setLoadError(result.error);
        setIsLoading(false);
        return;
      }

      setCoupons(result.data);
      setIsLoading(false);
    };

    void loadCoupons();

    return () => {
      cancelled = true;
    };
  }, [orderId, shippingMethod, useAuth]);

  useEffect(() => {
    if (!selectedCouponId) {
      return;
    }

    const selected = coupons.find((coupon) => coupon.id === selectedCouponId);
    if (selected && !selected.eligible) {
      onSelectCoupon(null);
    }
  }, [coupons, onSelectCoupon, selectedCouponId]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-[12px] text-text-disabled">
        <Spinner className="size-4 text-brand" />
        載入優惠券中…
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="font-sans text-[11px] text-text-disabled">
        無法載入優惠券：{loadError}
      </p>
    );
  }

  if (coupons.length === 0) {
    return (
      <p className="font-sans text-[11px] text-text-disabled">
        暫無可用優惠券
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor="checkout-coupon"
        className="font-mono text-[11px] text-[#d4c4b7] block"
      >
        選擇優惠券（選填）
      </label>
      <select
        id="checkout-coupon"
        value={selectedCouponId ?? ""}
        disabled={disabled}
        onChange={(event) => {
          const value = event.target.value;
          onSelectCoupon(value.length > 0 ? value : null);
        }}
        className="w-full h-10 bg-[#17130f] border border-white/10 rounded-xl px-3 text-[#eae1da] font-sans text-[13px]"
      >
        <option value="">不使用優惠券</option>
        {coupons.map((coupon) => (
          <option
            key={coupon.id}
            value={coupon.id}
            disabled={!coupon.eligible}
          >
            {couponLabel(coupon)}
            {coupon.eligible && coupon.previewSubsidy > 0
              ? `（-HK$${coupon.previewSubsidy}）`
              : ""}
            {!coupon.eligible && coupon.ineligibleReason
              ? `（${coupon.ineligibleReason}）`
              : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
