import Link from "next/link";
import { Store } from "lucide-react";
import { BrandWordmark } from "@/app/components/branding/BrandWordmark";
import { FooterMemberCenterLinks } from "@/app/components/navigation/FooterMemberCenterLinks";

// TODO: [server] Footer links (customer service, FAQ) should be fetched from CMS or Supabase `site_config` table

const footerSections = [
  {
    title: "交易服務",
    links: [
      { label: "搜尋卡牌", href: "/marketplace" },
      { label: "鑑定託管流程", href: "/terms#escrow" },
      { label: "賣家入駐", href: "/auth?role=merchant" },
    ],
  },
  {
    title: "關於平台",
    links: [
      { label: "關於 HKCardVault", href: "/about" },
      { label: "服務條款", href: "/terms" },
      { label: "私隱政策", href: "/privacy" },
    ],
  },
];

const footerLinkClass =
  "font-sans text-[11px] sm:text-[12px] text-text-disabled hover:text-brand transition-colors";
const footerHeadingClass =
  "font-sans font-semibold text-[11px] sm:text-[12px] text-brand mb-2.5";

export function Footer() {
  return (
    <footer className="w-full bg-bg-shell border-t border-[rgba(237,232,224,0.08)] mt-auto">
      <div className="max-w-[1100px] mx-auto px-4 lg:px-8 py-8 sm:py-10">
        <div className="flex flex-col gap-6 sm:gap-8 mb-6 sm:mb-8">
          {/* Brand block — full width, separated from link grid */}
          <div className="flex flex-col items-start gap-3">
            <Link href="/">
              <BrandWordmark className="text-[17px] sm:text-[18px]" />
            </Link>
            <p className="font-sans text-[12px] text-text-secondary leading-relaxed max-w-[300px] sm:max-w-[340px]">
              香港首個日版寶可夢卡牌專業交易平台。鑑定託管・安心交易。
            </p>
            <Link
              href="/auth?role=merchant"
              className="inline-flex items-center justify-center gap-2 px-4 h-9 sm:px-5 sm:h-10 md:px-6 md:h-12 bg-brand hover:bg-brand-hover text-[#17130f] font-sans text-[12px] sm:text-[13px] md:text-[14.5px] font-black rounded-xl transition-colors shadow-[0_6px_20px_rgba(212,165,116,0.22)] active:scale-[0.98] select-none cursor-pointer focus:outline-none"
            >
              <Store className="size-3.5 sm:size-4 shrink-0" aria-hidden />
              申請商戶入駐
            </Link>
          </div>

          {/* Link columns — 3 equal cols on mobile, no orphan column */}
          <div
            className="grid grid-cols-3 gap-x-3 gap-y-6 sm:gap-x-10 border-t border-[rgba(237,232,224,0.08)] pt-6"
          >
            <div>
              <h3 className={footerHeadingClass}>會員中心</h3>
              <ul className="space-y-1.5 sm:space-y-2">
                <FooterMemberCenterLinks linkClassName={footerLinkClass} />
              </ul>
            </div>

            {footerSections.map((section) => (
              <div key={section.title}>
                <h3 className={footerHeadingClass}>{section.title}</h3>
                <ul className="space-y-1.5 sm:space-y-2">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className={footerLinkClass}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[rgba(237,232,224,0.08)] pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="font-sans text-[11px] text-text-disabled">
              {new Date().getFullYear()} HKCardVault All rights reserved
            </p>
            <div className="flex items-center gap-4">
              
              <span className="font-mono text-[10px] text-text-disabled">
                powered by Mindark IO
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
