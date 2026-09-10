"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  Link2,
  Upload,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  createPlatformAnnouncement,
  updatePlatformAnnouncement,
} from "@/app/actions/admin-announcements";
import {
  BTN_OUTLINE_CLASS,
  BTN_PRIMARY_CLASS,
  FORM_INPUT_CLASS,
  FORM_LABEL_CLASS,
  FORM_SWITCH_CLASS,
  FORM_TEXTAREA_CLASS,
  FORM_TOGGLE_ROW_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import { DEFAULT_ANNOUNCEMENT_POSTER_URL } from "@/lib/announcements/defaults";
import {
  CALENDAR_POPOVER_CONTENT_CLASS,
  CALENDAR_TRIGGER_ICON_CLASS,
} from "@/lib/ui/calendar-theme";
import { uploadAnnouncementPosterImage } from "@/lib/announcements/client-upload";
import type { PlatformAnnouncement } from "@/lib/announcements/types";
import { cn } from "@/lib/utils";

type AnnouncementFormProps = {
  mode: "create" | "edit";
  pageTitle: string;
  announcement?: PlatformAnnouncement;
  defaultPriority?: number;
};

export function AnnouncementForm({
  mode,
  pageTitle,
  announcement,
  defaultPriority = 0,
}: AnnouncementFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const editingId = mode === "edit" ? announcement?.id : null;

  const [title, setTitle] = useState(announcement?.title ?? "");
  const [content, setContent] = useState(announcement?.content ?? "");
  const [imageUrl, setImageUrl] = useState(announcement?.imageUrl ?? "");
  const [linkUrl, setLinkUrl] = useState(announcement?.linkUrl ?? "");
  const [startDate, setStartDate] = useState<Date>(
    announcement
      ? new Date(announcement.startDate + "T00:00:00")
      : new Date(),
  );
  const [endDate, setEndDate] = useState<Date>(
    announcement
      ? new Date(announcement.endDate + "T23:59:59")
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  );
  const [showOnHomeBanner, setShowOnHomeBanner] = useState(
    announcement?.showOnHomeBanner ?? false,
  );
  const [showInAnnouncements, setShowInAnnouncements] = useState(
    announcement?.showInAnnouncements ?? true,
  );
  const [priority, setPriority] = useState(
    announcement?.priority ?? defaultPriority,
  );
  const [pendingAnnouncementId, setPendingAnnouncementId] = useState(
    announcement?.id ?? crypto.randomUUID(),
  );
  const [imageObjectKey, setImageObjectKey] = useState<string | null>(
    announcement?.imageObjectKey ?? null,
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFileName(file.name);
      setSelectedFile(file);
      setImageUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      if (!title.trim()) {
        alert("請輸入公告標題");
        return;
      }

      if (!showOnHomeBanner && !showInAnnouncements) {
        alert("請至少選擇一個展示位置");
        return;
      }

      if (showInAnnouncements && !content.trim()) {
        alert("請輸入公告內容詳情");
        return;
      }

      const formattedStartDate = format(startDate, "yyyy-MM-dd");
      const formattedEndDate = format(endDate, "yyyy-MM-dd");

      if (startDate > endDate) {
        alert("下架日期不能早於上架日期");
        return;
      }

      const announcementId = editingId ?? pendingAnnouncementId;
      let nextImageUrl = imageUrl.trim();
      let nextObjectKey = imageObjectKey;

      if (selectedFile) {
        const upload = await uploadAnnouncementPosterImage(
          selectedFile,
          announcementId,
        );
        nextImageUrl = upload.cdnUrl;
        nextObjectKey = upload.objectKey;
      }

      if (!nextImageUrl || nextImageUrl.startsWith("blob:")) {
        nextImageUrl = DEFAULT_ANNOUNCEMENT_POSTER_URL;
        nextObjectKey = null;
      }

      const payload = {
        title: title.trim(),
        content: content.trim(),
        imageUrl: nextImageUrl,
        imageObjectKey: nextObjectKey,
        linkUrl: linkUrl.trim(),
        startDate: formattedStartDate,
        endDate: formattedEndDate,
        isActive: mode === "edit" ? (announcement?.isActive ?? true) : true,
        priority,
        showOnHomeBanner,
        showInAnnouncements,
      };

      const result = editingId
        ? await updatePlatformAnnouncement(editingId, payload)
        : await createPlatformAnnouncement({ ...payload, id: announcementId });

      if (!result.success) {
        alert(result.error);
        return;
      }

      router.push(
        editingId
          ? "/admin/announcements?feedback=updated"
          : "/admin/announcements?feedback=created",
      );
      router.refresh();
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "儲存公告失敗，請稍後再試",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/announcements"
          aria-label="返回公告列表"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-text-secondary transition-colors hover:border-brand/30 hover:bg-brand/10 hover:text-brand active:scale-[0.98]"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
        <h1 className="font-sans text-[24px] font-bold tracking-tight text-text-primary">
          {pageTitle}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <label className={FORM_LABEL_CLASS}>
          標題 <span className="text-warning">*</span>
        </label>
        <Input
          type="text"
          placeholder="公告標題"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={FORM_INPUT_CLASS}
          required
        />
      </div>

      <div className="space-y-2">
        <label className={FORM_LABEL_CLASS}>封面海報圖</label>
        <div className="relative flex items-center justify-center rounded-lg border border-dashed border-white/10 bg-transparent p-3 text-center transition-colors hover:border-brand/40">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          <div className="flex items-center gap-2 font-sans text-[11px] text-text-secondary">
            <Upload className="size-4 shrink-0 text-brand" />
            <span>{selectedFileName || "上傳圖片"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link2 className="size-3.5 shrink-0 text-text-disabled" />
          <Input
            type="text"
            placeholder="圖片 URL"
            value={imageUrl}
            onChange={(e) => {
              setImageUrl(e.target.value);
              setSelectedFileName("");
              setSelectedFile(null);
              setImageObjectKey(null);
            }}
            className={`${FORM_INPUT_CLASS} text-[12px]`}
          />
        </div>
        {imageUrl ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-white/10">
            <Image
              src={imageUrl}
              alt="Preview"
              fill
              className="object-cover"
              unoptimized
            />
            <button
              type="button"
              onClick={() => {
                setImageUrl("");
                setSelectedFileName("");
                setSelectedFile(null);
                setImageObjectKey(null);
              }}
              className="absolute top-2 right-2 rounded-full bg-black/70 p-1 text-white hover:bg-black"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label className={FORM_LABEL_CLASS}>
          內容 <span className="text-warning">*</span>
        </label>
        <Textarea
          rows={4}
          placeholder="公告內文"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className={FORM_TEXTAREA_CLASS}
          required
        />
      </div>

      <div className="space-y-1.5">
        <label className={FORM_LABEL_CLASS}>連結</label>
        <Input
          type="text"
          placeholder="/catalog 或 URL"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          className={`${FORM_INPUT_CLASS} text-[12px]`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={FORM_LABEL_CLASS}>開始</label>
          <Popover>
            <PopoverTrigger
              className={`${FORM_INPUT_CLASS} flex w-full items-center gap-2 font-mono text-[12px]`}
            >
              <CalendarIcon className={cn("size-3.5", CALENDAR_TRIGGER_ICON_CLASS)} />
              {format(startDate, "yyyy-MM-dd")}
            </PopoverTrigger>
            <PopoverContent className={CALENDAR_POPOVER_CONTENT_CLASS} align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => date && setStartDate(date)}
                locale={zhTW}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1.5">
          <label className={FORM_LABEL_CLASS}>結束</label>
          <Popover>
            <PopoverTrigger
              className={`${FORM_INPUT_CLASS} flex w-full items-center gap-2 font-mono text-[12px]`}
            >
              <CalendarIcon className={cn("size-3.5", CALENDAR_TRIGGER_ICON_CLASS)} />
              {format(endDate, "yyyy-MM-dd")}
            </PopoverTrigger>
            <PopoverContent className={CALENDAR_POPOVER_CONTENT_CLASS} align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(date) => date && setEndDate(date)}
                locale={zhTW}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className={FORM_TOGGLE_ROW_CLASS}>
          <span className="font-sans text-[12px] font-semibold text-text-primary">
            首頁 Banner
          </span>
          <Switch
            checked={showOnHomeBanner}
            onCheckedChange={setShowOnHomeBanner}
            className={FORM_SWITCH_CLASS}
          />
        </div>
        <div className={FORM_TOGGLE_ROW_CLASS}>
          <span className="font-sans text-[12px] font-semibold text-text-primary">
            公告彈窗
          </span>
          <Switch
            checked={showInAnnouncements}
            onCheckedChange={setShowInAnnouncements}
            className={FORM_SWITCH_CLASS}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => router.push("/admin/announcements")}
          disabled={isSaving}
          className={`${BTN_OUTLINE_CLASS} min-w-0 flex-1 disabled:opacity-50 disabled:pointer-events-none`}
        >
          取消
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className={`${BTN_PRIMARY_CLASS} min-w-0 flex-1 disabled:opacity-50 disabled:pointer-events-none`}
        >
          {isSaving
            ? "儲存中…"
            : editingId
              ? "儲存變更"
              : "新增公告"}
        </button>
      </div>
    </form>
    </div>
  );
}
