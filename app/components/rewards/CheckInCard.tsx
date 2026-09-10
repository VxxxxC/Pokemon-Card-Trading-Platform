"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  executeDailyCheckIn,
  getCheckInProgram,
  getGamificationStats,
} from "@/app/actions/rewards";
import { useIsMemberPersonaActive } from "@/app/lib/hooks/useIsMemberPersonaActive";
import { useRewardNotificationStore } from "@/app/store/useRewardNotificationStore";
import type { CheckInProgramMemberView } from "@/lib/admin-check-in-program/types";
import {
  CHECK_IN_POINT_LADDER,
  CHECK_IN_STEPS,
  getCheckInCycleDayFromStreak,
} from "@/lib/constants/rewards";
import { DASHBOARD_SECTION_TITLE_CLASS } from "@/app/profile/dashboard-ui";

export type CheckInCardStats = {
  pointsBalance: number;
  currentStreak: number;
  checkedInToday: boolean;
};

type CheckInCardProps = {
  onStatsChange?: (stats: CheckInCardStats) => void;
  /** Skip initial fetch when overview SSR already provided points. */
  initialPointsBalance?: number;
  /** Defer gamification stats until idle (streak / check-in state). */
  deferStatsLoad?: boolean;
  /** Render inside hero without duplicate card chrome. */
  embedded?: boolean;
  /** Hide PTS in card header (show balance elsewhere on page). */
  hidePointsBalance?: boolean;
};

function buildStepsFromProgram(program: CheckInProgramMemberView | null) {
  const rewards = program?.dailyRewards ?? CHECK_IN_POINT_LADDER;
  return Array.from({ length: 7 }, (_, idx) => {
    const dayNum = idx + 1;
    const points = rewards[dayNum] ?? CHECK_IN_POINT_LADDER[dayNum] ?? 10;
    const completionHint =
      dayNum === 7 && program?.completionPreview?.enabled === true;
    return {
      dayNum,
      points,
      label: dayNum === 7 ? (completionHint ? "大禮包+" : "大禮包") : `第${dayNum}天`,
    };
  });
}

function CheckInCardSkeleton({
  embedded = false,
  hidePointsBalance = false,
}: {
  embedded?: boolean;
  hidePointsBalance?: boolean;
}) {
  const pulseCell =
    "rounded-lg border border-white/[0.06] bg-white/[0.05] animate-pulse min-h-[52px]";

  return (
    <div
      className={
        embedded
          ? "space-y-3"
          : "rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card p-3.5 space-y-3"
      }
      role="status"
      aria-label="載入簽到狀態"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="h-4 w-20 rounded bg-white/[0.06] animate-pulse" />
        {hidePointsBalance ? null : (
          <div className="h-4 w-16 rounded bg-white/[0.06] animate-pulse" />
        )}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className={pulseCell} />
        ))}
      </div>

      <div className="flex gap-2">
        <div className="h-9 flex-1 rounded-lg bg-white/[0.06] animate-pulse" />
        <div className="h-9 w-[4.5rem] rounded-lg bg-white/[0.06] animate-pulse" />
      </div>
    </div>
  );
}

export function CheckInCard({
  onStatsChange,
  initialPointsBalance,
  deferStatsLoad = false,
  embedded = false,
  hidePointsBalance = false,
}: CheckInCardProps = {}) {
  const isMemberPersonaActive = useIsMemberPersonaActive();
  const [hasCheckedIn, setHasCheckedIn] = useState(false);
  const [consecutiveDays, setConsecutiveDays] = useState(0);
  const [userPoints, setUserPoints] = useState(initialPointsBalance ?? 0);
  const [program, setProgram] = useState<CheckInProgramMemberView | null>(null);
  const [isLoading, setIsLoading] = useState(initialPointsBalance === undefined);
  const [isStreakLoading, setIsStreakLoading] = useState(
    deferStatsLoad && initialPointsBalance !== undefined,
  );
  const [isProgramLoading, setIsProgramLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enqueueGrants = useRewardNotificationStore((s) => s.enqueue);

  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const checkInSteps = useMemo(() => buildStepsFromProgram(program), [program]);
  const programPaused = program !== null && !program.isActive;

  const loadProgram = useCallback(async () => {
    setIsProgramLoading(true);
    const result = await getCheckInProgram();
    if (result.success) {
      setProgram(result.data);
    }
    setIsProgramLoading(false);
  }, []);

  const loadStats = useCallback(async () => {
    if (initialPointsBalance === undefined) {
      setIsLoading(true);
    } else {
      setIsStreakLoading(true);
    }

    const result = await getGamificationStats();

    if (initialPointsBalance === undefined) {
      setIsLoading(false);
    } else {
      setIsStreakLoading(false);
    }

    if (!result.success) return;

    setUserPoints(result.data.pointsBalance);
    setConsecutiveDays(result.data.currentStreak);
    setHasCheckedIn(result.data.checkedInToday);
    onStatsChange?.({
      pointsBalance: result.data.pointsBalance,
      currentStreak: result.data.currentStreak,
      checkedInToday: result.data.checkedInToday,
    });
  }, [initialPointsBalance, onStatsChange]);

  useEffect(() => {
    if (!isMounted || !isMemberPersonaActive) return;

    const runLoad = () => {
      void loadProgram();
      void loadStats();
    };

    if (deferStatsLoad) {
      if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(runLoad, { timeout: 2000 });
        return () => window.cancelIdleCallback(id);
      }

      const timer = setTimeout(runLoad, 1500);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(runLoad, 0);
    return () => clearTimeout(timer);
  }, [isMounted, isMemberPersonaActive, loadStats, loadProgram, deferStatsLoad]);

  if (!isMemberPersonaActive) {
    return null;
  }

  const handleCheckInExecute = async () => {
    if (hasCheckedIn || isSubmitting || programPaused) return;

    setIsSubmitting(true);
    const result = await executeDailyCheckIn();
    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    setHasCheckedIn(true);
    setConsecutiveDays(result.data.currentStreak);
    setUserPoints(result.data.pointsBalance);
    onStatsChange?.({
      pointsBalance: result.data.pointsBalance,
      currentStreak: result.data.currentStreak,
      checkedInToday: true,
    });

    let toastDescription = `今日 +${result.data.pointsEarned} PTS · 連續 ${result.data.currentStreak} 天`;
    const completion = result.data.completionGranted;
    if (completion?.pointsGranted && completion.pointsGranted > 0) {
      const totalPts = result.data.pointsEarned + completion.pointsGranted;
      toastDescription = `今日 +${totalPts} PTS（含簽滿獎勵 +${completion.pointsGranted}）· 連續 ${result.data.currentStreak} 天`;
    }

    toast.success("簽到成功", {
      description: toastDescription,
    });

    if (result.data.newlyGranted.length > 0) {
      enqueueGrants(result.data.newlyGranted);
    }
  };

  if (!isMounted || isLoading) {
    return (
      <CheckInCardSkeleton
        embedded={embedded}
        hidePointsBalance={hidePointsBalance}
      />
    );
  }

  const steps = checkInSteps.length > 0 ? checkInSteps : CHECK_IN_STEPS;
  const todayCycleDay = getCheckInCycleDayFromStreak(
    hasCheckedIn ? consecutiveDays : consecutiveDays + 1,
  );
  const completedCount = hasCheckedIn ? todayCycleDay : todayCycleDay - 1;
  const streakReady = !isStreakLoading;
  const isContentLoading = isStreakLoading || isProgramLoading;

  return (
    <div
      className={
        embedded
          ? "space-y-3"
          : "rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card p-3.5 space-y-3"
      }
    >
      {programPaused ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
          簽到暫停中，請稍後再試。
        </div>
      ) : null}

      <div
        className={
          hidePointsBalance
            ? ""
            : "flex items-center justify-between gap-3"
        }
      >
        <h3 className={DASHBOARD_SECTION_TITLE_CLASS}>
          每日簽到
        </h3>
        {hidePointsBalance ? null : (
          <p className="font-mono text-[12px] text-text-secondary leading-none shrink-0">
            {isContentLoading ? (
              <span className="inline-block h-4 w-16 rounded bg-white/[0.06] animate-pulse align-middle" />
            ) : (
              <span className="font-bold text-brand">
                {userPoints.toLocaleString()} PTS
              </span>
            )}
          </p>
        )}
      </div>

      <div
        className="grid grid-cols-7 gap-1"
        aria-busy={isContentLoading}
      >
        {isContentLoading
          ? Array.from({ length: 7 }).map((_, index) => (
              <div
                key={index}
                className="rounded-lg border border-white/[0.06] bg-white/[0.05] animate-pulse min-h-[52px]"
              />
            ))
          : steps.map((step, idx) => {
          const isCompleted = streakReady && idx < completedCount;
          const isToday =
            streakReady &&
            idx === completedCount &&
            !hasCheckedIn &&
            !isSubmitting;
          const isFuture = !isCompleted && !isToday;
          const shortLabel =
            step.dayNum === 7 ? "禮" : String(step.dayNum);

          return (
            <div
              key={step.dayNum}
              className={`rounded-lg border px-1 py-1.5 flex flex-col items-center justify-center gap-0.5 text-center min-h-[52px] ${
                isCompleted
                  ? "bg-success/5 border-success/30 text-success"
                  : isToday
                    ? "bg-brand/10 border-brand/40 text-brand"
                    : "bg-bg-page/60 border-white/[0.06] text-text-disabled"
              }`}
            >
              <span
                className={`font-mono text-[9px] font-bold leading-none ${isFuture ? "text-text-disabled" : ""}`}
              >
                {shortLabel}
              </span>

              {isCompleted ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <span
                  className={`font-mono text-[10px] font-bold leading-none ${isToday ? "text-brand" : isFuture ? "text-text-disabled" : "text-text-secondary"}`}
                >
                  +{step.points}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={
          hasCheckedIn ||
          isSubmitting ||
          isContentLoading ||
          programPaused
        }
        onClick={() => void handleCheckInExecute()}
        className={`w-full h-9 rounded-lg font-sans font-semibold text-[12px] transition-all flex items-center justify-center gap-1.5 active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed ${
          hasCheckedIn || isSubmitting || isContentLoading || programPaused
            ? "bg-bg-page border border-white/[0.06] text-text-disabled"
            : "bg-brand text-[#17130f] hover:bg-brand-hover"
        }`}
      >
        {isSubmitting ? (
          <span className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        ) : null}
        {programPaused
          ? "簽到暫停"
          : isContentLoading
            ? "載入中…"
            : hasCheckedIn
              ? "今日已簽到"
              : isSubmitting
                ? "簽到中…"
                : "立即簽到"}
      </button>
    </div>
  );
}
