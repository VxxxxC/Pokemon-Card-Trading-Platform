"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import { getUserRewardCoupons } from "@/app/actions/rewards";
import type {
  CouponCenterTab,
  LockedRewardView,
  UserCouponTab,
  UserCouponView,
} from "@/lib/rewards/mapUserRewardCoupon";

import { CheckInCard, type CheckInCardStats } from "@/app/components/rewards/CheckInCard";
import { CouponTicketShell } from "@/app/components/rewards/CouponTicketShell";
import { RewardNotificationHost } from "@/app/components/rewards/RewardNotificationHost";
import { CouponGridSkeleton } from "@/app/components/shared/CouponSkeletons";
import { Pagination } from "@/app/components/ui/Pagination";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

interface PlatformMission {
  id: string;
  title: string;
  desc: string;
  rewardPoints: number;
  status: "claimable" | "claimed" | "ongoing";
  progressLabel: string;
}

const INITIAL_MISSIONS: PlatformMission[] = [
  {
    id: "MIS-001",
    title: "部署首張現貨資產",
    desc: "在庫存管理中成功上架任意一張 C2C 私人藏品卡牌散件。",
    rewardPoints: 50,
    status: "claimable",
    progressLabel: "1 / 1",
  },
  {
    id: "MIS-002",
    title: "安全中介託管成交",
    desc: "完成首筆全款交割訂單交易，不論買入或賣出。",
    rewardPoints: 150,
    status: "ongoing",
    progressLabel: "0 / 1",
  },
  {
    id: "MIS-003",
    title: "加入全港加密議價聊天群",
    desc: "首次透過 [聯絡對方] 與另一位收藏玩家開啟加密安全對話。",
    rewardPoints: 30,
    status: "claimed",
    progressLabel: "已領取",
  },
  {
    id: "MIS-004",
    title: "大盤資產資深審查官",
    desc: "實時點擊觀看大盤卡牌商品詳情頁累計超過 20 次。",
    rewardPoints: 80,
    status: "ongoing",
    progressLabel: "14 / 20",
  },
];

const EMPTY_WALLET: Record<UserCouponTab, UserCouponView[]> = {
  redeemable: [],
  redeemed: [],
  expired: [],
};

const COUPON_CENTER_TABS: CouponCenterTab[] = [
  "redeemable",
  "locked",
  "redeemed",
  "expired",
];

const COUPON_TAB_LABELS: Record<CouponCenterTab, string> = {
  redeemable: "可使用",
  locked: "可解鎖",
  redeemed: "歷史已使用",
  expired: "不可領用 (已過期)",
};

// 🟢 嚴格依照意圖：設定每頁 6 個 Item 的 Chunk 限制線
const ITEMS_PER_PAGE = 6;

export default function MemberRewardsPage() {
  const [_missions] = useState<PlatformMission[]>(INITIAL_MISSIONS);
  const [walletCoupons, setWalletCoupons] =
    useState<Record<UserCouponTab, UserCouponView[]>>(EMPTY_WALLET);
  const [lockedRewards, setLockedRewards] = useState<LockedRewardView[]>([]);
  const [isCouponLoading, setIsCouponLoading] = useState(true);
  const [couponLoadError, setCouponLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CouponCenterTab>("redeemable");
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);

  const handleCheckInStatsChange = (stats: CheckInCardStats) => {
    setPointsBalance(stats.pointsBalance);
  };

  // ── 🟢 核心加裝：React 19 零 useEffect 狀態指紋分頁引擎 ──
  // 當 activeTab 切換時，過濾指紋改變，分頁數會主動、非阻塞式歸位回第 1 頁，打穿溢出 Bug
  const [couponPageState, setCouponPageState] = useState({
    page: 1,
    forKey: "",
  });
  const couponFilterFingerprint = activeTab;
  const currentCouponPage =
    couponPageState.forKey === couponFilterFingerprint
      ? couponPageState.page
      : 1;

  const setCurrentCouponPage = (page: number) => {
    setCouponPageState({ page, forKey: couponFilterFingerprint });
  };

  useEffect(() => {
    let cancelled = false;

    async function loadCoupons() {
      setIsCouponLoading(true);
      setCouponLoadError(null);

      const result = await getUserRewardCoupons();

      if (cancelled) return;

      if (result.success) {
        setWalletCoupons(result.data.wallet);
        setLockedRewards(result.data.locked);
      } else {
        setCouponLoadError(result.error);
        setWalletCoupons(EMPTY_WALLET);
        setLockedRewards([]);
      }

      setIsCouponLoading(false);
    }

    void loadCoupons();

    return () => {
      cancelled = true;
    };
  }, []);

  // 完美進行 SSR 環境水合防線看守
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // 🟢 數據衍生切片層 (Memoized Coupon Slice)
  const activeCoupons =
    activeTab === "locked" ? lockedRewards : walletCoupons[activeTab] || [];
  const totalCouponPages = Math.ceil(activeCoupons.length / ITEMS_PER_PAGE);
  const paginatedCoupons = activeCoupons.slice(
    (currentCouponPage - 1) * ITEMS_PER_PAGE,
    currentCouponPage * ITEMS_PER_PAGE,
  );

  if (!isMounted) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn text-text-primary">
      <section
        className="overflow-hidden rounded-xl border border-white/[0.06] bg-bg-card"
        aria-label="積分與簽到"
      >
        <div
          className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3"
          aria-label="帳戶總積分餘額"
        >
          <p className="font-sans text-[12px] font-medium text-text-secondary">
            帳戶總積分餘額
          </p>
          {pointsBalance === null ? (
            <span
              className="h-5 w-20 rounded bg-white/[0.06] animate-pulse"
              aria-hidden
            />
          ) : (
            <p className="font-mono text-[17px] font-bold tabular-nums leading-none text-brand">
              {pointsBalance.toLocaleString()} PTS
            </p>
          )}
        </div>

        <div className="px-3.5 py-3">
          <CheckInCard
            embedded
            hidePointsBalance
            onStatsChange={handleCheckInStatsChange}
          />
        </div>

        <Link
          href="/profile/user/campaigns"
          className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-3 font-sans text-[13px] font-semibold text-brand transition-colors hover:bg-white/[0.02]"
        >
          <span>前往限時搶券 · 積分商城</span>
          <span className="font-mono text-[12px]">→</span>
        </Link>
      </section>

      <section
        id="redeem-list"
        className="overflow-hidden rounded-xl border border-white/[0.06] bg-bg-card"
      >
        <div className="border-b border-white/[0.06] px-4 py-3">
          <h2 className={SECTION_TITLE_CLASS}>
            我的優惠劵
          </h2>
        </div>

        <div className="flex overflow-x-auto border-b border-white/[0.06] scrollbar-none">
            {COUPON_CENTER_TABS.map((tab) => {
              const count =
                tab === "locked"
                  ? lockedRewards.length
                  : walletCoupons[tab].length;
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`relative shrink-0 cursor-pointer px-2.5 pb-2 pt-2 font-sans text-[12px] font-semibold transition-colors ${
                    isActive
                      ? "text-brand"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {COUPON_TAB_LABELS[tab]}
                    <span
                      className={`rounded-full px-1 py-0.5 font-mono text-[9px] font-bold tabular-nums leading-none ${
                        isActive
                          ? "bg-brand/15 text-brand"
                          : "bg-white/[0.05] text-text-disabled"
                      }`}
                    >
                      {count}
                    </span>
                  </span>
                  {isActive ? (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-brand" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="px-3.5 py-3.5">
            {couponLoadError ? (
              <div className="py-8 text-center font-sans text-[12px] text-error">
                {couponLoadError}
              </div>
            ) : isCouponLoading ? (
              <CouponGridSkeleton />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {paginatedCoupons.length === 0 ? (
                    <div className="col-span-full py-8 text-center font-sans text-[12px] text-text-disabled">
                      {activeTab === "locked"
                        ? "目前沒有可預覽的解鎖獎勵"
                        : "目前沒有該狀態下的折價券券證"}
                    </div>
                  ) : activeTab === "locked" ? (
                    (paginatedCoupons as LockedRewardView[]).map((reward) => (
                      <CouponTicketShell
                        key={reward.id}
                        accentClass="bg-text-disabled/40"
                        borderClass="border-dashed border-white/[0.12]"
                        bgClass="bg-white/[0.03]"
                        stubClass="text-text-secondary"
                        valueLabel={reward.valueLabel}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="min-w-0 truncate font-sans text-[12.5px] font-bold leading-snug text-text-primary">
                              {reward.name}
                            </h4>
                            <span className="shrink-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-sans text-[9px] font-semibold text-text-disabled">
                              待解鎖
                            </span>
                          </div>
                          <p className="font-sans text-[11px] leading-snug text-text-secondary">
                            {reward.minSpendLabel}
                          </p>
                          <p className="text-[10px] leading-snug text-text-disabled">
                            {reward.requirementLabel}
                          </p>
                          <div className="flex items-center justify-between gap-3 border-t border-dashed border-white/[0.08] pt-2 text-[10px]">
                            <span className="font-mono font-bold text-brand">
                              {reward.progressLabel}
                            </span>
                            <Link
                              href={reward.ctaHref}
                              className="shrink-0 font-semibold text-brand hover:underline"
                            >
                              去完成 →
                            </Link>
                          </div>
                        </div>
                      </CouponTicketShell>
                    ))
                  ) : (
                    (paginatedCoupons as UserCouponView[]).map((coupon) => {
                      const ticketTone =
                        activeTab === "redeemable"
                          ? {
                              accent: "bg-brand",
                              border: "border-white/[0.08] hover:border-brand/35",
                              bg: "bg-white/[0.03]",
                              stub: "text-brand",
                              opacity: "",
                            }
                          : activeTab === "redeemed"
                            ? {
                                accent: "bg-success",
                                border: "border-white/[0.06]",
                                bg: "bg-white/[0.02]",
                                stub: "text-text-primary",
                                opacity: "opacity-85",
                              }
                            : {
                                accent: "bg-text-disabled/30",
                                border: "border-white/[0.05]",
                                bg: "bg-white/[0.02]",
                                stub: "text-text-primary",
                                opacity: "opacity-65",
                              };

                      return (
                        <CouponTicketShell
                          key={coupon.id}
                          accentClass={ticketTone.accent}
                          borderClass={`${ticketTone.border} ${ticketTone.opacity}`}
                          bgClass={ticketTone.bg}
                          stubClass={ticketTone.stub}
                          valueLabel={coupon.valueLabel}
                        >
                          <div className="space-y-1.5">
                            <h4 className="font-sans text-[12.5px] font-bold leading-snug text-text-primary line-clamp-2">
                              {coupon.name}
                            </h4>
                            <p className="font-sans text-[11px] leading-snug text-text-secondary">
                              {coupon.minSpendLabel}
                            </p>
                            <div className="flex items-center justify-between gap-3 border-t border-dashed border-white/[0.08] pt-2">
                              <span className="truncate rounded-md border border-white/[0.06] bg-black/25 px-2 py-0.5 font-mono text-[10px] font-medium text-text-secondary select-all">
                                {coupon.code}
                              </span>
                              <span
                                className={`shrink-0 text-[10px] font-medium ${
                                  activeTab === "redeemable"
                                    ? "text-text-disabled"
                                    : activeTab === "redeemed"
                                      ? "text-success"
                                      : "text-error"
                                }`}
                              >
                                {coupon.expiryDate}
                              </span>
                            </div>
                          </div>
                        </CouponTicketShell>
                      );
                    })
                  )}
                </div>

                <Pagination
                  currentPage={currentCouponPage}
                  totalPages={totalCouponPages}
                  onPageChange={setCurrentCouponPage}
                  itemLabel="張折價券"
                  totalItems={activeCoupons.length}
                  itemsPerPage={ITEMS_PER_PAGE}
                  hideControls={false}
                  enableScroll={true}
                  className="mt-2"
                  scrollToViewId="redeem-list"
                  scrollBlock="start"
                />
              </div>
            )}
          </div>
        </section>
      <RewardNotificationHost />
    </div>
  );
}
