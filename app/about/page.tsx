import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Shield, Sparkles, Store, MessagesSquare, Mail } from "lucide-react";
import { TopNav } from "@/app/components/navigation/TopNav";
import { MobileHeader } from "@/app/components/navigation/MobileHeader";
import { BottomNav } from "@/app/components/navigation/BottomNav";
import { Footer } from "@/app/components/navigation/Footer";
import {
  ABOUT_CONTACT_SECTION,
  ABOUT_LEGAL_SECTION,
  ABOUT_PAGE_SECTIONS,
} from "@/lib/about/about-content";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

export const metadata: Metadata = {
  title: "關於我們",
  description:
    "了解香港日版寶可夢卡牌專業交易平台，託管付款、鑑定服務與商戶入駐。",
};

const HIGHLIGHTS = [
  {
    icon: Sparkles,
    label: "專業掛單",
    detail: "清晰標示評級、系列與價格",
    accent: "from-brand/20 via-transparent to-transparent",
  },
  {
    icon: MessagesSquare,
    label: "議價溝通",
    detail: "站內聊天與出價流程",
    accent: "from-transparent via-brand/15 to-transparent",
  },
  {
    icon: Shield,
    label: "託管交易",
    detail: "付款託管，交割更有保障",
    accent: "from-transparent via-brand/12 to-brand/20",
  },
  {
    icon: Store,
    label: "商戶櫥窗",
    detail: "認證賣家專屬展示",
    accent: "from-brand/18 via-transparent to-brand/10",
  },
] as const;

export default function AboutPage() {
  return (
    <div className="min-h-[100dvh] bg-bg-page text-text-primary flex flex-col font-sans">
      <TopNav />
      <MobileHeader />

      <main className="flex-1 max-w-[800px] mx-auto w-full px-4 lg:px-8 mt-3 pb-28 lg:pb-12 space-y-4 animate-fadeIn">
        <section
          className="relative overflow-hidden rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card"
          aria-labelledby="about-heading"
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-brand/10 via-brand/5 to-transparent"
            aria-hidden
          />
          <div className="relative px-4 pt-5 pb-4 sm:px-5 sm:pt-6 sm:pb-5">
            <div className="flex items-start gap-3.5 sm:gap-4">
              <div
                className="relative shrink-0 rounded-xl border border-white/10 bg-[#17130f] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
              >
                <Image
                  src="/asset/logo.png"
                  alt="平台標誌"
                  width={56}
                  height={56}
                  className="size-14 rounded-lg object-cover"
                  priority
                />
              </div>
              <div className="min-w-0 pt-0.5">
                <h1
                  id="about-heading"
                  className="font-sans font-bold text-[20px] sm:text-[22px] text-text-primary tracking-tight leading-tight"
                >
                  關於我們
                </h1>
                <p className="mt-1.5 font-sans text-[12px] sm:text-[13px] text-text-secondary leading-relaxed">
                  香港首個日版寶可夢卡牌專業交易平台
                  <span className="text-text-disabled"> · </span>
                  鑑定託管・安心交易
                </p>
              </div>
            </div>

            <div className="mt-4">
              <div className="grid grid-cols-2 gap-1.5">
                {HIGHLIGHTS.map((item, index) => (
                  <div
                    key={item.label}
                    className="group relative min-h-[104px] overflow-hidden rounded-xl border border-white/[0.05] bg-[#1a1612] p-3 transition-colors hover:border-brand/25"
                  >
                    <div
                      className={`pointer-events-none absolute inset-0 bg-linear-to-br ${item.accent} opacity-80`}
                      aria-hidden
                    />
                    <div
                      className="pointer-events-none absolute -right-3 -top-3 opacity-[0.14] transition-opacity duration-300 group-hover:opacity-[0.22]"
                      aria-hidden
                    >
                      <item.icon
                        className="size-[72px] text-brand"
                        strokeWidth={1.25}
                      />
                    </div>
                    <p
                      className="relative font-mono text-[10px] font-bold tabular-nums text-brand/55"
                      aria-hidden
                    >
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <div className="relative mt-2 min-w-0 pr-2">
                      <p className="font-sans font-semibold text-[12px] text-text-primary leading-tight">
                        {item.label}
                      </p>
                      <p className="mt-1.5 font-sans text-[10px] text-text-disabled leading-snug">
                        {item.detail}
                      </p>
                    </div>
                    <div
                      className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-linear-to-r from-transparent via-brand/35 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <article
          className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card overflow-hidden"
        >
          <div className="border-b border-[rgba(237,232,224,0.06)] px-4 py-3 sm:px-5">
            <h2 className={SECTION_TITLE_CLASS}>
              平台簡介
            </h2>
          </div>

          <div className="px-4 py-4 sm:px-5 divide-y divide-[rgba(237,232,224,0.06)]">
            {ABOUT_PAGE_SECTIONS.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-20 py-4 first:pt-0 last:pb-0"
              >
                <h3 className={SECTION_TITLE_CLASS}>
                  {section.title}
                </h3>
                {"body" in section
                  ? section.body.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="mt-2 font-sans text-[13px] text-text-secondary leading-relaxed"
                      >
                        {paragraph}
                      </p>
                    ))
                  : null}
                {"bullets" in section
                  ? (
                      <ul className="mt-2.5 space-y-2">
                        {section.bullets.map((bullet) => (
                          <li
                            key={bullet}
                            className="flex gap-2.5 font-sans text-[13px] text-text-secondary leading-relaxed"
                          >
                            <span
                              className="mt-[7px] size-1 shrink-0 rounded-full bg-brand/70"
                              aria-hidden
                            />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )
                  : null}
              </section>
            ))}

            <section
              id={ABOUT_LEGAL_SECTION.id}
              className="scroll-mt-20 py-4 first:pt-0 last:pb-0"
            >
              <h3 className={SECTION_TITLE_CLASS}>
                {ABOUT_LEGAL_SECTION.title}
              </h3>
              {ABOUT_LEGAL_SECTION.body.map((paragraph) => (
                <p
                  key={paragraph}
                  className="mt-2 font-sans text-[13px] text-text-secondary leading-relaxed"
                >
                  {paragraph}
                </p>
              ))}
              <div className="mt-3 flex flex-wrap gap-2">
                {ABOUT_LEGAL_SECTION.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex h-9 items-center rounded-lg border border-[rgba(237,232,224,0.12)] bg-bg-page/50 px-3.5 font-sans text-[12px] font-semibold text-text-secondary hover:border-brand/30 hover:text-brand transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </article>

        <section
          id={ABOUT_CONTACT_SECTION.id}
          className="scroll-mt-20 rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card overflow-hidden"
          aria-labelledby="about-contact-heading"
        >
          <div className="border-b border-[rgba(237,232,224,0.06)] px-4 py-3 sm:px-5">
            <h2
              id="about-contact-heading"
              className={SECTION_TITLE_CLASS}
            >
              {ABOUT_CONTACT_SECTION.title}
            </h2>
          </div>
          <div className="px-4 py-4 sm:px-5 space-y-3">
            {ABOUT_CONTACT_SECTION.body.map((paragraph) => (
              <p
                key={paragraph}
                className="font-sans text-[13px] text-text-secondary leading-relaxed"
              >
                {paragraph}
              </p>
            ))}
            <a
              href={`mailto:${ABOUT_CONTACT_SECTION.email}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-brand/25 bg-brand/10 px-4 font-mono text-[12px] font-semibold text-brand hover:bg-brand/15 hover:border-brand/40 transition-colors"
            >
              <Mail className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
              {ABOUT_CONTACT_SECTION.email}
            </a>
          </div>
        </section>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
