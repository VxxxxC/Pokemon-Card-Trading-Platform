"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search } from "lucide-react";
import { toast } from "sonner";
import {
  BTN_OUTLINE_SM_CLASS,
  BTN_PRIMARY_SM_CLASS,
  FILTER_CHIP_SM_CLASS,
  FILTER_INPUT_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import { Pagination } from "@/app/components/ui/Pagination";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getKycDocumentSignedUrl,
  retryKycProvisioning,
  reviewKycApplication,
  type AdminKycApplicationListItem,
} from "@/app/actions/admin-kyc";
import { KYC_DOCUMENT_TYPE_LABELS } from "@/lib/kyc/documents";
import { formatHongKongDateTime } from "@/lib/datetime/hong-kong";

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: "全部",
  pending: "待審核",
  approved: "已批准",
  rejected: "已拒絕",
};

const PAGE_SIZE = 10;

function resolveHighlightState(
  applications: AdminKycApplicationListItem[],
  highlightApplicationId: string | null | undefined,
): { statusFilter: StatusFilter; page: number } {
  if (!highlightApplicationId) {
    return { statusFilter: "pending", page: 1 };
  }

  const target = applications.find((app) => app.id === highlightApplicationId);
  if (!target) {
    return { statusFilter: "pending", page: 1 };
  }

  const filtered = applications.filter((app) => app.status === target.status);
  const index = filtered.findIndex((app) => app.id === highlightApplicationId);
  const page = index >= 0 ? Math.floor(index / PAGE_SIZE) + 1 : 1;

  return { statusFilter: target.status, page };
}

function formatHandle(
  shopHandle: string | null,
  applicantUsername: string | null,
): string {
  const handle = shopHandle?.trim() || applicantUsername?.trim();
  if (!handle) return "—";
  return handle.startsWith("@") ? handle : `@${handle}`;
}

function formatDateTime(iso: string | null): string {
  return formatHongKongDateTime(iso);
}

function statusDotClasses(
  status: AdminKycApplicationListItem["status"],
): string {
  if (status === "approved") {
    return "bg-success";
  }
  if (status === "pending") {
    return "bg-brand";
  }
  return "bg-warning";
}

function statusLabelClasses(
  status: AdminKycApplicationListItem["status"],
): string {
  if (status === "approved") {
    return "text-success";
  }
  if (status === "pending") {
    return "text-brand";
  }
  return "text-warning";
}

function KycApplicationStatusDot({
  status,
}: {
  status: AdminKycApplicationListItem["status"];
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[9px]">
      <span
        className={`size-1.5 shrink-0 rounded-full ${statusDotClasses(status)}`}
        aria-hidden="true"
      />
      <span className={statusLabelClasses(status)}>{statusLabel(status)}</span>
    </span>
  );
}

function statusBadgeClasses(
  status: AdminKycApplicationListItem["status"],
): string {
  if (status === "approved") {
    return "text-success bg-[rgba(16,185,129,0.12)] border-success/20";
  }
  if (status === "pending") {
    return "text-brand bg-[rgba(212,165,116,0.12)] border-brand/20";
  }
  return "text-warning bg-[rgba(239,68,68,0.10)] border-warning/20";
}

function statusLabel(status: AdminKycApplicationListItem["status"]): string {
  if (status === "approved") return "已批准";
  if (status === "pending") return "待審核";
  return "已拒絕";
}

function ApplicationActions({
  application,
  onUpdated,
  variant = "inline",
}: {
  application: AdminKycApplicationListItem;
  onUpdated: () => void;
  variant?: "inline" | "stacked";
}) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function openDocument(documentId: string) {
    const result = await getKycDocumentSignedUrl(documentId);
    if (result.success) {
      window.open(result.data.url, "_blank", "noopener");
    } else {
      toast.error(result.error);
    }
  }

  function handleReview(decision: "approve" | "reject") {
    startTransition(async () => {
      const result = await reviewKycApplication(
        application.id,
        decision,
        decision === "reject" ? rejectReason : undefined,
      );

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      if (result.data.decision === "approve") {
        if (result.data.stripeSyncWarning) {
          toast.warning(`已批准。${result.data.stripeSyncWarning}`);
        } else {
          toast.success(
            `已批准，Stripe 帳戶：${result.data.stripeAccountId ?? "—"}`,
          );
        }
      } else {
        toast.success("已拒絕該申請");
      }

      setShowReject(false);
      setRejectReason("");
      onUpdated();
    });
  }

  function handleRetryStripe() {
    startTransition(async () => {
      const result = await retryKycProvisioning(application.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data.stripeSyncWarning) {
        toast.warning(result.data.stripeSyncWarning);
      } else {
        toast.success(
          `Stripe 開通成功：${result.data.stripeAccountId ?? "—"}`,
        );
      }
      onUpdated();
    });
  }

  if (application.status === "pending") {
    const inlineActionClass = "h-8 shrink-0 px-2.5";
    const stackedActionClass = "h-8 flex-1 min-w-0";

    if (variant === "stacked") {
      return (
        <div className="flex flex-col gap-2.5">
          <Popover>
            <PopoverTrigger
              className="inline-flex items-center gap-1 self-start font-mono text-[11px] text-text-disabled transition-colors hover:text-brand active:scale-[0.98]"
            >
              <FileText className="size-3.5 shrink-0" aria-hidden="true" />
              查看文件
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-56 border-[rgba(237,232,224,0.12)] bg-bg-card p-2"
            >
              <div className="flex flex-col gap-1">
                {application.documents.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => openDocument(doc.id)}
                    className="rounded-lg px-2 py-1.5 text-left font-sans text-[12px] text-text-primary hover:bg-bg-elevated"
                  >
                    {KYC_DOCUMENT_TYPE_LABELS[doc.documentType]}
                    {doc.stripeFileId ? " ✓" : ""}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleReview("approve")}
              className={`${BTN_PRIMARY_SM_CLASS} ${stackedActionClass} disabled:opacity-50`}
            >
              {isPending ? "處理中…" : "批准"}
            </button>
            {!showReject ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => setShowReject(true)}
                className={`${BTN_OUTLINE_SM_CLASS} ${stackedActionClass} border-warning/30 text-warning hover:border-warning/50 hover:bg-warning/10 hover:text-warning disabled:opacity-50`}
              >
                拒絕
              </button>
            ) : null}
          </div>

          {showReject ? (
            <div className="w-full space-y-2">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="拒絕原因（必填）"
                className="h-9 w-full rounded-lg border border-white/10 bg-transparent px-3 font-sans text-[12px] text-text-primary placeholder:text-text-disabled focus-visible:border-warning/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/30"
              />
              <button
                type="button"
                disabled={isPending || !rejectReason.trim()}
                onClick={() => handleReview("reject")}
                className={`${BTN_OUTLINE_SM_CLASS} h-9 w-full border-warning/40 text-warning hover:border-warning/50 hover:bg-warning/10 hover:text-warning disabled:opacity-50`}
              >
                確認拒絕
              </button>
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="flex min-w-[11rem] flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Popover>
            <PopoverTrigger
              className={`${BTN_OUTLINE_SM_CLASS} ${inlineActionClass}`}
            >
              查看文件
            </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-56 p-2 bg-bg-card border-[rgba(237,232,224,0.12)]"
          >
            <div className="flex flex-col gap-1">
              {application.documents.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => openDocument(doc.id)}
                  className="text-left px-2 py-1.5 rounded-lg font-sans text-[12px] text-text-primary hover:bg-bg-elevated"
                >
                  {KYC_DOCUMENT_TYPE_LABELS[doc.documentType]}
                  {doc.stripeFileId ? " ✓" : ""}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

          <button
            type="button"
            disabled={isPending}
            onClick={() => handleReview("approve")}
            className={`${BTN_PRIMARY_SM_CLASS} ${inlineActionClass} disabled:opacity-50`}
          >
            {isPending ? "處理中…" : "批准"}
          </button>
          {!showReject ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setShowReject(true)}
              className={`${BTN_OUTLINE_SM_CLASS} ${inlineActionClass} border-warning/30 text-warning hover:border-warning/50 hover:bg-warning/10 hover:text-warning disabled:opacity-50`}
            >
              拒絕
            </button>
          ) : null}
        </div>

        {showReject ? (
          <div className="w-full min-w-[11rem] space-y-2">
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="拒絕原因（必填）"
              className="h-9 w-full rounded-lg border border-white/10 bg-transparent px-3 font-sans text-[12px] text-text-primary placeholder:text-text-disabled focus-visible:border-warning/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/30"
            />
            <button
              type="button"
              disabled={isPending || !rejectReason.trim()}
              onClick={() => handleReview("reject")}
              className={`${BTN_OUTLINE_SM_CLASS} h-9 w-full border-warning/40 text-warning hover:border-warning/50 hover:bg-warning/10 hover:text-warning disabled:opacity-50`}
            >
              確認拒絕
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (application.status === "approved" && !application.stripeAccountId) {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={handleRetryStripe}
        className={`${BTN_PRIMARY_SM_CLASS} h-9 disabled:opacity-50`}
      >
        {isPending ? "重試中…" : "重試 Stripe 開通"}
      </button>
    );
  }

  if (application.status === "rejected" && application.rejectReason) {
    return (
      <span
        className="font-sans text-[11px] text-warning max-w-[160px] text-right line-clamp-2"
        title={application.rejectReason}
      >
        {application.rejectReason}
      </span>
    );
  }

  return <span className="font-sans text-[11px] text-text-disabled">—</span>;
}

function KycApplicationMobileCard({
  app,
  highlightApplicationId,
  onUpdated,
}: {
  app: AdminKycApplicationListItem;
  highlightApplicationId: string | null;
  onUpdated: () => void;
}) {
  return (
    <article
      data-testid={`kyc-row-${app.id}`}
      className={`space-y-2.5 px-1 py-3 ${
        highlightApplicationId === app.id
          ? "rounded-lg bg-brand/5 ring-1 ring-brand/30"
          : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-sans text-[13px] font-semibold leading-snug text-text-primary">
            {app.companyNameEn}
            {app.companyNameZh ? (
              <span className="font-normal text-text-secondary">
                （{app.companyNameZh}）
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-text-secondary">
            {formatHandle(app.shopHandle, app.applicantUsername)}
          </p>
        </div>
        <KycApplicationStatusDot status={app.status} />
      </div>
      <dl className="grid grid-cols-1 gap-1 font-mono text-[10px]">
        <div className="flex min-w-0 gap-2">
          <dt className="shrink-0 text-text-disabled">電郵</dt>
          <dd className="truncate text-text-secondary">{app.repEmail}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-text-disabled">BR</dt>
          <dd className="text-text-secondary">{app.brNumber}</dd>
        </div>
        {app.stripeAccountId ? (
          <div className="flex min-w-0 gap-2">
            <dt className="shrink-0 text-text-disabled">Stripe</dt>
            <dd className="truncate text-text-disabled">{app.stripeAccountId}</dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt className="shrink-0 text-text-disabled">提交</dt>
          <dd className="text-text-disabled">{formatDateTime(app.submittedAt)}</dd>
        </div>
      </dl>
      <ApplicationActions
        application={app}
        onUpdated={onUpdated}
        variant="stacked"
      />
    </article>
  );
}

export function AdminMerchantsClient({
  initialApplications,
  loadError,
  highlightApplicationId = null,
}: {
  initialApplications: AdminKycApplicationListItem[];
  loadError: string | null;
  highlightApplicationId?: string | null;
}) {
  const router = useRouter();
  const highlightState = resolveHighlightState(
    initialApplications,
    highlightApplicationId,
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    highlightState.statusFilter,
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(highlightState.page);
  const hasScrolledToHighlight = useRef(false);

  const counts = useMemo(() => {
    return {
      all: initialApplications.length,
      pending: initialApplications.filter((a) => a.status === "pending").length,
      approved: initialApplications.filter((a) => a.status === "approved")
        .length,
      rejected: initialApplications.filter((a) => a.status === "rejected")
        .length,
    };
  }, [initialApplications]);

  const filtered = useMemo(() => {
    const byStatus =
      statusFilter === "all"
        ? initialApplications
        : initialApplications.filter((app) => app.status === statusFilter);

    const q = search.trim().toLowerCase();
    if (!q) return byStatus;

    return byStatus.filter((app) => {
      const handle = formatHandle(app.shopHandle, app.applicantUsername);
      return (
        app.companyNameEn.toLowerCase().includes(q) ||
        (app.companyNameZh ?? "").toLowerCase().includes(q) ||
        handle.toLowerCase().includes(q) ||
        app.repEmail.toLowerCase().includes(q) ||
        app.brNumber.toLowerCase().includes(q) ||
        (app.stripeAccountId ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialApplications, statusFilter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    if (!highlightApplicationId || hasScrolledToHighlight.current) {
      return;
    }

    const row = document.querySelector(
      `[data-testid="kyc-row-${highlightApplicationId}"]`,
    );
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      hasScrolledToHighlight.current = true;
    }
  }, [highlightApplicationId, paginated]);

  function handleFilterChange(next: StatusFilter) {
    setStatusFilter(next);
    setPage(1);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleUpdated() {
    router.refresh();
  }

  return (
    <div className="space-y-5 pb-8">
      <p className="font-sans text-[13px] text-text-secondary">
        人工審批商戶入駐申請；批准後自動開通店舖並建立 Stripe Connect 帳戶
      </p>

      {loadError ? (
        <div className="rounded-lg border border-error/30 bg-error/10 px-3 py-2.5 font-sans text-[13px] text-error">
          {loadError}
        </div>
      ) : null}

      <div className="space-y-4 border-b border-white/[0.08] pb-5">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-disabled"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="搜尋公司名、Handle、電郵、BR 或 Stripe ID…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className={FILTER_INPUT_CLASS}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleFilterChange(key)}
                className={FILTER_CHIP_SM_CLASS(statusFilter === key)}
              >
                {FILTER_LABELS[key]} ({counts[key]})
              </button>
            ))}
          </div>
        </div>

        {paginated.length === 0 ? (
          <p className="py-10 text-center font-sans text-[13px] text-text-secondary">
            暫無{FILTER_LABELS[statusFilter]}申請
          </p>
        ) : (
          <>
            <div className="md:hidden divide-y divide-white/[0.06]">
              {paginated.map((app) => (
                <KycApplicationMobileCard
                  key={app.id}
                  app={app}
                  highlightApplicationId={highlightApplicationId ?? null}
                  onUpdated={handleUpdated}
                />
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-lg border border-white/[0.08] md:block">
              <Table>
                <TableHeader className="border-b border-white/[0.08] bg-bg-card/30">
                  <TableRow className="border-transparent hover:bg-transparent">
                    <TableHead className="h-9 font-sans text-[11px] text-text-disabled">
                      公司名稱
                    </TableHead>
                    <TableHead className="h-9 font-mono text-[11px] text-text-disabled">
                      Handle
                    </TableHead>
                    <TableHead className="h-9 font-mono text-[11px] text-text-disabled">
                      電郵
                    </TableHead>
                    <TableHead className="h-9 font-mono text-[11px] text-text-disabled">
                      BR 號碼
                    </TableHead>
                    <TableHead className="h-9 font-mono text-[11px] text-text-disabled">
                      Stripe ID
                    </TableHead>
                    <TableHead className="h-9 text-center font-sans text-[11px] text-text-disabled">
                      狀態
                    </TableHead>
                    <TableHead className="h-9 text-right font-mono text-[11px] text-text-disabled">
                      提交時間
                    </TableHead>
                    <TableHead className="h-9 min-w-[11rem] text-right font-sans text-[11px] text-text-disabled">
                      操作
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((app, rowIndex) => (
                    <TableRow
                      key={app.id}
                      data-testid={`kyc-row-${app.id}`}
                      className={`border-white/[0.06] transition-colors hover:bg-brand/10 ${
                        rowIndex % 2 === 0 ? "bg-bg-card/25" : "bg-white/[0.02]"
                      } ${
                        highlightApplicationId === app.id
                          ? "!bg-brand/10 ring-1 ring-inset ring-brand/30"
                          : ""
                      }`}
                    >
                      <TableCell className={`max-w-[12rem] py-2.5 ${SECTION_TITLE_CLASS}`}>
                        <span className="line-clamp-2">
                          {app.companyNameEn}
                          {app.companyNameZh ? (
                            <span className="font-normal text-text-secondary">
                              （{app.companyNameZh}）
                            </span>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-[11px] text-text-secondary whitespace-nowrap">
                        {formatHandle(app.shopHandle, app.applicantUsername)}
                      </TableCell>
                      <TableCell className="max-w-[10rem] py-2.5 font-mono text-[11px] text-text-secondary">
                        <span className="block truncate">{app.repEmail}</span>
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-[11px] text-text-secondary whitespace-nowrap">
                        {app.brNumber}
                      </TableCell>
                      <TableCell className="max-w-[9rem] py-2.5 font-mono text-[11px] text-text-disabled">
                        <span className="block truncate">
                          {app.stripeAccountId ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-block rounded border px-2 py-0.5 font-mono text-[9px] ${statusBadgeClasses(app.status)}`}
                        >
                          {statusLabel(app.status)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-mono text-[11px] text-text-disabled whitespace-nowrap">
                        {formatDateTime(app.submittedAt)}
                        {app.reviewedAt ? (
                          <div className="text-[10px] text-text-disabled">
                            審核 {formatDateTime(app.reviewedAt)}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-2.5 text-right align-top">
                        <ApplicationActions
                          application={app}
                          onUpdated={handleUpdated}
                          variant="inline"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {filtered.length > 0 ? (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={filtered.length}
            itemsPerPage={PAGE_SIZE}
            itemLabel="筆申請"
            enableScroll={false}
            showInfoStrip={false}
          />
        ) : null}
      </div>
    </div>
  );
}
