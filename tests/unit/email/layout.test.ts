import { describe, expect, it } from "vitest";
import { EMAIL_COLORS } from "@/lib/email/design-tokens";
import {
  buildBrandedEmailHtml,
  buildBrandedEmailText,
  resolveEmailLogoUrl,
} from "@/lib/email/layout";

describe("buildBrandedEmailHtml", () => {
  it("renders branded shell with CTA and brand colors", () => {
    const html = buildBrandedEmailHtml({
      title: "測試郵件",
      headline: "測試標題",
      bodyLines: ["第一行正文", "第二行正文"],
      primaryAction: {
        label: "確認電郵",
        href: "https://cardvaulthk.com/auth/callback",
      },
      logoUrl: "https://cardvaulthk.com/asset/logo.png",
    });

    expect(html).toContain(EMAIL_COLORS.headerBg);
    expect(html).toContain(EMAIL_COLORS.brand);
    expect(html).toContain("測試標題");
    expect(html).toContain("確認電郵");
    expect(html).toContain("https://cardvaulthk.com/auth/callback");
    expect(html).toContain("https://cardvaulthk.com/asset/logo.png");
  });

  it("builds plain text with action link", () => {
    const text = buildBrandedEmailText({
      title: "測試",
      headline: "標題",
      bodyLines: ["正文"],
      primaryAction: {
        label: "確認電郵",
        href: "https://cardvaulthk.com/auth/callback",
      },
    });

    expect(text).toContain("標題");
    expect(text).toContain("確認電郵: https://cardvaulthk.com/auth/callback");
  });

  it("resolves logo url from site origin", () => {
    expect(resolveEmailLogoUrl("https://cardvaulthk.com/")).toBe(
      "https://cardvaulthk.com/asset/logo.png",
    );
  });
});
