import { DEFAULT_ANNOUNCEMENT_POSTER_URL } from "@/lib/announcements/defaults";
import type { PlatformAnnouncementInput } from "@/lib/announcements/types";

function isValidHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidLinkUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("/")) return true;
  return isValidHttpsUrl(trimmed);
}

export function validateAnnouncementInput(
  input: PlatformAnnouncementInput,
): string | null {
  const showOnHomeBanner = input.showOnHomeBanner ?? false;
  const showInAnnouncements = input.showInAnnouncements ?? true;

  if (!showOnHomeBanner && !showInAnnouncements) {
    return "請至少選擇一個展示位置（首頁 Banner 或公告）";
  }

  if (!input.title.trim()) {
    return "請輸入公告標題";
  }

  if (showInAnnouncements && !input.content.trim()) {
    return "請輸入公告內容";
  }

  const imageUrl = input.imageUrl.trim();
  if (!imageUrl || imageUrl.startsWith("blob:")) {
    return "請上傳封面圖或提供有效圖片網址";
  }

  if (!isValidHttpsUrl(imageUrl) && imageUrl !== DEFAULT_ANNOUNCEMENT_POSTER_URL) {
    return "圖片網址須為 https";
  }

  if (input.linkUrl && !isValidLinkUrl(input.linkUrl)) {
    return "跳轉連結須為 /path 或 https 網址";
  }

  if (!input.startDate || !input.endDate) {
    return "請設定上架與下架日期";
  }

  if (input.startDate > input.endDate) {
    return "下架日期不能早於上架日期";
  }

  return null;
}
