"use client";

import { useState, useEffect, useRef, type UIEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { trackListingView } from "@/lib/listings/track-listing-view";
import { Switch } from "@/components/ui/switch";
import { BUYER_AUTH_DISABLED_COPY, buildBuyerAuthAddOnDescription } from "@/lib/listings/auth-service-copy";
import { usePlatformAuthFee } from "@/lib/platform/use-platform-auth-fee";
import { useUIStore } from "@/app/store/useUIStore";
import { useMarketplaceListingDetail } from "@/app/lib/hooks/useMarketplaceListingDetail";
import { useCurrentUserId } from "@/app/lib/hooks/useCurrentUserId";
import { ImageViewer } from "@/app/components/shared/ImageViewer";
import { ProfileAvatar } from "@/app/components/profile/ProfileAvatar";
import { CertifiedMerchantBadge } from "@/app/components/profile/CertifiedMerchantBadge";
import { SellerReputationMeta } from "@/lib/marketplace/seller-reputation-meta";
import { ExecutionActionFooter } from "@/app/components/transactions/ExecutionActionFooter";
import {
  formatTradeGradeLabel,
} from "@/lib/marketplace/listing-display";
import {
  resolveSellerProfilePath,
} from "@/lib/marketplace/seller-identity";
import { isSealedProductGrade } from "@/lib/catalog/item-kind";
import {
  type SellOrder,
  type UnifiedProductSpec,
} from "@/app/lib/mock-data/cards";

interface ExecutionSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  listingId: string | null;
  order: SellOrder | null;
  card: UnifiedProductSpec;
  productId: string;
}

export function ExecutionSlideOver({
  isOpen,
  onClose,
  listingId,
  order,
  card,
  productId,
}: ExecutionSlideOverProps) {
  const [useAuthentication, setUseAuthentication] = useState(false);
  const authServiceFeeHkd = usePlatformAuthFee();

  // ImageViewer integration states
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const userAuthRole = useUIStore((state) => state.userAuthRole);
  const isGuest = userAuthRole === "GUEST";
  const currentUserId = useCurrentUserId();
  const isOwnListing =
    currentUserId != null &&
    order != null &&
    order.sellerId === currentUserId;

  const {
    detail,
    isLoading: isDetailLoading,
    error: detailError,
  } = useMarketplaceListingDetail({
    listingId,
    enabled: isOpen && listingId != null,
  });

  const lastViewedListingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      queueMicrotask(() => setIsHeaderCompact(false));
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !listingId || isOwnListing) {
      lastViewedListingIdRef.current = null;
      return;
    }

    if (lastViewedListingIdRef.current === listingId) {
      return;
    }

    lastViewedListingIdRef.current = listingId;
    trackListingView({
      listingId,
      sellerId: order?.sellerId,
      currentUserId,
    });
  }, [isOpen, listingId, isOwnListing, order?.sellerId, currentUserId]);

  useEffect(() => {
    if (isOpen && order) {
      queueMicrotask(() => {
        setUseAuthentication(false);
      });
    }
  }, [isOpen, listingId, order]);

  useEffect(() => {
    if (detail?.useAuthentication === false) {
      queueMicrotask(() => setUseAuthentication(false));
    }
  }, [detail?.useAuthentication]);

  useEffect(() => {
    if (!isOpen) return;

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", onDocumentKeyDown);
    closeButtonRef.current?.focus();

    const panel = panelRef.current;
    if (!panel) {
      return () => document.removeEventListener("keydown", onDocumentKeyDown);
    }

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onPanelKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener("keydown", onPanelKeyDown);

    return () => {
      document.removeEventListener("keydown", onDocumentKeyDown);
      panel.removeEventListener("keydown", onPanelKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !order || !listingId) {
    return null;
  }

  const listingImages = detail?.images ?? [];
  const images = listingImages;
  const remarks = detail?.imagesDetail?.map((img) => img.remark) ?? [];

  const sellerDisplayName =
    detail?.sellerDisplayName?.trim() || order.sellerName?.trim() || "賣家";
  const sellerUsername = detail?.sellerUsername ?? order.sellerUsername ?? null;
  const sellerProfileHref = resolveSellerProfilePath({
    sellerId: order.sellerId,
    sellerUsername,
    sellerPersona: order.sellerPersona,
  });

  const sellerDescription = detail?.sellerDescription?.trim() ?? "";

  const gradeBadgeLabel = (() => {
    const { authority, score } = order.customGrade;
    if (authority === "Raw Card") {
      return formatTradeGradeLabel("RAW", score || "A");
    }
    return formatTradeGradeLabel(authority, score || null);
  })();

  const handleScrollBody = (event: UIEvent<HTMLDivElement>) => {
    setIsHeaderCompact(event.currentTarget.scrollTop > 36);
  };

  const listingAcceptsBuyerAuth = detail?.useAuthentication !== false;
  const isSealedListing =
    detail != null &&
    isSealedProductGrade(detail.gradingCompany, detail.gradingScore);

  return (
    <div className="fixed inset-0 z-[400] flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Panel — Right-Side Full-Height Slide-over Drawer */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${card.name} 交易面板`}
        className="relative z-10 w-full max-w-md bg-[#2e2925] border-l border-white/[0.08] flex flex-col h-screen h-[100dvh] shadow-[0_0_50px_rgba(0,0,0,0.85)] translate-x-0 transition-transform duration-300 ease-out rounded-none"
        style={{ height: "100dvh" }}
      >
        {/* Header Section (Fixed, Top) */}
        <div
          className={`px-4 border-b border-white/[0.07] flex items-center gap-2 shrink-0 bg-[#26211C] ${
            isHeaderCompact ? "py-2" : "py-2.5"
          }`}
        >
          <div className="min-w-0 flex-1 flex items-center gap-2">
            {isHeaderCompact ? (
              <p className="font-sans font-bold text-[13px] text-[#eae1da] truncate min-w-0">
                {card.name}
                {gradeBadgeLabel ? (
                  <span className="text-[#8A8680] font-mono text-[11px] font-semibold">
                    {" "}
                    · {gradeBadgeLabel}
                  </span>
                ) : null}
                <span className="font-mono text-brand">
                  {" "}
                  · HK$ {order.price.toLocaleString("en-HK")}
                </span>
              </p>
            ) : (
              <>
                <h2 className="font-sans font-bold text-[15px] text-[#eae1da] truncate min-w-0">
                  {card.name}
                </h2>
                {gradeBadgeLabel ? (
                  <span
                    className="shrink-0 max-w-[40%] truncate font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/10 bg-[#17130f] text-[#d4c4b7]"
                  >
                    {gradeBadgeLabel}
                  </span>
                ) : null}
              </>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="關閉交易面板"
            className="size-8 shrink-0 rounded-lg border border-white/[0.06] bg-[#17130f] hover:bg-[#2c2722] flex items-center justify-center transition-colors cursor-pointer text-[#8A8680] hover:text-brand focus:outline-none"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {/* Dynamic Scrollable Body Content / Lock Wrapper */}
        <div className="relative flex-1 overflow-hidden bg-[#231e1a]/40 flex flex-col min-h-0">
          {isGuest && (
            <div className="absolute inset-0 bg-[#2e2925]/75 backdrop-blur-lg z-40 flex flex-col items-center justify-center p-6 text-center select-none animate-fadeIn">
              <span className="text-[32px] mb-4">⚠️</span>
              <p className="font-sans font-bold text-[15px] text-[#eae1da] mb-2">
                您目前正以遊客身份觀盤
              </p>
              <p className="font-sans text-[12.5px] text-text-secondary mb-5 max-w-[280px]">
                登入後即可議價或立即購買此掛單。
              </p>
              <Link
                href={`/auth?redirect=${encodeURIComponent(`/marketplace/product/${productId}`)}`}
                onClick={onClose}
                className="w-full h-11 bg-brand text-[#1A1612] font-sans font-bold text-[13px] rounded-xl hover:bg-[#e8b896] active:scale-[0.98] transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 focus:outline-none"
              >
                登入 / 註冊
              </Link>
            </div>
          )}

          {/* Inner Scrollable Body Content */}
          <div
            ref={scrollBodyRef}
            onScroll={handleScrollBody}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-none min-h-0"
          >
            <div className="rounded-lg border border-white/[0.08] bg-[#17130f] p-3">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={sellerProfileHref}
                  onClick={onClose}
                  aria-label={`查看 ${sellerDisplayName} 的個人檔案`}
                  className="flex items-start gap-2.5 min-w-0 group focus:outline-none"
                >
                  <ProfileAvatar
                    avatarUrl={order.sellerAvatarUrl}
                    displayName={sellerDisplayName}
                    className="size-9 shrink-0 border border-white/10"
                    fallbackClassName="bg-[#26211C] text-brand text-xs font-bold font-mono"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-sans font-semibold text-[13px] text-[#eae1da] truncate">
                        {sellerDisplayName}
                      </span>
                      {order.sellerPersona === "merchant" ? (
                        <CertifiedMerchantBadge />
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                      <SellerReputationMeta
                        rating={order.sellerRating}
                        reviewCount={order.reviewCount}
                        totalTrades={order.sellerTotalTrades}
                      />
                      <span className="font-sans text-[11px] text-brand shrink-0 group-hover:underline">
                        查看個人檔案 →
                      </span>
                    </div>
                    {order.deliverySummary ? (
                      <p className="font-mono text-[10px] text-[#8A8680] mt-1 truncate">
                        {order.deliverySummary}
                      </p>
                    ) : null}
                  </div>
                </Link>
                <div className="text-right shrink-0">
                  <span className="font-mono text-[10px] text-[#8A8680] block">
                    掛牌售價
                  </span>
                  <span className="font-mono font-black text-[18px] text-brand leading-none">
                    HK$ {order.price.toLocaleString("en-HK")}
                  </span>
                </div>
              </div>

              <div className="mt-2.5 space-y-1.5 border-t border-white/[0.06] pt-2.5">
                {sellerDescription ? (
                  <div className="space-y-0.5">
                    <p className="font-sans font-semibold text-[11px] text-[#eae1da]">
                      商品描述
                    </p>
                    <p className="font-sans text-[11px] text-text-secondary leading-snug whitespace-pre-wrap break-words">
                      {sellerDescription}
                    </p>
                  </div>
                ) : null}
                <p className="font-mono text-[9px] text-[#8A8680] leading-tight break-all">
                  <span className="text-[#8A8680]/80">上架序號 </span>
                  {listingId}
                </p>
              </div>
            </div>

            <div className="w-full select-none">
              <span className="font-sans font-semibold text-[12px] text-[#eae1da] block mb-2">
                賣家實物照
                <span className="text-[#8A8680] font-normal">
                  （{isDetailLoading ? "…" : images.length}）
                </span>
              </span>
              {isDetailLoading ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {Array.from({ length: 6 }, (_, idx) => (
                    <div
                      key={idx}
                      className="aspect-[3/4] rounded-lg bg-[#120f0c] border border-white/5 animate-pulse"
                    />
                  ))}
                </div>
              ) : detailError ? (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                  {detailError}
                </p>
              ) : images.length === 0 ? (
                <p className="rounded-lg border border-white/10 bg-[#120f0c] px-3 py-4 text-center text-[12px] text-[#8A8680]">
                  此掛單暫無賣家實物照
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {images.map((img, idx) => {
                    const remarkText = remarks[idx];
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setViewerIndex(idx);
                          setIsViewerOpen(true);
                        }}
                        className="relative aspect-[3/4] rounded-lg overflow-hidden bg-[#120f0c] border border-white/5 cursor-zoom-in"
                      >
                        <Image
                          src={img}
                          alt={`${card.name} 實物照 ${idx + 1}`}
                          fill
                          sizes="(max-width: 640px) 28vw, 120px"
                          className="object-cover hover:scale-105 transition-transform duration-300"
                          unoptimized
                        />
                        {remarkText && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/75 backdrop-blur-xs py-0.5 px-1 text-center border-t border-white/5 pointer-events-none select-none">
                            <p className="font-sans text-[9px] text-[#eae1da] truncate font-bold leading-normal">
                              {remarkText}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {!isSealedListing ? (
            <div className="rounded-lg border border-white/[0.08] bg-[#17130f] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <span className="font-sans font-semibold text-[12px] text-[#eae1da] block">
                    加購平台鑑定託管
                  </span>
                  <p className="font-sans text-[11px] text-text-secondary leading-snug">
                    {listingAcceptsBuyerAuth
                      ? buildBuyerAuthAddOnDescription(authServiceFeeHkd)
                      : BUYER_AUTH_DISABLED_COPY}
                  </p>
                </div>
                <Switch
                  checked={useAuthentication}
                  onCheckedChange={setUseAuthentication}
                  disabled={!listingAcceptsBuyerAuth || isDetailLoading}
                  className="shrink-0 data-checked:bg-brand data-unchecked:bg-[#39342f] disabled:opacity-40"
                />
              </div>
            </div>
            ) : null}
          </div>

          {/* Bottom Action Footer Container */}
          <ExecutionActionFooter
            listingId={listingId}
            order={order}
            card={card}
            productId={productId}
            onComplete={onClose}
            useAuthentication={useAuthentication}
            onUseAuthenticationChange={setUseAuthentication}
          />
        </div>
      </div>

      <ImageViewer
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        images={images}
        remarks={remarks}
        initialIndex={viewerIndex}
      />
    </div>
  );
}
