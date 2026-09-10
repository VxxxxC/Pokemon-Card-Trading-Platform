"use client";

import Image from "next/image";
import type { CheckoutSession } from "@/lib/checkout/types";

type CheckoutProductCardProps = {
  session: CheckoutSession;
  compact?: boolean;
};

export function CheckoutProductCard({
  session,
  compact = false,
}: CheckoutProductCardProps) {
  const { product, counterparty } = session;
  const catalogLine =
    product.displayId?.trim() || product.cardNumber?.trim() || "";

  return (
    <div
      className={`flex gap-3 items-start rounded-lg border border-white/[0.06] bg-[#17130f] ${compact ? "p-2.5" : "p-3"}`}
    >
      <div
        className={`relative shrink-0 overflow-hidden rounded-md border border-white/10 ${compact ? "w-14 h-[4.25rem]" : "w-16 h-[4.5rem]"}`}
      >
        <Image
          src={product.imageUrl}
          alt={product.cardName}
          fill
          className="object-cover"
          unoptimized
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3
            className={`min-w-0 truncate font-sans font-bold text-text-primary ${compact ? "text-[13px]" : "text-[14px]"}`}
          >
            {product.cardName}
          </h3>
          <span className="inline-flex shrink-0 font-mono text-[9px] text-brand rounded border border-brand/20 bg-brand/10 px-1.5 py-0.5">
            {product.gradeLabel}
          </span>
        </div>
        {catalogLine ? (
          <p className="font-mono text-[10px] text-text-disabled">{catalogLine}</p>
        ) : null}
        <p className="font-sans text-[11px] text-text-secondary truncate">
          賣方 · {counterparty.name}
        </p>
        <p
          className="truncate font-mono text-[9px] leading-tight tabular-nums text-text-disabled"
          title={`上架序號：${session.listingId}`}
        >
          上架序號：{session.listingId}
        </p>
      </div>
    </div>
  );
}
