"use client";

import type { ReactNode } from "react";

const COUPON_TICKET_SURFACE = "bg-bg-card";

function CouponTicketDivider() {
  return (
    <div className="relative w-0 shrink-0 self-stretch py-3" aria-hidden>
      <div className="absolute inset-y-4 left-0 border-l border-dashed border-white/15" />
      <div
        className={`absolute -left-[5px] top-2 size-[10px] rounded-full ${COUPON_TICKET_SURFACE}`}
      />
      <div
        className={`absolute -left-[5px] bottom-2 size-[10px] rounded-full ${COUPON_TICKET_SURFACE}`}
      />
    </div>
  );
}

export type CouponTicketShellProps = {
  accentClass: string;
  borderClass: string;
  bgClass: string;
  stubClass: string;
  valueLabel: string;
  children: ReactNode;
};

export const REDEEMABLE_COUPON_TICKET_TONE = {
  accentClass: "bg-brand",
  borderClass: "border-white/[0.08] hover:border-brand/35",
  bgClass: "bg-white/[0.03]",
  stubClass: "text-brand",
} as const;

export function CouponTicketShell({
  accentClass,
  borderClass,
  bgClass,
  stubClass,
  valueLabel,
  children,
}: CouponTicketShellProps) {
  return (
    <div
      className={`relative flex overflow-hidden rounded-xl border transition-colors ${borderClass} ${bgClass}`}
    >
      <div className="relative flex w-[4.25rem] shrink-0 flex-col items-center justify-center px-2 py-3.5">
        <div
          className={`absolute left-1.5 top-3 bottom-3 w-0.5 rounded-full ${accentClass}`}
        />
        <p
          className={`text-center font-mono text-[13px] font-bold leading-tight tabular-nums ${stubClass}`}
        >
          {valueLabel}
        </p>
      </div>
      <CouponTicketDivider />
      <div className="min-w-0 flex-1 py-3.5 pr-3 pl-2">{children}</div>
    </div>
  );
}
