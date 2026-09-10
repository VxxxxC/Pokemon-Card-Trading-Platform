/**
 * One-shot batch: inject requiredElements for surfaces missing L2+ contracts.
 * Run: bun scripts/apply-l2-plus-batch.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DISPUTES_SHELL = [
  { id: "disputes-heading", role: "heading", name: "舉報與爭議仲裁工作台" },
  { id: "case-search", role: "textbox", pattern: "搜尋案件" },
  { id: "tab-pending", role: "tab", pattern: "待處理" },
];

const ADMIN_SETTINGS_SHELL = [
  { id: "financials-heading", role: "heading", locator: "#financials-heading" },
  { id: "auth-fee-label", role: "text", name: "單張卡牌保管鑑定費" },
];

const ADMIN_CAMPAIGNS_SHELL = [
  { id: "campaigns-heading", role: "heading", name: "積分與獎勵活動" },
  { id: "check-in-tab", role: "button", name: "簽到計劃" },
  { id: "activities-tab", role: "button", name: "獎勵活動" },
];

const ADMIN_PAYOUTS_SHELL = [
  { id: "payouts-heading", role: "heading", name: "財務與結算管控台" },
  { id: "fps-batch", role: "button", pattern: "FPS 批次處理" },
];

const GRADING_SHELL = [
  { id: "grading-heading", role: "heading", name: "鑑定工作台" },
  { id: "tab-awaiting-intake", role: "button", name: "待入庫" },
  { id: "tab-grading", role: "button", name: "鑑定中" },
];

const TERMS_SHELL = [
  { id: "terms-h1", role: "heading", pattern: "服務條款" },
  { id: "terms-body", role: "text", locator: "article" },
];

const REWARDS_SHELL = [
  { id: "rewards-center-heading", role: "heading", name: "會員獎勵與任務中心" },
  { id: "campaigns-hub-link", role: "link", pattern: "限時搶券.*積分商城" },
  { id: "coupon-center", role: "heading", pattern: "折價券中心" },
];

const USER_TRADING_SHELL = [
  { id: "trading-heading", role: "heading", locator: "#user-trading-heading" },
  { id: "orders-list", role: "text", locator: "#orders-list" },
  { id: "status-all", role: "button", pattern: "^全部" },
  { id: "status-pending", role: "button", pattern: "^待處理" },
];

const MERCHANT_TRADING_SHELL = [
  { id: "trading-heading", role: "heading", pattern: "交易管理" },
  { id: "tab-all", role: "button", pattern: "^全部" },
  { id: "tab-pending", role: "button", pattern: "^待處理" },
  { id: "order-search", role: "textbox", pattern: "輸入卡牌名稱" },
];

const MERCHANT_INVENTORY_SHELL = [
  { id: "listings-heading", role: "heading", locator: "#listings-heading" },
  { id: "all-products", role: "text", name: "所有商品" },
  { id: "add-product", role: "button", pattern: "新增商品" },
];

const PRODUCT_DETAIL_SHELL = [
  { id: "order-book-panel", role: "text", locator: "#live-order-book-panel" },
  { id: "buy-now-button", role: "button", pattern: "立即購買", optional: true },
];

const BY_SURFACE: Record<string, object[]> = {
  "auth-login": [
    { id: "login-email", role: "textbox", locator: 'input[name="email"]' },
    { id: "login-password", role: "textbox", locator: 'input[name="password"]' },
    { id: "login-submit", role: "button", locator: 'form button[type="submit"]' },
  ],
  "settings-logout": [
    { id: "settings-heading", role: "text", name: "帳戶設定" },
    { id: "logout-button", role: "button", name: "登出" },
    { id: "profile-section", role: "text", name: "個人資料" },
  ],
  "forgot-password": [
    { id: "forgot-heading", role: "heading", name: "忘記密碼" },
    { id: "email-field", role: "textbox", pattern: "電子郵件" },
    { id: "send-reset", role: "button", name: "發送重設連結" },
  ],
  suspended: [
    { id: "suspended-message", role: "text", name: "帳戶已暫停" },
    { id: "logout-return", role: "button", name: "登出並返回登入" },
  ],
  storefront: [
    { id: "certified-merchant", role: "text", pattern: "認證商戶" },
    {
      id: "storefront-search",
      role: "textbox",
      locator: 'input[placeholder*="搜尋此商戶"]',
    },
  ],
  "public-profile": [
    { id: "total-trades", role: "text", name: "完成交易" },
    { id: "active-listings", role: "text", pattern: "上架中的商品" },
    { id: "report-user", role: "button", pattern: "舉報用戶", optional: true },
  ],
  "public-ratings": [
    { id: "ratings-heading", role: "heading", name: "全量信用評價歷史" },
  ],
  collection: [
    { id: "cards-heading", role: "heading", locator: "#cards-heading" },
    { id: "add-card-button", role: "button", name: "收錄新卡" },
  ],
  "member-inventory": [
    { id: "listings-heading", role: "heading", locator: "#listings-heading" },
    { id: "all-products", role: "text", name: "所有商品" },
    { id: "sku-count", role: "text", pattern: "款 卡牌" },
  ],
  "member-settings": [
    { id: "settings-heading", role: "text", name: "帳戶設定" },
    { id: "profile-section", role: "text", name: "個人資料" },
    { id: "save-changes", role: "button", name: "儲存更改" },
  ],
  "chat-entry-trading": USER_TRADING_SHELL,
  "member-trading": USER_TRADING_SHELL,
  "auth-trading-list": USER_TRADING_SHELL,
  "order-detail-entry": USER_TRADING_SHELL,
  "offer-marketplace": PRODUCT_DETAIL_SHELL,
  "rewards-wallet": REWARDS_SHELL,
  "admin-campaigns-coupon": ADMIN_CAMPAIGNS_SHELL,
  rewards: REWARDS_SHELL,
  "report-profile": [
    { id: "total-trades", role: "text", name: "完成交易" },
    { id: "report-user", role: "button", pattern: "舉報用戶" },
  ],
  "disputes-inbox": DISPUTES_SHELL,
  announcements: [
    {
      id: "announcements-heading",
      role: "heading",
      name: "📢 平台官方公告與最新活動",
    },
    { id: "active-events-tab", role: "button", pattern: "進行中活動" },
    { id: "past-announcements-tab", role: "button", pattern: "過往公告歷史" },
  ],
  terms: TERMS_SHELL,
  privacy: [
    { id: "privacy-h1", role: "heading", pattern: "私隱政策" },
    { id: "privacy-body", role: "text", locator: "article" },
  ],
  "member-seller-trading": [
    ...USER_TRADING_SHELL,
    { id: "persona-sell", role: "button", pattern: "^賣單" },
  ],
  "merchant-dashboard": [
    { id: "pending-orders-heading", role: "heading", name: "待處理訂單" },
    { id: "kyc-status", role: "text", pattern: "KYC 已驗證|審核中" },
  ],
  "merchant-inventory-list": MERCHANT_INVENTORY_SHELL,
  "merchant-settings": [
    { id: "settings-heading", role: "heading", name: "店舖安全與設定中心" },
    { id: "shop-profile-heading", role: "heading", name: "店舖資料" },
    { id: "security-heading", role: "heading", name: "安全設定" },
  ],
  "merchant-finance": [
    { id: "monthly-payout", role: "text", name: "本月撥款收入（已結算）" },
    { id: "payout-history", role: "heading", pattern: "撥款記錄" },
    { id: "stripe-connect-heading", role: "heading", name: "Stripe Connect 帳戶" },
  ],
  "merchant-performance": [
    { id: "performance-heading", role: "heading", name: "店舖經營與業績分析" },
    { id: "total-revenue", role: "text", name: "歷史累計總營業額" },
    { id: "total-trades", role: "text", name: "歷史累計總成交次數" },
  ],
  "merchant-apply": [
    { id: "kyc-heading", role: "heading", pattern: "商戶入駐申請" },
    { id: "submit-apply", role: "button", pattern: "提交商戶入駐申請", optional: true },
  ],
  "connect-finance": [
    { id: "stripe-connect-heading", role: "heading", name: "Stripe Connect 帳戶" },
    {
      id: "connect-status",
      role: "text",
      pattern: "已連結 · Express 帳戶|待完成收款設定",
    },
  ],
  "b2c-marketplace": PRODUCT_DETAIL_SHELL,
  "merchant-trading-orders": MERCHANT_TRADING_SHELL,
  "upload-inventory": MERCHANT_INVENTORY_SHELL,
  "merchant-trading-grading": [
    ...MERCHANT_TRADING_SHELL,
    { id: "raw-filter", role: "checkbox", name: "只顯示 RAW/裸卡" },
  ],
  "admin-disputes-refund": DISPUTES_SHELL,
  "admin-disputes-freeze": DISPUTES_SHELL,
  "admin-campaigns-c2c": ADMIN_CAMPAIGNS_SHELL,
  "admin-fee-settings": ADMIN_SETTINGS_SHELL,
  "admin-fps": ADMIN_PAYOUTS_SHELL,
  "aml-terms": TERMS_SHELL,
  "coupon-rewards": [
    { id: "coupon-center", role: "heading", pattern: "折價券中心" },
    { id: "redeemable-label", role: "text", pattern: "可領取" },
  ],
  "moderation-disputes": DISPUTES_SHELL,
  "grading-workbench": GRADING_SHELL,
  "cc-settings": ADMIN_SETTINGS_SHELL,
  "legal-terms": TERMS_SHELL,
  "expiry-trading": MERCHANT_TRADING_SHELL,
  "policy-terms": TERMS_SHELL,
};

const mapPath = path.join(process.cwd(), "docs/dev/ui-feature-map.json");
const map = JSON.parse(readFileSync(mapPath, "utf8")) as {
  features: Array<{
    surfaces?: Array<{ id: string; requiredElements?: unknown[] }>;
  }>;
};

let applied = 0;
const missing: string[] = [];

for (const feature of map.features) {
  for (const surface of feature.surfaces ?? []) {
    if (surface.requiredElements?.length) continue;
    const elements = BY_SURFACE[surface.id];
    if (!elements) {
      missing.push(surface.id);
      continue;
    }
    surface.requiredElements = elements;
    applied++;
  }
}

if (missing.length) {
  console.error("Missing definitions for:", missing.join(", "));
  process.exit(1);
}

writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
console.log(`Applied requiredElements to ${applied} surfaces`);
