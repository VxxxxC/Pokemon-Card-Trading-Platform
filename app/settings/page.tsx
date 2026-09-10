import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/app/components/navigation/TopNav";
import { MobileHeader } from "@/app/components/navigation/MobileHeader";
import { BottomNav } from "@/app/components/navigation/BottomNav";

export const metadata: Metadata = {
  title: "設定 · HKCardVault",
  description: "管理語言、貨幣、通知偏好及查看平台條款",
};

function ChevronRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#d4c4b7"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

const settingsSections = [
  // TODO: [server] All action buttons (語言變更, 貨幣變更, 通知偏好管理, 隱私政策查看, FAQ前往, 聯絡客服) have no onClick handlers — each must open a modal or navigate to sub-pages once those routes are created
  // TODO: [database] "語言" / "貨幣" current values are hardcoded — replace with user preference from `user_preferences` table in Supabase
  {
    title: "偏好設定",
    items: [
      {
        label: "語言",
        description: "繁體中文 (香港)",
        action: "變更",
      },
      {
        label: "貨幣",
        description: "日圓（¥ JPY）",
        action: "變更",
      },
      {
        label: "通知偏好",
        description: "新卡上架、價格變動提醒",
        action: "管理",
      },
    ],
  },
  {
    title: "帳號管理",
    items: [
      {
        label: "登入 / 註冊",
        description: "立即加入 HKCardVault，開始交易精選卡牌",
        action: "前往",
        href: "/auth",
      },
    ],
  },
  {
    title: "條款與政策",
    items: [
      {
        label: "隱私政策",
        description: "關於個人資料的處理與保護方式",
        action: "查看",
      },
      {
        label: "服務條款",
        description: "HKCardVault 平台使用條款",
        action: "查看",
      },
      {
        label: "交易保障政策",
        description: "Escrow 託管與爭議處理流程",
        action: "查看",
      },
    ],
  },
  {
    title: "支援",
    items: [
      {
        label: "常見問題 (FAQ)",
        description: "關於交易、運費、鑑定卡等問題",
        action: "前往",
      },
      {
        label: "聯絡客服",
        description: "電郵：support@hkcardvault.jp",
        action: "聯絡",
      },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="min-h-dvh bg-bg-page flex flex-col">
      <TopNav />
      <MobileHeader />

      <main className="flex-1 max-w-[1100px] mx-auto w-full px-4 lg:px-8 py-6 pb-28 lg:pb-8">
        <h1 className="font-sans font-bold text-[24px] text-text-primary mb-6">
          設定
        </h1>

        {/* Login Prompt Banner */}
        <div className="mb-6 p-4 bg-[rgba(212,165,116,0.08)] border border-brand/20 rounded-2xl">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/20 flex items-center justify-center shrink-0">
              <span className="text-[18px]" aria-hidden="true">👋</span>
            </div>
            <div className="flex-1">
              <p className="font-sans font-semibold text-[15px] text-text-primary mb-0.5">
                登入以解鎖完整功能
              </p>
              <p className="font-sans text-[13px] text-text-secondary mb-3">
                追蹤卡牌、管理收藏、參與交易，享受專屬會員權益。
              </p>
              <Link
                href="/auth"
                className="inline-flex h-10 px-4 items-center justify-center bg-brand text-[#17130f] font-sans font-semibold text-[13px] rounded-xl hover:bg-brand-hover active:scale-[0.98] transition-transform"
              >
                立即登入 / 註冊
              </Link>
            </div>
          </div>
        </div>

        <div className="space-y-6 max-w-2xl">
          {settingsSections.map((section) => (
            <div key={section.title}>
              <h2 className="font-mono text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-2 px-1">
                {section.title}
              </h2>
              <div className="bg-bg-card rounded-2xl border border-[rgba(237,232,224,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.30)] overflow-hidden">
                {section.items.map((item, i) => {
                  const itemContent = (
                    <>
                      <div>
                        <p className="font-sans font-medium text-[15px] text-text-primary">
                          {item.label}
                        </p>
                        <p className="font-sans text-[13px] text-text-secondary mt-0.5">
                          {item.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.action && (
                          <span className="font-mono text-[12px] text-brand">{item.action}</span>
                        )}
                        <ChevronRightIcon />
                      </div>
                    </>
                  );

                  const className = `w-full flex items-center justify-between px-4 py-4 text-left hover:bg-bg-elevated transition-colors active:scale-[0.99] min-h-11 ${
                    i > 0 ? "border-t border-[rgba(237,232,224,0.08)]" : ""
                  }`;

                  return 'href' in item ? (
                    <Link key={item.label} href={item.href} className={className}>
                      {itemContent}
                    </Link>
                  ) : (
                    <button key={item.label} type="button" className={className}>
                      {itemContent}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
