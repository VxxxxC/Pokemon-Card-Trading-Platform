"use client";

import { useEffect, useState, useSyncExternalStore, use } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import {
  getCheckoutPaymentStatus,
  loadCheckoutSession,
} from "@/app/actions/checkout";
import { CheckoutProductCard } from "@/app/checkout/[id]/components/CheckoutProductCard";
import type { CheckoutSession } from "@/lib/checkout/types";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

const ESCROW_POLL_INTERVAL_MS = 2000;
const ESCROW_POLL_MAX_ATTEMPTS = 8;

interface SuccessPageProps {
  params: Promise<{ id: string }>;
}

export default function CheckoutSuccessPage({ params }: SuccessPageProps) {
  const resolvedParams = use(params);
  const paramsId = resolvedParams.id;

  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      const sessionResult = await loadCheckoutSession(paramsId);
      if (cancelled) {
        return;
      }

      if (!sessionResult.success) {
        setLoadError(sessionResult.error);
        setIsLoading(false);
        return;
      }

      setSession(sessionResult.data);

      const statusResult = await getCheckoutPaymentStatus(paramsId);
      if (cancelled) {
        return;
      }

      if (statusResult.success) {
        setIsPaid(statusResult.data.isPaid);
      }

      setIsLoading(false);
      attempts += 1;

      const stillWaiting =
        statusResult.success &&
        !statusResult.data.isPaid &&
        attempts < ESCROW_POLL_MAX_ATTEMPTS;

      if (stillWaiting) {
        timer = setTimeout(poll, ESCROW_POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [paramsId]);

  if (!isMounted || isLoading) {
    return (
      <div className="min-h-screen bg-[#17130f] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#17130f] text-[#eae1da] flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-sans text-[14px] text-text-secondary">
          {loadError ?? "找不到此訂單"}
        </p>
        <Link
          href="/profile/user/trading"
          className="h-11 px-5 rounded-xl bg-brand text-[#1A1612] font-sans font-bold text-[13.5px] flex items-center focus:outline-none"
        >
          前往交易管理
        </Link>
      </div>
    );
  }

  const orderReference = session.orderNumber ?? session.orderId;
  const isMerchant = session.orderKind === "merchant";
  const isAuthVariant =
    session.variant === "merchant_auth" || session.variant === "member_auth";

  const statusTitle = isPaid ? "付款成功" : "付款處理中";
  const statusDescription = isPaid
    ? isMerchant
      ? "資金已進入平台託管，可於交易管理追蹤後續流程。"
      : "平台已託管款項，請依指引將卡牌寄往平台倉庫。"
    : "已收到付款指令，正在等待金流確認並鎖定託管。";

  return (
    <div className="min-h-screen bg-[#17130f] text-[#eae1da] p-4 lg:p-8">
      <div className="mx-auto w-full max-w-2xl space-y-4 pb-24 pt-4 sm:pt-8 animate-fadeIn">
        <section className="rounded-lg border border-white/[0.08] bg-bg-card/20 p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div
              className={`flex size-11 shrink-0 items-center justify-center rounded-full border ${
                isPaid
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-brand/30 bg-brand/10 text-brand"
              }`}
            >
              <ShieldCheck className="size-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 space-y-1">
              <h1 className="font-sans text-[18px] font-bold leading-tight text-text-primary sm:text-[20px]">
                {statusTitle}
              </h1>
              <p className="font-sans text-[12px] leading-relaxed text-text-secondary">
                {statusDescription}
              </p>
              <p className="font-mono text-[11px] text-text-disabled">
                交易結單號碼 {orderReference}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-white/[0.08] bg-bg-card/20 p-4 space-y-3">
          <h2 className={SECTION_TITLE_CLASS}>
            訂單明細
          </h2>

          <CheckoutProductCard session={session} compact />

          <div className="space-y-2 border-t border-white/[0.06] pt-3 font-mono text-[12px] text-text-secondary">
            <div className="flex justify-between gap-3">
              <span>付款總額</span>
              <span className="font-semibold text-brand">
                HK$ {session.pricing.totalAmount.toLocaleString("zh-HK")}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>鑑定服務</span>
              <span
                className={
                  isAuthVariant ? "font-sans text-success" : "text-text-disabled"
                }
              >
                {isAuthVariant ? "已啟用" : "未加購"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>交易類型</span>
              <span className="text-text-primary">
                {isMerchant ? "認證商戶交易" : "會員交易"}
              </span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/profile/user/orderDetail/${session.orderId}`}
            className="flex h-9 w-full items-center justify-center rounded-lg bg-brand text-[12px] font-semibold text-[#1A1612] transition-all hover:bg-brand-hover active:scale-[0.98] focus:outline-none"
          >
            查看訂單
          </Link>
          <Link
            href="/profile/user/trading"
            className="flex h-9 w-full items-center justify-center rounded-lg border border-white/10 bg-[#17130f] text-[12px] font-medium text-text-secondary transition-all hover:border-brand/30 hover:text-brand active:scale-[0.98] focus:outline-none"
          >
            交易管理
          </Link>
        </div>
      </div>
    </div>
  );
}
