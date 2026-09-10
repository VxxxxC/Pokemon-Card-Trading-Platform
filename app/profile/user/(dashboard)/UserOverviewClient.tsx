"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Settings, Ticket } from "lucide-react";
import { toast } from "sonner";
import { updateUserAvatar } from "@/app/actions/profile";
import { DASHBOARD_SECTION_TITLE_CLASS } from "@/app/profile/dashboard-ui";
import { CheckInCard } from "@/app/components/rewards/CheckInCard";
import { TitleBadgeIcon } from "@/app/components/profile/TitleBadgeIcon";
import { ProfileAvatar } from "@/app/components/profile/ProfileAvatar";
import {
  useMemberDashboard,
  type MemberDashboardInitialData,
} from "@/app/lib/hooks/useMemberDashboard";
import { useMemberTitleDisplay } from "@/app/lib/hooks/useMemberTitleDisplay";
import { mapTradingOrderToSaleOrder } from "@/app/lib/member-order/map-sale-order";
import { PortfolioStatsSkeleton } from "@/app/components/shared/PortfolioSkeletons";
import { PublicReviewPreviewCard } from "@/app/components/profile/PublicReviewPreviewCard";
import { ProfilePersonaSwitch } from "@/app/components/profile/ProfilePersonaSwitch";
import { UserOrderRow } from "@/app/components/user/UserOrderRow";
import type { DualPersonaContext } from "@/lib/auth/dual-persona";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/avatar";
import { uploadProfileAvatar } from "@/lib/profile/client-upload";
import { SellerReputationMeta } from "@/lib/marketplace/seller-reputation-meta";

type UserOverviewClientProps = {
  currentUserId: string;
  initialData: MemberDashboardInitialData;
  dualPersona: DualPersonaContext;
  bootstrapError?: string;
};

function RewardsTicketButton({ embedded = false }: { embedded?: boolean }) {
  if (embedded) {
    return (
      <Link
        href="/profile/user/rewards"
        className="group flex items-center justify-between gap-2 px-3.5 py-2.5 border-t border-[rgba(237,232,224,0.06)] hover:bg-[#2c2722]/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Ticket className="h-4 w-4 text-brand shrink-0" aria-hidden />
          <p className="font-sans font-bold text-[12px] text-brand tracking-tight truncate">
            進入獎勵及任務專區
          </p>
        </div>
        <span className="text-brand group-hover:translate-x-0.5 transition-transform font-mono text-[12px] font-bold shrink-0">
          →
        </span>
      </Link>
    );
  }

  return (
    <Link href="/profile/user/rewards" className="block w-full group">
      <div className="w-full rounded-xl border border-brand/25 bg-[rgba(212,165,116,0.06)] p-[1px] shadow-[0_4px_16px_rgba(212,165,116,0.12)] transition-all active:scale-[0.99] cursor-pointer">
        <div className="w-full h-12 bg-[#26211C] rounded-[11px] px-3.5 flex items-center justify-between group-hover:bg-[#2c2722] transition-colors">
          <div className="flex items-center gap-2.5 min-w-0">
            <Ticket className="h-4 w-4 text-brand shrink-0" aria-hidden />
            <p className="font-sans font-bold text-[12.5px] text-brand tracking-tight truncate">
              進入獎勵及任務專區
            </p>
          </div>
          <span className="text-brand group-hover:translate-x-0.5 transition-transform font-mono text-[13px] font-bold shrink-0">
            →
          </span>
        </div>
      </div>
    </Link>
  );
}

function formatProfileHandle(username: string | null | undefined): string {
  const trimmed = username?.trim();
  return trimmed ? `@${trimmed}` : "";
}

function formatDashboardCurrency(value: number): string {
  return `HK$ ${value.toLocaleString("en-HK")}`;
}

export function UserOverviewClient({
  currentUserId,
  initialData,
  dualPersona,
  bootstrapError,
}: UserOverviewClientProps) {
  const [avatarOverrideUrl, setAvatarOverrideUrl] = useState<string | null>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const {
    profile,
    tradingStats,
    pendingOrders: pendingDbOrders,
    reviews,
    publicReviewCount,
    aggregateRating,
    isOverviewLoading,
    isOrdersLoading,
    isReviewsLoading,
    refetch,
  } = useMemberDashboard({
    profileId: currentUserId,
    initialData,
  });

  const { mainTitle, titleProgress, stepper, activityBadges } = useMemberTitleDisplay({
    reputationTag: profile?.reputationTag,
    completedTradesCount: tradingStats?.completedTradesCount,
  });

  const displayName = profile?.displayName ?? "會員";
  const profileHandle = formatProfileHandle(profile?.username);
  const joinDateLabel = profile?.joinDateLabel ?? "";
  const avatarUrl = profile?.avatarUrl ?? DEFAULT_AVATAR_URL;
  const displayAvatarUrl = avatarOverrideUrl ?? avatarUrl;
  const ratingScore = profile?.ratingScore ?? aggregateRating;
  const reviewCount = publicReviewCount;

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
        const { cdnUrl } = await uploadProfileAvatar(file);
        const result = await updateUserAvatar(cdnUrl);
        if (!result.success) {
          throw new Error(result.error);
        }

        URL.revokeObjectURL(localPreview);
        setAvatarOverrideUrl(cdnUrl);
        toast.success("頭像已更新");
        refetch();
      } catch (error) {
        URL.revokeObjectURL(localPreview);
        setAvatarOverrideUrl(null);
        toast.error(
          error instanceof Error ? error.message : "頭像上載失敗，請稍後再試",
        );
      } finally {
        setIsAvatarUploading(false);
      }
    },
    [refetch],
  );

  const portfolioStats = useMemo(() => {
    if (!tradingStats) {
      return [];
    }

    const listedNote =
      tradingStats.listedForSaleCount > 0
        ? `${tradingStats.listedForSaleCount} 張待售中`
        : "暫無待售卡牌";

    return [
      {
        label: "成交次數",
        value: tradingStats.completedTradesCount.toLocaleString("en-HK"),
        note: "買入 + 賣出",
      },
      {
        label: "持有卡牌數",
        value: tradingStats.heldCardCount.toLocaleString("en-HK"),
        note: listedNote,
      },
      {
        label: "總卡牌估值",
        value: formatDashboardCurrency(tradingStats.totalMarketValue),
        note: "SNKRDUNK → 平台 → 入手價",
      },
    ];
  }, [tradingStats]);

  const pendingOrders = useMemo(
    () => pendingDbOrders.map(mapTradingOrderToSaleOrder),
    [pendingDbOrders],
  );

  const mainTitleLabel = mainTitle?.nameZh ?? "尚未獲得稱號";

  const directTo = useCallback((sectionId: string) => {
    const sectionElement = document.getElementById(sectionId);
    if (sectionElement) {
      sectionElement.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  return (
    <>
      {bootstrapError ? (
        <div className="mb-4 px-4 py-3 bg-[rgba(239,68,68,0.06)] border border-warning/25 rounded-xl">
          <p className="font-sans text-[13px] text-warning">
            無法載入帳戶總覽：{bootstrapError}
          </p>
        </div>
      ) : null}

      <section
        className="mb-4 rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)] animate-fadeIn"
        aria-labelledby="user-hero-name"
      >
        <div className="relative px-4 pt-4 pb-4 sm:px-5">
          <Link
            href="/profile/user/settings"
            className="absolute top-3 right-3 z-12 p-1 text-text-secondary hover:text-brand transition-colors"
            title="設定"
          >
            <Settings className="h-4 w-4" aria-hidden />
          </Link>

          <div className="flex items-start gap-3 pr-8">
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0">
              <ProfileAvatar
                avatarUrl={displayAvatarUrl}
                displayName={displayName}
                className="w-full h-full border-2 border-bg-card bg-[#17130f]"
                imageClassName="object-cover"
                fallbackClassName="bg-[#17130f] text-brand font-mono text-base font-bold"
                alt={`${displayName} 的頭像`}
              />
              {isAvatarUploading ? (
                <div className="absolute inset-0 z-[1] flex items-center justify-center rounded-full bg-[#17130f]/70">
                  <div className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
                </div>
              ) : null}
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
                title="更換頭像"
                aria-label="更換頭像"
              >
                <Camera size={10} aria-hidden="true" />
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <h1
                id="user-hero-name"
                className="font-sans font-bold text-[17px] sm:text-[20px] text-text-primary tracking-tight truncate"
              >
                {displayName}
              </h1>
              <p className="font-mono text-[11px] text-brand mt-0.5 truncate">
                {[profileHandle, joinDateLabel].filter(Boolean).join(" · ")}
              </p>
              {dualPersona.hasDualPersona ? (
                <ProfilePersonaSwitch
                  activeContext="member"
                  context={dualPersona}
                  className="mt-1.5 block"
                />
              ) : null}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2">
                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-brand">
                  {mainTitle?.badgeUrl ? (
                    <TitleBadgeIcon
                      src={mainTitle.badgeUrl}
                      alt={mainTitleLabel}
                      size="sm"
                    />
                  ) : null}
                  <span className="truncate">
                    {isOverviewLoading ? "—" : mainTitleLabel}
                  </span>
                </span>
                <button
                  type="button"
                  className="hover:opacity-90 transition-opacity"
                  onClick={() => directTo("reviews")}
                >
                  <SellerReputationMeta
                    rating={Number(ratingScore) || 0}
                    reviewCount={reviewCount}
                    totalTrades={
                      isOverviewLoading
                        ? null
                        : tradingStats?.completedTradesCount ?? null
                    }
                    className="text-[11px]"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          className="flex border-t border-[rgba(237,232,224,0.06)] divide-x divide-[rgba(237,232,224,0.06)]"
          aria-labelledby="stats-heading"
        >
          <h2 id="stats-heading" className="sr-only">資產總覽</h2>
          {isOverviewLoading ? (
            <PortfolioStatsSkeleton count={3} embedded />
          ) : (
            portfolioStats.map(({ label, value, note }, index) => {
              const isValuation = index === portfolioStats.length - 1;
              return (
                <div
                  key={label}
                  className={`min-w-0 py-3 sm:py-3.5 ${
                    isValuation
                      ? "flex-[1.55] px-2 sm:px-3"
                      : "flex-[0.85] px-2.5 sm:px-4"
                  }`}
                >
                  <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary truncate leading-tight">
                    {label}
                  </p>
                  <p
                    className={`font-mono font-bold text-text-primary leading-tight mt-1 tabular-nums ${
                      isValuation
                        ? "text-[11px] sm:text-[13px]"
                        : "text-[13px] sm:text-[15px] truncate"
                    }`}
                  >
                    {value}
                  </p>
                  <p className="font-mono text-[9px] text-text-disabled truncate mt-0.5 hidden sm:block">
                    {note}
                  </p>
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-3.5 sm:px-5 sm:py-4 border-t border-[rgba(237,232,224,0.06)]">
          <div className="hidden sm:flex items-start">
            {stepper.map((tier, i) => {
              const isActive = tier.isActive;
              const isDone = tier.isDone;
              return (
                <React.Fragment key={tier.tier}>
                  <div
                    className={`flex flex-col items-center gap-1 min-w-0 flex-1 ${isActive ? "opacity-100" : isDone ? "opacity-80" : "opacity-45"}`}
                  >
                    <div
                      className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center border transition-colors ${isActive ? "bg-brand border-brand" : isDone ? "bg-[rgba(212,165,116,0.15)] border-brand/40" : "bg-bg-elevated border-[rgba(237,232,224,0.12)]"}`}
                    >
                      <TitleBadgeIcon
                        src={tier.badgeUrl}
                        alt={tier.label}
                        size="sm"
                        fallbackText={String(tier.tier)}
                      />
                    </div>
                    <span
                      className={`font-mono text-[8px] sm:text-[9px] text-center leading-tight w-full truncate px-0.5 ${isActive ? "text-brand font-bold" : isDone ? "text-text-secondary" : "text-text-disabled"}`}
                    >
                      {tier.label}
                    </span>
                  </div>
                  {i < stepper.length - 1 ? (
                    <div
                      className={`h-px w-2 shrink-0 self-center mt-[-12px] ${isDone ? "bg-brand/50" : "bg-[rgba(237,232,224,0.1)]"}`}
                    />
                  ) : null}
                </React.Fragment>
              );
            })}
          </div>

          <div className="mt-0 sm:mt-2">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-mono text-[10px] sm:text-[11px] text-text-secondary truncate">
                {titleProgress.nextTitleName ? (
                  <>
                    升至 <span className="text-brand">{titleProgress.nextTitleName}</span>
                  </>
                ) : (
                  <span className="text-brand">已達最高稱號</span>
                )}
              </span>
              <span className="font-mono text-[10px] sm:text-[11px] text-text-secondary shrink-0">
                {isOverviewLoading ? "—" : titleProgress.progressLabel}
              </span>
            </div>
            <div
              className="w-full h-1.5 bg-bg-elevated rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={titleProgress.completedTrades}
              aria-valuemax={titleProgress.nextTitle?.threshold ?? titleProgress.completedTrades}
              aria-valuemin={0}
            >
              <div
                className="h-full bg-brand rounded-full transition-all duration-700"
                style={{ width: `${titleProgress.progressPercent}%` }}
              />
            </div>
          </div>

          {activityBadges.length > 0 ? (
            <div className="hidden sm:flex gap-3 mt-3 overflow-x-auto scrollbar-none">
              {activityBadges.map((badge) => (
                <div
                  key={badge.id}
                  title={badge.description}
                  className="shrink-0 flex items-center gap-1 text-text-secondary cursor-help"
                >
                  <TitleBadgeIcon src={badge.badgeUrl} alt={badge.nameZh} size="sm" />
                  <span className="font-mono text-[10px] whitespace-nowrap">
                    {badge.nameZh}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mb-4 rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]">
        <div className="p-3.5">
          <CheckInCard
            embedded
            initialPointsBalance={initialData.overview?.pointsBalance}
            deferStatsLoad
          />
        </div>
        <RewardsTicketButton embedded />
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

        {isOrdersLoading ? (
          <div className="py-8 text-center">
            <div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin mx-auto" />
          </div>
        ) : pendingOrders.length === 0 ? (
          <p className="py-8 text-center font-sans text-[13px] text-text-disabled">
            目前無待處理訂單
          </p>
        ) : (
          <div>
            {pendingOrders.slice(0, 3).map((order) => (
              <UserOrderRow
                key={order.id}
                variant="embedded"
                order={order}
                orderNumber={
                  pendingDbOrders.find((row) => row.id === order.id)?.orderNumber
                }
                detailOrderId={order.id}
              />
            ))}
            {pendingOrders.length > 3 ? (
              <Link
                href="/profile/user/trading?filter=待處理"
                className="block py-2.5 text-center font-mono text-[10px] text-brand hover:text-brand-hover border-t border-[rgba(237,232,224,0.06)]"
              >
                還有 {pendingOrders.length - 3} 筆待處理 →
              </Link>
            ) : null}
          </div>
        )}

        <div id="reviews" className="border-t border-[rgba(237,232,224,0.06)]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(237,232,224,0.06)]">
            <h2
              id="reviews-heading"
              className={DASHBOARD_SECTION_TITLE_CLASS}
            >
              最近收到的信用評價
            </h2>
            <Link
              href={`/profile/${currentUserId}/rating?persona=member`}
              className="font-mono text-[11px] text-brand hover:text-brand-hover font-bold transition-colors"
            >
              查看更多 →
            </Link>
          </div>
          {isReviewsLoading ? (
            <div className="py-8 text-center">
              <div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin mx-auto" />
            </div>
          ) : reviews.length === 0 ? (
            <p className="py-8 text-center font-sans text-[13px] text-text-disabled">
              暫無收到的評價
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
                  href={`/profile/${currentUserId}/rating?persona=member`}
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
