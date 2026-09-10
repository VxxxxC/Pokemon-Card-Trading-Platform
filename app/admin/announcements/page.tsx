"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Clock,
  X,
  Link2,
  Megaphone,
  Plus,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  deletePlatformAnnouncement,
  getAnnouncementsForAdmin,
  togglePlatformAnnouncementActive,
} from "@/app/actions/admin-announcements";
import {
  BTN_OUTLINE_SM_CLASS,
  BTN_PRIMARY_CLASS,
  FILTER_CHIP_SM_CLASS,
  FILTER_INPUT_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import {
  getAnnouncementStatus,
} from "@/lib/announcements/status";
import {
  getAnnouncementDisplaySurfaceBadgeClass,
  getAnnouncementDisplaySurfaceLabel,
} from "@/lib/announcements/display-surfaces";
import type { PlatformAnnouncement } from "@/lib/announcements/types";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

function AdminAnnouncementsFeedback() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const feedback = searchParams.get("feedback");

  useEffect(() => {
    if (feedback === "created") {
      toast.success("已成功新增公告！");
      router.replace("/admin/announcements");
    } else if (feedback === "updated") {
      toast.success("已成功更新公告！");
      router.replace("/admin/announcements");
    }
  }, [feedback, router]);

  return null;
}

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await getAnnouncementsForAdmin();
      if (cancelled) return;

      if (result.success) {
        setAnnouncements(result.data);
      } else {
        setActionError(result.error);
      }
      setIsLoadingAnnouncements(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    let activeCount = 0;
    let upcomingCount = 0;
    let expiredCount = 0;
    let inactiveCount = 0;

    announcements.forEach((item) => {
      const status = getAnnouncementStatus(item, now);
      if (status.code === "active") activeCount++;
      else if (status.code === "upcoming") upcomingCount++;
      else if (status.code === "expired") expiredCount++;
      else if (status.code === "inactive") inactiveCount++;
    });

    return {
      total: announcements.length,
      active: activeCount,
      upcoming: upcomingCount,
      expired: expiredCount,
      inactive: inactiveCount,
    };
  }, [announcements]);

  const filteredAnnouncements = useMemo(() => {
    const now = new Date();
    return announcements.filter((item) => {
      const matchesSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.content.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === "all") return true;
      const status = getAnnouncementStatus(item, now);
      return status.code === statusFilter;
    });
  }, [announcements, searchQuery, statusFilter]);

  const handleToggleActive = async (id: string) => {
    const result = await togglePlatformAnnouncementActive(id);
    if (!result.success) {
      setActionError(result.error);
      return;
    }

    setAnnouncements((prev) =>
      prev.map((item) => (item.id === id ? result.data : item)),
    );
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("確定要刪除此公告嗎？此操作無法復原。")) {
      return;
    }

    const result = await deletePlatformAnnouncement(id);
    if (!result.success) {
      setActionError(result.error);
      return;
    }

    setAnnouncements((prev) => prev.filter((item) => item.id !== id));
  };

  const statusFilters = [
    { id: "all", label: "全部", count: stats.total },
    { id: "active", label: "進行中", count: stats.active },
    { id: "upcoming", label: "未開始", count: stats.upcoming },
    { id: "expired", label: "已過期", count: stats.expired },
    { id: "inactive", label: "已下架", count: stats.inactive },
  ] as const;

  return (
    <div className="space-y-5 pb-8">
      <Suspense fallback={null}>
        <AdminAnnouncementsFeedback />
      </Suspense>

      {actionError ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 font-sans text-[13px] text-warning">
          {actionError}
        </div>
      ) : null}

      <header>
        <p className="font-sans text-[13px] text-text-secondary">
          管理全站公告彈窗與動態輪播橫幅，精準設定上架時段與展示狀態。
        </p>
      </header>

      <section className="space-y-4">
        <div className="space-y-3 border-b border-white/[0.08] pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-md">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-disabled"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="搜尋公告標題或內容…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={FILTER_INPUT_CLASS}
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-text-disabled hover:text-text-primary"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            <Link
              href="/admin/announcements/new"
              className={`${BTN_PRIMARY_CLASS} shrink-0 gap-1.5`}
            >
              <Plus className="size-3.5" />
              新增公告
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {statusFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setStatusFilter(filter.id)}
                className={`${FILTER_CHIP_SM_CLASS(statusFilter === filter.id)} gap-1`}
              >
                <span>{filter.label}</span>
                <span
                  className={`font-mono text-[9px] tabular-nums ${
                    statusFilter === filter.id
                      ? "text-brand/80"
                      : "text-text-disabled"
                  }`}
                >
                  {filter.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-0 divide-y divide-white/[0.06]">
          {isLoadingAnnouncements ? (
            <p className="py-10 text-center font-sans text-[13px] text-text-secondary">
              載入公告中…
            </p>
          ) : filteredAnnouncements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Megaphone className="mb-2 size-8 text-text-disabled" />
              <p className={SECTION_TITLE_CLASS}>
                找不到符合條件的公告
              </p>
              <p className="mt-1 font-sans text-[12px] text-text-secondary">
                嘗試調整搜尋關鍵字或選擇其他狀態分類
              </p>
            </div>
          ) : (
            filteredAnnouncements.map((item) => {
              const status = getAnnouncementStatus(item);

              return (
                <article key={item.id} className="space-y-3 px-1 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-lg border border-white/10 sm:w-36">
                      <Image
                        src={
                          item.imageUrl ||
                          "https://images.unsplash.com/photo-1613771404784-3a5686aa2be3?q=80&w=1200&auto=format&fit=crop"
                        }
                        alt={item.title}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <span
                        className={`absolute top-2 left-2 rounded border px-2 py-0.5 font-mono text-[9px] ${status.badgeClass}`}
                      >
                        {status.label}
                      </span>
                      <span
                        className={`absolute top-2 right-2 rounded border px-2 py-0.5 font-mono text-[9px] ${getAnnouncementDisplaySurfaceBadgeClass(item)}`}
                      >
                        {getAnnouncementDisplaySurfaceLabel(item)}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <h3 className={`line-clamp-2 ${SECTION_TITLE_CLASS}`}>
                        {item.title}
                      </h3>
                      <p className="line-clamp-2 font-sans text-[12px] leading-relaxed text-text-secondary">
                        {item.content}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 pt-0.5 font-mono text-[11px] text-text-secondary">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3 text-brand" />
                          {item.startDate} ~ {item.endDate}
                        </span>
                        {item.linkUrl ? (
                          <span className="flex items-center gap-1 text-brand">
                            <Link2 className="size-3" />
                            <span className="max-w-[12rem] truncate">
                              {item.linkUrl}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                    <span className="font-mono text-[10px] text-text-disabled">
                      {item.id}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(item.id)}
                        className={`${BTN_OUTLINE_SM_CLASS} gap-1.5`}
                      >
                        {item.isActive ? (
                          <>
                            <EyeOff className="size-3.5 text-warning" />
                            下架
                          </>
                        ) : (
                          <>
                            <Eye className="size-3.5 text-success" />
                            重新上架
                          </>
                        )}
                      </button>
                      <Link
                        href={`/admin/announcements/${item.id}/edit`}
                        className={`${BTN_OUTLINE_SM_CLASS} gap-1.5 text-brand`}
                      >
                        <Pencil className="size-3.5" />
                        編輯
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className={`${BTN_OUTLINE_SM_CLASS} border-warning/30 text-warning hover:border-warning/40 hover:bg-warning/10 hover:text-warning`}
                      >
                        <Trash2 className="size-3.5" />
                        刪除
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
