import type { ReactNode } from "react";
import { TopNav } from "@/app/components/navigation/TopNav";
import { MobileHeader } from "@/app/components/navigation/MobileHeader";
import { BottomNav } from "@/app/components/navigation/BottomNav";

export function ProfileSubpageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg-page flex flex-col">
      <TopNav />
      <MobileHeader />

      <main className="mt-3 flex-1 max-w-[1100px] mx-auto w-full px-4 lg:px-8 pb-28 lg:pb-10">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
