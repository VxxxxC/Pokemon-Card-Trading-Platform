"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hourglass } from "lucide-react";
import { toast } from "sonner";
import { buyNowListing } from "@/app/actions/buy-now";
import {
  getBuyerPendingOfferForListing,
  makeOffer,
} from "@/app/actions/offers";
import { getCurrentUserProfile } from "@/app/actions/profile";
import { useMarketplaceListingDetail } from "@/app/lib/hooks/useMarketplaceListingDetail";
import { useCurrentUserId } from "@/app/lib/hooks/useCurrentUserId";
import { useIsMemberPersonaActive } from "@/app/lib/hooks/useIsMemberPersonaActive";
import { useHkCardVaultStore } from "@/app/store/useHkCardVaultStore";
import { useUIStore } from "@/app/store/useUIStore";
import { completeBuyNowFlow } from "@/lib/chat/complete-buy-now-flow";
import { SELF_OFFER_ERROR_MESSAGE } from "@/lib/auth/dual-persona";
import { MERCHANT_BUYER_PERSONA_HINT } from "@/lib/auth/member-persona-features";
import { switchToMemberPersonaForBuyerAction } from "@/lib/auth/switch-to-member-persona-for-buyer-action";
import { isSealedProductGrade } from "@/lib/catalog/item-kind";
import { buildSellerListingDetailHref } from "@/lib/marketplace/listing-detail-href";
import { usePlatformAuthFee } from "@/lib/platform/use-platform-auth-fee";
import type {
  SellOrder,
  UnifiedProductSpec,
} from "@/app/lib/mock-data/cards";

type ExecutionActionFooterProps = {
  listingId: string;
  order: SellOrder;
  card: UnifiedProductSpec;
  productId: string;
  onComplete?: () => void;
  layout?: "embedded" | "sticky";
  useAuthentication?: boolean;
  onUseAuthenticationChange?: (value: boolean) => void;
};

export function ExecutionActionFooter({
  listingId,
  order,
  card,
  productId,
  onComplete,
  layout = "embedded",
  useAuthentication: useAuthenticationProp,
  onUseAuthenticationChange,
}: ExecutionActionFooterProps) {
  const router = useRouter();
  const priceInputId = "exe-negotiation-price";
  const [customPrice, setCustomPrice] = useState("");
  const [internalUseAuthentication, setInternalUseAuthentication] =
    useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBuyingNow, setIsBuyingNow] = useState(false);
  const [pendingOffer, setPendingOffer] = useState<{
    offerId: string;
    offerPrice: number;
  } | null>(null);
  const [isPendingOfferLoading, setIsPendingOfferLoading] = useState(false);
  const authServiceFeeHkd = usePlatformAuthFee();

  const useAuthentication = useAuthenticationProp ?? internalUseAuthentication;
  const setUseAuthentication =
    onUseAuthenticationChange ?? setInternalUseAuthentication;

  const userAuthRole = useUIStore((state) => state.userAuthRole);
  const isGuest = userAuthRole === "GUEST";
  const isMemberPersonaActive = useIsMemberPersonaActive();
  const currentUserId = useCurrentUserId();
  const isOwnListing =
    currentUserId != null && order.sellerId === currentUserId;

  const openOfferChatSession = useHkCardVaultStore(
    (state) => state.openOfferChatSession,
  );

  const { detail } = useMarketplaceListingDetail({
    listingId,
    enabled: listingId.length > 0,
  });

  useEffect(() => {
    setCustomPrice("");
    setPendingOffer(null);
    if (onUseAuthenticationChange == null) {
      setInternalUseAuthentication(false);
    }
  }, [listingId, onUseAuthenticationChange]);

  useEffect(() => {
    if (!listingId || isGuest || isOwnListing) {
      setPendingOffer(null);
      return;
    }

    let cancelled = false;
    setIsPendingOfferLoading(true);

    void getBuyerPendingOfferForListing(listingId).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setPendingOffer(result.data);
      } else {
        setPendingOffer(null);
      }
      setIsPendingOfferLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [listingId, isGuest, isOwnListing]);

  useEffect(() => {
    if (detail?.useAuthentication === false) {
      setUseAuthentication(false);
    }
  }, [detail?.useAuthentication, setUseAuthentication]);

  const listingAcceptsBuyerAuth = detail?.useAuthentication !== false;
  const isSealedListing =
    detail != null &&
    isSealedProductGrade(detail.gradingCompany, detail.gradingScore);
  const authFeeApplied =
    useAuthentication && listingAcceptsBuyerAuth && !isSealedListing;
  const buyNowTotal = order.price + (authFeeApplied ? authServiceFeeHkd : 0);
  const canBuyNow = !isOwnListing && !isGuest;
  const showMerchantBuyerPersonaHint =
    !isGuest && !isOwnListing && !isMemberPersonaActive;

  const guestRedirectPath = buildSellerListingDetailHref(
    order.sellerId,
    listingId,
  );

  const handleBuyNow = async () => {
    if (!listingId) {
      toast.error("找不到此掛單");
      return;
    }

    setIsBuyingNow(true);
    const result = await buyNowListing(listingId, useAuthentication);
    setIsBuyingNow(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    const flow = completeBuyNowFlow(result.data, router);
    onComplete?.();

    if (flow === "checkout") {
      toast.success("🧾 交易已成立", {
        description: "請於結帳頁完成託管付款。",
      });
      return;
    }

    toast.success("🧾 交易已成立", {
      description: "已為您開啟與賣家的安全對話，請於對話中完成後續交收步驟。",
    });
  };

  const handleSendCounterOffer = async () => {
    if (!listingId) {
      toast.error("找不到此掛單");
      return;
    }

    if (isOwnListing) {
      toast.error(SELF_OFFER_ERROR_MESSAGE);
      return;
    }

    if (pendingOffer) {
      toast.error("您已有進行中的出價，請於聊天室等待賣家回應或修改出價。");
      return;
    }

    if (!customPrice || Number(customPrice) <= 0) {
      toast.error("⚠️ 請輸入有效的預期出價金額");
      return;
    }

    if (useAuthentication && !listingAcceptsBuyerAuth) {
      toast.error("此賣家不接受平台鑑定加購");
      return;
    }

    setIsSubmitting(true);

    try {
      const profileResult = await getCurrentUserProfile();
      if (!profileResult.success) {
        toast.error(profileResult.error);
        return;
      }

      const result = await makeOffer(
        listingId,
        Number(customPrice),
        useAuthentication,
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const { room, offer, message } = result.data;

      setPendingOffer({
        offerId: offer.id,
        offerPrice: Number(offer.offer_price),
      });

      switchToMemberPersonaForBuyerAction();

      openOfferChatSession({
        roomId: room.id,
        partnerId: order.sellerId,
        partnerName: order.sellerName,
        partnerPersona:
          room.seller_persona === "merchant" ? "merchant" : "member",
        buyerId: profileResult.data.id,
        buyerName: profileResult.data.displayName,
        sellerId: order.sellerId,
        sellerName: order.sellerName,
        cardName: card.name,
        cardId: productId,
        listingId,
        offerId: offer.id,
        offerPrice: offer.offer_price,
        listingImageUrls: detail?.images,
        imageUrl: detail?.images[0],
        modifiedCount:
          "modified_count" in offer ? Number(offer.modified_count) || 0 : 0,
        messageId: message.id,
        messageContent: message.content,
        messageCreatedAt: message.created_at ?? new Date().toISOString(),
        offerStatus: offer.status ?? "pending",
        useAuthentication: offer.use_authentication,
      });

      onComplete?.();

      toast.success("✉️ 議價要約已成功送出", {
        description: "交易協定已實時注入全域對話中樞，即刻為您開啟對話視窗！",
        duration: 4000,
      });
    } catch {
      toast.error("出價時發生錯誤，請稍後再試");
    } finally {
      setIsSubmitting(false);
    }
  };

  const footerInner = (
    <div className="px-4 py-2.5 border-t border-white/[0.07] bg-[#26211C] space-y-2">
      {showMerchantBuyerPersonaHint ? (
        <p className="font-sans text-[11px] leading-snug text-text-disabled">
          {MERCHANT_BUYER_PERSONA_HINT}
        </p>
      ) : null}
      {isGuest ? (
        <Link
          href={`/auth?redirect=${encodeURIComponent(guestRedirectPath)}`}
          className="flex h-9 w-full items-center justify-center rounded-lg bg-brand text-[#1A1612] font-sans font-bold text-[12px] hover:bg-brand-hover active:scale-[0.98] transition-all"
        >
          登入 / 註冊以出價或購買
        </Link>
      ) : isOwnListing ? (
        <p className="font-sans text-[11px] text-[#8A8680]">
          這是您的掛單，無法對自己的商品出價
        </p>
      ) : pendingOffer ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-brand/20 bg-[#17130f] px-3 py-2"
          role="status"
        >
          <Hourglass className="size-3.5 shrink-0 mt-0.5 text-brand/80" aria-hidden />
          <p className="font-sans text-[11px] leading-snug text-text-secondary">
            等待賣家回應中… 您的出價為{" "}
            <span className="font-mono font-bold text-brand">
              HK$ {pendingOffer.offerPrice.toLocaleString("en-HK")}
            </span>
            。請於聊天室修改出價或等待賣家處理。
          </p>
        </div>
      ) : (
        <div
          className="flex h-9 min-w-0 rounded-lg border border-white/[0.08] bg-[#17130f] overflow-hidden focus-within:border-brand/40 transition-colors"
        >
          <label htmlFor={priceInputId} className="sr-only">
            輸入理想價錢 (HK$)
          </label>
          <span className="px-2 font-mono text-[9px] font-bold text-[#8A8680] bg-[#26211C] border-r border-white/5 flex items-center shrink-0">
            HK$
          </span>
          <input
            id={priceInputId}
            type="number"
            value={customPrice}
            onChange={(e) => setCustomPrice(e.target.value)}
            placeholder="輸入理想價錢"
            disabled={isPendingOfferLoading}
            className="flex-1 min-w-0 h-full bg-transparent px-2 font-mono text-[13px] text-brand focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            disabled={
              isSubmitting ||
              isBuyingNow ||
              isPendingOfferLoading ||
              !listingId
            }
            onClick={() => void handleSendCounterOffer()}
            className="shrink-0 px-3 border-l border-white/[0.08] text-[#eae1da] font-sans font-semibold text-[12px] hover:bg-[#2c2722] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5 focus:outline-none disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="w-3.5 h-3.5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            ) : (
              "發送議價"
            )}
          </button>
        </div>
      )}
      {canBuyNow ? (
        <button
          type="button"
          disabled={isBuyingNow || isSubmitting || !listingId}
          onClick={() => void handleBuyNow()}
          className="w-full h-9 bg-brand text-[#1A1612] font-sans font-bold text-[12px] rounded-lg hover:bg-brand-hover active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5 focus:outline-none disabled:opacity-60"
        >
          {isBuyingNow ? (
            <div className="w-3.5 h-3.5 border-2 border-[#1A1612] border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span className="truncate">
                {authFeeApplied ? "立即購買（含鑑定）" : "立即購買"}
              </span>
              <span className="font-mono shrink-0">
                HK$ {buyNowTotal.toLocaleString("en-HK")}
              </span>
            </>
          )}
        </button>
      ) : null}
    </div>
  );

  if (layout === "sticky") {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[rgba(237,232,224,0.08)] bg-[#17130f]/95 backdrop-blur-md lg:mx-auto lg:max-w-[1240px] lg:px-8 lg:border-t-0 lg:bg-transparent lg:backdrop-blur-none"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {footerInner}
      </div>
    );
  }

  return footerInner;
}
