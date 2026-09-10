import { EMAIL_SITE_NAME } from "@/lib/email/constants";
import { EMAIL_COLORS, EMAIL_LAYOUT } from "@/lib/email/design-tokens";

export type BrandedEmailAction = {
  label: string;
  href: string;
  /** Generator-only: Go template href (not HTML-escaped). */
  unsafeHref?: string;
};

export type BrandedEmailLayoutInput = {
  title: string;
  preheader?: string;
  headline: string;
  bodyLines: string[];
  primaryAction?: BrandedEmailAction;
  footerLines?: string[];
  logoUrl?: string;
  /** Generator-only: Go template src (e.g. `{{ .SiteURL }}/asset/logo.png`). */
  unsafeLogoSrc?: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLogoBlock(logoUrl?: string, unsafeLogoSrc?: string): string {
  const src = unsafeLogoSrc ?? logoUrl;
  if (src) {
    const safeSrc = unsafeLogoSrc ? src : escapeHtml(src);
    return `<img src="${safeSrc}" alt="${escapeHtml(EMAIL_SITE_NAME)}" width="120" style="display:block;border:0;max-width:120px;height:auto;" />`;
  }

  return `<span style="font-size:18px;font-weight:700;color:${EMAIL_COLORS.brand};letter-spacing:0.02em;">${escapeHtml(EMAIL_SITE_NAME)}</span>`;
}

function renderBodyLines(bodyLines: string[]): string {
  return bodyLines
    .map(
      (line) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${EMAIL_COLORS.text};">${escapeHtml(line)}</p>`,
    )
    .join("");
}

function renderPrimaryAction(action: BrandedEmailAction): string {
  const href = action.unsafeHref ?? escapeHtml(action.href);
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px 0 8px;">
  <tr>
    <td style="border-radius:10px;background:${EMAIL_COLORS.brand};">
      <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:${EMAIL_COLORS.buttonText};text-decoration:none;border-radius:10px;">
        ${escapeHtml(action.label)}
      </a>
    </td>
  </tr>
</table>`;
}

function renderFooterLines(footerLines: string[]): string {
  return footerLines
    .map(
      (line) =>
        `<p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:${EMAIL_COLORS.textMuted};">${escapeHtml(line)}</p>`,
    )
    .join("");
}

export function buildBrandedEmailHtml(input: BrandedEmailLayoutInput): string {
  const preheader = input.preheader ?? input.headline;
  const footerLines = input.footerLines ?? [
    `${EMAIL_SITE_NAME} — Pokémon TCG 專業交易平台`,
    "如非本人操作，請忽略此郵件或聯絡客服。",
  ];

  const actionBlock = input.primaryAction
    ? renderPrimaryAction(input.primaryAction)
    : "";

  return `<!DOCTYPE html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${EMAIL_COLORS.outerBg};font-family:${EMAIL_LAYOUT.fontFamily};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(preheader)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_COLORS.outerBg};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:${EMAIL_LAYOUT.maxWidth}px;background:${EMAIL_COLORS.cardBg};border:1px solid ${EMAIL_COLORS.border};border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:${EMAIL_COLORS.headerBg};padding:20px 24px;">
                ${renderLogoBlock(input.logoUrl, input.unsafeLogoSrc)}
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 8px;">
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.35;font-weight:700;color:${EMAIL_COLORS.text};">
                  ${escapeHtml(input.headline)}
                </h1>
                ${renderBodyLines(input.bodyLines)}
                ${actionBlock}
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px 24px;border-top:1px solid ${EMAIL_COLORS.border};">
                ${renderFooterLines(footerLines)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildBrandedEmailText(input: BrandedEmailLayoutInput): string {
  const lines = [
    input.headline,
    "",
    ...input.bodyLines,
    "",
  ];

  if (input.primaryAction) {
    lines.push(`${input.primaryAction.label}: ${input.primaryAction.href}`, "");
  }

  const footerLines = input.footerLines ?? [
    EMAIL_SITE_NAME,
    "如非本人操作，請忽略此郵件或聯絡客服。",
  ];
  lines.push(...footerLines);

  return lines.join("\n");
}

export function resolveEmailLogoUrl(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/asset/logo.png`;
}
