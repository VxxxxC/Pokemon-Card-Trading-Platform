"use client";

import { useCallback, useEffect, useState, useTransition, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  claimFlashReward,
  listActiveFlashCampaigns,
} from "@/app/actions/reward-flash";
import type { FlashCampaignView } from "@/lib/admin-rewards/types";
import { Pagination } from "@/app/components/ui/Pagination";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

type FlashCampaignSectionProps = {
  onClaimed?: () => void;
  paginated?: boolean;
  showHeading?: boolean;
  itemsPerPage?: number;
};

type FlashSort = "ending_soon" | "newest";

const FLASH_PAGE_SIZE = 6;

function sortFlashCampaigns(
  campaigns: FlashCampaignView[],
  sort: FlashSort,
): FlashCampaignView[] {
  const sorted = [...campaigns];
  if (sort === "newest") {
    sorted.sort(
      (a, b) =>
        new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
    );
    return sorted;
  }
  sorted.sort(
    (a, b) => new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime(),
  );
  return sorted;
}

function rewardStubLabel(campaign: FlashCampaignView): string {
  if (campaign.template.type === "free_shipping") {
    const cap = Number(campaign.template.reward_value.max_subsidy_hkd ?? 0);
    return cap > 0 ? `HK$${cap}` : "免運";
  }

  const amount = Number(campaign.template.reward_value.amount_hkd ?? 0);
  return amount > 0 ? `HK$${amount}` : "券";
}

function showTemplateSubtitle(campaign: FlashCampaignView): boolean {
  const title = campaign.template.title?.trim() ?? "";
  const name = campaign.name?.trim() ?? "";
  return title.length > 0 && title !== name;
}

function formatCountdown(targetMs: number, nowMs: number): string {
  const diff = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Cached snapshot — getSnapshot must return the same value until the store notifies.
let flashCountdownNowMs = 0;

function subscribeFlashCountdown(onStoreChange: () => void) {
  flashCountdownNowMs = Date.now();
  const intervalId = window.setInterval(() => {
    flashCountdownNowMs = Date.now();
    onStoreChange();
  }, 1000);
  return () => window.clearInterval(intervalId);
}

function getFlashCountdownNowSnapshot() {
  return flashCountdownNowMs;
}

function getFlashCountdownNowServerSnapshot() {
  return 0;
}

export function FlashCampaignSection({
  onClaimed,
  paginated = false,
  showHeading = true,
  itemsPerPage = FLASH_PAGE_SIZE,
}: FlashCampaignSectionProps) {
  const [campaigns, setCampaigns] = useState<FlashCampaignView[]>([]);
  const [sort, setSort] = useState<FlashSort>("ending_soon");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const now = useSyncExternalStore(
    subscribeFlashCountdown,
    getFlashCountdownNowSnapshot,
    getFlashCountdownNowServerSnapshot,
  );
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshCampaigns = useCallback(async () => {
    const result = await listActiveFlashCampaigns();
    if (!result.success) {
      setCampaigns([]);
      setLoadError(result.error);
      setIsLoading(false);
      return;
    }

    setCampaigns(result.data);
    setLoadError(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadCampaigns = async () => {
      setIsLoading(true);
      setLoadError(null);

      const result = await listActiveFlashCampaigns();
      if (cancelled) {
        return;
      }

      if (!result.success) {
        setCampaigns([]);
        setLoadError(result.error);
        setIsLoading(false);
        return;
      }

      setCampaigns(result.data);
      setIsLoading(false);
    };

    void loadCampaigns();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleClaim = (campaignId: string) => {
    setClaimingId(campaignId);
    startTransition(async () => {
      const result = await claimFlashReward(campaignId);
      setClaimingId(null);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("搶券成功！已加入你的優惠券錢包");
      onClaimed?.();
      await refreshCampaigns();
    });
  };

  if (isLoading) {
    return (
      <section className="flex items-center gap-2 py-6 text-[12px] text-text-secondary">
        <Spinner className="size-4 text-brand" />
        載入限時搶券活動中…
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="py-6 text-[12px] text-text-secondary">
        無法載入限時搶券：{loadError}
      </section>
    );
  }

  if (campaigns.length === 0) {
    return (
      <section className="py-10 text-center text-[12px] text-text-disabled">
        目前沒有進行中的限時搶券活動
      </section>
    );
  }

  const sortedCampaigns = sortFlashCampaigns(campaigns, sort);
  const totalPages = paginated
    ? Math.max(1, Math.ceil(sortedCampaigns.length / itemsPerPage))
    : 1;
  const safePage = Math.min(page, totalPages);
  const visibleCampaigns = paginated
    ? sortedCampaigns.slice(
        (safePage - 1) * itemsPerPage,
        safePage * itemsPerPage,
      )
    : sortedCampaigns;

  return (
    <section className="space-y-4">
      {showHeading ? (
        <div>
          <h3 className={SECTION_TITLE_CLASS}>
            ⚡ 限時搶券
          </h3>
          <p className="font-mono text-[9px] text-[#50453b] uppercase tracking-wider">
            FLASH REWARD CAMPAIGNS
          </p>
        </div>
      ) : null}

      {paginated ? (
        <div className="flex justify-end">
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as FlashSort);
              setPage(1);
            }}
            className="h-8 rounded-lg border border-white/[0.06] bg-bg-card px-2 font-sans text-[11px] text-text-primary"
          >
            <option value="ending_soon">即將結束</option>
            <option value="newest">最新上架</option>
          </select>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {visibleCampaigns.map((campaign) => {
          const startsAt = new Date(campaign.starts_at).getTime();
          const endsAt = new Date(campaign.ends_at).getTime();
          const notStarted = now < startsAt;
          const ended = now >= endsAt;
          const countdownTarget = notStarted ? startsAt : endsAt;
          const countdownPrefix = notStarted
            ? "距離開始"
            : ended
              ? "已結束"
              : "距離結束";
          const showSubtitle = showTemplateSubtitle(campaign);

          return (
            <div
              key={campaign.id}
              className="overflow-hidden rounded-xl border border-white/[0.08] bg-bg-card"
            >
              <div className="flex items-stretch">
                <div className="relative flex w-[4.5rem] shrink-0 flex-col items-center justify-center px-2 py-3.5">
                  <div className="absolute left-1.5 top-3 bottom-3 w-0.5 rounded-full bg-brand/70" />
                  <p className="text-center font-mono text-[13px] font-bold leading-tight tabular-nums text-brand">
                    {rewardStubLabel(campaign)}
                  </p>
                  <p className="mt-1 text-center font-sans text-[9px] leading-tight text-text-disabled">
                    限時
                  </p>
                </div>

                <div className="min-w-0 flex-1 border-l border-dashed border-white/10 py-3 pr-3 pl-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="min-w-0 font-sans text-[14px] font-bold leading-snug text-text-primary line-clamp-2">
                      {campaign.name}
                    </h4>
                    {!ended && !notStarted ? (
                      <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-brand">
                        {formatCountdown(countdownTarget, now)}
                      </span>
                    ) : null}
                  </div>

                  {showSubtitle ? (
                    <p className="mt-0.5 font-sans text-[12px] leading-snug text-brand line-clamp-1">
                      {campaign.template.title}
                    </p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-sans text-[10px] text-text-disabled">
                    <span>
                      剩餘 {campaign.remaining_claims}/{campaign.max_claims}
                    </span>
                    <span>
                      今日 {campaign.user_claims_today}/{campaign.max_claims_per_user}
                    </span>
                    {ended || notStarted ? (
                      <span className="text-text-secondary">{countdownPrefix}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.06] px-3 py-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    isPending ||
                    !campaign.can_claim ||
                    notStarted ||
                    ended ||
                    claimingId === campaign.id
                  }
                  onClick={() => handleClaim(campaign.id)}
                  className="h-9 w-full"
                >
                  {claimingId === campaign.id ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="size-4" />
                      搶券中…
                    </span>
                  ) : campaign.can_claim ? (
                    "立即搶券"
                  ) : ended ? (
                    "活動已結束"
                  ) : notStarted ? (
                    "尚未開始"
                  ) : campaign.remaining_claims <= 0 ? (
                    "已搶光"
                  ) : (
                    "今日已達上限"
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {paginated ? (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          itemLabel="個活動"
          totalItems={sortedCampaigns.length}
          itemsPerPage={itemsPerPage}
          hideControls={totalPages <= 1}
          enableScroll={false}
        />
      ) : null}
    </section>
  );
}
