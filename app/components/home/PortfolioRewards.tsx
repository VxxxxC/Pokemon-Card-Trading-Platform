"use client";

import Link from "next/link";
import { CheckInCard } from "@/app/components/rewards/CheckInCard";
import { useIsMemberPersonaActive } from "@/app/lib/hooks/useIsMemberPersonaActive";
import { useUIStore } from "@/app/store/useUIStore";
import { getProfileHomePath } from "@/lib/auth/roles";

// TODO: [API] Fetch user portfolio value from Supabase — aggregate `user_portfolio` table card values in HKD
// TODO: [database] Create `user_portfolio` table with card_id, quantity, condition fields; compute HKD net worth via market price API

export function PortfolioRewards() {
  const userAuthRole = useUIStore((state) => state.userAuthRole);
  const activeListingPersona = useUIStore((state) => state.activeListingPersona);
  const isMemberPersonaActive = useIsMemberPersonaActive();
  const isLoggedIn =
    userAuthRole === "USER" || userAuthRole === "MERCHANT" || userAuthRole === "ADMIN";

  if (!isLoggedIn) {
    return (
      <section
        className="mb-6 rounded-[16px] bg-bg-card border border-[rgba(237,232,224,0.08)] p-6 text-center relative overflow-hidden"
        aria-labelledby="portfolio-heading"
      >
        <div className="absolute inset-0 bg-[rgba(23,19,15,0.60)] backdrop-blur-sm z-10" />
        <div className="relative z-20">
          <h2
            id="portfolio-heading"
            className="font-sans font-semibold text-[20px] text-text-primary mb-3"
          >
            我的卡盒身家
          </h2>
          <p className="font-sans text-[14px] text-text-secondary mb-4 max-w-[320px] mx-auto">
            防潮箱裡藏著多少寶藏？登入即刻啟用「AI
            身家計算器」，一秒估算你的卡牌港幣總價值！
          </p>
          <Link
            href="/auth"
            className="inline-flex items-center justify-center h-11 px-6 bg-brand text-[#17130f] font-sans font-semibold text-[14px] rounded-[8px] active:scale-[0.98] active:translate-y-[1px] transition-transform hover:bg-brand-hover"
          >
            登入 / 註冊
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      className="mb-6 rounded-[16px] bg-bg-card border border-[rgba(237,232,224,0.08)] p-5"
      aria-labelledby="portfolio-heading"
    >
      <div className="flex items-center justify-between mb-4">
        <h2
          id="portfolio-heading"
          className="font-sans font-semibold text-[20px] text-text-primary"
        >
          我的卡盒身家
        </h2>
        {userAuthRole !== "ADMIN" ? (
          <Link
            href={getProfileHomePath(userAuthRole, activeListingPersona)}
            className="font-mono text-[12px] text-brand hover:text-brand-hover transition-colors"
          >
            管理收藏 →
          </Link>
        ) : null}
      </div>

      <div className="lg:flex lg:gap-6">
        <div className="mb-4 lg:mb-0 lg:flex-1 flex flex-row gap-6 sm:gap-8 items-start">
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[12px] text-text-secondary mb-1 truncate">
              總收藏估值 (HKD)
            </p>
            <p className="font-mono font-bold text-[24px] sm:text-[28px] text-text-primary truncate">
              HK$48,620
            </p>
            <span className="font-mono text-[12px] text-success block mt-1">
              ▲ 3.2% (本月)
            </span>
          </div>

          <div className="border-l border-[rgba(237,232,224,0.12)] pl-6 sm:pl-8 flex-1 min-w-0">
            <p className="font-mono text-[12px] text-text-secondary mb-1 truncate">
              持有卡牌數量
            </p>
            <p className="font-mono font-bold text-[24px] sm:text-[28px] text-text-primary truncate">
              142{" "}
              <span className="font-sans text-[13.5px] text-text-secondary font-medium">
                張
              </span>
            </p>
            <span className="font-mono text-[12px] text-brand block mt-1">
              ★ 頂級收藏家
            </span>
          </div>
        </div>

        {isMemberPersonaActive ? (
          <div className="lg:flex-1">
            <CheckInCard />
          </div>
        ) : null}
      </div>
    </section>
  );
}
