"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { CiSettings } from "react-icons/ci";
import { updateMerchantShopAvatar } from "@/app/actions/merchant-settings";
import { DASHBOARD_SECTION_TITLE_CLASS } from "@/app/profile/dashboard-ui";
import { MerchantOrderRow } from "@/app/components/merchant/MerchantOrderRow";
import { ProfilePersonaSwitch } from "@/app/components/profile/ProfilePersonaSwitch";
import { PublicReviewPreviewCard } from "@/app/components/profile/PublicReviewPreviewCard";
import { TitleBadgeIcon } from "@/app/components/profile/TitleBadgeIcon";
import { useMerchantTitleDisplay } from "@/app/lib/hooks/useMerchantTitleDisplay";
import { mapMerchantTradingOrderToSaleOrder } from "@/app/lib/merchant-order/map-sale-order";
import type { MerchantDashboardInitialData } from "./MerchantOverviewPageData";
import type { DualPersonaContext } from "@/lib/auth/dual-persona";
import { uploadMerchantShopAvatar } from "@/lib/merchant/client-upload";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/avatar";

type MerchantOverviewClientProps = {
  currentUserId: string;
  initialData: MerchantDashboardInitialData;
  dualPersona: DualPersonaContext;
  bootstrapError?: string;
};

function formatDashboardCurrency(value: number): string {
  return `HK$ ${value.toLocaleString("en-HK")}`;
}

function formatShopMeta(handle: string | null, joinDateLabel: string): string {
  return [handle, joinDateLabel].filter(Boolean).join(" · ");
}

export function MerchantOverviewClient({
  currentUserId,
  initialData,
  dualPersona,
  bootstrapError,
}: MerchantOverviewClientProps) {
  const router = useRouter();
  const [avatarOverrideUrl, setAvatarOverrideUrl] = useState<string | null>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const shop = initialData.overview?.shop;
  const performance = initialData.overview?.performance;

  const handleAvatarEditClick = useCallback(() => {
    if (isAvatarUploading) return;
    avatarFileInputRef.current?.click();
  }, [isAvatarUploading]);

  const handleAvatarFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      const localPreview = URL.createObjectURL(file);
      setAvatarOverrideUrl(localPreview);
      setIsAvatarUploading(true);

      try {
        const { cdnUrl } = await uploadMerchantShopAvatar(file);
        const result = await updateMerchantShopAvatar(cdnUrl);
        if (!result.success) {
          throw new Error(result.error);
        }

        URL.revokeObjectURL(localPreview);
        setAvatarOverrideUrl(cdnUrl);
        toast.success("店舖頭像已更新");
        router.refresh();
      } catch (error) {
        URL.revokeObjectURL(localPreview);
        setAvatarOverrideUrl(null);
        toast.error(
          error instanceof Error ? error.message : "店舖頭像上載失敗，請稍後再試",
        );
      } finally {
        setIsAvatarUploading(false);
      }
    },
    [router],
  );

  const { mainTitle, titleProgress, stepper, activityBadges } = useMerchantTitleDisplay({
    reputationTag: shop?.reputationTag,
    completedTradesCount: shop?.completedTradesCount,
    ratingScore: shop?.ratingScore,
  });

  const pendingOrders = useMemo(
    () => (initialData.pendingOrders ?? []).map(mapMerchantTradingOrderToSaleOrder),
    [initialData.pendingOrders],
  );

  const shopName = shop?.shopName ?? "認證商戶";
  const avatarUrl = shop?.avatarUrl ?? DEFAULT_AVATAR_URL;
  const displayAvatarUrl = avatarOverrideUrl ?? avatarUrl;
  const topBannerUrl = shop?.topBannerUrl ?? null;
  const shopMeta = formatShopMeta(shop?.shopHandle ?? null, shop?.joinDateLabel ?? "");
  const mainTitleLabel = mainTitle?.nameZh ?? "尚未獲得稱號";
  const aggregateRating = initialData.aggregateRating ?? 0;
  const ratingScore =
    (shop?.ratingScore ?? 0) > 0
      ? Number(shop?.ratingScore).toFixed(1)
      : aggregateRating > 0
        ? aggregateRating.toFixed(1)
        : "—";
  const reviewCount = initialData.publicReviewCount ?? 0;
  const totalListings = shop?.activeListingCount ?? 0;
  const monthlyRevenue = performance?.monthlyRevenue ?? 0;
  const monthlyOrderCount = performance?.monthlyOrderCount ?? 0;
  const pendingOrderCount = initialData.pendingOrderCount ?? 0;
  const reviews = initialData.reviews ?? [];

  return (
    <>
      {bootstrapError ? (
        <div className="mb-4 px-4 py-3 bg-[rgba(239,68,68,0.06)] border border-warning/25 rounded-xl">
          <p className="font-sans text-[13px] text-warning">
            無法載入商戶總覽：{bootstrapError}
          </p>
        </div>
      ) : null}

      {shop && !shop.kycVerified ? (
        <div className="mb-4 px-4 py-3 bg-[rgba(212,165,116,0.08)] border border-brand/25 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="font-sans text-[13px] text-brand">
            完成商戶驗證後方可收款與上架商品
          </p>
          <Link
            href="/profile/user/merchant-apply"
            className="inline-flex items-center justify-center font-mono text-[11px] font-bold text-[#1A1612] bg-brand px-3 py-1.5 rounded-md hover:bg-[#e8b896] transition-colors shrink-0"
          >
            前往入駐申請 →
          </Link>
        </div>
      ) : null}

      {/* ── Merchant hero ─────────────────────────────────────────────── */}
      <section
        className="mb-4 rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)] animate-fadeIn"
        aria-labelledby="merchant-hero-name"
      >
        {topBannerUrl ? (
          <div className="relative h-20 sm:h-24 w-full">
            <Image
              src={topBannerUrl}
              alt={`${shopName} 店舖橫幅`}
              fill
              className="object-cover"
              sizes="(max-width: 1280px) 100vw, 1100px"
              priority
              unoptimized
            />
            <div className="absolute inset-0 bg-linear-to-t from-bg-card via-[rgba(38,33,28,0.35)] to-transparent" />
          </div>
        ) : null}

        <div className="relative px-4 pt-3 pb-4 sm:px-5 sm:pt-4">
          <Link
            href="/profile/merchant/settings"
            className="absolute top-3 right-3 z-12 p-1 text-text-secondary hover:text-brand transition-colors"
            title="店舖設定"
          >
            <CiSettings size={16} aria-hidden="true" />
          </Link>

          <div className="flex items-start gap-3 pr-8">
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0">
              <div className="relative w-full h-full rounded-full border-2 border-bg-card overflow-hidden bg-[#17130f]">
                <Image
                  src={displayAvatarUrl}
                  alt={`${shopName} 的商舖頭像`}
                  fill
                  className="object-cover"
                  unoptimized
                />
                {isAvatarUploading ? (
                  <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[#17130f]/70">
                    <div className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
                  </div>
                ) : null}
              </div>
              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
              <button
                type="button"
                onClick={handleAvatarEditClick}
                disabled={isAvatarUploading}
                className="absolute -bottom-0.5 -right-0.5 z-10 w-5 h-5 rounded-full bg-[#17130f]/90 border border-[rgba(237,232,224,0.2)] text-text-secondary hover:text-brand hover:border-brand/40 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="更換店舖頭像"
                aria-label="更換店舖頭像"
              >
                <Camera size={10} aria-hidden="true" />
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <h1
                id="merchant-hero-name"
                className="font-sans font-bold text-[17px] sm:text-[20px] text-text-primary tracking-tight truncate"
              >
                {shopName}
              </h1>
              <p className="font-mono text-[11px] text-brand mt-0.5 truncate">
                {shopMeta}
              </p>
              {dualPersona.hasDualPersona ? (
                <ProfilePersonaSwitch
                  activeContext="merchant"
                  context={dualPersona}
                  className="mt-1.5 block"
                />
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {shop?.kycVerified ? (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-success bg-[rgba(16,185,129,0.12)] px-2 py-0.5 rounded-md border border-success/20 font-bold">
                    ✓ KYC 已驗證
                  </span>
                ) : shop ? (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-brand bg-brand/10 px-2 py-0.5 rounded-md border border-brand/20 font-bold">
                    審核中
                  </span>
                ) : null}
                {shop?.stripeConnected ? (
                  <a
                    href="/api/stripe/connect/dashboard"
                    className="inline-flex items-center gap-1 font-mono text-[10px] text-[#635bff] bg-[rgba(99,91,255,0.10)] px-2 py-0.5 rounded-md border border-[rgba(99,91,255,0.25)] font-bold hover:bg-[rgba(99,91,255,0.16)] transition-colors"
                  >
                    管理 Stripe 收款 →
                  </a>
                ) : null}
                {shop?.kycVerified && !shop.stripeConnected ? (
                  <a
                    href="/api/stripe/connect/onboard"
                    className="inline-flex items-center gap-1 font-mono text-[10px] text-brand bg-brand/10 px-2 py-0.5 rounded-md border border-brand/20 font-bold hover:bg-brand/15 transition-colors"
                  >
                    完成 Stripe 收款設定 →
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div
          className="flex border-t border-[rgba(237,232,224,0.06)] divide-x divide-[rgba(237,232,224,0.06)]"
          aria-label="商戶概覽統計"
        >
          <div className="flex-1 min-w-0 px-3 py-3 sm:px-4 sm:py-3.5">
            <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary truncate leading-tight">
              商戶級別
            </p>
            <p className="font-mono font-bold text-[13px] sm:text-[15px] text-brand leading-tight mt-1 truncate">
              <span className="inline-flex items-center gap-1">
                {mainTitle?.badgeUrl ? (
                  <TitleBadgeIcon
                    src={mainTitle.badgeUrl}
                    alt={mainTitleLabel}
                    size="sm"
                  />
                ) : (
                  <span>🏪</span>
                )}
                <span className="truncate">{mainTitleLabel}</span>
              </span>
            </p>
          </div>
          <div className="flex-1 min-w-0 px-3 py-3 sm:px-4 sm:py-3.5">
            <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary truncate leading-tight">
              信用評分
            </p>
            <p className="font-mono font-bold text-[13px] sm:text-[15px] text-text-primary leading-tight mt-1 truncate tabular-nums">
              ⭐ {ratingScore}
              <span className="text-text-disabled font-normal text-[10px] sm:text-[11px]">
                {" "}
                ({reviewCount} 評)
              </span>
            </p>
          </div>
          <div className="flex-1 min-w-0 px-3 py-3 sm:px-4 sm:py-3.5">
            <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary truncate leading-tight">
              在庫資產
            </p>
            <p className="font-mono font-bold text-[13px] sm:text-[15px] text-text-primary leading-tight mt-1 truncate tabular-nums">
              {totalListings}
              <span className="text-text-secondary font-normal text-[10px] sm:text-[11px]">
                {" "}
                件在售
              </span>
            </p>
          </div>
        </div>

        <div className="px-4 py-3.5 sm:px-5 sm:py-4 border-t border-[rgba(237,232,224,0.06)]">
          <div className="hidden sm:flex items-start">
            {stepper.map((step, i) => (
              <React.Fragment key={step.tier}>
                <div
                  className={`flex flex-col items-center gap-1 min-w-0 flex-1 ${step.isActive ? "opacity-100" : step.isDone ? "opacity-80" : "opacity-45"}`}
                >
                  <div
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-mono text-[10px] font-bold border transition-colors ${
                      step.isActive
                        ? "bg-brand border-brand text-[#17130f]"
                        : step.isDone
                          ? "bg-[rgba(212,165,116,0.15)] border-brand/40 text-brand"
                          : "bg-bg-elevated border-[rgba(237,232,224,0.12)] text-text-disabled"
                    }`}
                  >
                    {step.tier}
                  </div>
                  <span
                    className={`font-mono text-[8px] sm:text-[9px] text-center leading-tight w-full truncate px-0.5 ${
                      step.isActive
                        ? "text-brand font-bold"
                        : step.isDone
                          ? "text-text-secondary"
                          : "text-text-disabled"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {i < stepper.length - 1 ? (
                  <div
                    className={`h-px w-2 shrink-0 self-center mt-[-12px] ${step.isDone ? "bg-brand/50" : "bg-[rgba(237,232,224,0.1)]"}`}
                  />
                ) : null}
              </React.Fragment>
            ))}
          </div>

          <div className="mt-0 sm:mt-2">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-mono text-[10px] sm:text-[11px] text-text-secondary truncate">
                {titleProgress.nextTitleName ? (
                  <>
                    升至{" "}
                    <span className="text-brand">{titleProgress.nextTitleName}</span>
                  </>
                ) : (
                  <span className="text-brand">已達最高稱號</span>
                )}
              </span>
              <span className="font-mono text-[10px] sm:text-[11px] text-text-secondary shrink-0">
                {titleProgress.progressLabel}
              </span>
            </div>
            <div
              className="w-full h-1.5 bg-bg-elevated rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={titleProgress.completedTrades}
              aria-valuemax={
                titleProgress.nextTitle?.threshold ?? titleProgress.completedTrades
              }
              aria-valuemin={0}
            >
              <div
                className="h-full bg-brand rounded-full transition-all duration-500"
                style={{ width: `${titleProgress.progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pt-3 scrollbar-none">
            {activityBadges.length === 0 ? (
              <p className="font-sans text-[11px] text-text-disabled px-0.5">
                暫無活動徽章
              </p>
            ) : (
              activityBadges.map((badge) => (
                <div
                  key={badge.id}
                  title={badge.description}
                  className="shrink-0 flex items-center gap-1.5 px-2 py-1 bg-bg-elevated border border-[rgba(237,232,224,0.06)] rounded-lg"
                >
                  <TitleBadgeIcon src={badge.badgeUrl} alt={badge.nameZh} size="sm" />
                  <span className="font-mono text-[10px] text-text-secondary">
                    {badge.nameZh}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="revenue-heading" className="mb-4">
        <h2 id="revenue-heading" className="sr-only">
          經營業績與快報分析
        </h2>

        <div className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card p-3.5 sm:p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="min-w-0">
              <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary truncate leading-tight">
                本月營收
              </p>
              <p className="font-mono font-bold text-[15px] sm:text-[17px] text-text-primary leading-tight mt-1 truncate tabular-nums">
                {formatDashboardCurrency(monthlyRevenue)}
              </p>
            </div>

            <div className="min-w-0 pl-3 border-l border-[rgba(237,232,224,0.06)]">
              <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary truncate leading-tight">
                本月訂單
              </p>
              <p className="font-mono font-bold text-[15px] sm:text-[17px] text-text-primary leading-tight mt-1 truncate tabular-nums">
                {monthlyOrderCount}
                <span className="font-sans text-[11px] text-text-secondary font-normal">
                  {" "}
                  單
                </span>
              </p>
              <p className="font-mono text-[10px] text-warning font-medium mt-0.5">
                {pendingOrderCount} 件待處理
              </p>
            </div>
          </div>

          <Link
            href="/profile/merchant/performance"
            className="flex items-center justify-center w-full h-10 rounded-lg bg-brand hover:bg-brand-hover text-[#17130f] font-sans text-[13px] font-semibold transition-colors active:scale-[0.98]"
            title="進入商戶數據與業績分析控制艙"
          >
            經營分析 →
          </Link>
        </div>
      </section>

      <section
        className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]"
        aria-labelledby="pending-heading"
      >
        <div className="px-4 py-3 border-b border-[rgba(237,232,224,0.06)]">
          <h2
            id="pending-heading"
            className={DASHBOARD_SECTION_TITLE_CLASS}
          >
            待處理訂單
          </h2>
        </div>

        {pendingOrders.length === 0 ? (
          <p className="py-8 text-center font-sans text-[13px] text-text-disabled">
            目前無待處理訂單
          </p>
        ) : (
          <div>
            {pendingOrders.slice(0, 3).map((order) => (
              <MerchantOrderRow
                key={order.id}
                order={order}
                variant="embedded"
              />
            ))}
            {pendingOrders.length > 3 ? (
              <Link
                href="/profile/merchant/trading?filter=待處理"
                className="block py-2.5 text-center font-mono text-[10px] text-brand hover:text-brand-hover border-t border-[rgba(237,232,224,0.06)]"
              >
                還有 {pendingOrders.length - 3} 筆待處理 →
              </Link>
            ) : null}
          </div>
        )}

        <div className="border-t border-[rgba(237,232,224,0.06)]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(237,232,224,0.06)]">
            <h2
              id="rating-heading"
              className={DASHBOARD_SECTION_TITLE_CLASS}
            >
              最近收到的信用評價
            </h2>
            <Link
              href={`/profile/${currentUserId}/rating?persona=merchant`}
              className="font-mono text-[11px] text-brand hover:text-brand-hover font-bold transition-colors"
            >
              查看更多 →
            </Link>
          </div>
          {reviews.length === 0 ? (
            <p className="py-8 text-center font-sans text-[13px] text-text-disabled">
              暫無信用評價
            </p>
          ) : (
            <div>
              {reviews.slice(0, 2).map((review) => (
                <PublicReviewPreviewCard
                  key={review.id}
                  review={review}
                  variant="embedded"
                />
              ))}
              {reviews.length > 2 ? (
                <Link
                  href={`/profile/${currentUserId}/rating?persona=merchant`}
                  className="block py-2.5 text-center font-mono text-[10px] text-brand hover:text-brand-hover border-t border-[rgba(237,232,224,0.06)]"
                >
                  還有 {reviews.length - 2} 則評價 →
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
