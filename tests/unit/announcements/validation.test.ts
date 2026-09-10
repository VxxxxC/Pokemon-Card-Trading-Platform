import { describe, expect, it } from "vitest";
import { DEFAULT_ANNOUNCEMENT_POSTER_URL } from "@/lib/announcements/defaults";
import { validateAnnouncementInput } from "@/lib/announcements/validation";

const validInput = {
  title: "Summer promo",
  content: "Limited-time trading fee waiver for graded cards.",
  imageUrl: DEFAULT_ANNOUNCEMENT_POSTER_URL,
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  isActive: true,
};

describe("validateAnnouncementInput", () => {
  it("accepts valid input", () => {
    expect(validateAnnouncementInput(validInput)).toBeNull();
  });

  it("rejects empty title", () => {
    expect(
      validateAnnouncementInput({ ...validInput, title: "   " }),
    ).toBe("請輸入公告標題");
  });

  it("rejects empty content when announcements surface is enabled", () => {
    expect(
      validateAnnouncementInput({ ...validInput, content: "" }),
    ).toBe("請輸入公告內容");
  });

  it("allows empty content for banner-only surface", () => {
    expect(
      validateAnnouncementInput({
        ...validInput,
        content: "",
        showOnHomeBanner: true,
        showInAnnouncements: false,
      }),
    ).toBeNull();
  });

  it("rejects when no display surface is selected", () => {
    expect(
      validateAnnouncementInput({
        ...validInput,
        showOnHomeBanner: false,
        showInAnnouncements: false,
      }),
    ).toBe("請至少選擇一個展示位置（首頁 Banner 或公告）");
  });

  it("rejects blob image URLs", () => {
    expect(
      validateAnnouncementInput({
        ...validInput,
        imageUrl: "blob:http://localhost/preview",
      }),
    ).toBe("請上傳封面圖或提供有效圖片網址");
  });

  it("rejects invalid link URLs", () => {
    expect(
      validateAnnouncementInput({
        ...validInput,
        linkUrl: "javascript:alert(1)",
      }),
    ).toBe("跳轉連結須為 /path 或 https 網址");
  });

  it("accepts internal link paths", () => {
    expect(
      validateAnnouncementInput({ ...validInput, linkUrl: "/catalog" }),
    ).toBeNull();
  });

  it("rejects end date before start date", () => {
    expect(
      validateAnnouncementInput({
        ...validInput,
        startDate: "2026-08-31",
        endDate: "2026-08-01",
      }),
    ).toBe("下架日期不能早於上架日期");
  });
});
