"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminCheckInProgramClient } from "./AdminCheckInProgramClient";
import { AdminRewardActivitiesClient } from "./AdminRewardActivitiesClient";
import {
  type CampaignTab,
  campaignTabToQuery,
} from "./campaign-tabs";
import {
  ADMIN_PAGE_TAB_CLASS,
  ADMIN_PAGE_TAB_NAV_CLASS,
} from "./campaigns-ui";
import type { CheckInProgramRow } from "@/lib/admin-check-in-program/types";
import type { AdminRewardActivityRow } from "@/lib/admin-rewards/types";
import type { AdminRewardActivityStatusCountKey } from "@/app/actions/admin-reward-activities";

type CampaignsPageShellProps = {
  initialActivities: AdminRewardActivityRow[];
  activitiesTotal: number;
  activitiesLoadError: string | null;
  initialStatusCounts: Record<AdminRewardActivityStatusCountKey, number> | null;
  initialCheckInProgram: CheckInProgramRow | null;
  checkInLoadError: string | null;
  initialTab: CampaignTab;
};

export function CampaignsPageShell({
  initialActivities,
  activitiesTotal,
  activitiesLoadError,
  initialStatusCounts,
  initialCheckInProgram,
  checkInLoadError,
  initialTab,
}: CampaignsPageShellProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CampaignTab>(initialTab);
  const [checkInActive, setCheckInActive] = useState(
    initialCheckInProgram?.is_active ?? false,
  );

  const handleTabChange = (tab: CampaignTab) => {
    setActiveTab(tab);
    const query = campaignTabToQuery(tab);
    router.replace(query ? `/admin/campaigns?tab=${query}` : "/admin/campaigns");
  };

  return (
    <div className="space-y-5 pb-8">
      <p className="font-sans text-[13px] text-text-secondary">
        管理獎勵活動（自動發放、限時搶領）與簽到計劃。
      </p>

      <nav
        className={ADMIN_PAGE_TAB_NAV_CLASS}
        aria-label="積分與獎勵活動檢視"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "activities"}
          onClick={() => handleTabChange("activities")}
          className={ADMIN_PAGE_TAB_CLASS(activeTab === "activities")}
        >
          獎勵活動
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "check_in"}
          onClick={() => handleTabChange("check_in")}
          className={ADMIN_PAGE_TAB_CLASS(activeTab === "check_in")}
        >
          簽到計劃
          <span
            className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
              checkInActive
                ? "bg-success/15 text-success"
                : "bg-white/5 text-text-disabled"
            }`}
          >
            {checkInActive ? "已啟用" : "已關閉"}
          </span>
        </button>
      </nav>

      {activeTab === "activities" ? (
        <AdminRewardActivitiesClient
          initialRows={initialActivities}
          initialTotal={activitiesTotal}
          initialStatusCounts={initialStatusCounts}
          loadError={activitiesLoadError}
        />
      ) : null}

      {activeTab === "check_in" ? (
        <AdminCheckInProgramClient
          initialRow={initialCheckInProgram}
          loadError={checkInLoadError}
          onActiveChange={setCheckInActive}
        />
      ) : null}
    </div>
  );
}
