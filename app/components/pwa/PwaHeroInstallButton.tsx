"use client";

import { usePwaInstall } from "@/app/lib/hooks/usePwaInstall";

export function PwaHeroInstallButton() {
  const { promptState, onInstall } = usePwaInstall();

  // State C: Already installed — hide completely
  if (promptState === "ALREADY_INSTALLED") return null;

  // State A: Native prompt ready — primary install button
  if (promptState === "NATIVE_READY") {
    return (
      <button
        type="button"
        onClick={onInstall}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-[rgba(212,165,116,0.60)] bg-[rgba(212,165,116,0.22)] font-sans text-[12px] text-brand hover:bg-[rgba(212,165,116,0.34)] hover:border-[rgba(212,165,116,0.85)] hover:text-brand-hover active:scale-[0.97] transition-all"
        aria-label="加到主螢幕 — 安裝 PWA 應用程式"
      >
        <HomeScreenIcon />
        加到主螢幕
      </button>
    );
  }

  if (promptState === "WAITING") return null;

  // State B: Browser cooling — muted hint text
  return (
    <span
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-[rgba(237,232,224,0.08)] bg-[#26211C] font-sans text-[11px] text-[#d4c4b7]"
      title="瀏覽器安全冷卻期 — 請使用網址列圖標手動安裝"
    >
      📥 可手動安裝
    </span>
  );
}

function HomeScreenIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
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
