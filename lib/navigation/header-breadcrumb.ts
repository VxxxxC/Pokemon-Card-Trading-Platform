export type HeaderBreadcrumb = {
  parentHref: string;
  parentLabel: string;
  currentLabel: string;
};

const HEADER_BREADCRUMBS: Record<string, HeaderBreadcrumb> = {
  "/announcements": {
    parentHref: "/",
    parentLabel: "首頁",
    currentLabel: "官方公告",
  },
  "/about": {
    parentHref: "/",
    parentLabel: "首頁",
    currentLabel: "關於平台",
  },
  "/profile/user/settings": {
    parentHref: "/profile/user",
    parentLabel: "我的帳號總覽",
    currentLabel: "帳戶設定",
  },
  "/profile/user/rewards": {
    parentHref: "/profile/user",
    parentLabel: "我的帳號總覽",
    currentLabel: "獎勵與任務",
  },
  "/profile/user/campaigns": {
    parentHref: "/profile/user/rewards",
    parentLabel: "獎勵與任務",
    currentLabel: "活動商城",
  },
  "/profile/user/merchant-apply": {
    parentHref: "/profile/user",
    parentLabel: "我的帳號總覽",
    currentLabel: "商戶入駐",
  },
  "/profile/merchant/settings": {
    parentHref: "/profile/merchant",
    parentLabel: "商戶總覽",
    currentLabel: "店舖設定",
  },
  "/profile/merchant/performance": {
    parentHref: "/profile/merchant",
    parentLabel: "商戶總覽",
    currentLabel: "業績分析",
  },
};

const HEADER_BREADCRUMB_PREFIXES: Array<{
  prefix: string;
  breadcrumb: HeaderBreadcrumb;
}> = [
  {
    prefix: "/profile/user/orderDetail/",
    breadcrumb: {
      parentHref: "/profile/user/trading",
      parentLabel: "交易管理",
      currentLabel: "訂單詳情",
    },
  },
  {
    prefix: "/profile/merchant/orderDetail/",
    breadcrumb: {
      parentHref: "/profile/merchant/trading",
      parentLabel: "交易管理",
      currentLabel: "訂單詳情",
    },
  },
];

export function getHeaderBreadcrumb(pathname: string): HeaderBreadcrumb | null {
  const exact = HEADER_BREADCRUMBS[pathname];
  if (exact) {
    return exact;
  }

  for (const { prefix, breadcrumb } of HEADER_BREADCRUMB_PREFIXES) {
    if (pathname.startsWith(prefix) && pathname.length > prefix.length) {
      return breadcrumb;
    }
  }

  return null;
}
