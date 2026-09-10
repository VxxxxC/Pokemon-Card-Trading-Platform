"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  adminClearSellerSettlement,
  adminConfirmGradingIntake,
  adminFailGradingAndRefund,
  adminPassGrading,
  adminSubmitGradingOutbound,
  adminSubmitSellerReturnTracking,
  getAdminGradingAuditHistory,
  type AdminGradingAuditRow,
  type AdminGradingFaultParty,
  type AdminGradingQueueRow,
  type AdminGradingTab,
} from "@/app/actions/admin-grading";
import {
  ActionPanel,
  BTN_BRAND_CLASS,
  canAdminSubmitSellerReturn,
  merchantRecoveryBlocksReturn,
  cnInputClass,
  cnSelectClass,
  cnTextareaClass,
  defaultPassGradingOptionId,
  DetailInline,
  DetailValue,
  formatAdminGradingEscrowStatus,
  formatGradingFailWarning,
  formatListingGrade,
  formatParty,
  formatProductName,
  GradingDecisionToggle,
  GradingFlowTimelineEntry,
  GradingOrderTimeline,
  type GradingDecisionMode,
  RecoveryProgressDetail,
  resolveMerchantRecoveryProgress,
  showMerchantRecoveryTrackingPanel,
  showSellerSettlementPanel,
} from "@/app/admin/grading/admin-grading-workbench-ui";
import { CertifiedMerchantBadge } from "@/app/components/profile/CertifiedMerchantBadge";
import { GRADING_OPTION_GROUPS, getGradingOptionsByGroup } from "@/lib/grading/options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AdminGradingOrderDetailClientProps = {
  initialRow: AdminGradingQueueRow;
  tab: AdminGradingTab;
  backHref: string;
};

export function AdminGradingOrderDetailClient({
  initialRow,
  tab,
  backHref,
}: AdminGradingOrderDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [row, setRow] = useState(initialRow);
  const [auditRows, setAuditRows] = useState<AdminGradingAuditRow[]>([]);
  const [notes, setNotes] = useState("");
  const [gradingOptionId, setGradingOptionId] = useState(() =>
    defaultPassGradingOptionId(initialRow),
  );
  const [failReason, setFailReason] = useState("");
  const [faultParty, setFaultParty] = useState<AdminGradingFaultParty | "">("");
  const [carrierLiabilityParty, setCarrierLiabilityParty] = useState<
    "seller" | "platform" | ""
  >("");
  const [outboundTracking, setOutboundTracking] = useState(
    initialRow.outbound_tracking_no ?? "",
  );
  const [fpsReference, setFpsReference] = useState("");
  const [settlementNotes, setSettlementNotes] = useState("");
  const [sellerReturnTracking, setSellerReturnTracking] = useState("");
  const [gradingDecisionMode, setGradingDecisionMode] =
    useState<GradingDecisionMode>("pass");

  const loadAudit = useCallback((target: AdminGradingQueueRow) => {
    startTransition(async () => {
      const result = await getAdminGradingAuditHistory({
        orderKind: target.order_kind,
        orderId: target.order_id,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setAuditRows(result.data);
    });
  }, []);

  useEffect(() => {
    loadAudit(row);
  }, [loadAudit, row.order_id, row.order_kind, row.seller_settlement_status]);

  const runMutation = (
    action: () => Promise<{ success: boolean; error?: string }>,
    successMessage: string,
    options?: { redirectToList?: boolean },
  ) => {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? "操作失敗");
        return;
      }
      toast.success(successMessage);
      if (options?.redirectToList) {
        router.push(backHref);
        router.refresh();
        return;
      }
      router.refresh();
    });
  };

  const handleClearSellerSettlement = () => {
    startTransition(async () => {
      const result = await adminClearSellerSettlement({
        orderKind: row.order_kind,
        orderId: row.order_id,
        fpsReference,
        notes: settlementNotes,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        row.order_kind === "merchant"
          ? "已確認追償入賬，請提交寄回賣家物流"
          : "已確認賣方收款，請提交寄回賣家物流",
      );
      const nextRow = { ...row, seller_settlement_status: "cleared" };
      setRow(nextRow);
      loadAudit(nextRow);
      router.refresh();
    });
  };

  const handleSubmitSellerReturnTracking = () => {
    const trackingNo = sellerReturnTracking.trim();
    if (!trackingNo) {
      toast.error("請輸入寄回物流單號");
      return;
    }
    startTransition(async () => {
      const result = await adminSubmitSellerReturnTracking({
        orderKind: row.order_kind,
        orderId: row.order_id,
        trackingNo,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("寄回賣家物流已更新");
      router.push(backHref);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-10">
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-text-secondary transition-colors hover:border-brand/30 hover:bg-brand/10 hover:text-brand"
          aria-label="返回鑑定工作台"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-mono text-[17px] font-bold text-text-primary sm:text-[18px]">
            {row.order_number ?? row.order_id}
          </h1>
          <p className="font-sans text-[12px] text-text-disabled">鑑定訂單詳情</p>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-bg-page">
        <div className="border-b border-white/[0.08] px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={
                row.order_kind === "member"
                  ? "border-brand/25 bg-brand/10 text-brand"
                  : "border-white/10 text-text-secondary"
              }
            >
              {row.order_kind === "member" ? "C2C" : "B2C"}
            </Badge>
            <Badge
              variant="outline"
              className="border-white/10 font-sans text-[11px] text-text-secondary"
            >
              {formatAdminGradingEscrowStatus(row.escrow_status, row.order_kind)}
            </Badge>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4 sm:px-6">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <DetailInline label="買家" compact>
              <DetailValue value={row.buyer_display_name ?? row.buyer_username} />
            </DetailInline>
            <DetailInline label="賣方" compact>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{formatParty(row)}</span>
                {row.order_kind === "merchant" ? (
                  <CertifiedMerchantBadge
                    className="shrink-0 scale-[0.92] origin-left"
                  />
                ) : null}
              </span>
            </DetailInline>
            <DetailInline label="商品" compact>
              {formatProductName(row)}
            </DetailInline>
            <DetailInline label="賣家申報" compact>
              {formatListingGrade(row)}
            </DetailInline>
            <DetailInline label="金額" className="col-span-2 sm:col-span-1" compact>
              <span className="font-mono text-[12px] font-semibold text-brand">
                HK$ {Number(row.total_amount ?? 0).toLocaleString("zh-HK")}
              </span>
            </DetailInline>
          </div>

          <GradingOrderTimeline row={row} currentTab={tab} />

          {tab === "awaiting_intake" ? (
            <ActionPanel title="入庫確認" compact>
              <Button
                type="button"
                disabled={isPending}
                size="sm"
                className={BTN_BRAND_CLASS}
                onClick={() =>
                  runMutation(
                    () =>
                      adminConfirmGradingIntake({
                        orderKind: row.order_kind,
                        orderId: row.order_id,
                      }),
                    "已確認入庫",
                    { redirectToList: true },
                  )
                }
              >
                確認入庫
              </Button>
            </ActionPanel>
          ) : null}

          {tab === "grading" ? (
            <ActionPanel title="鑑定作業">
              <GradingDecisionToggle
                mode={gradingDecisionMode}
                onChange={setGradingDecisionMode}
              />

              <div
                className={`space-y-3 rounded-lg border p-3 ${
                  gradingDecisionMode === "pass"
                    ? "border-white/10 bg-bg-page/30"
                    : "border-warning/25 bg-warning/5"
                }`}
              >
                {gradingDecisionMode === "pass" ? (
                  <>
                    <select
                      name="gradingOptionId"
                      value={gradingOptionId}
                      onChange={(event) => setGradingOptionId(event.target.value)}
                      className={cnSelectClass("w-full")}
                    >
                      <option value="">請選擇鑑定等級（必填）</option>
                      {GRADING_OPTION_GROUPS.filter((group) => group.key !== "RAW").map(
                        (group) => (
                          <optgroup key={group.key} label={group.label}>
                            {getGradingOptionsByGroup(group.key).map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </optgroup>
                        ),
                      )}
                    </select>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="鑑定備註（選填）"
                      className={cnTextareaClass()}
                    />
                    <Button
                      type="button"
                      disabled={isPending || !gradingOptionId}
                      className={`${BTN_BRAND_CLASS} w-full`}
                      onClick={() =>
                        runMutation(
                          () =>
                            adminPassGrading({
                              orderKind: row.order_kind,
                              orderId: row.order_id,
                              gradingOptionId,
                              notes,
                            }),
                          "鑑定已標記為通過",
                          { redirectToList: true },
                        )
                      }
                    >
                      確認通過
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="font-sans text-[12px] leading-relaxed text-warning">
                      {formatGradingFailWarning(row, faultParty)}
                    </p>
                    <select
                      name="faultParty"
                      value={faultParty}
                      onChange={(event) =>
                        setFaultParty(event.target.value as AdminGradingFaultParty | "")
                      }
                      className={cnSelectClass("w-full")}
                    >
                      <option value="">請選擇責任方（必填）</option>
                      <option value="buyer">買家</option>
                      <option value="seller">賣家</option>
                      <option value="platform">平台</option>
                      <option value="carrier">物流</option>
                      <option value="inconclusive">無法判定</option>
                    </select>
                    {faultParty === "carrier" ? (
                      <select
                        name="carrierLiabilityParty"
                        value={carrierLiabilityParty}
                        onChange={(event) =>
                          setCarrierLiabilityParty(
                            event.target.value as "seller" | "platform" | "",
                          )
                        }
                        className={cnSelectClass("w-full")}
                      >
                        <option value="">物流承擔方（必填）</option>
                        <option value="seller">賣家物流</option>
                        <option value="platform">平台物流</option>
                      </select>
                    ) : null}
                    <textarea
                      value={failReason}
                      onChange={(event) => setFailReason(event.target.value)}
                      placeholder="失敗原因（選填）"
                      className={cnTextareaClass("min-h-[64px]")}
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full active:scale-[0.98]"
                      disabled={
                        isPending ||
                        !faultParty ||
                        (faultParty === "carrier" && !carrierLiabilityParty)
                      }
                      onClick={() =>
                        runMutation(
                          async () => {
                            if (!faultParty) {
                              return { success: false, error: "請選擇責任方" };
                            }
                            if (faultParty === "carrier" && !carrierLiabilityParty) {
                              return {
                                success: false,
                                error: "物流責任請選擇承擔方",
                              };
                            }
                            const result = await adminFailGradingAndRefund({
                              orderKind: row.order_kind,
                              orderId: row.order_id,
                              faultParty,
                              reason: failReason,
                              ...(faultParty === "carrier" && carrierLiabilityParty
                                ? { carrierLiabilityParty }
                                : {}),
                            });
                            return result.success
                              ? { success: true }
                              : { success: false, error: result.error };
                          },
                          "已釋放未扣款餘額",
                          { redirectToList: true },
                        )
                      }
                    >
                      確認失敗並釋放餘額
                    </Button>
                  </>
                )}
              </div>
            </ActionPanel>
          ) : null}

          {showSellerSettlementPanel(row) ? (
            <ActionPanel
              title={
                row.seller_settlement_status === "cleared"
                  ? "寄回賣家"
                  : "賣方追償與寄回"
              }
            >
              {resolveMerchantRecoveryProgress(row) ||
              row.receivable_amount_hkd != null ? (
                <RecoveryProgressDetail row={row} compact />
              ) : null}
              {row.seller_settlement_status === "pending" &&
              row.order_kind === "member" ? (
                <>
                  <p className="font-sans text-[12px] text-text-secondary">
                    請先確認已向賣方收取追償款項。
                  </p>
                  <input
                    value={fpsReference}
                    onChange={(event) => setFpsReference(event.target.value)}
                    placeholder="FPS 參考編號（選填）"
                    className={cnInputClass("font-mono")}
                  />
                  <textarea
                    value={settlementNotes}
                    onChange={(event) => setSettlementNotes(event.target.value)}
                    placeholder="收款備註（選填）"
                    className={cnTextareaClass("min-h-[64px]")}
                  />
                  <Button
                    type="button"
                    disabled={isPending}
                    className={BTN_BRAND_CLASS}
                    onClick={handleClearSellerSettlement}
                  >
                    確認賣方已收款
                  </Button>
                </>
              ) : merchantRecoveryBlocksReturn(row) ? (
                <p className="font-sans text-[12px] text-text-secondary">
                  追償款項尚未扣清，待 Connect 撥款抵扣完成後方可安排寄回。
                </p>
              ) : row.order_kind === "merchant" &&
                row.seller_settlement_status === "pending" ? (
                <p className="font-sans text-[12px] text-text-secondary">
                  追償已記入 Connect ledger，系統將於下筆撥款自動抵扣；扣清後可安排寄回。
                </p>
              ) : null}

              {canAdminSubmitSellerReturn(row) ? (
                <>
                  <p className="font-sans text-[12px] text-text-secondary">
                    請填寫寄回賣家物流單號。
                  </p>
                  <input
                    value={sellerReturnTracking}
                    onChange={(event) =>
                      setSellerReturnTracking(event.target.value)
                    }
                    placeholder="寄回賣家物流單號"
                    className={cnInputClass("font-mono")}
                  />
                  <Button
                    type="button"
                    disabled={isPending || !sellerReturnTracking.trim()}
                    className={BTN_BRAND_CLASS}
                    onClick={handleSubmitSellerReturnTracking}
                  >
                    提交寄回賣家物流
                  </Button>
                </>
              ) : null}
            </ActionPanel>
          ) : null}

          {showMerchantRecoveryTrackingPanel(row) ? (
            <ActionPanel title="追償狀態">
              <RecoveryProgressDetail row={row} />
            </ActionPanel>
          ) : null}

          {tab === "awaiting_outbound" ? (
            <ActionPanel title="出庫物流">
              <input
                value={outboundTracking}
                onChange={(event) => setOutboundTracking(event.target.value)}
                placeholder="出庫物流單號"
                className={cnInputClass("font-mono")}
              />
              <Button
                type="button"
                disabled={isPending || !outboundTracking.trim()}
                className={BTN_BRAND_CLASS}
                onClick={() =>
                  runMutation(
                    () =>
                      adminSubmitGradingOutbound({
                        orderKind: row.order_kind,
                        orderId: row.order_id,
                        trackingNo: outboundTracking,
                      }),
                    "出庫物流已更新",
                    { redirectToList: true },
                  )
                }
              >
                提交出庫物流
              </Button>
            </ActionPanel>
          ) : null}

          <section className="border-t border-white/[0.08] pt-3">
            <h3 className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-wide text-text-disabled">
              流程紀錄
            </h3>
            {auditRows.length === 0 ? (
              <p className="font-sans text-[12px] text-text-disabled">暫無紀錄</p>
            ) : (
              <div className="space-y-2">
                {auditRows.map((entry) => (
                  <GradingFlowTimelineEntry key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
