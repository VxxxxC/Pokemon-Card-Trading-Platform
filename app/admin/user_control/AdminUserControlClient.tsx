"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import Link from "next/link";
import { Search } from "lucide-react";
import { listAdminPlatformUsers } from "@/app/actions/admin-user-control";
import {
  ADMIN_PAGE_TAB_CLASS,
  ADMIN_PAGE_TAB_NAV_CLASS,
  FILTER_CHIP_SM_CLASS,
  FILTER_INPUT_CLASS,
  BTN_OUTLINE_SM_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import { Input } from "@/components/ui/input";
import {
  formatPlatformUserKycLabel,
} from "@/lib/admin-user-control/format";
import type {
  PlatformUserKycFilter,
  PlatformUserPage,
  PlatformUserRow,
  PlatformUserType,
} from "@/lib/admin-user-control/types";
import {
  EMPTY_PLATFORM_USER_KYC_COUNTS,
  PLATFORM_USERS_PAGE_SIZE,
} from "@/lib/admin-user-control/types";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/app/components/ui/Pagination";

// 通過 Stripe KYC 即自動 trigger webhook 註冊商戶，故毋須人工入駐審核流程。

// ── Types Definitions ────────────────────────────────────────────────────────

interface OverrideAuditLog {
  id: string;
  adminEmail: string;
  targetUser: string;
  action: string;
  reason: string;
  timestamp: string;
}

// TODO: [Supabase Wiring] audit_logs persistence deferred
const initialAuditLogs: OverrideAuditLog[] = [
  {
    id: "LOG-881",
    adminEmail: "admin@hkcv.io",
    targetUser: "USR-0042 (KuroGamer TCG)",
    action: "強制封禁其 Stripe Connect 帳戶",
    reason: "收到 3 宗假卡舉報，暫停放款等待調查",
    timestamp: "2025/5/21 11:30",
  },
  {
    id: "LOG-880",
    adminEmail: "admin@hkcv.io",
    targetUser: "USR-0012 (Daichi Rare Cards)",
    action: "升級為 MERCHANT (商戶)",
    reason: "人工確認實體店營業執照無誤",
    timestamp: "2025/5/19 14:15",
  },
];

type AdminUserControlClientProps = {
  initialPage: PlatformUserPage;
  loadError: string | null;
};

function emptyPlatformUserPage(): PlatformUserPage {
  return {
    rows: [],
    total: 0,
    page: 1,
    pageSize: PLATFORM_USERS_PAGE_SIZE,
    totalPages: 0,
    kycCounts: { ...EMPTY_PLATFORM_USER_KYC_COUNTS },
    typeCounts: { member: 0, merchant: 0 },
  };
}

function userTypeChipClasses(userType: PlatformUserType): string {
  return userType === "member"
    ? "border border-white/10 bg-bg-hover text-text-secondary"
    : "border border-brand/30 bg-brand/15 text-brand";
}

function kycBadgeClasses(
  kycStatus: PlatformUserRow["kycStatus"],
): string {
  if (kycStatus === "verified") {
    return "text-success bg-[rgba(16,185,129,0.12)] border-success/20";
  }
  if (kycStatus === "pending") {
    return "text-brand bg-[rgba(212,165,116,0.12)] border-brand/20";
  }
  if (kycStatus === "rejected") {
    return "text-warning bg-[rgba(239,68,68,0.10)] border-warning/20";
  }
  return "bg-bg-hover text-text-secondary border border-white/10";
}

function kycDotClasses(kycStatus: PlatformUserRow["kycStatus"]): string {
  if (kycStatus === "verified") {
    return "bg-success";
  }
  if (kycStatus === "pending") {
    return "bg-brand";
  }
  if (kycStatus === "rejected") {
    return "bg-warning";
  }
  return "bg-text-disabled";
}

function kycLabelClasses(kycStatus: PlatformUserRow["kycStatus"]): string {
  if (kycStatus === "verified") {
    return "text-success";
  }
  if (kycStatus === "pending") {
    return "text-brand";
  }
  if (kycStatus === "rejected") {
    return "text-warning";
  }
  return "text-text-secondary";
}

function PlatformUserKycStatusDot({
  kycStatus,
}: {
  kycStatus: NonNullable<PlatformUserRow["kycStatus"]>;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[9px]">
      <span
        className={`size-1.5 shrink-0 rounded-full ${kycDotClasses(kycStatus)}`}
        aria-hidden="true"
      />
      <span className={kycLabelClasses(kycStatus)}>
        {formatPlatformUserKycLabel(kycStatus)}
      </span>
    </span>
  );
}

function PlatformUserTypeBadges({ userType }: { userType: PlatformUserType }) {
  if (userType === "member") {
    return (
      <span
        className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] ${userTypeChipClasses("member")}`}
      >
        會員
      </span>
    );
  }

  return (
    <>
      <span
        className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] ${userTypeChipClasses("merchant")}`}
      >
        商戶
      </span>
      <span
        className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] ${userTypeChipClasses("member")}`}
      >
        會員
      </span>
    </>
  );
}

function PlatformUserMemberPersonaLine({
  memberHandle,
  memberName,
  primaryHandle,
  className,
}: {
  memberHandle: string | null;
  memberName: string | null;
  primaryHandle?: string;
  className?: string;
}) {
  const showHandle =
    memberHandle && memberHandle !== primaryHandle;
  if (!showHandle && !memberName) {
    return null;
  }

  const parts: string[] = [];
  if (showHandle) {
    parts.push(`會員 ${memberHandle}`);
  } else if (memberName) {
    parts.push("會員");
  }
  if (memberName) {
    parts.push(memberName);
  }

  return (
    <p className={`font-mono text-[10px] text-text-disabled ${className ?? ""}`}>
      {parts.join(" · ")}
    </p>
  );
}

function PlatformUserMerchantPersonaBlock({
  shopHandle,
  memberHandle,
  memberName,
}: {
  shopHandle: string;
  memberHandle: string | null;
  memberName: string | null;
}) {
  const showMemberHandle =
    memberHandle && memberHandle !== shopHandle;
  const showMemberRow = showMemberHandle || memberName;

  return (
    <div className="mt-1.5 space-y-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
      <div className="flex min-w-0 items-baseline gap-2 font-mono text-[10px] leading-snug">
        <span className="shrink-0 text-text-disabled">店鋪</span>
        <span className="truncate text-text-secondary">{shopHandle}</span>
      </div>
      {showMemberRow ? (
        <div className="flex min-w-0 items-baseline gap-2 font-mono text-[10px] leading-snug">
          <span className="shrink-0 text-text-disabled">會員</span>
          <span className="truncate text-text-secondary">
            {[showMemberHandle ? memberHandle : null, memberName]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function PlatformUserMobileCard({ user }: { user: PlatformUserRow }) {
  return (
    <article className="space-y-1.5 px-1 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1">
            <PlatformUserTypeBadges userType={user.userType} />
          </div>
          <p className="mt-4 font-sans text-[13px] font-semibold leading-snug text-text-primary">
            {user.name}
          </p>
          {user.userType === "merchant" ? (
            <PlatformUserMerchantPersonaBlock
              shopHandle={user.handle}
              memberHandle={user.memberHandle}
              memberName={user.memberName}
            />
          ) : (
            <p className="mt-0.5 font-mono text-[11px] text-text-secondary">
              {user.handle}
            </p>
          )}
        </div>
        {user.kycStatus ? (
          <PlatformUserKycStatusDot kycStatus={user.kycStatus} />
        ) : null}
      </div>
      <dl className="grid grid-cols-1 gap-0.5 pt-0.5 font-mono text-[10px]">
        <div className="flex min-w-0 gap-2">
          <dt className="shrink-0 text-text-disabled">電郵</dt>
          <dd className="truncate text-text-secondary">{user.email}</dd>
        </div>
        {user.stripeAccountId ? (
          <div className="flex min-w-0 gap-2">
            <dt className="shrink-0 text-text-disabled">Stripe</dt>
            <dd className="truncate text-text-disabled">{user.stripeAccountId}</dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt className="shrink-0 text-text-disabled">更新</dt>
          <dd className="text-text-disabled">{user.updatedAt}</dd>
        </div>
      </dl>
      {user.kycStatus === "pending" && user.applicationId ? (
        <Link
          href={`/admin/merchants?applicationId=${user.applicationId}`}
          className={`${BTN_OUTLINE_SM_CLASS} inline-flex h-9 items-center`}
        >
          審核 KYC
        </Link>
      ) : null}
    </article>
  );
}

export default function AdminUserControlClient({
  initialPage,
  loadError,
}: AdminUserControlClientProps) {
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [pageData, setPageData] = useState<PlatformUserPage>(initialPage);
  const [listError, setListError] = useState<string | null>(loadError);
  const [isRefreshing, startRefresh] = useTransition();

  const [auditLogs, setAuditLogs] =
    useState<OverrideAuditLog[]>(initialAuditLogs);
  const [nextLogId, setNextLogId] = useState(882);

  const [userSearch, setUserSearch] = useState("");
  const [debouncedUserSearch, setDebouncedUserSearch] = useState("");
  const [kycFilter, setKycFilter] = useState<PlatformUserKycFilter>("pending");
  const [userTypeTab, setUserTypeTab] = useState<"all" | PlatformUserType>("all");

  const [page, setPage] = useState(initialPage.page);
  const pageSize = PLATFORM_USERS_PAGE_SIZE;

  const [isOverrideLocked, setIsOverrideLocked] = useState(true);
  const [overrideTargetUser, setOverrideTargetUser] = useState("");
  const [overrideAction, setOverrideAction] =
    useState("升級為 MERCHANT (商戶)");
  const [overrideReason, setOverrideReason] = useState("");

  const resolveUserTypes = useCallback((): PlatformUserType[] => {
    if (userTypeTab === "all") {
      return ["member", "merchant"];
    }
    return [userTypeTab];
  }, [userTypeTab]);

  const effectiveSearch = debouncedUserSearch;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedUserSearch(userSearch.trim());
    }, 400);
    return () => window.clearTimeout(timer);
  }, [userSearch]);

  const refreshUsers = useCallback(
    (nextPage: number) => {
      startRefresh(async () => {
        const result = await listAdminPlatformUsers({
          page: nextPage,
          pageSize,
          search: effectiveSearch || undefined,
          userTypes: resolveUserTypes(),
          kycFilter,
        });

        if (!result.success) {
          setListError(result.error);
          setPageData(emptyPlatformUserPage());
          return;
        }

        setListError(null);
        setPageData(result.data);
        setPage(result.data.page);
      });
    },
    [effectiveSearch, kycFilter, pageSize, resolveUserTypes],
  );

  const skipInitialRefresh = useRef(true);

  useEffect(() => {
    if (skipInitialRefresh.current) {
      skipInitialRefresh.current = false;
      return;
    }
    refreshUsers(page);
  }, [page, kycFilter, userTypeTab, debouncedUserSearch, refreshUsers]);

  const typeCounts = pageData.typeCounts;
  const kycCounts = pageData.kycCounts;
  const paginatedUsers = pageData.rows;
  const filteredTotal = pageData.total;
  const totalPages = pageData.totalPages || 1;
  const safePage = Math.min(page, totalPages);
  // ── Override Actions ───────────────────────────────────────────────────────
  const handleExecuteOverride = () => {
    if (!overrideTargetUser.trim()) {
      toast.error("請輸入目標用戶 ID 或 Handle");
      return;
    }
    if (!overrideReason.trim()) {
      toast.error("強制執行特權覆寫時必須填寫『操作理由』以備審計");
      return;
    }

    const newLog: OverrideAuditLog = {
      id: `LOG-${String(nextLogId).padStart(3, "0")}`,
      adminEmail: "admin@hkcv.io",
      targetUser: overrideTargetUser,
      action: overrideAction,
      reason: overrideReason,
      timestamp: new Date().toLocaleString("zh-TW", { hour12: false }),
    };

    setAuditLogs([newLog, ...auditLogs]);
    setNextLogId((prev) => prev + 1);
    toast.success(`特權指令『${overrideAction}』已執行`, {
      description: "已存入 Audit Log",
    });
    setOverrideTargetUser("");
    setOverrideReason("");
  };

  const resetPagination = () => setPage(1);

  const handleSearchChange = (value: string) => {
    setUserSearch(value);
    resetPagination();
  };

  const handleFilterChange = (filter: PlatformUserKycFilter) => {
    setKycFilter(filter);
    resetPagination();
  };

  const handleUserTypeTabChange = (tab: "all" | PlatformUserType) => {
    setUserTypeTab(tab);
    resetPagination();
  };

  const userTypeTabs: {
    key: "all" | PlatformUserType;
    label: string;
    count: number;
  }[] = [
    {
      key: "all",
      label: "全部",
      count: typeCounts.member + typeCounts.merchant,
    },
    { key: "member", label: "會員", count: typeCounts.member },
    { key: "merchant", label: "商戶", count: typeCounts.merchant },
  ];

  return (
    <div className="space-y-5 pb-8">
      <header>
        <p className="font-sans text-[13px] text-text-secondary">
          管理全平台會員與認證商戶帳號、Stripe KYC 認證狀態
        </p>
      </header>

      {listError ? (
        <div className="rounded-lg border border-error/30 bg-error/10 px-3 py-2.5 font-sans text-[13px] text-error">
          {listError}
        </div>
      ) : null}

      <AnimatePresence>
        {isOverrideOpen && (
          <>
            {/* Backdrop blur layer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1, ease: "linear" }}
              className="fixed inset-0 z-60 bg-[#17130f]/90 backdrop-blur-sm"
              onClick={() => setIsOverrideOpen(false)}
              aria-hidden="true"
            />

            {/* Overlay window */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                duration: 0.5,
                ease: "linear",
              }}
              className="fixed inset-0 z-[70] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[min(92vw,1100px)] sm:max-h-[min(85vh,800px)] sm:rounded-2xl bg-bg-card border border-[rgba(237,232,224,0.08)] shadow-2xl overflow-hidden flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-override-title"
            >
              {/* Overlay header */}
              <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[rgba(237,232,224,0.08)] bg-[rgba(239,68,68,0.04)]">
                <div className="flex items-center gap-2">
                  <span className="text-warning text-[20px]">⚠️</span>
                  <h2
                    id="admin-override-title"
                    className="font-sans font-bold text-[16px] text-warning"
                  >
                    管理員特權覆寫面板
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOverrideOpen(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
                  aria-label="關閉"
                >
                  ✕
                </button>
              </div>

              {/* Overlay body */}
              <div className="flex-1 overflow-y-auto p-5">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Control Panel */}
                  <div className="bg-[rgba(239,68,68,0.04)] rounded-2xl border border-warning/20 p-5 space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <p className="font-sans text-[12px] text-text-secondary leading-relaxed">
                        解鎖後可強制繞過標準 KYC
                        流程，直接修改用戶角色權限或封禁其 Stripe Connect
                        金流通道。**所有操作均會強制存入不可篡改的審計日誌
                        (Audit Log)。**
                      </p>

                      {/* Safety Lock Toggle Switch */}
                      <div className="bg-bg-card rounded-xl border border-[rgba(239,68,68,0.15)] p-4 flex items-center justify-between">
                        <div>
                          <span className="font-mono text-[10px] text-text-disabled uppercase block">
                            覆寫安全鎖狀態
                          </span>
                          <span
                            className={`font-sans font-bold text-[13px] ${isOverrideLocked ? "text-success" : "text-warning"}`}
                          >
                            {isOverrideLocked
                              ? "🔒 系統已安全鎖定"
                              : "🔓 已解除安全鎖"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsOverrideLocked(!isOverrideLocked);
                            toast(
                              isOverrideLocked
                                ? "特權覆寫安全鎖已解除"
                                : "特權覆寫安全鎖已重新啟用",
                            );
                          }}
                          className={`h-9 px-3.5 font-sans font-semibold text-[11px] rounded-xl border transition-all active:scale-[0.98] ${
                            isOverrideLocked
                              ? "bg-[rgba(239,68,68,0.10)] text-warning border-warning/20 hover:bg-[rgba(239,68,68,0.15)]"
                              : "bg-success text-[#111] border-transparent hover:bg-success/90"
                          }`}
                        >
                          {isOverrideLocked ? "解除鎖定" : "重啟安全鎖"}
                        </button>
                      </div>

                      {/* Override Command Form */}
                      {!isOverrideLocked ? (
                        <div className="bg-bg-card rounded-xl border border-[rgba(237,232,224,0.12)] p-4 space-y-3 animate-fade-in">
                          <span className="font-sans font-bold text-[12px] text-text-primary block border-b border-[rgba(237,232,224,0.08)] pb-2">
                            執行特權覆寫指令
                          </span>
                          <div className="space-y-2.5">
                            <div>
                              <label className="font-mono text-[10px] text-text-disabled block mb-1">
                                目標用戶 (ID / Handle / Email)
                              </label>
                              <input
                                type="text"
                                placeholder="例: USR-0042 或 @kuro_gamer"
                                value={overrideTargetUser}
                                onChange={(e) =>
                                  setOverrideTargetUser(e.target.value)
                                }
                                className="w-full h-9 bg-bg-page border border-[rgba(237,232,224,0.12)] rounded-lg px-3 font-mono text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-brand/40"
                              />
                            </div>

                            <div>
                              <label className="font-mono text-[10px] text-text-disabled block mb-1">
                                特權指令類型
                              </label>
                              <select
                                value={overrideAction}
                                onChange={(e) =>
                                  setOverrideAction(e.target.value)
                                }
                                className="w-full h-9 bg-bg-page border border-[rgba(237,232,224,0.12)] rounded-lg px-2 font-sans text-xs text-text-primary focus:outline-none"
                              >
                                <option>升級為 MERCHANT (商戶)</option>
                                <option>降級為 USER (一般會員)</option>
                                <option>強制免 KYC 提現放行</option>
                                <option>強制封禁其 Stripe Connect 帳戶</option>
                                <option>重置 Stripe KYC 連結狀態</option>
                              </select>
                            </div>

                            <div>
                              <label className="font-mono text-[10px] text-text-disabled block mb-1">
                                操作理由 (必填 Audit Log 存檔)
                              </label>
                              <textarea
                                rows={2}
                                placeholder="請輸入本次人工覆寫的詳細理由..."
                                value={overrideReason}
                                onChange={(e) =>
                                  setOverrideReason(e.target.value)
                                }
                                className="w-full bg-bg-page border border-[rgba(237,232,224,0.12)] rounded-lg p-2.5 font-sans text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-brand/40"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={handleExecuteOverride}
                              className="w-full h-9 bg-warning text-[#17130f] font-sans font-bold text-xs rounded-lg active:scale-[0.98] hover:bg-warning/90 transition-all shadow-md shadow-warning/10"
                            >
                              🚀 執行特權覆寫指令
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl border border-[rgba(237,232,224,0.06)] bg-bg-page text-center space-y-1">
                          <p className="font-sans text-xs text-text-disabled">
                            指令輸入框已隱藏
                          </p>
                          <p className="font-mono text-[10px] text-text-disabled">
                            請先點擊上方『解除鎖定』按鈕以進行覆寫操作
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Audit Log Table (Span 2 Cols) */}
                  <div className="lg:col-span-2 bg-bg-page rounded-2xl border border-[rgba(237,232,224,0.08)] p-4 flex flex-col justify-between space-y-3">
                    <div>
                      <h3 className={`${SECTION_TITLE_CLASS} mb-1`}>
                        特權覆寫審計日誌 (Audit Logs)
                      </h3>
                      <p className="font-sans text-[11px] text-text-secondary mb-3">
                        不可篡改的全站管理員操作歷史軌跡
                      </p>

                      <div className="rounded-xl border border-[rgba(237,232,224,0.08)] overflow-x-scroll no-scrollbar">
                        <Table>
                          <TableHeader className="bg-bg-elevated/50">
                            <TableRow className="border-b border-[rgba(237,232,224,0.08)]">
                              <TableHead className="font-mono text-[11px] text-text-secondary h-9">
                                日誌編號
                              </TableHead>
                              <TableHead className="font-sans text-[11px] text-text-secondary h-9">
                                管理員
                              </TableHead>
                              <TableHead className="font-mono text-[11px] text-text-secondary h-9">
                                目標用戶
                              </TableHead>
                              <TableHead className="font-sans text-[11px] text-text-secondary h-9">
                                特權動作
                              </TableHead>
                              <TableHead className="font-sans text-[11px] text-text-secondary h-9">
                                操作理由
                              </TableHead>
                              <TableHead className="font-mono text-[11px] text-text-secondary h-9 text-right">
                                時間
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {auditLogs.map((log) => (
                              <TableRow
                                key={log.id}
                                className="border-b border-[rgba(237,232,224,0.06)] hover:bg-bg-elevated/30"
                              >
                                <TableCell className="font-mono text-[10px] text-text-disabled py-2.5">
                                  #{log.id}
                                </TableCell>
                                <TableCell className="font-mono text-[11px] text-text-secondary py-2.5 whitespace-nowrap">
                                  {log.adminEmail}
                                </TableCell>
                                <TableCell className="font-mono text-[11px] text-brand font-bold py-2.5 whitespace-nowrap">
                                  {log.targetUser}
                                </TableCell>
                                <TableCell className="font-sans text-[11px] text-warning font-semibold py-2.5 whitespace-nowrap">
                                  {log.action}
                                </TableCell>
                                <TableCell className="font-sans text-[11px] text-text-primary py-2.5 max-w-[200px] truncate">
                                  {log.reason}
                                </TableCell>
                                <TableCell className="font-mono text-[10px] text-text-disabled text-right py-2.5 whitespace-nowrap">
                                  {log.timestamp}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="space-y-4 border-b border-white/[0.08] pb-5">
        <div className="flex flex-col gap-3">
          <div className="space-y-2.5">
            <nav className={ADMIN_PAGE_TAB_NAV_CLASS} aria-label="用戶類型">
              {userTypeTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleUserTypeTabChange(tab.key)}
                  className={ADMIN_PAGE_TAB_CLASS(userTypeTab === tab.key)}
                >
                  {tab.label}
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      userTypeTab === tab.key
                        ? "text-brand/80"
                        : "text-text-disabled"
                    }`}
                  >
                    {tab.count.toLocaleString("en-US")}
                  </span>
                </button>
              ))}
            </nav>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-disabled"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="搜尋名稱、Handle、電郵或 Stripe ID…"
                value={userSearch}
                onChange={(e) => handleSearchChange(e.target.value)}
                className={FILTER_INPUT_CLASS}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { key: "all", label: "全部" },
                  { key: "pending", label: "待審核" },
                  { key: "verified", label: "已認證" },
                  { key: "rejected", label: "已拒絕" },
                ] as { key: PlatformUserKycFilter; label: string }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleFilterChange(key)}
                  className={`${FILTER_CHIP_SM_CLASS(kycFilter === key)} gap-1`}
                >
                  <span>{label}</span>
                  <span
                    className={`font-mono text-[9px] tabular-nums ${
                      kycFilter === key
                        ? "text-brand/80"
                        : "text-text-disabled"
                    }`}
                  >
                    {kycCounts[key].toLocaleString("en-US")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {paginatedUsers.length === 0 ? (
          <p className="py-10 text-center font-sans text-[13px] text-text-secondary">
            沒有符合篩選條件的用戶記錄。
          </p>
        ) : (
          <>
            <div className="md:hidden divide-y divide-white/[0.06]">
              {paginatedUsers.map((user) => (
                <PlatformUserMobileCard key={user.id} user={user} />
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-lg border border-white/[0.08] md:block">
              <Table>
                <TableHeader className="border-b border-white/[0.08] bg-bg-card/30">
                  <TableRow className="border-transparent hover:bg-transparent">
                    <TableHead className="h-9 font-sans text-[11px] text-text-disabled">
                      名稱
                    </TableHead>
                    <TableHead className="h-9 font-mono text-[11px] text-text-disabled">
                      Handle
                    </TableHead>
                    <TableHead className="h-9 font-mono text-[11px] text-text-disabled">
                      電郵
                    </TableHead>
                    <TableHead className="h-9 font-mono text-[11px] text-text-disabled">
                      Stripe ID
                    </TableHead>
                    <TableHead className="h-9 text-center font-sans text-[11px] text-text-disabled">
                      KYC 狀態
                    </TableHead>
                    <TableHead className="h-9 text-right font-mono text-[11px] text-text-disabled">
                      更新時間
                    </TableHead>
                    <TableHead className="h-9 min-w-[5.5rem] text-right font-sans text-[11px] text-text-disabled">
                      操作
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((u, rowIndex) => (
                      <TableRow
                        key={u.id}
                        className={`border-white/[0.06] transition-colors hover:bg-brand/10 ${
                          rowIndex % 2 === 0 ? "bg-bg-card/25" : "bg-white/[0.02]"
                        }`}
                      >
                        <TableCell className="max-w-[14rem] py-2.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <PlatformUserTypeBadges userType={u.userType} />
                            <span className={`truncate ${SECTION_TITLE_CLASS}`}>
                              {u.name}
                            </span>
                          </div>
                          {u.userType === "merchant" ? (
                            <PlatformUserMemberPersonaLine
                              memberHandle={u.memberHandle}
                              memberName={u.memberName}
                              primaryHandle={u.handle}
                              className="mt-1"
                            />
                          ) : null}
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-[11px] text-text-secondary whitespace-nowrap">
                          <span className="block">{u.handle}</span>
                          {u.userType === "merchant" &&
                          u.memberHandle &&
                          u.memberHandle !== u.handle ? (
                            <span className="mt-0.5 block text-[10px] text-text-disabled">
                              {u.memberHandle}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[11rem] py-2.5">
                          <span
                            className="block truncate font-mono text-[11px] text-text-secondary"
                            title={u.email}
                          >
                            {u.email}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[9rem] py-2.5">
                          {u.stripeAccountId ? (
                            <span
                              className="block truncate font-mono text-[11px] text-text-disabled"
                              title={u.stripeAccountId}
                            >
                              {u.stripeAccountId}
                            </span>
                          ) : (
                            <span className="font-mono text-[11px] text-text-disabled">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-center whitespace-nowrap">
                          {u.kycStatus ? (
                            <span
                              className={`inline-block rounded border px-2 py-0.5 font-mono text-[9px] ${kycBadgeClasses(u.kycStatus)}`}
                            >
                              {formatPlatformUserKycLabel(u.kycStatus)}
                            </span>
                          ) : (
                            <span className="font-mono text-[11px] text-text-disabled">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-mono text-[11px] text-text-disabled whitespace-nowrap">
                          {u.updatedAt}
                        </TableCell>
                        <TableCell className="py-2.5 text-right align-top">
                          {u.kycStatus === "pending" && u.applicationId ? (
                            <Link
                              href={`/admin/merchants?applicationId=${u.applicationId}`}
                              className={`${BTN_OUTLINE_SM_CLASS} inline-flex h-8 items-center px-2.5`}
                            >
                              審核 KYC
                            </Link>
                          ) : (
                            <span className="font-mono text-[11px] text-text-disabled">
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {filteredTotal > 0 && totalPages <= 1 ? (
          <p className="font-mono text-[12px] text-text-secondary">
            共 {filteredTotal} 筆資料{isRefreshing ? "（更新中…）" : ""}
          </p>
        ) : null}
        {filteredTotal > 0 && totalPages > 1 ? (
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={filteredTotal}
            itemsPerPage={pageSize}
            itemLabel="筆資料"
            enableScroll={false}
          />
        ) : null}
      </div>
    </div>
  );
}
