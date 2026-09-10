"use client";

import {
  getAuthEscrowStatusLabel,
  getAuthEscrowStepIndexFromStatus,
  getMemberAuthSellerReleasedStepCopy,
  getMemberAuthEscrowTimelineSteps,
  isMemberAuthSellerPayoutComplete,
  type MemberEscrowStatus,
} from "@/app/lib/member-order/auth-escrow";
import { ESCROW_STEPS } from "@/app/lib/types/rbac";
import type { MemberOrderDbStatus } from "@/app/lib/member-order/p2p";
import { OrderTimelineStepDot } from "@/app/components/shared/OrderTimelineStepDot";
import { cn } from "@/lib/utils";
import type { Enums } from "@/types/supabase";

type MemberAuthOrderTimelineProps = {
  status: MemberOrderDbStatus | null | undefined;
  escrowStatus?: MemberEscrowStatus | null;
  paymentConfirmedAt?: string | null;
  perspective?: "buy" | "sell";
  sellerPayoutStatus?: Enums<"member_seller_payout_status"> | null;
  fpsPayoutRequestStatus?: string | null;
  embedded?: boolean;
};

export function MemberAuthOrderTimeline({
  status,
  escrowStatus,
  paymentConfirmedAt,
  perspective,
  sellerPayoutStatus,
  fpsPayoutRequestStatus,
  embedded = false,
}: MemberAuthOrderTimelineProps) {
  const timelineSteps = perspective
    ? getMemberAuthEscrowTimelineSteps(perspective)
    : ESCROW_STEPS;
  const sellerPayoutComplete =
    perspective === "sell" &&
    isMemberAuthSellerPayoutComplete(
      sellerPayoutStatus,
      fpsPayoutRequestStatus,
    );
  const currentStepIdx = getAuthEscrowStepIndexFromStatus(
    escrowStatus,
    status,
    { perspective, sellerPayoutStatus, fpsPayoutRequestStatus },
  );
  const isAwaitingPayment =
    escrowStatus === "payment" && paymentConfirmedAt == null;
  const isCancelled =
    status === "cancelled" || escrowStatus === "cancelled";

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
        <div className="relative pl-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1px] before:bg-white/10">
          <div className="relative text-[12.5px] leading-relaxed">
            <OrderTimelineStepDot className="border-white/20 bg-[#1A1612]" />
            <div className="flex flex-col">
              <span className="font-sans font-bold text-text-disabled">
                已取消
              </span>
              <span className="text-[11px] text-text-disabled">
                交易已中止
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative pl-6 space-y-5 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1px] before:bg-white/10">
          {timelineSteps.map((step, idx) => {
            const isCompleted = idx < currentStepIdx;
            const isActive = idx === currentStepIdx;
            const showAwaitingPaymentLabel =
              isAwaitingPayment && isActive && step.id === "payment";
            const stepLabel = showAwaitingPaymentLabel
              ? getAuthEscrowStatusLabel("payment")
              : step.label;
            let stepDescription = step.description;
            let resolvedStepLabel = stepLabel;
            if (showAwaitingPaymentLabel) {
              stepDescription =
                perspective === "sell"
                  ? "等待買家完成付款"
                  : "請完成卡價與鑑定服務費付款";
            } else if (
              step.id === "custody" &&
              perspective === "sell" &&
              isCompleted
            ) {
              stepDescription = "你已將卡牌寄往平台倉庫";
            } else if (step.id === "released" && perspective === "sell") {
              const releasedCopy = getMemberAuthSellerReleasedStepCopy(
                sellerPayoutComplete,
              );
              resolvedStepLabel = releasedCopy.label;
              stepDescription = releasedCopy.description;
            }

            return (
              <div
                key={step.id}
                className="relative text-[12.5px] leading-relaxed"
              >
                <OrderTimelineStepDot
                  isCompleted={isCompleted}
                  isActive={isActive}
                  activeTone={showAwaitingPaymentLabel ? "warning" : "brand"}
                />

                <div className="flex flex-col">
                  <span
                    className={cn(
                      "font-sans font-bold",
                      isActive
                        ? showAwaitingPaymentLabel
                          ? "text-amber-400"
                          : "text-brand"
                        : isCompleted
                          ? "text-success"
                          : "text-text-secondary",
                    )}
                  >
                    {resolvedStepLabel}
                  </span>
                  <span className="text-[11px] text-text-disabled">
                    {stepDescription}
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
