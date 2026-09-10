import { PortfolioStatsSkeleton } from "@/app/components/shared/PortfolioSkeletons";

export function UserOverviewSkeleton() {
  return (
    <>
      <section
        className="mb-4 rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)] animate-pulse"
        aria-hidden="true"
      >
        <div className="px-4 pt-4 pb-4 sm:px-5">
          <div className="flex items-start gap-3">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/5 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-40 rounded bg-white/5" />
              <div className="h-3 w-48 rounded bg-white/5" />
              <div className="h-3.5 w-36 rounded bg-white/5" />
            </div>
          </div>
        </div>
        <PortfolioStatsSkeleton count={3} embedded />
        <div className="px-4 py-3.5 sm:px-5 border-t border-[rgba(237,232,224,0.06)]">
          <div className="h-1.5 rounded-full bg-white/5" />
        </div>
      </section>

      <section
        className="mb-4 rounded-xl border border-[rgba(237,232,224,0.08)] overflow-hidden h-40 bg-white/[0.03] animate-pulse"
        aria-hidden="true"
      />

      <section
        className="rounded-xl border border-[rgba(237,232,224,0.08)] overflow-hidden"
        aria-hidden="true"
      >
        <div className="h-12 border-b border-[rgba(237,232,224,0.06)] bg-white/[0.03]" />
        <div className="h-24 bg-white/[0.02] animate-pulse" />
        <div className="h-12 border-y border-[rgba(237,232,224,0.06)] bg-white/[0.03]" />
        <div className="h-28 bg-white/[0.02] animate-pulse" />
      </section>
    </>
  );
}
