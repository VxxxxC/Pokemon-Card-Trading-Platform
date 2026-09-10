"use client";

import { useMemo, useState, useEffect } from "react";
import Image from "next/image";
import { Megaphone, Clock } from "lucide-react";

import { TopNav } from "@/app/components/navigation/TopNav";
import { MobileHeader } from "@/app/components/navigation/MobileHeader";
import { BottomNav } from "@/app/components/navigation/BottomNav";
import { Footer } from "@/app/components/navigation/Footer";
import { getAnnouncementStatus, sortAnnouncementsForPublicDisplay } from "@/lib/announcements/status";
import type { PlatformAnnouncement } from "@/lib/announcements/types";
import { AnnouncementDetailLink } from "@/lib/announcements/announcement-detail-link";
import { markAnnouncementsAsRead } from "@/lib/announcements/read-state";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";
import { cn } from "@/lib/utils";

type AnnouncementsPageClientProps = {
  announcements: PlatformAnnouncement[];
};

export function AnnouncementsPageClient({
  announcements,
}: AnnouncementsPageClientProps) {
  const [activeTab, setActiveTab] = useState<"active" | "past">("active");

  const { activeAnnouncements, pastAnnouncements, now } = useMemo(() => {
    const nowDate = new Date();
    const activeList: PlatformAnnouncement[] = [];
    const pastList: PlatformAnnouncement[] = [];

    announcements.forEach((item) => {
      const status = getAnnouncementStatus(item, nowDate);
      if (status.code === "active") {
        activeList.push(item);
      } else {
        pastList.push(item);
      }
    });

    return {
      activeAnnouncements: sortAnnouncementsForPublicDisplay(activeList),
      pastAnnouncements: sortAnnouncementsForPublicDisplay(pastList),
      now: nowDate,
    };
  }, [announcements]);

  const currentDisplayList =
    activeTab === "active" ? activeAnnouncements : pastAnnouncements;

  useEffect(() => {
    markAnnouncementsAsRead(activeAnnouncements);
  }, [activeAnnouncements]);

  return (
    <div className="min-h-[100dvh] bg-bg-page text-text-primary flex flex-col font-sans overflow-x-hidden">
      <TopNav />
      <MobileHeader />

      <main className="flex-1 max-w-[1100px] mx-auto w-full px-4 lg:px-8 mt-3 pb-28 lg:pb-10 space-y-4 animate-fadeIn">
        <section
          className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)] px-3.5 py-3 sm:px-4"
          aria-labelledby="announcements-heading"
        >
          <h1
            id="announcements-heading"
            className={SECTION_TITLE_CLASS}
          >
            平台官方公告
          </h1>
          <p className="mt-1 font-mono text-[10px] text-text-secondary leading-relaxed">
            活動折扣、服務升級與系統維護通知
          </p>
        </section>

        <section
          className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card overflow-hidden"
          aria-label="公告列表"
        >
          <div className="px-3.5 py-3 sm:px-4 border-b border-[rgba(237,232,224,0.06)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveTab("active")}
                  className={cn(
                    "font-mono text-[10px] px-2.5 py-1 rounded-md border transition-colors inline-flex items-center gap-1.5",
                    activeTab === "active"
                      ? "text-brand border-brand/40 bg-[rgba(212,165,116,0.08)] font-bold"
                      : "text-text-secondary border-[rgba(237,232,224,0.08)] hover:text-text-primary hover:bg-bg-elevated/60",
                  )}
                >
                  進行中活動
                  <span className="tabular-nums">{activeAnnouncements.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("past")}
                  className={cn(
                    "font-mono text-[10px] px-2.5 py-1 rounded-md border transition-colors inline-flex items-center gap-1.5",
                    activeTab === "past"
                      ? "text-brand border-brand/40 bg-[rgba(212,165,116,0.08)] font-bold"
                      : "text-text-secondary border-[rgba(237,232,224,0.08)] hover:text-text-primary hover:bg-bg-elevated/60",
                  )}
                >
                  過往公告
                  <span className="tabular-nums">{pastAnnouncements.length}</span>
                </button>
              </div>
              <p className="font-mono text-[10px] text-text-disabled shrink-0">
                {currentDisplayList.length} 則公告
              </p>
            </div>
          </div>

          {currentDisplayList.length === 0 ? (
            <div
              className="px-4 py-10 sm:py-12 text-center"
              role="status"
            >
              <div
                className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-brand/20 bg-bg-page/60"
                aria-hidden
              >
                <Megaphone className="h-5 w-5 text-brand/70" strokeWidth={1.5} />
              </div>
              <p className="font-sans font-semibold text-[13px] text-text-primary">
                目前暫無{activeTab === "active" ? "進行中活動" : "過往公告"}
              </p>
              <p className="mt-1 max-w-xs mx-auto font-sans text-[12px] text-text-disabled leading-relaxed">
                最新特惠與平台升級通知將於此公佈
              </p>
            </div>
          ) : (
            <div className="p-3.5 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {currentDisplayList.map((item) => {
                const status = getAnnouncementStatus(item, now);

                return (
                  <article
                    key={item.id}
                    className="group flex flex-col overflow-hidden rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-page/40 hover:border-brand/25 transition-colors"
                  >
                    <div className="relative h-40 sm:h-44 w-full overflow-hidden bg-[#17130f]">
                      <Image
                        src={item.imageUrl}
                        alt={item.title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-linear-to-t from-[#26211C]/90 via-transparent to-black/10" />

                      <div className="absolute top-2.5 left-2.5">
                        <span
                          className={cn(
                            "inline-block rounded-md border px-2 py-0.5 font-mono text-[9px] font-bold",
                            status.badgeClass,
                          )}
                        >
                          {status.label}
                        </span>
                      </div>

                      <div className="absolute bottom-2.5 left-2.5 right-2.5">
                        <span className="inline-flex items-center gap-1 rounded-md border border-[rgba(237,232,224,0.12)] bg-black/60 px-2 py-0.5 font-mono text-[10px] text-brand tabular-nums">
                          <Clock className="h-3 w-3 shrink-0" aria-hidden />
                          {item.startDate} ~ {item.endDate}
                        </span>
                      </div>
                    </div>

                    <div className="px-3.5 py-3 sm:px-4 flex-1 flex flex-col gap-2">
                      <h2 className={`${SECTION_TITLE_CLASS} group-hover:text-brand transition-colors`}>
                        {item.title}
                      </h2>
                      <p className="font-sans text-[12px] text-text-secondary leading-relaxed line-clamp-3 whitespace-pre-line">
                        {item.content}
                      </p>
                      <div className="pt-1 flex items-center justify-between gap-3">
                        <span className="font-mono text-[10px] text-text-disabled">
                          官方消息
                        </span>
                        {item.linkUrl ? (
                          <AnnouncementDetailLink
                            linkUrl={item.linkUrl}
                            className="h-8 px-3 text-[11px] rounded-lg shrink-0"
                          />
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
