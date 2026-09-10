"use client";

import { memo } from "react";
import Link from "next/link";
import { AlertTriangle, CircleX } from "lucide-react";
import { useHkCardVaultStore } from "@/app/store/useHkCardVaultStore";
import { SYSTEM_ORDER_CANCELLED_TEXT } from "@/app/lib/chat/offerSystemMessageCopy";
import { ChatInlineIconText } from "./ChatInlineIconText";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type SystemOrderCancelledMessageProps = {
  orderId?: string;
  orderKind?: "member" | "merchant";
  partnerName?: string;
};

function SystemOrderCancelledMessageComponent({
  orderId,
  orderKind = "member",
  partnerName,
}: SystemOrderCancelledMessageProps) {
  const setIsChatOpen = useHkCardVaultStore((state) => state.setIsChatOpen);

  const orderDetailHref =
    orderId
      ? orderKind === "merchant"
        ? `/profile/user/orderDetail/${orderId}`
        : `/profile/user/orderDetail/${orderId}`
      : null;

  return (
    <Card className="my-2 w-full gap-0 overflow-hidden border border-error/20 bg-[#1A1612] py-0 font-sans text-[12.5px]">
      <CardHeader className="flex flex-row items-start justify-between gap-2 border-b border-white/5 px-3 py-2.5">
        <div className="space-y-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-error/90">
            <ChatInlineIconText icon={AlertTriangle}>
              交易取消通知
            </ChatInlineIconText>
          </p>
          <CardTitle className="text-[13px] font-black text-[#eae1da]">
            此筆訂單已終止
          </CardTitle>
        </div>
        <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold text-text-disabled bg-white/5 border border-white/10">
          ● 已取消
        </span>
      </CardHeader>

      <CardContent className="space-y-2 px-3 py-2.5">
        <div className="rounded-md border border-error/20 bg-[#17130f] px-2.5 py-1.5">
          <p className="text-[11px] font-medium leading-snug text-text-secondary">
            <ChatInlineIconText icon={CircleX} iconClassName="text-error/90">
              {SYSTEM_ORDER_CANCELLED_TEXT}
              {partnerName ? (
                <>
                  {" "}
                  與{" "}
                  <span className="font-bold text-[#eae1da]">{partnerName}</span>{" "}
                  的議價交易已結束，商品已解除鎖定。
                </>
              ) : (
                " 商品已解除鎖定，款項將依平台規則處理。"
              )}
            </ChatInlineIconText>
          </p>
        </div>
      </CardContent>

      {orderDetailHref ? (
        <CardFooter className="flex flex-wrap gap-2 border-t border-white/5 bg-transparent px-3 py-2.5">
          <Link
            href={orderDetailHref}
            onClick={() => setIsChatOpen(false)}
            className="inline-flex h-8 items-center rounded-lg border border-white/10 bg-[#17130f] px-3 text-[11px] font-bold text-text-secondary hover:text-brand"
          >
            查看訂單詳情
          </Link>
          <Link
            href="/profile/user/trading"
            onClick={() => setIsChatOpen(false)}
            className="inline-flex h-8 items-center rounded-lg border border-white/10 bg-transparent px-3 text-[11px] font-bold text-text-disabled hover:text-text-secondary"
          >
            我的訂單
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  );
}

export const SystemOrderCancelledMessage = memo(
  SystemOrderCancelledMessageComponent,
);
