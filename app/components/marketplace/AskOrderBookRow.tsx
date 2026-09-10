"use client";

import React from "react";
import { ProfileAvatar } from "@/app/components/profile/ProfileAvatar";
import { GradeBadge } from "@/app/components/cards/GradeBadge";
import { type SellOrder } from "@/app/lib/mock-data/cards";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/avatar";
import { CertifiedMerchantBadge } from "@/app/components/profile/CertifiedMerchantBadge";
import { SellerReputationMeta } from "@/lib/marketplace/seller-reputation-meta";

interface AskOrderBookRowProps {
  order: SellOrder;
  idx: number;
  productId: string;
  onOpenGate: (order: SellOrder) => void;
  grade: { authority: string; score: string };
  isOwnListing?: boolean;
}

export function AskOrderBookRow({
  order,
  idx,
  onOpenGate,
  grade,
  isOwnListing = false,
}: AskOrderBookRowProps) {
  const handleActivate = () => {
    if (isOwnListing) return;
    onOpenGate(order);
  };

  return (
    <div className="space-y-2 w-full animate-fadeIn">
      {/* Main Interactive Row Layout Box */}
      <div
        role={isOwnListing ? undefined : "button"}
        tabIndex={isOwnListing ? undefined : 0}
        onClick={handleActivate}
        onKeyDown={(e) => {
          if (isOwnListing) return;
          if (e.key === "Enter" || e.key === " ") onOpenGate(order);
        }}
        className={`w-full bg-[#1A1612] ${isOwnListing ? "border-brand/60 bg-brand/[0.06] cursor-default" : "hover:bg-[#2c2722] cursor-pointer"} ${idx === 0 && !isOwnListing ? "border-brand/40" : isOwnListing ? "border-brand/50" : "border-white/5"} py-1.5 px-3 flex items-center justify-between gap-3 transition-all group focus:outline-none focus:ring-1 focus:ring-brand/40`}
      >
        {/* Left Hand Container (Avatar + Identity Stack) - NOW COMPLETELY INERT */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <ProfileAvatar
            avatarUrl={order.sellerAvatarUrl ?? DEFAULT_AVATAR_URL}
            displayName={order.sellerName}
            className="w-8 h-8 border border-white/10 shrink-0 select-none"
            fallbackClassName="bg-[#26211C] text-brand text-xs font-bold font-mono"
          />

          <div className="flex flex-col text-left min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-sans font-bold text-[13px] text-[#eae1da] truncate select-none">
                {order.sellerName}
              </span>
              {order.sellerPersona === "merchant" ? (
                <CertifiedMerchantBadge />
              ) : null}
              {isOwnListing ? (
                <span className="shrink-0 font-mono text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand/20 text-brand border border-brand/30">
                  我的掛單
                </span>
              ) : null}
            </div>

            {/* Responsive Stack Defense Line */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <SellerReputationMeta
                rating={order.sellerRating}
                reviewCount={order.reviewCount}
                totalTrades={order.sellerTotalTrades}
              />

              {/* MOBILE ONLY METADATA BLOCK */}
              <div className="flex sm:hidden items-center gap-1 scale-[0.9] origin-left shrink-0">
                <GradeBadge authority={grade.authority} score={grade.score} />
              </div>
            </div>
          </div>
        </div>

        {/* DESKTOP ONLY METADATA BLOCK */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <GradeBadge authority={grade.authority} score={grade.score} />
        </div>

        {/* Right Hand Container (Financial Value Axis) */}
        <div className="text-right shrink-0">
          <span
            className={`font-mono font-black text-[14px] ${idx === 0 ? "text-brand" : "text-[#eae1da]"}`}
          >
            HK$ {order.price.toLocaleString("en-HK")}
          </span>
          {order.deliverySummary ? (
            <p className="font-mono text-[10px] text-[#8A8680] mt-0.5">
              {order.deliverySummary}
            </p>
          ) : null}
        </div>
      </div>
      {isOwnListing ? (
        <p className="font-sans text-[11px] text-[#8A8680] px-1">
          這是您的掛單，無法對自己的商品出價
        </p>
      ) : null}
    </div>
  );
}
