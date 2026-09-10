"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useUIStore } from "@/app/store/useUIStore";
import { getProfileHomePath, getTradingHomePath } from "@/lib/auth/roles";
import { shouldShowBottomNav, isUserProfileHubPath } from "@/lib/navigation/bottom-nav-visibility";

export function BottomNav() {
  const pathname = usePathname();
  const openAddAssetModal = useUIStore((state) => state.openAddAssetModal);
  const userAuthRole = useUIStore((state) => state.userAuthRole);
  const activeListingPersona = useUIStore((state) => state.activeListingPersona);
  const isGuest = useSyncExternalStore(
    () => () => {},
    () => userAuthRole === "GUEST",
    () => true,
  );

  if (!shouldShowBottomNav(pathname)) {
    return null;
  }

  const tradingPath = getTradingHomePath(userAuthRole, activeListingPersona);
  const profilePath = getProfileHomePath(userAuthRole, activeListingPersona);

  const isMarketplaceActive = pathname === "/marketplace";
  const isTradingActive =
    pathname === "/profile/user/trading" ||
    pathname === "/profile/merchant/trading";
  const isProfileActive = isUserProfileHubPath(pathname);

  return (
    <nav
      className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="flex justify-evenly items-center px-1 py-1.5 bg-[rgba(26,22,18,0.92)] backdrop-blur-xl border border-[rgba(237,232,224,0.08)] rounded-[24px] shadow-[0_12px_32px_rgba(0,0,0,0.7)] transition-all duration-300"
      >
        <Link
          href="/"
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-[18px] active:scale-[0.93] transition-transform focus:outline-none ${
            pathname === "/" ? "text-[#d4a574]" : "text-[#d4c4b7]"
          }`}
        >
          <HomeIcon active={pathname === "/"} />
          <span className="font-sans text-[10px] font-semibold tracking-tight">
            首頁
          </span>
        </Link>

        <Link
          href="/marketplace"
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-[18px] active:scale-[0.93] transition-transform focus:outline-none ${
            isMarketplaceActive ? "text-[#d4a574]" : "text-[#d4c4b7]"
          }`}
        >
          <SearchIcon active={isMarketplaceActive} />
          <span className="font-sans text-[10px] font-semibold tracking-tight">
            大盤市場
          </span>
        </Link>

        {isGuest ? (
          <Link
            href="/auth"
            className="flex flex-col items-center justify-center min-w-[96px] min-h-[46px] bg-[#d4a574] text-[#1A1612] rounded-[16px] font-sans text-[11px] font-black shadow-md active:scale-[0.95] transition-all text-center focus:outline-none animate-fadeIn"
          >
            登入 / 註冊
          </Link>
        ) : (
          <div className="flex flex-col items-center justify-center gap-0.5 animate-fadeIn">
            <button
              type="button"
              onClick={() => openAddAssetModal({ mode: "merch" })}
              className="w-8 h-8 bg-[#d4a574] text-[#1A1612] rounded-lg flex items-center justify-center shadow-lg active:scale-[0.90] transition-all cursor-pointer focus:outline-none"
              aria-label="新增掛單"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                aria-hidden
              >
                <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
                <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
              </svg>
            </button>
            <span className="font-sans text-[10px] font-semibold text-brand tracking-tight">
              新增掛單
            </span>
          </div>
        )}

        <Link
          href={tradingPath}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-[18px] active:scale-[0.93] transition-transform focus:outline-none ${
            isTradingActive ? "text-[#d4a574]" : "text-[#d4c4b7]"
          }`}
        >
          <ClipboardList
            className="h-5 w-5 shrink-0"
            strokeWidth={2.5}
            aria-hidden
          />
          <span className="font-sans text-[10px] font-semibold tracking-tight">
            交易管理
          </span>
        </Link>

        <Link
          href={profilePath}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-[18px] active:scale-[0.93] transition-transform focus:outline-none ${
            isProfileActive ? "text-[#d4a574]" : "text-[#d4c4b7]"
          }`}
        >
          <ProfileIcon active={isProfileActive} />
          <span className="font-sans text-[10px] font-semibold tracking-tight">
            會員中心
          </span>
        </Link>
      </div>
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={active ? "#d4a574" : "none"}
      stroke={active ? "#d4a574" : "#d4c4b7"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "#d4a574" : "#d4c4b7"}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "#d4a574" : "#d4c4b7"}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
