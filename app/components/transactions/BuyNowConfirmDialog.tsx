"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { buyNowListing } from "@/app/actions/buy-now";
import type { MarketplaceListing } from "@/app/components/marketplace/MarketplaceCard";
import { GradeBadge } from "@/app/components/cards/GradeBadge";
import { useMarketplaceListingDetail } from "@/app/lib/hooks/useMarketplaceListingDetail";
import { completeBuyNowFlow } from "@/lib/chat/complete-buy-now-flow";
import { BUYER_AUTH_DISABLED_COPY } from "@/lib/listings/auth-service-copy";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Lock } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

export const BUY_NOW_GUEST_LOCK_COPY = {
  eyebrow: "訪客模式",
  title: "登入後方可交易",
  description:
    "訪客模式僅供瀏覽。登入會員帳戶後，即可使用託管付款、即時議價及第三方鑑定服務。",
  primaryCta: "登入或註冊",
  secondaryCta: "稍後再說",
} as const;

export type BuyNowConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: MarketplaceListing | null;
  onNegotiate?: () => void;
};

export function BuyNowConfirmDialog({
  open,
  onOpenChange,
  listing,
}: BuyNowConfirmDialogProps) {
  const router = useRouter();
  const listingId = listing?.id?.trim() ?? null;
  const [useAuthentication, setUseAuthentication] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { detail } = useMarketplaceListingDetail({
    listingId,
    enabled: open && listingId != null,
  });

  const listingAcceptsAuth = detail?.useAuthentication !== false;
  const showAuthToggle = listingAcceptsAuth;

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setUseAuthentication(false);
        setIsSubmitting(false);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  const handleConfirm = useCallback(async () => {
    if (!listingId || !listing || isSubmitting) {
      return;
    }

    if (useAuthentication && !listingAcceptsAuth) {
      toast.error(BUYER_AUTH_DISABLED_COPY);
      return;
    }

    setIsSubmitting(true);
    const result = await buyNowListing(listingId, useAuthentication);
    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    const flow = completeBuyNowFlow(result.data, router);
    handleDialogOpenChange(false);

    if (flow === "checkout") {
      toast.success("🧾 交易已成立", {
        description: "請於結帳頁完成託管付款。",
        duration: 4000,
      });
      return;
    }

    toast.success("🧾 交易已成立", {
      description: "已為您開啟與賣家的安全對話，請於對話中完成後續交收步驟。",
      duration: 4000,
    });
  }, [
    isSubmitting,
    listing,
    listingAcceptsAuth,
    listingId,
    handleDialogOpenChange,
    useAuthentication,
    router,
  ]);

  if (!listing) {
    return null;
  }

  const displayName =
    listing.name?.trim() ||
    listing.nameZh?.trim() ||
    listing.nameJa?.trim() ||
    "未知商品";

  const deliverySummary =
    detail?.deliverySummary ?? listing.deliverySummary ?? null;
  const isMerchantListing = listing.sellerPersona === "merchant";
  const sellerHandle = detail?.sellerUsername?.trim();
  const confirmHint = isMerchantListing
    ? "確認後前往託管結帳，並保留與賣家的對話紀錄。"
    : "確認後自動成交並開啟與賣家的聊天視窗。";

  return (
    <AlertDialog open={open} onOpenChange={handleDialogOpenChange}>
      <AlertDialogContent
        className="max-w-[min(100vw-2rem,340px)] gap-3 rounded-2xl border border-[rgba(237,232,224,0.10)] bg-[#26211C] p-4 text-[#eae1da] ring-0"
      >
        <AlertDialogHeader className="text-left space-y-0.5">
          <AlertDialogTitle className="text-[16px] font-black tracking-tight">
            確認立即購買
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[12px] leading-snug text-[#8A8680]">
            一口價成交，無需等待賣家接受出價。{confirmHint}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-[#17130f] overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-brand/[0.06] border-b border-white/5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#8A8680]">
              應付一口價
            </span>
            <span className="font-mono font-black text-[22px] text-brand leading-none tabular-nums">
              HK$ {listing.price.toLocaleString("en-HK")}
            </span>
          </div>

          <div className="flex gap-2.5 p-3 min-w-0">
            {listing.image ? (
              <div className="relative w-12 aspect-5/7 shrink-0 rounded-md overflow-hidden bg-[#26211C]">
                <Image
                  src={listing.image}
                  alt={displayName}
                  fill
                  className="object-contain"
                  sizes="48px"
                />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="font-sans font-bold text-[13px] text-[#eae1da] leading-snug line-clamp-2">
                {displayName}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <GradeBadge
                  authority={listing.grade.authority}
                  score={listing.grade.score}
                />
              </div>
              <p className="mt-1.5 font-mono text-[10px] text-[#8A8680] truncate">
                <span className="text-[#d4c4b7]">{listing.seller}</span>
                {sellerHandle ? (
                  <span className="text-[#6f6a62]"> · @{sellerHandle}</span>
                ) : null}
              </p>
            </div>
          </div>

          {deliverySummary ? (
            <p className="px-3 pb-3 font-mono text-[10px] text-[#8A8680] border-t border-white/5 pt-2">
              {deliverySummary}
            </p>
          ) : null}
        </div>

        {showAuthToggle ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#17130f] px-3 py-2">
            <span className="text-[12px] font-semibold text-[#eae1da]">
              加購平台鑑定服務
            </span>
            <Switch
              checked={useAuthentication}
              onCheckedChange={setUseAuthentication}
            />
          </div>
        ) : null}

        <AlertDialogFooter
          className="!mx-0 !mb-0 !border-0 !bg-transparent !p-0 flex-row gap-2 sm:flex-row sm:space-x-0"
        >
          <AlertDialogAction
            type="button"
            disabled={isSubmitting}
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            className="h-11 flex-1 rounded-xl bg-brand font-black text-[#1A1612] hover:bg-[#e8b896] disabled:opacity-60"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="size-4" />
                處理中…
              </span>
            ) : (
              "確認立即購買"
            )}
          </AlertDialogAction>

          <AlertDialogCancel
            disabled={isSubmitting}
            className="h-11 flex-1 rounded-xl border border-white/10 bg-[#17130f] text-[12px] font-medium text-[#d4c4b7] hover:bg-[#2c2722] hover:text-[#eae1da] mt-0"
          >
            取消
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export type BuyNowGuestLockDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectPath: string;
};

export function BuyNowGuestLockDialog({
  open,
  onOpenChange,
  redirectPath,
}: BuyNowGuestLockDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[22rem] gap-0 overflow-hidden rounded-xl border border-[rgba(237,232,224,0.12)] bg-bg-card p-0 text-text-primary shadow-[0_12px_40px_rgba(0,0,0,0.55)] ring-1 ring-brand/20">
        <div className="border-b border-[rgba(237,232,224,0.08)] bg-bg-elevated/40 px-5 pt-5 pb-4">
          <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-brand/25 bg-brand/10">
            <Lock className="size-[18px] text-brand" strokeWidth={2.25} aria-hidden />
          </div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
            {BUY_NOW_GUEST_LOCK_COPY.eyebrow}
          </p>
          <AlertDialogHeader className="mt-2 place-items-start gap-1.5 p-0 text-left">
            <AlertDialogTitle className="font-sans text-[17px] font-semibold leading-snug tracking-tight text-text-primary">
              {BUY_NOW_GUEST_LOCK_COPY.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] leading-[1.55] text-text-secondary">
              {BUY_NOW_GUEST_LOCK_COPY.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>
        <AlertDialogFooter className="!mx-0 !mb-0 flex flex-col items-stretch gap-3 border-0 bg-transparent px-5 pt-4 pb-5 sm:flex-col">
          <AlertDialogAction
            className="h-11 w-full rounded-lg border-0 bg-brand font-sans text-[13px] font-bold text-[#1A1612] shadow-[0_4px_16px_rgba(212,165,116,0.35)] ring-1 ring-brand/40 transition-all hover:bg-brand-hover hover:shadow-[0_6px_20px_rgba(212,165,116,0.45)] active:scale-[0.98]"
            render={
              <Link
                href={`/auth?redirect=${encodeURIComponent(redirectPath)}`}
                className="inline-flex h-11 w-full items-center justify-center"
              />
            }
          >
            {BUY_NOW_GUEST_LOCK_COPY.primaryCta}
          </AlertDialogAction>
          <AlertDialogCancel
            variant="ghost"
            className="mx-auto mt-0 h-auto w-auto border-0 bg-transparent px-2 py-1 font-sans text-[12px] font-medium text-text-disabled hover:bg-transparent hover:text-text-secondary"
          >
            {BUY_NOW_GUEST_LOCK_COPY.secondaryCta}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
