import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  MERCHANT_APPLY_ONBOARDING_INTENT,
  MERCHANT_APPLY_POST_CONFIRM_PATH,
  MEMBER_POST_CONFIRM_PATH,
} from "@/lib/auth/post-confirm-paths";
import {
  buildBrandedEmailHtml,
  buildBrandedEmailText,
} from "@/lib/email/layout";

const OUTPUT_DIR = join(process.cwd(), "supabase/templates/auth");
const SITE_URL = "{{ .SiteURL }}";
const TOKEN_HASH = "{{ .TokenHash }}";
const LOGO_SRC = `${SITE_URL}/asset/logo.png`;

function buildTokenCallbackHref(type: string, nextPath: string): string {
  return `${SITE_URL}/auth/callback?token_hash=${TOKEN_HASH}&type=${type}&next=${nextPath}`;
}

type TemplateSpec = {
  fileBase: string;
  subject: string;
  layout: Parameters<typeof buildBrandedEmailHtml>[0];
  textLayout: Parameters<typeof buildBrandedEmailText>[0];
};

function buildConfirmSignupSubject(): string {
  return `{{ if eq .Data.onboarding_intent "${MERCHANT_APPLY_ONBOARDING_INTENT}" }}確認電郵 — 開始商戶入駐 · Cardvault HK{{ else }}確認你的 Cardvault HK 帳戶{{ end }}`;
}

function buildConfirmSignupTemplates(): {
  subject: string;
  html: string;
  text: string;
} {
  const memberLayout = {
    title: "確認你的電郵",
    preheader: "請確認電郵以啟用 Cardvault HK 帳戶",
    headline: "歡迎加入 Cardvault HK",
    bodyLines: [
      "感謝註冊！請確認你的電郵地址以啟用帳戶。",
      "確認後即可開始瀏覽、議價與交易 Pokémon TCG 卡牌。",
    ],
    primaryAction: {
      label: "確認電郵",
      href: "#",
      unsafeHref: buildTokenCallbackHref("signup", MEMBER_POST_CONFIRM_PATH),
    },
    unsafeLogoSrc: LOGO_SRC,
    footerLines: [
      "Cardvault HK — Pokémon TCG 專業交易平台",
      "如非本人註冊，請忽略此郵件。",
    ],
  } satisfies Parameters<typeof buildBrandedEmailHtml>[0];

  const merchantLayout = {
    title: "確認電郵 — 商戶入駐",
    preheader: "請確認電郵以繼續 Cardvault HK 商戶入駐申請",
    headline: "歡迎申請 Cardvault HK 認證商戶",
    bodyLines: [
      "感謝你申請成為認證商戶！請先確認電郵地址以啟用帳戶。",
      "確認後將帶你前往入駐申請頁，提交公司資料及 KYC 文件。",
      "通過審核後即可開設商戶櫥窗、連接 Stripe 收款，並管理 B2C 訂單與撥款。",
    ],
    primaryAction: {
      label: "確認電郵並繼續入駐",
      href: "#",
      unsafeHref: buildTokenCallbackHref(
        "signup",
        MERCHANT_APPLY_POST_CONFIRM_PATH,
      ),
    },
    unsafeLogoSrc: LOGO_SRC,
    footerLines: [
      "Cardvault HK — 認證商戶入駐",
      "如非本人申請，請忽略此郵件。",
    ],
  } satisfies Parameters<typeof buildBrandedEmailHtml>[0];

  const memberTextLayout = {
    title: "確認你的電郵",
    headline: "歡迎加入 Cardvault HK",
    bodyLines: [
      "感謝註冊！請確認你的電郵地址以啟用帳戶。",
      "確認後即可開始瀏覽、議價與交易。",
    ],
    primaryAction: {
      label: "確認電郵",
      href: buildTokenCallbackHref("signup", MEMBER_POST_CONFIRM_PATH),
    },
    footerLines: ["Cardvault HK", "如非本人註冊，請忽略此郵件。"],
  } satisfies Parameters<typeof buildBrandedEmailText>[0];

  const merchantTextLayout = {
    title: "確認電郵 — 商戶入駐",
    headline: "歡迎申請 Cardvault HK 認證商戶",
    bodyLines: [
      "感謝你申請成為認證商戶！請先確認電郵地址以啟用帳戶。",
      "確認後將帶你前往入駐申請頁，提交公司資料及 KYC 文件。",
      "通過審核後即可開設商戶櫥窗、連接 Stripe 收款，並管理 B2C 訂單與撥款。",
    ],
    primaryAction: {
      label: "確認電郵並繼續入駐",
      href: buildTokenCallbackHref("signup", MERCHANT_APPLY_POST_CONFIRM_PATH),
    },
    footerLines: ["Cardvault HK", "如非本人申請，請忽略此郵件。"],
  } satisfies Parameters<typeof buildBrandedEmailText>[0];

  const merchantCondition = `eq .Data.onboarding_intent "${MERCHANT_APPLY_ONBOARDING_INTENT}"`;

  return {
    subject: buildConfirmSignupSubject(),
    html: `{{ if ${merchantCondition} }}\n${buildBrandedEmailHtml(merchantLayout)}\n{{ else }}\n${buildBrandedEmailHtml(memberLayout)}\n{{ end }}`,
    text: `{{ if ${merchantCondition} }}\n${buildBrandedEmailText(merchantTextLayout)}\n{{ else }}\n${buildBrandedEmailText(memberTextLayout)}\n{{ end }}`,
  };
}

const TEMPLATES: TemplateSpec[] = [
  {
    fileBase: "reset-password",
    subject: "重設你的 Cardvault HK 密碼",
    layout: {
      title: "重設密碼",
      preheader: "你申請了重設 Cardvault HK 密碼",
      headline: "重設密碼",
      bodyLines: [
        "我們收到你申請重設密碼的請求。",
        "請點擊下方按鈕設定新密碼。連結將在短時間後失效。",
      ],
      primaryAction: {
        label: "重設密碼",
        href: "#",
        unsafeHref: buildTokenCallbackHref(
          "recovery",
          "/auth/forgot-password/complete",
        ),
      },
      unsafeLogoSrc: LOGO_SRC,
      footerLines: [
        "Cardvault HK — Pokémon TCG 專業交易平台",
        "如非本人申請，請忽略此郵件並檢查帳戶安全。",
      ],
    },
    textLayout: {
      title: "重設密碼",
      headline: "重設密碼",
      bodyLines: [
        "我們收到你申請重設密碼的請求。",
        "請使用以下連結設定新密碼。連結將在短時間後失效。",
      ],
      primaryAction: {
        label: "重設密碼",
        href: buildTokenCallbackHref(
          "recovery",
          "/auth/forgot-password/complete",
        ),
      },
      footerLines: [
        "Cardvault HK",
        "如非本人申請，請忽略此郵件。",
      ],
    },
  },
  {
    fileBase: "magic-link",
    subject: "登入 Cardvault HK",
    layout: {
      title: "登入連結",
      preheader: "你的 Cardvault HK 一次性登入連結",
      headline: "登入 Cardvault HK",
      bodyLines: [
        "請點擊下方按鈕登入帳戶。",
        "此連結僅可使用一次，並將在短時間後失效。",
      ],
      primaryAction: {
        label: "登入",
        href: "#",
        unsafeHref: buildTokenCallbackHref("magiclink", "/profile/user"),
      },
      unsafeLogoSrc: LOGO_SRC,
    },
    textLayout: {
      title: "登入連結",
      headline: "登入 Cardvault HK",
      bodyLines: [
        "請使用以下連結登入帳戶。",
        "此連結僅可使用一次。",
      ],
      primaryAction: {
        label: "登入",
        href: buildTokenCallbackHref("magiclink", "/profile/user"),
      },
    },
  },
  {
    fileBase: "change-email",
    subject: "確認你的新電郵地址",
    layout: {
      title: "確認新電郵",
      preheader: "請確認你的 Cardvault HK 新電郵地址",
      headline: "確認新電郵地址",
      bodyLines: [
        "你正在更改 Cardvault HK 帳戶的登入電郵。",
        "請點擊下方按鈕確認新電郵地址。",
      ],
      primaryAction: {
        label: "確認新電郵",
        href: "#",
        unsafeHref: buildTokenCallbackHref("email_change", "/profile/user/settings"),
      },
      unsafeLogoSrc: LOGO_SRC,
    },
    textLayout: {
      title: "確認新電郵",
      headline: "確認新電郵地址",
      bodyLines: [
        "你正在更改帳戶登入電郵。",
        "請使用以下連結確認新電郵地址。",
      ],
      primaryAction: {
        label: "確認新電郵",
        href: buildTokenCallbackHref("email_change", "/profile/user/settings"),
      },
    },
  },
];

mkdirSync(OUTPUT_DIR, { recursive: true });

const confirmSignup = buildConfirmSignupTemplates();
writeFileSync(
  join(OUTPUT_DIR, "confirm-signup.subject.txt"),
  confirmSignup.subject,
  "utf8",
);
writeFileSync(join(OUTPUT_DIR, "confirm-signup.html"), confirmSignup.html, "utf8");
writeFileSync(join(OUTPUT_DIR, "confirm-signup.txt"), confirmSignup.text, "utf8");

for (const template of TEMPLATES) {
  writeFileSync(
    join(OUTPUT_DIR, `${template.fileBase}.subject.txt`),
    template.subject,
    "utf8",
  );
  writeFileSync(
    join(OUTPUT_DIR, `${template.fileBase}.html`),
    buildBrandedEmailHtml(template.layout),
    "utf8",
  );
  writeFileSync(
    join(OUTPUT_DIR, `${template.fileBase}.txt`),
    buildBrandedEmailText(template.textLayout),
    "utf8",
  );
}

console.log(
  `Generated ${TEMPLATES.length + 1} Supabase auth email templates in ${OUTPUT_DIR}`,
);
