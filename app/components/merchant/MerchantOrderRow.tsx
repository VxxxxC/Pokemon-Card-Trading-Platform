"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  SaleOrder,
  OrderStatus,
  STATUS_STEP_INDEX,
} from "@/app/lib/types/trading";
import { ESCROW_STEPS } from "@/app/lib/types/rbac";

interface MerchantOrderRowProps {
  order: SaleOrder;
  variant?: "default" | "embedded";
}

function OrderStatusBadge({
  status,
  labelOverride,
}: {
  status: OrderStatus;
  labelOverride?: string;
}) {
  const stepIdx =
    STATUS_STEP_INDEX[status as Exclude<OrderStatus, "cancelled">];
  const step = stepIdx !== undefined ? ESCROW_STEPS[stepIdx] : null;
  const colorMap: Record<OrderStatus, string> = {
    payment: "text-warning bg-[rgba(239,68,68,0.10)] border border-warning/10",
    custody: "text-brand bg-[rgba(212,165,116,0.12)] border border-brand/10",
    shipped:
      "text-[#3b9eff] bg-[rgba(59,158,255,0.12)] border border-[#3b9eff]/10",
    grading: "text-success bg-[rgba(16,185,129,0.12)] border border-success/10",
    released: "text-text-secondary bg-bg-elevated border border-white/5",
    cancelled: "text-text-disabled bg-bg-elevated border border-white/5",
  };
  return (
    <span
      className={cn(
        "font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full",
        colorMap[status] ?? "text-text-disabled bg-bg-elevated",
      )}
    >
      {status === "cancelled"
        ? "已取消"
        : (labelOverride ?? step?.label ?? status)}
    </span>
  );
}

export function MerchantOrderRow({
  order,
  variant = "default",
}: MerchantOrderRowProps) {
  const router = useRouter();

  if (variant === "embedded") {
    return (
      <div
        onClick={() => router.push("/profile/merchant/orderDetail/" + order.id)}
        className="flex items-center gap-2.5 py-2.5 px-3 cursor-pointer transition-colors hover:bg-bg-elevated/40 border-b border-[rgba(237,232,224,0.06)] last:border-b-0 animate-fadeIn"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <OrderStatusBadge
              status={order.status}
              labelOverride={order.statusLabelOverride}
            />
          </div>
          <div className="flex items-center gap-1.5 min-w-0 mt-1">
            <span className="text-[13px] font-semibold text-text-primary truncate">
              {order.cardName}
            </span>
            <span className="font-sans text-[9px] font-bold text-brand bg-brand/5 border border-brand/20 px-1 py-0.5 rounded shrink-0">
              {order.grade}
            </span>
          </div>
          <p className="font-mono text-[10px] text-text-disabled truncate mt-0.5">
            買家：{order.buyerName} · #{order.orderNumber ?? order.id}
          </p>
        </div>
        <span className="font-mono text-[13px] font-bold text-brand shrink-0 tabular-nums">
          HK$ {order.amount.toLocaleString("zh-TW")}
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={() => router.push("/profile/merchant/orderDetail/" + order.id)}
      className="flex items-center justify-between py-3 px-4 bg-bg-card hover:bg-bg-elevated border border-[rgba(237,232,224,0.08)] rounded-xl cursor-pointer transition-all duration-200 animate-fadeIn"
    >
      {/* Left side: Card Name + Badges + Sub context */}
      <div className="flex flex-col gap-1 min-w-0 flex-1 pr-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-[14.5px] font-bold text-text-primary truncate max-w-[160px] sm:max-w-xs md:max-w-md">
            {order.cardName}
          </h3>
          <OrderStatusBadge
            status={order.status}
            labelOverride={order.statusLabelOverride}
          />
          <span className="font-sans text-[10px] font-black text-brand bg-brand/5 border border-brand/20 px-1.5 py-0.5 rounded">
            {order.grade}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-text-disabled">
          <span className="text-[12px] text-text-secondary font-medium">
            買家：{order.buyerName}
          </span>
          <span className="hidden sm:inline text-white/5">|</span>
          <span className="text-[11px] font-mono tracking-tight text-brand">
            訂單編號: #{order.orderNumber ?? order.id}
          </span>
        </div>
      </div>

      {/*  Price Button */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <span className="text-[15.5px] font-mono font-black text-brand block">
            HK$ {order.amount.toLocaleString("zh-TW")}
          </span>
        </div>
      </div>
    </div>
  );
}
