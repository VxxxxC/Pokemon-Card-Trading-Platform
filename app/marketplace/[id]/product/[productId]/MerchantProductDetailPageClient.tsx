"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RarityBadge } from "@/app/components/cards/RarityBadge";
import { GradeBadge } from "@/app/components/cards/GradeBadge";
import { ExecutionActionFooter } from "@/app/components/transactions/ExecutionActionFooter";
import { Switch } from "@/components/ui/switch";
import { mapMarketplaceListingToExecutionPayload } from "@/lib/marketplace/map-listing-to-execution";
import type { MarketplaceSellerListingDetailView } from "@/app/lib/marketplace/types";
import { formatElementTypeZh } from "@/lib/catalog/element-types";
import { isSealedCatalogType } from "@/lib/catalog/item-kind";
import {
  BUYER_AUTH_DISABLED_COPY,
  buildBuyerAuthAddOnDescription,
} from "@/lib/listings/auth-service-copy";
import { usePlatformAuthFee } from "@/lib/platform/use-platform-auth-fee";
import {
  formatListingGrade,
  formatTradeGradeLabel,
} from "@/lib/marketplace/listing-display";
import {
  resolveSellerProfilePath,
  resolveSellerStorefrontPath,
} from "@/lib/marketplace/seller-identity";
import { IoChevronBack, IoChevronForward } from "react-icons/io5";
import { ClipboardList } from "lucide-react";
import { ProfileAvatar } from "@/app/components/profile/ProfileAvatar";
import { CertifiedMerchantBadge } from "@/app/components/profile/CertifiedMerchantBadge";
import { SellerReputationMeta } from "@/lib/marketplace/seller-reputation-meta";
import { ImageViewer } from "@/app/components/shared/ImageViewer";
import { trackListingView } from "@/lib/listings/track-listing-view";

interface MerchantProductDetailPageClientProps {
  detail: MarketplaceSellerListingDetailView | null;
  routeProductId: string;
  currentUserId?: string | null;
  bootstrapError?: string;
}

export function MerchantProductDetailPageClient({
  detail,
  routeProductId,
  currentUserId = null,
  bootstrapError,
}: MerchantProductDetailPageClientProps) {
  const router = useRouter();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [useAuthentication, setUseAuthentication] = useState(false);
  const [authResetProductId, setAuthResetProductId] = useState(routeProductId);
  const authServiceFeeHkd = usePlatformAuthFee();
  const lastTrackedListingIdRef = useRef<string | null>(null);

  if (authResetProductId !== routeProductId) {
    setAuthResetProductId(routeProductId);
    setUseAuthentication(false);
  }

  useEffect(() => {
    if (!detail) {
      lastTrackedListingIdRef.current = null;
      return;
    }

    const listingId = routeProductId.trim();
    if (!listingId || lastTrackedListingIdRef.current === listingId) {
      return;
    }

    lastTrackedListingIdRef.current = listingId;
    trackListingView({
      listingId,
      sellerId: detail.seller.id,
      currentUserId,
    });
  }, [detail, routeProductId, currentUserId]);

  const handleThumbnailClick = (i: number) => {
    setActiveImageIndex(i);
  };

  if (!detail) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#17130f] py-20">
        <h1 className="text-xl font-sans font-bold text-text-disabled">
          {bootstrapError ?? "未找到該私域現貨標的"}
        </h1>
        <Link
          href="/marketplace"
          className="text-brand text-sm mt-2 hover:underline"
        >
          返回全網大盤
        </Link>
      </div>
    );
  }

  const { seller, catalog, storefrontListing, photos, batchLabel } =
    detail;
  const isSealedProduct = isSealedCatalogType(catalog.catalogType);
  const grade = formatListingGrade(
    detail.gradingCompany,
    detail.gradingScore,
  );
  const gradeLabel = formatTradeGradeLabel(
    detail.gradingCompany,
    detail.gradingScore,
  );
  const cardCode =
    catalog.cardNumber?.trim() ||
    catalog.displayId?.trim() ||
    catalog.productId;
  const publicProductHref = `/marketplace/product/${
    catalog.displayId ?? catalog.productId
  }`;
  const listingSellerPersona = storefrontListing.sellerPersona ?? "member";
  const sellerHandleUsername = seller.handle.startsWith("@")
    ? seller.handle.slice(1)
    : seller.handle;
  const sellerProfileHref =
    listingSellerPersona === "merchant"
      ? resolveSellerStorefrontPath(seller.id, "merchant")
      : resolveSellerProfilePath({
          sellerId: seller.id,
          sellerUsername: sellerHandleUsername,
          sellerPersona: "member",
        });

  const specRows = isSealedProduct
    ? [{ label: "所屬系列", val: catalog.setCode || "—" }].filter(
        (row) => row.val !== "—",
      )
    : [
        { label: "所屬擴充包", val: catalog.setCode || "—" },
        {
          label: "資產屬性",
          val: formatElementTypeZh(catalog.elementType),
        },
        { label: "進化階段", val: catalog.pokemonStage?.trim() || "—" },
        { label: "HP", val: catalog.hp != null ? String(catalog.hp) : "—" },
        { label: "子分類", val: catalog.subTypeJa?.trim() || "—" },
      ].filter((row) => row.val !== "—");

  const galleryPhotos =
    photos.length > 0 ? photos : [catalog.imageUrl || "/placeholder-card.png"];
  const galleryRemarks = detail.photosDetail?.map((img) => img.remark) ?? [];
  const batchDisplay = (batchLabel || routeProductId).trim();
  const thumbnailGridClass =
    galleryPhotos.length <= 4
      ? "grid-cols-4"
      : galleryPhotos.length === 5
        ? "grid-cols-5"
        : "grid-cols-6";
  const executionPayload = mapMarketplaceListingToExecutionPayload(
    storefrontListing,
  );
  const listingAcceptsBuyerAuth = detail.useAuthentication !== false;

  return (
    <div className="flex-1 w-full flex flex-col bg-[#17130f]">
      <main className="flex-1 max-w-[1240px] mx-auto w-full px-4 lg:px-8 py-4 sm:py-6 pb-44 lg:pb-24 animate-fadeIn">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 h-8 px-2.5 rounded-lg bg-[#1A1612] font-sans text-[12px] font-medium text-brand focus:outline-none"
        >
          <IoChevronBack />
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-8 items-start gap-6">
          <section className="lg:col-span-5 lg:sticky lg:top-[5.5rem] space-y-3 lg:space-y-3.5">
            <div
              className="relative w-full max-w-[280px] sm:max-w-[300px] mx-auto lg:max-w-none aspect-5/7 max-h-[min(48vh,420px)] lg:max-h-none lg:aspect-[3/4] overflow-hidden rounded-2xl bg-[#17130f]"
            >
              {galleryPhotos.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (activeImageIndex === i) {
                      setIsViewerOpen(true);
                    } else {
                      handleThumbnailClick(i);
                    }
                  }}
                  className={`absolute inset-0 transition-opacity duration-300 cursor-zoom-in focus:outline-none ${
                    activeImageIndex === i
                      ? "opacity-100 z-10"
                      : "opacity-0 z-0 pointer-events-none"
                  }`}
                  aria-label={`查看實物特寫角度 ${i + 1}`}
                >
                  <Image
                    src={img}
                    alt={`${catalog.productName} 賣家實物特寫角度 ${i + 1}`}
                    fill
                    priority={i === 0}
                    className="object-contain bg-[#17130f]"
                    sizes="(max-width: 1024px) 280px, 40vw"
                  />
                </button>
              ))}
            </div>

            <div
              className={`grid ${thumbnailGridClass} gap-1.5 sm:gap-2 max-w-[280px] sm:max-w-[300px] mx-auto lg:max-w-none w-full`}
            >
              {galleryPhotos.map((img, i) => (
                <button
                  key={`${img}-${i}`}
                  onMouseEnter={() => {
                    if (window.innerWidth >= 1024) {
                      handleThumbnailClick(i);
                    }
                  }}
                  onClick={() => handleThumbnailClick(i)}
                  className={`relative aspect-5/7 bg-[#26211C] rounded-lg lg:rounded-xl overflow-hidden border-2 transition-all cursor-pointer focus:outline-none ${
                    activeImageIndex === i
                      ? "border-brand shadow-[0_0_12px_rgba(212,165,116,0.3)]"
                      : "border-[rgba(237,232,224,0.12)] hover:border-brand/40"
                  }`}
                  aria-label={`查看實物特寫角度 ${i + 1}`}
                >
                  <Image
                    src={img}
                    alt={`角度 ${i + 1}`}
                    fill
                    className="object-contain bg-[#17130f]"
                    sizes="80px"
                  />
                </button>
              ))}
            </div>
          </section>

          <section className="lg:col-span-7 space-y-4">
            <div className="space-y-1 pb-3 border-b border-[rgba(237,232,224,0.06)]">
              <div className="flex items-start justify-between gap-3 min-w-0">
                <h1 className="font-sans font-black text-[22px] sm:text-[24px] lg:text-[28px] text-[#eae1da] leading-tight tracking-tight min-w-0">
                  {catalog.productName}
                </h1>
                <div className="shrink-0 pt-1">
                  {isSealedProduct ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[12px] font-medium text-text-primary bg-[rgba(212,165,116,0.15)] rounded-[4px] px-2 py-0.5">
                      {gradeLabel}
                    </span>
                  ) : (
                    <GradeBadge
                      authority={grade.authority}
                      score={grade.score}
                    />
                  )}
                </div>
              </div>
              <div className="space-y-1 font-mono text-[11px] sm:text-[12px] text-text-disabled">
                <p className="flex items-center gap-2 flex-wrap">
                  官方卡號{" "}
                  <span className="text-[#eae1da] font-bold">
                    {cardCode || "未標註"}
                  </span>
                  {catalog.rarity ? (
                    <RarityBadge rarity={catalog.rarity} />
                  ) : null}
                </p>
                <p className="break-all">
                  出讓批次{" "}
                  <span className="text-[#eae1da] font-bold">{batchDisplay}</span>
                </p>
              </div>
            </div>

            <Link
              href={sellerProfileHref}
              className="flex items-center gap-3 p-3.5 rounded-xl border border-[rgba(237,232,224,0.08)] bg-[#26211C] hover:bg-[#2c2722] hover:border-brand/20 transition-colors focus:outline-none group"
            >
              <ProfileAvatar
                avatarUrl={seller.avatarUrl}
                displayName={seller.username}
                className="w-11 h-11 border border-white/10 shrink-0"
                fallbackClassName="bg-[#1A1612] text-brand text-sm font-bold font-mono"
              />
              <div className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-sans font-bold text-[14px] text-[#eae1da] truncate">
                    {seller.username}
                  </span>
                  {listingSellerPersona === "merchant" ? (
                    <CertifiedMerchantBadge />
                  ) : null}
                </div>
                <span className="font-mono text-[11px] text-[#8A8680] truncate block">
                  {seller.handle}
                </span>
                <SellerReputationMeta
                  rating={seller.ratingScore}
                  totalTrades={seller.completedTrades}
                  className="mt-1"
                />
              </div>
              <IoChevronForward
                className="size-4 shrink-0 text-[#8A8680] group-hover:text-brand group-hover:translate-x-0.5 transition-all"
                aria-hidden
              />
            </Link>

            <Link
              href={publicProductHref}
              className="w-full h-11 flex items-center justify-between gap-3 px-4 rounded-xl border border-[rgba(237,232,224,0.10)] bg-[#26211C] hover:bg-[#2c2722] hover:border-brand/25 text-[#d4c4b7] hover:text-[#eae1da] font-sans font-semibold text-[13px] transition-colors duration-200 active:scale-[0.99] cursor-pointer text-left focus:outline-none shrink-0 group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ClipboardList
                  className="size-4 shrink-0 text-brand/80 group-hover:text-brand transition-colors"
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="truncate">查看此卡牌的所有掛單</span>
              </div>
              <IoChevronForward
                className="size-4 shrink-0 text-[#8A8680] group-hover:text-brand group-hover:translate-x-0.5 transition-all"
                aria-hidden
              />
            </Link>

            {specRows.length > 0 ? (
              <div className="bg-[#26211C] rounded-xl border border-[rgba(237,232,224,0.08)] overflow-hidden">
                <div className="px-4 py-3 bg-[#26211C] border-b border-[rgba(237,232,224,0.08)]">
                  <h3 className="font-sans font-bold text-[13px] text-[#eae1da]">
                    規格
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 font-sans text-[13px]">
                  {specRows.map((row, idx) => (
                    <div
                      key={row.label}
                      className={`flex items-center justify-between p-3.5 ${
                        idx % 2 === 0 ? "bg-[#2c2722]" : "bg-[#26211C]"
                      } border-b border-white/[0.04]`}
                    >
                      <span className="text-[#d4c4b7]">{row.label}</span>
                      <span className="font-semibold text-[#eae1da] text-right truncate max-w-[180px]">
                        {row.val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-white/5 text-center font-sans text-[12.5px] text-text-disabled bg-[#26211C]/30">
                ⚠️ 無法載入該特定卡牌的官方招式屬性資料表 (SSOT Alignment
                Pending)
              </div>
            )}
          </section>
        </div>
      </main>

      {executionPayload ? (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-[rgba(237,232,224,0.08)] bg-[#17130f]/95 backdrop-blur-md lg:mx-auto lg:max-w-[1240px] lg:px-8 lg:border-t-0 lg:bg-transparent lg:backdrop-blur-none"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {!isSealedProduct ? (
            <div className="mx-4 mb-2 rounded-lg border border-white/[0.08] bg-[#17130f] p-3 lg:mx-0">
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
                  disabled={!listingAcceptsBuyerAuth}
                  className="shrink-0 data-checked:bg-brand data-unchecked:bg-[#39342f] disabled:opacity-40"
                />
              </div>
            </div>
          ) : null}
          <ExecutionActionFooter
            listingId={executionPayload.listingId}
            order={executionPayload.order}
            card={executionPayload.card}
            productId={executionPayload.productId}
            layout="embedded"
            useAuthentication={useAuthentication}
            onUseAuthenticationChange={setUseAuthentication}
          />
        </div>
      ) : null}

      <ImageViewer
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        images={galleryPhotos}
        remarks={galleryRemarks}
        initialIndex={activeImageIndex}
      />
    </div>
  );
}
