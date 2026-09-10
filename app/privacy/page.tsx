import type { Metadata } from "next";
import { TopNav } from "@/app/components/navigation/TopNav";
import { MobileHeader } from "@/app/components/navigation/MobileHeader";
import { BottomNav } from "@/app/components/navigation/BottomNav";
import { Footer } from "@/app/components/navigation/Footer";
import { getPlatformPrivacyForDisplay } from "@/app/actions/platform-legal";
import {
  DEFAULT_PLATFORM_PRIVACY,
  formatPlatformLegalUpdatedAt,
} from "@/lib/platform/platform-legal-config";

export const metadata: Metadata = {
  title: "私隱政策",
  description: "HKCardVault 私隱政策。",
};

export default async function PrivacyPage() {
  const result = await getPlatformPrivacyForDisplay();
  const privacy = result.success ? result.data : {
    ...DEFAULT_PLATFORM_PRIVACY,
    updatedAtIso: null,
  };

  return (
    <div className="min-h-[100dvh] bg-bg-page text-text-primary flex flex-col font-sans">
      <TopNav />
      <MobileHeader />
      <main className="flex-1 max-w-[800px] mx-auto px-4 lg:px-8 py-8 pb-24 lg:pb-12 w-full">
        <h1 className="font-sans font-bold text-[24px] text-text-primary mb-2">
          {privacy.title}
        </h1>
        <p className="font-sans text-[13px] text-text-secondary mb-8">
          最後更新：{formatPlatformLegalUpdatedAt(privacy.updatedAtIso)}
        </p>

        <article className="font-sans text-[13px] text-text-secondary leading-relaxed">
          <div className="whitespace-pre-wrap">{privacy.body}</div>
        </article>
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
