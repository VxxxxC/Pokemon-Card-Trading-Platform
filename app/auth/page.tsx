import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOptionalAuthUser, resolveCurrentAuthRole } from "@/lib/auth/session";
import {
  buildConfirmEmailPath,
  isUserEmailConfirmed,
} from "@/lib/auth/email-confirmation";
import { AuthForm } from "./AuthForm";
import { BrandWordmark } from "@/app/components/branding/BrandWordmark";

export const metadata: Metadata = {
  title: "登入 · HKCardVault",
  description: "登入或建立帳戶，開始交易精選日版寶可夢卡牌。",
};

// ─── Relic card data — realistic Pokémon TCG JP ────────────────────────────────
interface RelicSpec {
  name: string;
  price: string;
  grade: string;
  artFrom: string;
  artVia: string;
  artTo: string;
}

const RELICS: RelicSpec[] = [
  {
    name: "Charizard ex SAR",
    price: "¥340,000",
    grade: "PSA 10",
    artFrom: "#7A2E08",
    artVia: "#C47030",
    artTo: "#3A1205",
  },
  {
    name: "Pikachu AR",
    price: "¥28,500",
    grade: "BGS 9.5",
    artFrom: "#7A6808",
    artVia: "#C4B030",
    artTo: "#3A2E05",
  },
  {
    name: "Umbreon VMAX SA",
    price: "¥185,000",
    grade: "PSA 10",
    artFrom: "#120840",
    artVia: "#402880",
    artTo: "#080415",
  },
  {
    name: "Mew ex SAR",
    price: "¥62,000",
    grade: "CGC Pristine 10",
    artFrom: "#6A1050",
    artVia: "#C050A0",
    artTo: "#300820",
  },
];

// ─── RelicCard — pure display, Server Component ───────────────────────────────
function RelicCard({
  spec,
  small = false,
}: {
  spec: RelicSpec;
  small?: boolean;
}) {
  const w = small ? 112 : 144;
  const h = small ? 157 : 202;
  const artH = small ? 82 : 108;

  return (
    <div
      className="relative rounded-xl border border-[rgba(212,165,116,0.18)] overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.80)]"
      style={{ width: w, height: h, backgroundColor: "#26211C", flexShrink: 0 }}
    >
      {/* Top edge shimmer */}
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-[rgba(212,165,116,0.30)] to-transparent" />

      {/* Art area */}
      <div
        className="absolute left-2.5 right-2.5 top-2.5 rounded-lg overflow-hidden"
        style={{ height: artH }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${spec.artFrom} 0%, ${spec.artVia} 55%, ${spec.artTo} 100%)`,
          }}
        />
        {/* Subtle radial highlight */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_55%_at_45%_35%,rgba(255,255,255,0.07)_0%,transparent_70%)]" />
      </div>

      {/* Card info */}
      <div className="absolute left-2.5 right-2.5 bottom-2.5 space-y-0.5">
        <p
          className={`font-sans font-semibold text-text-primary leading-tight truncate ${small ? "text-[9px]" : "text-[10px]"}`}
        >
          {spec.name}
        </p>
        <p
          className={`font-mono text-brand ${small ? "text-[9px]" : "text-[10px]"}`}
        >
          {spec.price}
        </p>
        <span
          className={`inline-block px-1.5 py-px rounded bg-[rgba(212,165,116,0.14)] font-mono text-brand ${small ? "text-[8px]" : "text-[9px]"}`}
        >
          {spec.grade}
        </span>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  // 商戶入駐入口（marketplace / footer → /auth?role=merchant）：
  // 已登入用戶直接帶去 KYC 申請頁，唔使重複註冊
  const { role: roleParam } = await searchParams;
  if (roleParam === "merchant") {
    const user = await getOptionalAuthUser();
    if (user) {
      if (!isUserEmailConfirmed(user)) {
        redirect(
          `${buildConfirmEmailPath(user.email)}&next=${encodeURIComponent("/profile/user/merchant-apply")}`,
        );
      }
      const authRole = await resolveCurrentAuthRole();
      redirect(
        authRole === "MERCHANT"
          ? "/profile/merchant"
          : "/profile/user/merchant-apply",
      );
    }
  }

  return (
    <div className="min-h-dvh bg-bg-page flex flex-col lg:flex-row">
      {/* ── Left panel — Brand + floating relics (desktop only) ── */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden flex-col justify-between p-12">
        {/* Ambient radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 30% 45%, rgba(212,165,116,0.07) 0%, transparent 70%)",
          }}
        />

        {/* Logo */}
        <Link href="/" className="relative z-10 inline-block">
          <BrandWordmark className="text-[22px]" />
        </Link>

        {/* ── Floating relic cards ─────────────────────────────────────── */}
        {/* Card 1 — Charizard — upper-left */}
        <div
          className="absolute pointer-events-none"
          style={{ left: "12%", top: "18%" }}
        >
          <div style={{ transform: "rotate(-12deg)" }}>
            <div className="animate-float-a" style={{ animationDelay: "0s" }}>
              <RelicCard spec={RELICS[0]!} />
            </div>
          </div>
        </div>

        {/* Card 2 — Pikachu — upper-right (small) */}
        <div
          className="absolute pointer-events-none"
          style={{ right: "12%", top: "14%" }}
        >
          <div style={{ transform: "rotate(9deg)" }}>
            <div className="animate-float-b" style={{ animationDelay: "0.9s" }}>
              <RelicCard spec={RELICS[1]!} small />
            </div>
          </div>
        </div>

        {/* Card 3 — Umbreon — lower-left (small) */}
        <div
          className="absolute pointer-events-none"
          style={{ left: "6%", bottom: "24%" }}
        >
          <div style={{ transform: "rotate(4deg)" }}>
            <div className="animate-float-c" style={{ animationDelay: "1.6s" }}>
              <RelicCard spec={RELICS[2]!} small />
            </div>
          </div>
        </div>

        {/* Card 4 — Mew — lower-right */}
        <div
          className="absolute pointer-events-none"
          style={{ right: "8%", bottom: "20%" }}
        >
          <div style={{ transform: "rotate(-6deg)" }}>
            <div className="animate-float-a" style={{ animationDelay: "2.4s" }}>
              <RelicCard spec={RELICS[3]!} />
            </div>
          </div>
        </div>

        {/* ── Bottom tagline + trust stats ─────────────────────────────── */}
        <div className="relative z-10">
          <p className="font-sans text-[30px] font-bold text-text-primary leading-tight">
            精選日版卡牌
            <br />
            <span className="text-brand">每筆交易均受保障</span>
          </p>
          <p className="mt-3 font-sans text-[14px] text-text-secondary">
            PSA 10 認定 · 全程第三方託管 · 保障安全交付
          </p>

          {/* Trust stats */}
          {/* TODO: [database] ¥2.4億+, 12,800+, 99.8% are placeholder metrics — replace with real aggregation from Supabase: sum(orders.amount), count(listings), avg(user_ratings.score) */}
          <div className="mt-6 flex items-center gap-5">
            <div>
              <p className="font-mono text-[20px] font-semibold text-brand">
                ¥2.4億+
              </p>
              <p className="font-sans text-[12px] text-text-secondary mt-0.5">
                累計交易額
              </p>
            </div>
            <div className="w-px h-9 bg-[rgba(237,232,224,0.10)]" />
            <div>
              <p className="font-mono text-[20px] font-semibold text-brand">
                12,800+
              </p>
              <p className="font-sans text-[12px] text-text-secondary mt-0.5">
                已認證卡牌
              </p>
            </div>
            <div className="w-px h-9 bg-[rgba(237,232,224,0.10)]" />
            <div>
              <p className="font-mono text-[20px] font-semibold text-success">
                99.8%
              </p>
              <p className="font-sans text-[12px] text-text-secondary mt-0.5">
                交易成功率
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel — Auth form ── */}
      <div className="w-full lg:w-120 lg:flex-none flex-1 flex flex-col min-h-dvh lg:min-h-0 lg:border-l lg:border-[rgba(237,232,224,0.08)] relative">
        {/* Mobile ambient glow */}
        <div
          className="lg:hidden absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 100% 50% at 50% 0%, rgba(212,165,116,0.06) 0%, transparent 60%)",
          }}
        />

        {/* Mobile floating relics — behind the form, low-opacity */}
        <div className="lg:hidden absolute inset-0 overflow-hidden pointer-events-none opacity-[0.12]">
          <div
            className="absolute"
            style={{ right: "-5%", top: "5%", transform: "rotate(12deg)" }}
          >
            <div className="animate-float-b" style={{ animationDelay: "0.4s" }}>
              <RelicCard spec={RELICS[0]!} />
            </div>
          </div>
          <div
            className="absolute"
            style={{ left: "-8%", bottom: "10%", transform: "rotate(-8deg)" }}
          >
            <div className="animate-float-c" style={{ animationDelay: "1.2s" }}>
              <RelicCard spec={RELICS[2]!} small />
            </div>
          </div>
        </div>

        <div className="relative z-10 flex flex-col flex-1 w-full max-w-100 mx-auto px-5 py-6 sm:px-6 sm:py-8 lg:px-12 lg:py-16 lg:justify-center">
          {/* Mobile logo */}
          <Link href="/" className="lg:hidden mb-5 self-start inline-block">
            <BrandWordmark className="text-[18px]" />
          </Link>

          <Suspense fallback={null}>
            <AuthForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
