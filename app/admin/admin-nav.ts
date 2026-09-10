export const ADMIN_ROOT_LABEL = "管理員控制台";
export const ADMIN_ROOT_HREF = "/admin/dashboard";

export const ADMIN_NAV_ITEMS = [
  { href: "/admin/dashboard", label: "數據總覽" },
  {
    href: "/admin/announcements",
    label: "公告管理",
    pageTitle: "首頁活動與公告管理",
  },
  { href: "/admin/payouts", label: "財務與結算管控台" },
  { href: "/admin/user_control", label: "用戶管理" },
  {
    href: "/admin/merchants",
    label: "商戶 KYC 審核",
    pageTitle: "商戶與 KYC 審查",
  },
  { href: "/admin/grading", label: "鑑定工作台" },
  {
    href: "/admin/disputes",
    label: "舉報與爭議仲裁",
    pageTitle: "舉報與爭議仲裁工作台",
  },
  {
    href: "/admin/catalog",
    label: "卡牌字典與行情",
    pageTitle: "卡牌字典資料庫",
  },
  { href: "/admin/campaigns", label: "積分與獎勵活動" },
  {
    href: "/admin/settings",
    label: "全局系統配置",
    pageTitle: "營運設定",
  },
] as const;

export type AdminNavItem = (typeof ADMIN_NAV_ITEMS)[number];

export function getAdminNavPageTitle(item: AdminNavItem): string {
  if ("pageTitle" in item) {
    return item.pageTitle;
  }
  return item.label;
}

export function isAdminIndexPage(pathname: string): boolean {
  const navMatch = findAdminNavMatch(pathname);
  if (!navMatch) return false;
  return pathname === navMatch.href;
}

export function findAdminNavMatch(pathname: string): AdminNavItem | null {
  const match = ADMIN_NAV_ITEMS.find(
    (item) =>
      pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match ?? null;
}

export function getAdminSubPathLabel(pathname: string, navHref: string): string | null {
  const rest = pathname.slice(navHref.length);
  if (!rest || rest === "/") return null;

  if (rest === "/new") return "新增";

  const segments = rest.split("/").filter(Boolean);
  if (segments.length !== 1) return null;

  if (navHref === "/admin/campaigns") return "活動詳情";
  if (navHref === "/admin/disputes") return "爭議詳情";

  return "詳情";
}
