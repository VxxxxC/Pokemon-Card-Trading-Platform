"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { MessageCircle } from "lucide-react";
import { TitleBadgeIcon } from "@/app/components/profile/TitleBadgeIcon";
import { CertifiedMerchantBadge } from "@/app/components/profile/CertifiedMerchantBadge";
import { UserReportModal } from "@/app/components/report/UserReportModal";
import { useMemberTitleDisplay } from "@/app/lib/hooks/useMemberTitleDisplay";
import { useMerchantTitleDisplay } from "@/app/lib/hooks/useMerchantTitleDisplay";
import type { MarketplaceSellerProfile } from "@/lib/marketplace/load-seller-profile";
import type { ReviewPersona } from "@/app/lib/reviews/types";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/avatar";

const STOREFRONT_BIO_PLACEHOLDER = "此賣家尚未填寫櫥窗簡介。";

type PublicPersonaProfileHeaderProps = {
  profile: MarketplaceSellerProfile;
  rating: number;
  reviewCount: number;
  variant: "public-profile" | "storefront";
  viewPersona?: ReviewPersona;
  listingCount?: number;
  onStorefrontChat?: () => void;
};

function MerchantIdentityChips({
  profile,
}: {
  profile: MarketplaceSellerProfile;
}) {
  return (
    <>
      <CertifiedMerchantBadge />
      {profile.kycVerified ? (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-success bg-[rgba(16,185,129,0.12)] px-2 py-0.5 rounded-md border border-success/20 font-bold">
          ✓ KYC 已驗證
        </span>
      ) : null}
      {profile.stripeConnected ? (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-brand bg-brand/10 px-2 py-0.5 rounded-md border border-brand/20 font-bold">
          ● Stripe 已連結
        </span>
      ) : null}
    </>
  );
}

function ActivityBadgeRow({
  badges,
  hideWhenEmpty = false,
}: {
  badges: Array<{ id: string; nameZh: string; description: string; badgeUrl: string }>;
  hideWhenEmpty?: boolean;
}) {
  if (badges.length === 0) {
    if (hideWhenEmpty) {
      return null;
    }
    return (
      <p className="font-sans text-[12px] text-text-disabled px-1 py-1.5">
        暫無活動徽章
      </p>
    );
  }

  return (
    <>
      {badges.map((badge) => (
        <div
          key={badge.id}
          title={badge.description}
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-[#17130f]/40 border border-[rgba(237,232,224,0.06)] rounded-xl hover:border-brand/20 transition-all cursor-help"
        >
          <TitleBadgeIcon src={badge.badgeUrl} alt={badge.nameZh} size="sm" />
          <span className="font-mono text-[10.5px] text-text-secondary whitespace-nowrap">
            {badge.nameZh}
          </span>
        </div>
      ))}
    </>
  );
}

export function PublicPersonaProfileHeader({
  profile,
  rating,
  reviewCount,
  variant,
  viewPersona,
  listingCount,
  onStorefrontChat,
}: PublicPersonaProfileHeaderProps) {
  const searchParams = useSearchParams();
  const chatParam = searchParams.get("chat");
  const isMerchant =
    viewPersona != null
      ? viewPersona === "merchant"
      : profile.role === "merchant";
  const [isReportOpen, setIsReportOpen] = useState(false);

  const memberTitles = useMemberTitleDisplay({
    reputationTag: isMerchant ? null : profile.reputationTag,
    completedTradesCount: profile.completedTrades,
  });
  const merchantTitles = useMerchantTitleDisplay({
    reputationTag: isMerchant ? profile.reputationTag : null,
    completedTradesCount: profile.completedTrades,
    ratingScore: profile.ratingScore,
  });

  const titleDisplay = isMerchant ? merchantTitles : memberTitles;
  const mainTitle = titleDisplay.mainTitle;
  const mainTitleLabel = mainTitle?.nameZh ?? profile.level;
  const activityBadges = titleDisplay.activityBadges;

  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const openChat = useCallback(() => {
    if (variant === "storefront") {
      onStorefrontChat?.();
      return;
    }

    window.dispatchEvent(
      new CustomEvent("open-global-chat", {
        detail: {
          partnerId: profile.id,
          partnerName: profile.username,
          partnerPersona: isMerchant ? "merchant" : "member",
        },
      }),
    );
  }, [onStorefrontChat, profile.id, profile.username, variant, isMerchant]);

  useEffect(() => {
    if (variant === "public-profile" && chatParam === "open") {
      openChat();
    }
  }, [chatParam, openChat, variant]);

  const publicMetaLine = `${profile.handle} · ${profile.joinDate}`;

  if (!isMounted) {
    return null;
  }

  if (variant === "public-profile") {
    return (
      <section className="px-4 pt-4 pb-4">
        <div className="flex gap-3 min-w-0">
          <div className="relative w-14 h-14 shrink-0 rounded-full overflow-hidden bg-[#17130f] ring-1 ring-white/[0.08]">
            <Image
              src={profile.avatarUrl || DEFAULT_AVATAR_URL}
              alt={`${profile.username} 頭像`}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-sans font-bold text-[17px] text-[#eae1da] truncate leading-tight">
              {profile.username}
            </h1>
            <p className="font-mono text-[11px] text-[#8A8680] truncate mt-0.5">
              {publicMetaLine}
            </p>
            {isMerchant ? (
              <div className="flex flex-wrap items-center gap-1 mt-2">
                <MerchantIdentityChips profile={profile} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-[#17130f]/60 border border-white/[0.05] p-2.5">
          <div className="min-w-0 text-center">
            <span className="font-mono text-[9px] text-[#8A8680] uppercase tracking-wider block">
              {isMerchant ? "商戶級別" : "身分級別"}
            </span>
            <span className="inline-flex items-center justify-center gap-1 font-mono text-[11px] font-bold text-brand mt-1 max-w-full truncate">
              {mainTitle?.badgeUrl ? (
                <TitleBadgeIcon
                  src={mainTitle.badgeUrl}
                  alt={mainTitleLabel}
                  size="sm"
                />
              ) : isMerchant ? (
                <span>🏪</span>
              ) : null}
              <span className="truncate">{mainTitleLabel}</span>
            </span>
          </div>
          <button
            type="button"
            className="min-w-0 text-center border-x border-white/[0.06] px-1"
            onClick={() => {
              document
                .getElementById("rating")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <span className="font-mono text-[9px] text-[#8A8680] uppercase tracking-wider block">
              信用評分
            </span>
            <span className="font-mono text-[11px] text-[#eae1da] font-bold mt-1 block truncate tabular-nums">
              ⭐ {Number(rating).toFixed(1)}
              <span className="text-[#8A8680] font-normal text-[10px]">
                {" "}
                ({reviewCount} 評)
              </span>
            </span>
          </button>
          <div className="min-w-0 text-center">
            <span className="font-mono text-[9px] text-[#8A8680] uppercase tracking-wider block">
              完成交易
            </span>
            <span className="font-mono text-[11px] font-bold text-[#eae1da] mt-1 block tabular-nums">
              {profile.completedTrades.toLocaleString()}+
            </span>
          </div>
        </div>

        {profile.bio?.trim() ? (
          <p className="font-sans text-[12px] text-[#d4c4b7] leading-relaxed mt-3 line-clamp-3">
            {profile.bio}
          </p>
        ) : null}

        {activityBadges.length > 0 ? (
          <div className="flex gap-1.5 overflow-x-auto mt-3 scrollbar-none [-webkit-overflow-scrolling:touch]">
            <ActivityBadgeRow badges={activityBadges} hideWhenEmpty />
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={openChat}
            className="w-full h-10 rounded-lg bg-brand text-[#17130f] font-sans font-semibold text-[13px] hover:bg-brand-hover active:scale-[0.98] transition-all cursor-pointer focus:outline-none flex items-center justify-center gap-1.5"
          >
            <MessageCircle className="size-4 shrink-0" strokeWidth={2} />
            {isMerchant ? "聯絡賣家" : "聯絡會員"}
          </button>
          <button
            type="button"
            aria-label="舉報用戶"
            onClick={() => setIsReportOpen(true)}
            className="w-full py-1 text-[11px] font-sans text-text-disabled hover:text-red-400 transition-colors cursor-pointer focus:outline-none"
          >
            舉報此用戶
          </button>
        </div>

        <UserReportModal
          isOpen={isReportOpen}
          onOpenChange={setIsReportOpen}
          targetUserId={profile.id}
          targetUserName={profile.username}
          targetType={isMerchant ? "merchant" : "user"}
        />
      </section>
    );
  }

  const showBio =
    profile.bio?.trim() && profile.bio.trim() !== STOREFRONT_BIO_PLACEHOLDER;

  if (variant === "storefront" && !isMerchant) {
    return (
      <section className="bg-[#26211C] rounded-xl overflow-hidden">
        <div className="px-4 pt-3 pb-3">
          <div className="flex gap-3 min-w-0">
            <div className="relative w-14 h-14 shrink-0 rounded-full overflow-hidden bg-[#17130f] ring-1 ring-white/[0.06]">
              <Image
                src={profile.avatarUrl || DEFAULT_AVATAR_URL}
                alt={`${profile.username} 頭像`}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-sans font-bold text-[17px] text-[#eae1da] truncate leading-tight">
                {profile.username}
              </h1>
              <p className="font-mono text-[11px] text-[#8A8680] truncate mt-0.5">
                {publicMetaLine}
              </p>
            </div>
            <button
              type="button"
              onClick={openChat}
              className="shrink-0 w-9 h-9 rounded-lg bg-[#17130f] text-text-secondary hover:text-brand flex items-center justify-center transition-colors cursor-pointer focus:outline-none"
              aria-label="開啟對話"
            >
              <MessageCircle className="size-4" strokeWidth={2} />
            </button>
          </div>

          <div className="flex items-stretch gap-2 mt-2.5 py-2">
            <div className="flex-1 min-w-0">
              <span className="font-mono text-[9px] text-[#8A8680] uppercase tracking-wider block">
                身分級別
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-brand mt-0.5 max-w-full truncate">
                {mainTitle?.badgeUrl ? (
                  <TitleBadgeIcon
                    src={mainTitle.badgeUrl}
                    alt={mainTitleLabel}
                    size="sm"
                  />
                ) : null}
                <span className="truncate">{mainTitleLabel}</span>
              </span>
            </div>
            <div className="w-px bg-white/[0.06] shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-mono text-[9px] text-[#8A8680] uppercase tracking-wider block">
                信用評分
              </span>
              <span className="font-mono text-[11px] text-[#eae1da] font-bold mt-0.5 block truncate">
                ⭐ {rating > 0 ? Number(rating).toFixed(1) : "—"}
                <span className="text-[#8A8680] font-normal text-[10px]">
                  {" "}
                  ({reviewCount} 評)
                </span>
              </span>
            </div>
            <div className="w-px bg-white/[0.06] shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-mono text-[9px] text-[#8A8680] uppercase tracking-wider block">
                公開掛單
              </span>
              <span className="font-mono text-[11px] font-bold text-[#eae1da] mt-0.5 block">
                {listingCount?.toLocaleString() ?? "—"}
              </span>
            </div>
          </div>

          {showBio ? (
            <p className="font-sans text-[12px] text-[#d4c4b7] leading-snug mt-1.5 line-clamp-2">
              {profile.bio}
            </p>
          ) : null}

          {activityBadges.length > 0 ? (
            <div className="flex gap-1.5 overflow-x-auto mt-2 scrollbar-none">
              <ActivityBadgeRow badges={activityBadges} hideWhenEmpty />
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  const sectionClassName =
    "relative flex-1 rounded-xl border border-white/[0.06] bg-[#26211C] overflow-hidden";

  const merchantTopBanner = profile.topBannerUrl ?? null;

  const bannerClassName =
    "h-14 sm:h-16 bg-linear-to-r from-[#2a2318] via-[rgba(212,165,116,0.08)] to-[#2a2318]";

  const metaLinePrimary = `${profile.handle} · ${profile.joinDate}`;
  const metaLineSecondary =
    listingCount != null
      ? `完成 ${profile.completedTrades.toLocaleString()} 筆 · 公開 ${listingCount.toLocaleString()} 件`
      : null;

  return (
    <section className={sectionClassName}>
      {merchantTopBanner ? (
        <div className="relative h-36 sm:h-40 w-full">
          <Image
            src={merchantTopBanner}
            alt={`${profile.username} 店舖橫幅`}
            fill
            className="object-cover"
            sizes="(max-width: 1280px) 100vw, 1200px"
            priority
            unoptimized
          />
          <div className="absolute inset-0 bg-linear-to-t from-[#26211C] via-[rgba(38,33,28,0.35)] to-transparent" />
        </div>
      ) : (
        <div className={bannerClassName} />
      )}
      <div className="relative space-y-2.5 min-w-0 px-4 sm:px-5 pb-4 sm:pb-5">
        <div className="flex items-end justify-between gap-3 -mt-8 sm:-mt-9 mb-2">
          <div className="relative w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] shrink-0 rounded-full border-[3px] border-[#26211C] overflow-hidden bg-[#17130f]">
            <Image
              src={profile.avatarUrl || DEFAULT_AVATAR_URL}
              alt={`${profile.username} 頭像`}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pr-11">
          <h1 className="font-sans font-bold text-[20px] sm:text-[22px] text-[#eae1da] tracking-tight truncate">
            {profile.username}
          </h1>
          <MerchantIdentityChips profile={profile} />
        </div>

        <div className="space-y-0.5">
          <p className="font-mono text-[11px] text-[#8A8680] truncate">
            {metaLinePrimary}
          </p>
          {metaLineSecondary ? (
            <p className="font-mono text-[10px] text-[#8A8680]/80">
              {metaLineSecondary}
            </p>
          ) : null}
        </div>

        <div className="flex items-stretch gap-2 py-2">
          <div className="flex-1 min-w-0">
            <span className="font-mono text-[9px] text-[#8A8680] uppercase tracking-wider block">
              商戶級別
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-brand mt-0.5 max-w-full truncate">
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
          </div>
          <div className="w-px bg-white/[0.06] shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-mono text-[9px] text-[#8A8680] uppercase tracking-wider block">
              信用評分
            </span>
            <span className="font-mono text-[11px] text-[#eae1da] font-bold mt-0.5 block truncate">
              ⭐ {rating > 0 ? Number(rating).toFixed(1) : "—"}
              <span className="text-[#8A8680] font-normal text-[10px]">
                {" "}
                ({reviewCount} 評)
              </span>
            </span>
          </div>
        </div>

        {showBio ? (
          <p className="font-sans text-[12px] text-[#d4c4b7] leading-snug line-clamp-2">
            {profile.bio}
          </p>
        ) : null}

        {activityBadges.length > 0 ? (
          <div className="flex gap-1.5 overflow-x-auto pt-2 scrollbar-none">
            <ActivityBadgeRow badges={activityBadges} hideWhenEmpty />
          </div>
        ) : null}

        <button
          type="button"
          onClick={openChat}
          className="absolute top-3 right-3 z-12 w-9 h-9 rounded-lg bg-[#17130f] text-text-secondary hover:text-brand flex items-center justify-center transition-colors cursor-pointer focus:outline-none"
          aria-label="開啟對話"
        >
          <MessageCircle className="size-4" strokeWidth={2} />
        </button>
      </div>
    </section>
  );
}
