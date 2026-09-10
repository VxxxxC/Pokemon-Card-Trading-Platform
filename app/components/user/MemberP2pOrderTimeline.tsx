"use client";

import { cn } from "@/lib/utils";
import {
  getP2pTimelineStep,
  type MemberOrderDbStatus,
} from "@/app/lib/member-order/p2p";
import { OrderTimelineStepDot } from "@/app/components/shared/OrderTimelineStepDot";

type MemberP2pOrderTimelineProps = {
  status: MemberOrderDbStatus | null | undefined;
  embedded?: boolean;
};

const TONE_LABEL_CLASS: Record<
  ReturnType<typeof getP2pTimelineStep>["tone"],
  string
> = {
  active: "text-brand",
  success: "text-success",
  muted: "text-text-disabled",
};

export function MemberP2pOrderTimeline({
  status,
  embedded = false,
}: MemberP2pOrderTimelineProps) {
  const step = getP2pTimelineStep(status);

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

      <div className="relative pl-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1px] before:bg-white/10">
        <div className="relative text-[12.5px] leading-relaxed">
          <OrderTimelineStepDot
            isCompleted={step.tone === "success"}
            isActive={step.tone === "active"}
          />
          <div className="flex flex-col">
            <span
              className={cn("font-sans font-bold", TONE_LABEL_CLASS[step.tone])}
            >
              {step.label}
            </span>
            <span className="text-[11px] text-text-disabled">
              {step.description}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
