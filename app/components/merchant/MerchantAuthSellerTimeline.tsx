"use client";

import type { Tables } from "@/types/supabase";
import { cn } from "@/lib/utils";
import {
  getMerchantAuthSellerTimelineStepIndex,
  getMerchantAuthSellerTimelineSteps,
} from "@/lib/merchant-order/order-timeline-steps";
import { OrderTimelineStepDot } from "@/app/components/shared/OrderTimelineStepDot";

type MerchantEscrowStatus = Tables<"merchant_orders">["escrow_status"];

type MerchantAuthSellerTimelineProps = {
  escrowStatus: MerchantEscrowStatus | null;
  payoutStatus?: string | null;
  embedded?: boolean;
};

export function MerchantAuthSellerTimeline({
  escrowStatus,
  payoutStatus,
  embedded = false,
}: MerchantAuthSellerTimelineProps) {
  const steps = getMerchantAuthSellerTimelineSteps(payoutStatus);
  const currentStepIdx = getMerchantAuthSellerTimelineStepIndex(
    escrowStatus,
    payoutStatus,
  );
  const isCancelled = escrowStatus === "refunded";

  return (
    <div
      className={
        embedded
          ? "space-y-4"
          : "space-y-4 rounded-xl border border-white/5 bg-[#17130f] p-4"
      }
    >
      {!embedded ? (
        <h4 className="font-sans text-[12.5px] font-bold text-text-primary">
          交易狀態
        </h4>
      ) : null}

      {isCancelled ? (
        <p className="text-[12.5px] text-text-disabled">訂單已取消 / 已退款</p>
      ) : (
        <div className="relative pl-6 space-y-5 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1px] before:bg-white/10">
          {steps.map((step, idx) => {
            const isCompleted = currentStepIdx >= 0 && idx < currentStepIdx;
            const isActive = idx === currentStepIdx;

            return (
              <div
                key={step.id}
                className="relative text-[12.5px] leading-relaxed"
              >
                <OrderTimelineStepDot
                  isCompleted={isCompleted}
                  isActive={isActive}
                />
                <div className="flex flex-col">
                  <span
                    className={cn(
                      "font-sans font-bold",
                      isActive
                        ? "text-brand"
                        : isCompleted
                          ? "text-success"
                          : "text-text-secondary",
                    )}
                  >
                    {step.label}
                  </span>
                  <span className="text-[11px] text-text-disabled">
                    {step.description}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
