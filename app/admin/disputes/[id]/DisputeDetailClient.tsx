"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  adjustAdminModerationCaseScore,
  previewModerationOrderRefund,
  requestAdminModerationEvidence,
  resolveAdminModerationCase,
  retryModerationOrderRefund,
} from "@/app/actions/admin-moderation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  categoryBadgeClasses,
  deriveSeverityBand,
  formatCategoryLabel,
  formatModerationDateTime,
  moderationResolutionLabel,
  moderationStatusBadgeClasses,
  moderationStatusLabel,
  sanctionScopeLabel,
  sanctionTypeLabel,
  severityBadgeClasses,
  severityLabel,
} from "@/lib/moderation/admin-case-presenters";
import {
  isUpheldResolutionOption,
  mapResolutionOptionToInput,
  MODERATION_RESOLUTION_OPTIONS,
  VIOLATION_PERSONA_OPTIONS,
  type ModerationResolutionOptionValue,
} from "@/lib/moderation/resolution-config";
import type {
  AdminModerationCaseBundle,
  AdminSubjectModerationHistory,
  ModerationRefundBreakdownPreview,
  ViolationPersona,
} from "@/lib/moderation/types";
import ModerationAuditTimeline from "./ModerationAuditTimeline";
import ModerationChatHistoryPanel from "./ModerationChatHistoryPanel";
import ModerationEvidencePanel from "./ModerationEvidencePanel";
import ModerationOrderContextPanel from "./ModerationOrderContextPanel";
import ModerationReportSummaryPanel from "./ModerationReportSummaryPanel";
import ModerationSubjectHistoryPanel from "./ModerationSubjectHistoryPanel";
import {
  BTN_OUTLINE_CLASS,
  BTN_PRIMARY_CLASS,
  INPUT_CLASS,
  META_TEXT_CLASS,
  MODERATION_META_BADGE_CLASS,
  SECTION_BLOCK_CLASS,
  SECTION_TITLE_CLASS,
  SELECT_CONTENT_CLASS,
  SELECT_ITEM_CLASS,
  SELECT_TRIGGER_CLASS,
  TEXTAREA_CLASS,
} from "./moderation-detail-ui";

interface DisputeDetailClientProps {
  bundle: AdminModerationCaseBundle;
  subjectHistory: AdminSubjectModerationHistory | null;
}

function isCaseOpen(status: AdminModerationCaseBundle["case"]["status"]): boolean {
  return status === "open" || status === "reviewing";
}

export default function DisputeDetailClient({
  bundle,
  subjectHistory,
}: DisputeDetailClientProps) {
  const router = useRouter();
  const [isAdjustPending, startAdjustTransition] = useTransition();
  const [isResolvePending, startResolveTransition] = useTransition();
  const { case: caseDetail, reports, attachments, chatAccess, auditLog, activeSanctions, relatedOrders } =
    bundle;
  const severity = deriveSeverityBand(caseDetail.finalScore);
  const primaryReporter = bundle.reporterSummaries[0];
  const primaryReporterUsername = primaryReporter
    ? reports.find((r) => r.reporterId === primaryReporter.id)?.reporterUsername
    : null;
  const caseOpen = isCaseOpen(caseDetail.status);
  const showScoreBreakdown =
    caseOpen ||
    caseDetail.adminAdjustment !== 0 ||
    reports.length > 1;
  const chatRoomIds =
    chatAccess.roomIds.length > 0
      ? chatAccess.roomIds
      : chatAccess.roomId
        ? [chatAccess.roomId]
        : [];

  const [scoreAdjustment, setScoreAdjustment] = useState("0");
  const [adjustmentReason, setAdjustmentReason] = useState(
    caseDetail.adjustmentReason ?? "",
  );
  const [resolutionOption, setResolutionOption] = useState<
    ModerationResolutionOptionValue | ""
  >("");
  const [violationPersona, setViolationPersona] = useState<
    ViolationPersona | ""
  >("");
  const [evidenceOverride, setEvidenceOverride] = useState(false);
  const [evidenceOverrideReason, setEvidenceOverrideReason] = useState("");
  const [notifyReporter, setNotifyReporter] = useState(true);
  const [executeOrderRefund, setExecuteOrderRefund] = useState(false);
  const [refundOrderId, setRefundOrderId] = useState(() => {
    const eligible = bundle.relatedOrders.filter((order) => order.refundEligible);
    return eligible.length === 1 ? eligible[0].id : "";
  });
  const [faultParty, setFaultParty] = useState<
    "seller" | "buyer" | "platform" | "carrier" | "inconclusive" | ""
  >("");
  const [platformFaultReason, setPlatformFaultReason] = useState("");
  const [carrierLiabilityParty, setCarrierLiabilityParty] = useState<
    "seller" | "platform" | ""
  >("");
  const [refundPreview, setRefundPreview] =
    useState<ModerationRefundBreakdownPreview | null>(null);
  const [refundPreviewError, setRefundPreviewError] = useState<string | null>(
    null,
  );
  const [previewFetchGeneration, setPreviewFetchGeneration] = useState(0);
  const [previewResolvedGeneration, setPreviewResolvedGeneration] = useState(0);
  const [isRetryPending, startRetryTransition] = useTransition();
  const [isEvidenceRequestPending, startEvidenceRequestTransition] = useTransition();
  const [evidenceRequestTarget, setEvidenceRequestTarget] = useState<
    "subject" | "reporter" | ""
  >("");
  const [evidenceRequestMessage, setEvidenceRequestMessage] = useState("");

  const eligibleRefundOrders = relatedOrders.filter((order) => order.refundEligible);

  const canPreviewRefund =
    executeOrderRefund &&
    Boolean(refundOrderId) &&
    Boolean(faultParty) &&
    (faultParty !== "carrier" || Boolean(carrierLiabilityParty)) &&
    (faultParty !== "platform" || Boolean(platformFaultReason.trim()));

  useEffect(() => {
    if (!canPreviewRefund || !faultParty) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPreviewFetchGeneration((value) => value + 1);
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    canPreviewRefund,
    refundOrderId,
    faultParty,
    platformFaultReason,
    carrierLiabilityParty,
  ]);

  useEffect(() => {
    if (!canPreviewRefund || !faultParty || previewFetchGeneration === 0) {
      return;
    }

    const generation = previewFetchGeneration;
    let cancelled = false;

    void previewModerationOrderRefund({
      orderId: refundOrderId,
      faultParty,
      ...(faultParty === "platform"
        ? { platformFaultReason: platformFaultReason.trim() }
        : {}),
      ...(faultParty === "carrier" && carrierLiabilityParty
        ? { carrierLiabilityParty }
        : {}),
    }).then((result) => {
      if (cancelled) {
        return;
      }
      if (!result.success) {
        setRefundPreview(null);
        setRefundPreviewError(result.error);
        setPreviewResolvedGeneration(generation);
        return;
      }
      setRefundPreview(result.data);
      setRefundPreviewError(null);
      setPreviewResolvedGeneration(generation);
    });

    return () => {
      cancelled = true;
    };
  }, [
    previewFetchGeneration,
    canPreviewRefund,
    refundOrderId,
    faultParty,
    platformFaultReason,
    carrierLiabilityParty,
  ]);

  const visibleRefundPreview = canPreviewRefund ? refundPreview : null;
  const visibleRefundPreviewError = canPreviewRefund ? refundPreviewError : null;
  const visibleRefundPreviewLoading =
    canPreviewRefund &&
    previewFetchGeneration > 0 &&
    previewFetchGeneration !== previewResolvedGeneration;

  const handleSaveScoreAdjustment = () => {
    const adjustment = Number(scoreAdjustment);
    if (!Number.isFinite(adjustment)) {
      toast.error("請輸入有效的分數調整值");
      return;
    }

    if (adjustment !== 0 && !adjustmentReason.trim()) {
      toast.error("調整分數時必須填寫原因");
      return;
    }

    startAdjustTransition(async () => {
      const result = await adjustAdminModerationCaseScore({
        caseId: caseDetail.id,
        adjustment,
        reason: adjustmentReason.trim() || undefined,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("風控分數已更新");
      router.refresh();
    });
  };

  const handleRequestEvidence = () => {
    if (!evidenceRequestTarget) {
      toast.error("請選擇通知對象");
      return;
    }

    startEvidenceRequestTransition(async () => {
      const result = await requestAdminModerationEvidence({
        caseId: caseDetail.id,
        targetRole: evidenceRequestTarget,
        message: evidenceRequestMessage.trim() || undefined,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("已發送補充證據通知郵件");
      setEvidenceRequestMessage("");
    });
  };

  const handleResolve = () => {
    if (!resolutionOption) {
      toast.error("請選擇仲裁結果");
      return;
    }

    const requiresUpheld = isUpheldResolutionOption(resolutionOption);
    if (requiresUpheld && !violationPersona) {
      toast.error("裁定成立時必須指定違規身分");
      return;
    }

    if (
      requiresUpheld &&
      !chatAccess.evidenceSufficient &&
      !evidenceOverride
    ) {
      toast.error("證據不足時無法裁定成立，請勾選管理員覆寫或改選其他結果");
      return;
    }

    if (evidenceOverride && !evidenceOverrideReason.trim()) {
      toast.error("請填寫證據覆寫原因");
      return;
    }

    if (requiresUpheld && executeOrderRefund) {
      if (!refundOrderId) {
        toast.error("請選擇要退款的訂單");
        return;
      }
      if (!faultParty) {
        toast.error("請選擇退款責任方");
        return;
      }
      if (faultParty === "platform" && !platformFaultReason.trim()) {
        toast.error("平台責任退款必須填寫原因");
        return;
      }
      if (faultParty === "carrier" && !carrierLiabilityParty) {
        toast.error("物流責任必須指定承擔方");
        return;
      }
    }

    const resolveInput = mapResolutionOptionToInput(
      resolutionOption,
      violationPersona || undefined,
    );

    if (evidenceOverride && evidenceOverrideReason.trim()) {
      resolveInput.evidenceOverrideReason = evidenceOverrideReason.trim();
    }

    if (requiresUpheld && executeOrderRefund && refundOrderId && faultParty) {
      resolveInput.orderRefund = {
        enabled: true,
        orderId: refundOrderId,
        faultParty,
        ...(faultParty === "platform"
          ? { platformFaultReason: platformFaultReason.trim() }
          : {}),
        ...(faultParty === "carrier" && carrierLiabilityParty
          ? { carrierLiabilityParty }
          : {}),
      };
    }

    startResolveTransition(async () => {
      const result = await resolveAdminModerationCase({
        caseId: caseDetail.id,
        ...resolveInput,
        notifyReporter,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      if (result.data.authBanWarning) {
        toast.warning(result.data.authBanWarning);
      }

      if (result.data.refundWarning) {
        toast.warning(result.data.refundWarning);
      }

      toast.success("案件已裁定結案");
      router.push("/admin/disputes?status=completed");
    });
  };

  return (
    <div className="pb-8">
      <header className={`${SECTION_BLOCK_CLASS} space-y-2`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
              <p className="font-mono text-[10px] text-text-disabled">
                {caseDetail.caseNumber}
              </p>
              <p className={META_TEXT_CLASS}>
                {formatModerationDateTime(caseDetail.createdAt)}
              </p>
            </div>
            <h1 className="mt-1 font-sans text-[17px] font-bold leading-snug text-text-primary sm:text-[19px]">
              被舉報：{caseDetail.subject.displayName ?? "未知用戶"}
            </h1>
            <p className={`mt-0.5 ${META_TEXT_CLASS} text-text-secondary`}>
              @{caseDetail.subject.username ?? "—"} ·{" "}
              {caseDetail.subject.role ?? "—"}
            </p>
          </div>
          <Badge
            variant="outline"
            className={`shrink-0 ${MODERATION_META_BADGE_CLASS} ${moderationStatusBadgeClasses(caseDetail.status)}`}
          >
            {moderationStatusLabel(caseDetail.status)}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Badge
            variant="outline"
            className={`${MODERATION_META_BADGE_CLASS} ${categoryBadgeClasses(caseDetail.primaryCategory)}`}
          >
            {formatCategoryLabel(caseDetail.primaryCategory)}
          </Badge>
          <Badge
            variant="outline"
            className={`${MODERATION_META_BADGE_CLASS} ${severityBadgeClasses(severity)}`}
          >
            {severityLabel(severity)}
          </Badge>
          <Badge
            variant="outline"
            className={`${MODERATION_META_BADGE_CLASS} border-brand/20 bg-brand/10 text-brand`}
          >
            分數 {caseDetail.finalScore ?? 0}
          </Badge>
        </div>

        <p className={META_TEXT_CLASS}>
          主要舉報方{" "}
          <span className="text-text-secondary">
            {primaryReporter?.displayName ?? "—"}
            {primaryReporterUsername ? ` · @${primaryReporterUsername}` : null}
          </span>
          <span className="text-text-disabled/50"> · </span>
          {bundle.reporterSummaries.length} 人舉報
        </p>

        {activeSanctions.length > 0 ? (
          <div className="space-y-0.5">
            <p className="font-sans text-[12px] font-medium text-text-secondary">
              有效制裁
            </p>
            {activeSanctions.map((sanction) => (
              <p
                key={sanction.id}
                className="font-sans text-[12px] text-text-disabled"
              >
                {sanctionScopeLabel(sanction.scope)} ·{" "}
                {sanctionTypeLabel(sanction.type)}
                {sanction.endsAt
                  ? ` · 至 ${formatModerationDateTime(sanction.endsAt)}`
                  : " · 永久"}
              </p>
            ))}
          </div>
        ) : null}
      </header>

      <ModerationReportSummaryPanel
        reports={reports}
        primaryCategory={caseDetail.primaryCategory}
        primaryReporterId={primaryReporter?.id}
      />

      {!chatAccess.evidenceSufficient ? (
        <p className={`${SECTION_BLOCK_CLASS} font-sans text-[13px] text-error`}>
          證據不足 — 此類別需調閱對話紀錄。若下方無聊天紀錄，可先標記
          insufficient_evidence 或駁回。
        </p>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[55fr_45fr] lg:gap-8">
        <div>
          {subjectHistory ? (
            <ModerationSubjectHistoryPanel
              history={subjectHistory}
              currentFinalScore={caseDetail.finalScore}
            />
          ) : null}

          <section className={SECTION_BLOCK_CLASS}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className={SECTION_TITLE_CLASS}>用戶上傳證據</h2>
              {attachments.length === 0 ? (
                <span className={META_TEXT_CLASS}>暫無</span>
              ) : null}
            </div>
            {attachments.length > 0 ? (
              <ModerationEvidencePanel attachments={attachments} />
            ) : null}
          </section>

          <ModerationChatHistoryPanel
            caseId={caseDetail.id}
            subjectUserId={caseDetail.subject.id}
            chatRoomIds={chatRoomIds}
          />
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          {caseOpen ? (
            <section className={SECTION_BLOCK_CLASS}>
              <h2 className={SECTION_TITLE_CLASS}>風控分數明細</h2>
              {showScoreBreakdown ? (
                <div className="space-y-1.5">
                  <ScoreDetailRow
                    label="自動分數"
                    value={String(caseDetail.autoScore)}
                  />
                  {reports.map((report) => (
                    <ScoreDetailRow
                      key={report.id}
                      label={formatCategoryLabel(report.category)}
                      value={`+${report.contributionScore ?? 0}`}
                      hint={report.reporterDisplayName ?? "未知"}
                    />
                  ))}
                  <ScoreDetailRow
                    label="管理員調整"
                    value={String(caseDetail.adminAdjustment)}
                  />
                  {caseDetail.adjustmentReason ? (
                    <p className={META_TEXT_CLASS}>
                      調整原因：{caseDetail.adjustmentReason}
                    </p>
                  ) : null}
                  <ScoreDetailRow
                    label="最終分數"
                    value={String(caseDetail.finalScore ?? 0)}
                    emphasize
                  />
                </div>
              ) : null}
              <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
                <div>
                  <label
                    htmlFor="admin-score-adjustment"
                    className="mb-1.5 block font-sans text-[12px] font-medium text-text-secondary"
                  >
                    分數調整 (+/−)
                  </label>
                  <Input
                    id="admin-score-adjustment"
                    name="adjustment"
                    type="number"
                    value={scoreAdjustment}
                    onChange={(event) => setScoreAdjustment(event.target.value)}
                    disabled={isAdjustPending}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label
                    htmlFor="admin-adjustment-reason"
                    className="mb-1.5 block font-sans text-[12px] font-medium text-text-secondary"
                  >
                    調整原因
                  </label>
                  <Textarea
                    id="admin-adjustment-reason"
                    name="adjustmentReason"
                    rows={3}
                    value={adjustmentReason}
                    onChange={(event) => setAdjustmentReason(event.target.value)}
                    disabled={isAdjustPending}
                    className={TEXTAREA_CLASS}
                  />
                </div>
                <Button
                  type="button"
                  disabled={isAdjustPending}
                  onClick={handleSaveScoreAdjustment}
                  className={BTN_PRIMARY_CLASS}
                >
                  {isAdjustPending ? "儲存中…" : "儲存調整"}
                </Button>
              </div>
            </section>
          ) : null}

          <ModerationOrderContextPanel
            relatedOrders={relatedOrders}
            primaryCategory={caseDetail.primaryCategory}
            caseId={caseDetail.id}
            caseOpen={caseOpen}
            isRetryPending={isRetryPending}
            onRetryRefund={(orderId) => {
              startRetryTransition(async () => {
                const result = await retryModerationOrderRefund({
                  caseId: caseDetail.id,
                  orderId,
                });
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                toast.success("已重新提交售後退款");
                router.refresh();
              });
            }}
          />

          {caseOpen ? (
            <section className={SECTION_BLOCK_CLASS}>
              <h2 className={SECTION_TITLE_CLASS}>要求補充證據</h2>
              <p className="mb-4 font-sans text-[12px] text-text-secondary">
                案件審查中向被舉報人或舉報人發送電郵，請其補充證據；不會關閉案件。
              </p>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block font-sans text-[12px] font-medium text-text-secondary">
                    通知對象
                  </label>
                  <Select
                    value={evidenceRequestTarget}
                    onValueChange={(value) =>
                      setEvidenceRequestTarget(value as "subject" | "reporter")
                    }
                    disabled={isEvidenceRequestPending}
                  >
                    <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                      <SelectValue placeholder="請選擇通知對象" />
                    </SelectTrigger>
                    <SelectContent className={SELECT_CONTENT_CLASS}>
                      <SelectItem value="subject" className={SELECT_ITEM_CLASS}>
                        被舉報人（{caseDetail.subject.displayName}）
                      </SelectItem>
                      <SelectItem
                        value="reporter"
                        className={SELECT_ITEM_CLASS}
                        disabled={!primaryReporter}
                      >
                        舉報人
                        {primaryReporter
                          ? `（${primaryReporter.displayName}）`
                          : "（無舉報人）"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block font-sans text-[12px] font-medium text-text-secondary">
                    補充說明（選填）
                  </label>
                  <Textarea
                    name="evidenceRequestMessage"
                    rows={3}
                    placeholder="請說明需要補充的證據或資料"
                    value={evidenceRequestMessage}
                    onChange={(event) => setEvidenceRequestMessage(event.target.value)}
                    disabled={isEvidenceRequestPending}
                    className={TEXTAREA_CLASS}
                  />
                </div>
                <Button
                  type="button"
                  disabled={isEvidenceRequestPending || !evidenceRequestTarget}
                  onClick={handleRequestEvidence}
                  className={BTN_OUTLINE_CLASS}
                >
                  {isEvidenceRequestPending ? "發送中…" : "發送補充證據通知"}
                </Button>
              </div>
            </section>
          ) : null}

          {caseOpen ? (
            <section className={SECTION_BLOCK_CLASS}>
              <h2 className={SECTION_TITLE_CLASS}>仲裁判定動作</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block font-sans text-[12px] font-medium text-text-secondary">
                    選擇仲裁結果
                  </label>
                  <Select
                    value={resolutionOption}
                    onValueChange={(value) =>
                      setResolutionOption(value as ModerationResolutionOptionValue)
                    }
                    disabled={isResolvePending}
                  >
                    <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                      <SelectValue placeholder="請選擇一項仲裁判定動作" />
                    </SelectTrigger>
                    <SelectContent className={SELECT_CONTENT_CLASS}>
                      {MODERATION_RESOLUTION_OPTIONS.map((option) => {
                        const disabled =
                          !chatAccess.evidenceSufficient &&
                          option.disabledWhenEvidenceInsufficient;
                        return (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            disabled={disabled}
                            className={SELECT_ITEM_CLASS}
                          >
                            {option.label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {resolutionOption && isUpheldResolutionOption(resolutionOption) ? (
                  <div>
                    <label className="mb-1.5 block font-sans text-[12px] font-medium text-text-secondary">
                      違規身分
                    </label>
                    <Select
                      value={violationPersona}
                      onValueChange={(value) =>
                        setViolationPersona(value as ViolationPersona)
                      }
                      disabled={isResolvePending}
                    >
                      <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                        <SelectValue placeholder="請選擇違規身分" />
                      </SelectTrigger>
                      <SelectContent className={SELECT_CONTENT_CLASS}>
                        {VIOLATION_PERSONA_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            className={SELECT_ITEM_CLASS}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {resolutionOption && isUpheldResolutionOption(resolutionOption) ? (
                  <div className="space-y-3 border-t border-white/[0.06] pt-3">
                    <label className="flex items-center gap-2 font-sans text-[12px] text-text-secondary">
                      <Checkbox
                        checked={executeOrderRefund}
                        onCheckedChange={(checked) =>
                          setExecuteOrderRefund(checked === true)
                        }
                        disabled={isResolvePending}
                      />
                      執行售後退款
                    </label>
                    {executeOrderRefund ? (
                      <>
                        <div>
                          <label className="mb-1.5 block font-sans text-[12px] font-medium text-text-secondary">
                            退款訂單
                          </label>
                          {eligibleRefundOrders.length === 0 ? (
                            <p className="font-sans text-[12px] text-text-disabled">
                              無符合條件的關聯訂單
                            </p>
                          ) : eligibleRefundOrders.length === 1 ? (
                            <p className="font-mono text-[12px] text-text-primary">
                              {eligibleRefundOrders[0].orderNumber ??
                                eligibleRefundOrders[0].id.slice(0, 8)}
                            </p>
                          ) : (
                            <Select
                              value={refundOrderId}
                              onValueChange={(value) =>
                                setRefundOrderId(value ?? "")
                              }
                              disabled={isResolvePending}
                            >
                              <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                <SelectValue placeholder="選擇訂單" />
                              </SelectTrigger>
                              <SelectContent className={SELECT_CONTENT_CLASS}>
                                {eligibleRefundOrders.map((order) => (
                                  <SelectItem
                                    key={order.id}
                                    value={order.id}
                                    className={SELECT_ITEM_CLASS}
                                  >
                                    {order.orderNumber ?? order.id.slice(0, 8)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div>
                          <label className="mb-1.5 block font-sans text-[12px] font-medium text-text-secondary">
                            退款責任方
                          </label>
                          <Select
                            value={faultParty}
                            onValueChange={(value) =>
                              setFaultParty(
                                value as
                                  | "seller"
                                  | "buyer"
                                  | "platform"
                                  | "carrier"
                                  | "inconclusive"
                                  | "",
                              )
                            }
                            disabled={isResolvePending}
                          >
                            <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                              <SelectValue placeholder="請選擇" />
                            </SelectTrigger>
                            <SelectContent className={SELECT_CONTENT_CLASS}>
                              <SelectItem value="seller" className={SELECT_ITEM_CLASS}>
                                賣家責任
                              </SelectItem>
                              <SelectItem value="buyer" className={SELECT_ITEM_CLASS}>
                                買家責任
                              </SelectItem>
                              <SelectItem value="platform" className={SELECT_ITEM_CLASS}>
                                平台責任
                              </SelectItem>
                              <SelectItem value="carrier" className={SELECT_ITEM_CLASS}>
                                物流責任
                              </SelectItem>
                              <SelectItem
                                value="inconclusive"
                                className={SELECT_ITEM_CLASS}
                              >
                                無法判定
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {faultParty === "carrier" ? (
                          <div>
                            <label className="mb-1.5 block font-sans text-[12px] font-medium text-text-secondary">
                              物流承擔方
                            </label>
                            <Select
                              value={carrierLiabilityParty}
                              onValueChange={(value) =>
                                setCarrierLiabilityParty(
                                  value as "seller" | "platform" | "",
                                )
                              }
                              disabled={isResolvePending}
                            >
                              <SelectTrigger className={SELECT_TRIGGER_CLASS}>
                                <SelectValue placeholder="請選擇" />
                              </SelectTrigger>
                              <SelectContent className={SELECT_CONTENT_CLASS}>
                                <SelectItem value="seller" className={SELECT_ITEM_CLASS}>
                                  賣家安排物流
                                </SelectItem>
                                <SelectItem
                                  value="platform"
                                  className={SELECT_ITEM_CLASS}
                                >
                                  平台安排物流
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                        {faultParty === "platform" ? (
                          <Textarea
                            name="platformFaultReason"
                            rows={2}
                            placeholder="平台責任原因"
                            value={platformFaultReason}
                            onChange={(event) =>
                              setPlatformFaultReason(event.target.value)
                            }
                            disabled={isResolvePending}
                            className={TEXTAREA_CLASS}
                          />
                        ) : null}
                        {canPreviewRefund ? (
                          <div
                            data-testid="moderation-refund-preview"
                            className="space-y-1 font-sans text-[12px] text-text-secondary"
                          >
                            {visibleRefundPreviewLoading ? (
                              <p>載入退款預覽中…</p>
                            ) : visibleRefundPreviewError ? (
                              <p className="text-error">{visibleRefundPreviewError}</p>
                            ) : visibleRefundPreview ? (
                              <>
                                <p>
                                  政策可退基數：{visibleRefundPreview.eligiblePolicyHkd}{" "}
                                  HKD
                                </p>
                                <p>
                                  Stripe 手續費：{visibleRefundPreview.stripeFeeNote}
                                </p>
                                <p>
                                  退買家：{visibleRefundPreview.refundToBuyerHkd} HKD
                                </p>
                                <p>
                                  鑑定費留平台：
                                  {visibleRefundPreview.authFeeRetainedHkd} HKD
                                </p>
                                <p>
                                  賣家追償：{visibleRefundPreview.sellerRecoveryHkd} HKD
                                </p>
                                <p>
                                  平台承擔：{visibleRefundPreview.platformAbsorbHkd} HKD
                                </p>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}

                {!chatAccess.evidenceSufficient ? (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 font-sans text-[12px] text-text-secondary">
                      <Checkbox
                        checked={evidenceOverride}
                        onCheckedChange={(checked) =>
                          setEvidenceOverride(checked === true)
                        }
                        disabled={isResolvePending}
                      />
                      管理員強制裁定（證據不足覆寫）
                    </label>
                    {evidenceOverride ? (
                      <Textarea
                        name="evidenceOverrideReason"
                        rows={2}
                        placeholder="覆寫原因"
                        value={evidenceOverrideReason}
                        onChange={(event) =>
                          setEvidenceOverrideReason(event.target.value)
                        }
                        disabled={isResolvePending}
                        className={TEXTAREA_CLASS}
                      />
                    ) : null}
                  </div>
                ) : null}

                <label className="flex items-center gap-2 font-sans text-[12px] text-text-secondary">
                  <Checkbox
                    checked={notifyReporter}
                    onCheckedChange={(checked) =>
                      setNotifyReporter(checked === true)
                    }
                    disabled={isResolvePending}
                  />
                  通知舉報人結果（in-app）
                </label>
              </div>

              <Button
                type="button"
                disabled={isResolvePending || !resolutionOption}
                onClick={handleResolve}
                className={`mt-4 h-11 ${BTN_PRIMARY_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isResolvePending ? "提交中…" : "執行最終仲裁裁決"}
              </Button>
            </section>
          ) : null}

          <ModerationAuditTimeline entries={auditLog} />

          {!caseOpen ? (
            <section className={SECTION_BLOCK_CLASS}>
              <h2 className={SECTION_TITLE_CLASS}>案件結果</h2>
              <div className="space-y-1.5">
                <ScoreDetailRow
                  label="案件狀態"
                  value={moderationStatusLabel(caseDetail.status)}
                />
                {caseDetail.resolution ? (
                  <ScoreDetailRow
                    label="裁定結果"
                    value={moderationResolutionLabel(caseDetail.resolution)}
                  />
                ) : null}
                {caseDetail.resolvedAt ? (
                  <ScoreDetailRow
                    label="結案時間"
                    value={formatModerationDateTime(caseDetail.resolvedAt)}
                  />
                ) : null}
              </div>
              {showScoreBreakdown ? (
                <div className="space-y-1.5 border-t border-white/[0.06] pt-3">
                  <p className={META_TEXT_CLASS}>分數明細</p>
                  <ScoreDetailRow
                    label="自動分數"
                    value={String(caseDetail.autoScore)}
                  />
                  {reports.map((report) => (
                    <ScoreDetailRow
                      key={report.id}
                      label={formatCategoryLabel(report.category)}
                      value={`+${report.contributionScore ?? 0}`}
                      hint={report.reporterDisplayName ?? "未知"}
                    />
                  ))}
                  <ScoreDetailRow
                    label="管理員調整"
                    value={String(caseDetail.adminAdjustment)}
                  />
                  {caseDetail.adjustmentReason ? (
                    <p className={META_TEXT_CLASS}>
                      調整原因：{caseDetail.adjustmentReason}
                    </p>
                  ) : null}
                  <ScoreDetailRow
                    label="最終分數"
                    value={String(caseDetail.finalScore ?? 0)}
                    emphasize
                  />
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ScoreDetailRow({
  label,
  value,
  hint,
  emphasize = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 font-sans text-[12px]">
      <span className={META_TEXT_CLASS}>
        {label}
        {hint ? (
          <span className="text-text-disabled/70"> · {hint}</span>
        ) : null}
      </span>
      <span
        className={
          emphasize
            ? "font-mono text-[13px] font-semibold text-brand"
            : "font-mono text-[12px] text-text-primary"
        }
      >
        {value}
      </span>
    </div>
  );
}
