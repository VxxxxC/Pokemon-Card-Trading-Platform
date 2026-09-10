"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { getUserRewardCoupons } from "@/app/actions/rewards";
import { FlashCampaignSection } from "@/app/components/rewards/FlashCampaignSection";
import { PointsRedemptionSection } from "@/app/components/rewards/PointsRedemptionSection";
import { RewardNotificationHost } from "@/app/components/rewards/RewardNotificationHost";

type CampaignTab = "flash" | "points";

const TAB_LABELS: Record<CampaignTab, string> = {
  flash: "限時搶券",
  points: "積分商城",
};

export default function MemberCampaignsPage() {
  const [activeTab, setActiveTab] = useState<CampaignTab>("flash");

  const reloadCoupons = useCallback(async () => {
    await getUserRewardCoupons();
  }, []);

  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!isMounted) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn text-text-primary">
      <div className="flex border-b border-white/[0.06]">
        {(Object.keys(TAB_LABELS) as CampaignTab[]).map((tab) => {
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
              {TAB_LABELS[tab]}
              {isActive ? (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-brand" />
              ) : null}
            </button>
          );
        })}
      </div>

        {activeTab === "flash" ? (
          <FlashCampaignSection
            onClaimed={reloadCoupons}
            paginated
            showHeading={false}
          />
        ) : (
          <PointsRedemptionSection
            onRedeemed={reloadCoupons}
            paginated
            showHeading={false}
          />
        )}
      <RewardNotificationHost />
    </div>
  );
}
