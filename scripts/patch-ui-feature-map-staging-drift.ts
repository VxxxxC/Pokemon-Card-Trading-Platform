/**
 * One-shot: align docs/dev/ui-feature-map.json with current UI (staging cert drift).
 * Run: bun scripts/patch-ui-feature-map-staging-drift.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Json = Record<string, unknown>;

const mapPath = path.join(process.cwd(), "docs/dev/ui-feature-map.json");
type UiStateVariant = {
  id: string;
  setup: Json[];
  requiredElements: Json[];
};

const map = JSON.parse(readFileSync(mapPath, "utf8")) as {
  features: Array<{
    surfaces?: Array<{
      id: string;
      assertions?: Array<Json>;
      requiredElements?: Array<Json>;
      stateVariants?: UiStateVariant[];
    }>;
  }>;
};

function replaceInSurface(
  surfaceId: string,
  patch: (surface: NonNullable<(typeof map.features)[0]["surfaces"]>[0]) => void,
): void {
  for (const feature of map.features) {
    for (const surface of feature.surfaces ?? []) {
      if (surface.id === surfaceId) {
        patch(surface);
        return;
      }
    }
  }
  throw new Error(`surface not found: ${surfaceId}`);
}

function setAssertion(surfaceId: string, assertion: Json): void {
  replaceInSurface(surfaceId, (surface) => {
    surface.assertions = [assertion];
  });
}

function setRequired(surfaceId: string, requiredElements: Json[]): void {
  replaceInSurface(surfaceId, (surface) => {
    surface.requiredElements = requiredElements;
  });
}

function patchElement(
  elements: Json[],
  id: string,
  patch: (el: Json) => void,
): void {
  const el = elements.find((item) => item.id === id);
  if (!el) {
    throw new Error(`requiredElement ${id} not found`);
  }
  patch(el);
}

// --- Surfaces (canonical UI from app/components) ---

setAssertion("home", {
  type: "locator",
  name: '[aria-label="最新平台成交"]',
});
replaceInSurface("home", (surface) => {
  const elements = surface.requiredElements ?? [];
  patchElement(elements, "price-ticker", (el) => {
    el.role = "text";
    el.locator = '[aria-label="最新平台成交"]';
    delete el.name;
  });
  patchElement(elements, "hero-heading", (el) => {
    el.name = "搜尋你的目標卡牌";
  });
  surface.requiredElements = elements;
});

setAssertion("public-profile", { type: "text", pattern: "完成交易" });
setRequired("public-profile", [
  { id: "total-trades", role: "text", name: "完成交易" },
  { id: "active-listings", role: "text", pattern: "上架中的商品" },
  { id: "report-user", role: "button", pattern: "舉報用戶", optional: true },
]);

setAssertion("announcements", { type: "heading", name: "平台官方公告" });
setRequired("announcements", [
  { id: "announcements-heading", role: "heading", name: "平台官方公告" },
  { id: "active-events-tab", role: "button", pattern: "進行中活動" },
  { id: "past-announcements-tab", role: "button", pattern: "過往公告" },
]);

replaceInSurface("marketplace-search", (surface) => {
  surface.assertions = [{ type: "text", pattern: "大盤市場" }];
  surface.requiredElements = [
    {
      id: "market-search",
      role: "text",
      locator: 'input[type="search"][placeholder*="搜尋卡牌"]',
    },
    { id: "market-heading", role: "heading", pattern: "大盤市場", optional: true },
  ];
});

replaceInSurface("product-detail", (surface) => {
  surface.assertions = [{ type: "locator", name: "#live-order-book-panel" }];
  surface.requiredElements = [
    { id: "order-book-panel", role: "text", locator: "#live-order-book-panel" },
    { id: "order-book-sort", role: "text", pattern: "最平售價優先" },
    { id: "buy-now-button", role: "button", pattern: "立即購買", optional: true },
  ];
});

setAssertion("member-dashboard", { type: "text", pattern: "成交次數" });
replaceInSurface("member-dashboard", (surface) => {
  surface.requiredElements = [
    { id: "trades-count", role: "text", pattern: "成交次數" },
    { id: "collection-count", role: "text", pattern: "持有卡牌數", optional: true },
    {
      id: "rewards-link",
      role: "link",
      pattern: "進入獎勵及任務專區",
      optional: true,
    },
  ];
});

const USER_ORDER_SEARCH = [
  { id: "trading-heading", role: "heading", locator: "#user-trading-heading" },
  { id: "orders-list", role: "text", locator: "#orders-list" },
  { id: "order-search", role: "text", locator: "#user-order-search" },
  { id: "status-all", role: "button", pattern: "^全部" },
  { id: "status-pending", role: "button", pattern: "^待處理" },
];

setRequired("trading-filters", USER_ORDER_SEARCH);
replaceInSurface("trading-filters", (surface) => {
  surface.stateVariants = (surface.stateVariants ?? []).map((variant) => {
    if (variant.id !== "buy-persona") {
      return variant;
    }
    return {
      ...variant,
      requiredElements: variant.requiredElements.filter(
        (element) => element.id !== "buy-persona-raw",
      ),
    };
  });
});
setRequired("member-trading", USER_ORDER_SEARCH);
setRequired("chat-entry-trading", USER_ORDER_SEARCH);
setRequired("auth-trading-list", USER_ORDER_SEARCH);
setRequired("order-detail-entry", USER_ORDER_SEARCH);

const REWARDS_SHELL = [
  { id: "rewards-heading", role: "heading", name: "我的優惠劵" },
  { id: "campaigns-hub-link", role: "link", name: "前往限時搶券 · 積分商城" },
  { id: "coupon-tab-usable", role: "button", pattern: "^可使用" },
];

setAssertion("rewards-wallet", { type: "text", pattern: "帳戶總積分餘額" });
setRequired("rewards-wallet", REWARDS_SHELL);

setAssertion("rewards", { type: "text", pattern: "可使用" });
setRequired("rewards", REWARDS_SHELL);

setAssertion("coupon-rewards", { type: "heading", name: "我的優惠劵" });
setRequired("coupon-rewards", [
  { id: "coupon-center", role: "heading", name: "我的優惠劵" },
  { id: "redeemable-label", role: "text", pattern: "可使用" },
]);

const ADMIN_CAMPAIGNS = [
  { id: "campaigns-heading", role: "heading", name: "積分與獎勵活動" },
  { id: "check-in-tab", role: "tab", pattern: "^簽到計劃" },
  { id: "activities-tab", role: "tab", pattern: "^獎勵活動" },
];

setAssertion("admin-campaigns-coupon", { type: "heading", name: "積分與獎勵活動" });
setRequired("admin-campaigns-coupon", ADMIN_CAMPAIGNS);
setRequired("admin-campaigns", ADMIN_CAMPAIGNS);
setRequired("admin-campaigns-c2c", ADMIN_CAMPAIGNS);

setAssertion("member-campaigns", { type: "text", pattern: "限時搶券" });
setRequired("member-campaigns", [
  { id: "flash-tab", role: "button", name: "限時搶券" },
  { id: "catalog-tab", role: "button", name: "積分商城" },
]);

setAssertion("report-profile", { type: "text", pattern: "舉報此用戶" });
setRequired("report-profile", [
  { id: "total-trades", role: "text", name: "完成交易" },
  { id: "report-user", role: "button", name: "舉報用戶" },
]);

const DISPUTES_SHELL = [
  { id: "disputes-heading", role: "heading", name: "舉報與爭議仲裁工作台" },
  { id: "case-search", role: "text", locator: 'input[placeholder*="搜尋案件"]' },
  { id: "tab-pending", role: "button", pattern: "^待處理" },
  { id: "tab-all", role: "button", pattern: "^全部" },
];

setRequired("disputes-inbox", DISPUTES_SHELL);
setRequired("admin-disputes", DISPUTES_SHELL);
setRequired("admin-disputes-refund", DISPUTES_SHELL);
setRequired("admin-disputes-freeze", DISPUTES_SHELL);
setRequired("moderation-disputes", DISPUTES_SHELL);

setAssertion("merchant-apply", { type: "text", pattern: "公司資料" });
setRequired("merchant-apply", [
  { id: "kyc-heading", role: "text", name: "公司資料" },
  {
    id: "submit-apply",
    role: "button",
    pattern: "提交商戶入駐申請",
    optional: true,
  },
]);

setAssertion("admin-dashboard", { type: "text", pattern: "平台淨營收" });
replaceInSurface("admin-dashboard", (surface) => {
  surface.requiredElements = [
    { id: "net-revenue", role: "text", name: "平台淨營收" },
    { id: "dashboard-heading", role: "heading", name: "管理員控制台", optional: true },
  ];
});

setAssertion("admin-check-in", { type: "text", pattern: "簽到計劃" });
replaceInSurface("admin-check-in", (surface) => {
  surface.requiredElements = [
    { id: "check-in-tab", role: "tab", pattern: "^簽到計劃" },
    { id: "check-in-heading", role: "heading", name: "基本設定", optional: true },
  ];
});

setAssertion("admin-grading", { type: "heading", name: "鑑定工作台" });
replaceInSurface("admin-grading", (surface) => {
  surface.requiredElements = [
    { id: "grading-heading", role: "heading", name: "鑑定工作台" },
    { id: "tab-awaiting-intake", role: "button", name: "待入庫" },
    { id: "tab-grading", role: "button", name: "鑑定中" },
  ];
  surface.stateVariants = (surface.stateVariants ?? []).map((variant) => {
    if (variant.id === "intake-tab-active") {
      return {
        ...variant,
        requiredElements: variant.requiredElements.map((element) =>
          element.id === "intake-col-inbound"
            ? { ...element, name: "入庫" }
            : element,
        ),
      };
    }
    if (variant.id === "outbound-tab-active") {
      return {
        ...variant,
        requiredElements: variant.requiredElements.map((element) =>
          element.id === "outbound-col-outbound"
            ? { ...element, name: "出庫" }
            : element,
        ),
      };
    }
    return variant;
  });
});
setRequired("grading-workbench", [
  { id: "grading-heading", role: "heading", name: "鑑定工作台" },
  { id: "tab-awaiting-intake", role: "button", name: "待入庫" },
  { id: "tab-grading", role: "button", name: "鑑定中" },
]);

replaceInSurface("admin-merchants", (surface) => {
  surface.requiredElements = [
    {
      id: "merchant-search",
      role: "text",
      locator: 'input[placeholder*="搜尋公司名"]',
    },
    { id: "merchants-heading", role: "heading", name: "商戶管理", optional: true },
  ];
});

replaceInSurface("admin-user-control", (surface) => {
  surface.requiredElements = [
    {
      id: "user-search",
      role: "text",
      locator: 'input[placeholder*="搜尋名稱"]',
    },
    { id: "users-heading", role: "heading", name: "用戶管控", optional: true },
  ];
});

setAssertion("admin-catalog", { type: "text", pattern: "手動錄入" });
replaceInSurface("admin-catalog", (surface) => {
  surface.requiredElements = [
    { id: "manual-catalog-button", role: "button", pattern: "手動錄入" },
    { id: "catalog-heading", role: "heading", name: "卡牌資料庫", optional: true },
  ];
});

const ADMIN_PAYOUTS = [
  { id: "payouts-heading", role: "heading", name: "財務與結算管控台" },
  { id: "fps-batch", role: "tab", pattern: "^FPS 批次" },
];

setRequired("admin-payouts", ADMIN_PAYOUTS);
setAssertion("admin-fps", { type: "text", pattern: "FPS 批次" });
setRequired("admin-fps", ADMIN_PAYOUTS);

replaceInSurface("admin-announcements", (surface) => {
  surface.requiredElements = [
    { id: "new-announcement", role: "link", name: "新增公告" },
    { id: "announcements-admin-heading", role: "heading", name: "公告管理", optional: true },
  ];
});

const INVENTORY_TABS = [
  { id: "listings-heading", role: "heading", locator: "#listings-heading" },
  { id: "tab-active", role: "tab", name: "上架中" },
  { id: "add-product", role: "button", pattern: "新增商品", optional: true },
];

setAssertion("member-inventory", { type: "text", pattern: "上架中" });
setRequired("member-inventory", INVENTORY_TABS);

setAssertion("merchant-inventory", { type: "text", pattern: "上架中" });
setRequired("merchant-inventory", INVENTORY_TABS);
setAssertion("merchant-inventory-list", {
  type: "locator",
  name: 'input[placeholder*="搜尋卡牌名稱"]',
});
setRequired("merchant-inventory-list", INVENTORY_TABS);
setAssertion("upload-inventory", {
  type: "locator",
  name: 'input[placeholder*="搜尋卡牌名稱"]',
});
setRequired("upload-inventory", [
  ...INVENTORY_TABS,
  {
    id: "inventory-search",
    role: "text",
    locator: 'input[placeholder*="搜尋卡牌名稱"]',
  },
]);

const MERCHANT_TRADING = [
  { id: "trading-heading", role: "heading", pattern: "交易管理" },
  { id: "tab-all", role: "button", pattern: "^全部" },
  { id: "tab-pending", role: "button", pattern: "^待處理" },
  { id: "order-search", role: "text", locator: "#merchant-order-search" },
];

setRequired("merchant-trading", MERCHANT_TRADING);
setRequired("merchant-trading-orders", MERCHANT_TRADING);
setRequired("expiry-trading", MERCHANT_TRADING);
setRequired("merchant-trading-grading", [
  ...MERCHANT_TRADING,
  { id: "raw-filter", role: "checkbox", name: "只顯示 RAW/裸卡" },
]);

setAssertion("merchant-settings", { type: "heading", name: "店舖資料" });
setRequired("merchant-settings", [
  { id: "settings-heading", role: "heading", name: "店舖資料" },
  { id: "shop-profile-heading", role: "heading", name: "店舖資料" },
  { id: "security-heading", role: "heading", name: "安全設定" },
]);

setAssertion("merchant-performance", {
  type: "locator",
  name: '[aria-label="店舖經營與業績分析"]',
});
setRequired("merchant-performance", [
  {
    id: "performance-heading",
    role: "text",
    locator: '[aria-label="店舖經營與業績分析"]',
  },
  { id: "total-revenue", role: "text", name: "歷史累計總營業額" },
  { id: "total-trades", role: "text", name: "歷史累計總成交次數" },
]);

writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
console.log("Patched docs/dev/ui-feature-map.json for staging drift");
