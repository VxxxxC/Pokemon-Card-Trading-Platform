"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitUserReport } from "@/app/actions/reports";
import {
  isChatEvidenceRequiredForCategory,
  REPORT_CATEGORY_CONFIG,
  resolveReportCategoryInput,
} from "@/lib/moderation/category-config";
import { uploadReportEvidence } from "@/lib/moderation/client-upload";
import {
  REPORT_EVIDENCE_MAX_BYTES,
  REPORT_EVIDENCE_MAX_COUNT,
  validateReportEvidenceUpload,
} from "@/lib/moderation/report-evidence-files";

interface UserReportModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  targetUserName: string;
  targetType?: "user" | "merchant" | "chat_message";
  chatRoomId?: string;
  onSuccess?: () => void;
}

const REPORT_CATEGORIES = [
  {
    value: "惡意欺詐 / 虛假交易",
    label: "🛑 惡意欺詐 / 虛假交易 (FRAUD)",
  },
  {
    value: "言語辱罵 / 不當言論",
    label: "💬 言語辱罵 / 不當言論 (HARASS)",
  },
  {
    value: "誘導私下交易",
    label: "🔒 誘導私下交易 / 逃避中介 (OFFLINE)",
  },
  {
    value: "其他違規行為",
    label: "⚙️ 其他違規行為 (OTHER)",
  },
] as const;

type ReportCategoryValue = (typeof REPORT_CATEGORIES)[number]["value"];

type PendingEvidenceFile = {
  id: string;
  file: File;
  previewUrl: string;
};

function revokeEvidencePreviewUrls(files: PendingEvidenceFile[]): void {
  for (const item of files) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

export function UserReportModal({
  isOpen,
  onOpenChange,
  targetUserId,
  targetUserName,
  targetType = "user",
  chatRoomId,
  onSuccess,
}: UserReportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reportCategory, setReportCategory] = useState<ReportCategoryValue | "">("");
  const [reportDetails, setReportDetails] = useState("");
  const [pendingEvidenceFiles, setPendingEvidenceFiles] = useState<
    PendingEvidenceFile[]
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCategorySlug = reportCategory
    ? resolveReportCategoryInput(reportCategory)
    : null;
  const requiresChatEvidence =
    selectedCategorySlug !== null &&
    isChatEvidenceRequiredForCategory(selectedCategorySlug) &&
    !chatRoomId?.trim();
  const categoryUserHint = selectedCategorySlug
    ? REPORT_CATEGORY_CONFIG[selectedCategorySlug].userHint
    : null;
  const uploadRecommended =
    selectedCategorySlug !== null &&
    (REPORT_CATEGORY_CONFIG[selectedCategorySlug].evidence.upload ===
      "recommended" ||
      REPORT_CATEGORY_CONFIG[selectedCategorySlug].evidence.upload ===
        "required");

  const titleText =
    targetType === "chat_message"
      ? "提交交易違規舉報"
      : targetType === "merchant"
        ? "舉報該商戶用戶"
        : "舉報該用戶";

  const descriptionText =
    targetType === "chat_message"
      ? "填寫舉報表單並提交"
      : "填寫商戶舉報表單並提交";

  const clearEvidenceFiles = useCallback(() => {
    setPendingEvidenceFiles((current) => {
      revokeEvidencePreviewUrls(current);
      return [];
    });
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      onOpenChange(open);
      if (!open) {
        setReportCategory("");
        setReportDetails("");
        clearEvidenceFiles();
      }
    },
    [clearEvidenceFiles, onOpenChange],
  );

  useEffect(() => {
    return () => {
      revokeEvidencePreviewUrls(pendingEvidenceFiles);
    };
  }, [pendingEvidenceFiles]);

  const handleEvidenceFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      event.target.value = "";

      if (selectedFiles.length === 0) {
        return;
      }

      const availableSlots = REPORT_EVIDENCE_MAX_COUNT - pendingEvidenceFiles.length;
      if (availableSlots <= 0) {
        toast.error(`證據圖片不可超過 ${REPORT_EVIDENCE_MAX_COUNT} 張`);
        return;
      }

      const filesToAdd = selectedFiles.slice(0, availableSlots);
      if (filesToAdd.length < selectedFiles.length) {
        toast.error(`證據圖片不可超過 ${REPORT_EVIDENCE_MAX_COUNT} 張`);
      }

      const nextFiles: PendingEvidenceFile[] = [];

      for (const file of filesToAdd) {
        const validationError = validateReportEvidenceUpload({
          size: file.size,
          type: file.type,
          name: file.name,
        });

        if (validationError) {
          toast.error(validationError);
          continue;
        }

        nextFiles.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }

      if (nextFiles.length === 0) {
        return;
      }

      setPendingEvidenceFiles((current) => [...current, ...nextFiles]);
    },
    [pendingEvidenceFiles.length],
  );

  const handleRemoveEvidenceFile = useCallback((fileId: string) => {
    setPendingEvidenceFiles((current) => {
      const target = current.find((item) => item.id === fileId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((item) => item.id !== fileId);
    });
  }, []);

  const handleConfirm = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();

      if (!reportCategory) {
        toast.error("❌ 請選擇舉報事項類別");
        return;
      }

      if (requiresChatEvidence) {
        toast.error("請在對話內使用舉報功能");
        return;
      }

      if (isSubmitting) {
        return;
      }

      setIsSubmitting(true);

      try {
        const attachmentIds: string[] = [];

        for (const item of pendingEvidenceFiles) {
          const uploaded = await uploadReportEvidence(item.file);
          attachmentIds.push(uploaded.attachmentId);
        }

        const payload: {
          reportedUserId: string;
          category: string;
          details: string;
          chatRoomId?: string;
          attachmentIds?: string[];
        } = {
          reportedUserId: targetUserId,
          category: reportCategory,
          details: reportDetails,
        };

        if (chatRoomId?.trim()) {
          payload.chatRoomId = chatRoomId.trim();
        }

        if (attachmentIds.length > 0) {
          payload.attachmentIds = attachmentIds;
        }

        const result = await submitUserReport(payload);

        if (!result.success) {
          toast.error(result.error);
          return;
        }

        const description =
          targetType === "chat_message"
            ? `【${reportCategory}】風控隊列已啟動，案件詳情已留存快照。`
            : `【${reportCategory}】商戶風控隊列已啟動。已對該用戶實施鏈上行為快照。`;

        toast.success("⚠️ 舉報信號已受理", {
          description,
          className:
            "bg-[#26211C] border border-red-500/30 text-[#eae1da] font-sans shadow-2xl",
        });

        setReportCategory("");
        setReportDetails("");
        clearEvidenceFiles();
        onOpenChange(false);
        onSuccess?.();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "提交舉報時發生錯誤";
        toast.error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      reportCategory,
      reportDetails,
      isSubmitting,
      requiresChatEvidence,
      pendingEvidenceFiles,
      targetUserId,
      targetType,
      chatRoomId,
      clearEvidenceFiles,
      onOpenChange,
      onSuccess,
    ],
  );

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        className="max-w-sm gap-0 rounded-2xl border border-[rgba(237,232,224,0.08)] bg-[#26211C] p-5 text-[#eae1da] ring-0 shadow-[0_16px_48px_rgba(0,0,0,0.45)] animate-scaleUp max-h-[min(90dvh,calc(100dvh-2rem))] overflow-y-auto sm:p-6"
      >
        <AlertDialogCancel
          variant="ghost"
          size="icon"
          aria-label="關閉"
          className="absolute right-3 top-3 z-10 size-8 shrink-0 rounded-lg border border-white/10 bg-[#17130f] text-[#8A8680] hover:bg-[#1A1612] hover:text-[#eae1da]"
        >
          <X className="size-4" aria-hidden />
        </AlertDialogCancel>

        <AlertDialogHeader className="text-left place-items-start gap-1 pb-3 pr-8">
          <AlertDialogTitle className="text-[15px] font-black text-[#eae1da]">
            {titleText}
          </AlertDialogTitle>
          <AlertDialogDescription className="sr-only">
            {descriptionText}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3.5 py-1 font-sans text-[13px] w-full">
          <div className="space-y-1.5">
            <label className="block font-mono text-[11px] text-[#d4c4b7] uppercase tracking-wide">
              選擇舉報事項類別
            </label>
            <Select
              value={reportCategory}
              onValueChange={(value) =>
                setReportCategory((value ?? "") as ReportCategoryValue | "")
              }
            >
              <SelectTrigger className="w-full h-10 bg-[#17130f] border border-white/5 rounded-xl text-[#eae1da] font-sans text-[12px] hover:bg-[#2c2722] transition-colors focus:ring-0 focus:border-brand/40">
                <SelectValue placeholder="點擊展開合約違規類別" />
              </SelectTrigger>
              <SelectContent className="bg-[#26211C] border border-white/10 rounded-xl text-[#eae1da] font-sans text-[12.5px] shadow-2xl">
                {REPORT_CATEGORIES.map((category) => (
                  <SelectItem
                    key={category.value}
                    value={category.value}
                    className="focus:bg-[#322a24] focus:text-brand cursor-pointer transition-colors"
                  >
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categoryUserHint ? (
              <p className="text-[11px] leading-relaxed text-[#8A8680]">
                {categoryUserHint}
              </p>
            ) : null}
            {uploadRecommended ? (
              <p className="text-[11px] leading-relaxed text-[#8A8680]">
                建議上傳截圖作為證據。
              </p>
            ) : null}
            {requiresChatEvidence ? (
              <p className="text-[11px] leading-relaxed text-warning">
                此類別需在對話視窗內舉報，請返回聊天後再提交。
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="user-report-details"
              className="block font-mono text-[11px] text-[#d4c4b7] uppercase tracking-wide"
            >
              詳細說明
            </label>
            <textarea
              id="user-report-details"
              value={reportDetails}
              onChange={(event) => setReportDetails(event.target.value)}
              placeholder={`請描述與 ${targetUserName} 相關的違規事實（例如：貨品不符、辱罵言論、誘導私下交易）`}
              rows={3}
              className="w-full bg-[#17130f] border border-white/5 rounded-xl text-[12.5px] font-sans text-[#eae1da] placeholder:text-[#50453b] p-3 focus:outline-none focus:border-brand/40 transition-colors resize-none leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-mono text-[11px] text-[#d4c4b7] uppercase tracking-wide">
              證據圖片（選填，最多 {REPORT_EVIDENCE_MAX_COUNT} 張）
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleEvidenceFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                isSubmitting ||
                pendingEvidenceFiles.length >= REPORT_EVIDENCE_MAX_COUNT
              }
              className={cn(
                "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[rgba(237,232,224,0.1)] bg-transparent px-3 text-[11px] font-medium text-[#8A8680] transition-colors",
                "hover:border-[rgba(237,232,224,0.18)] hover:bg-[#17130f]/40 hover:text-[#d4c4b7] disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <ImagePlus className="size-3 shrink-0 opacity-70" aria-hidden />
              選擇證據圖片
            </button>
            <p className="text-[10px] leading-relaxed text-[#8A8680]">
              單張不可超過 {Math.round(REPORT_EVIDENCE_MAX_BYTES / (1024 * 1024))}
              MB，支援 JPG / PNG / WEBP / HEIC。
            </p>
            {pendingEvidenceFiles.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {pendingEvidenceFiles.map((item) => (
                  <div
                    key={item.id}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-[rgba(237,232,224,0.08)] bg-[#17130f]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.previewUrl}
                      alt="證據預覽"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveEvidenceFile(item.id)}
                      disabled={isSubmitting}
                      aria-label="移除證據圖片"
                      className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-md border border-white/10 bg-[#17130f]/90 text-[#eae1da] opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <p className="rounded-xl border border-warning/20 bg-warning/5 px-3 py-2.5 text-[11px] leading-relaxed text-[#c9b8a8]">
            <span className="font-semibold text-warning">聲明：</span>
            平台嚴格禁止惡意惡作劇或虛假舉報。一經查實虛報，將面臨賬戶風控扣分限制。
          </p>
        </div>

        <div className="pt-4 w-full">
          <AlertDialogAction
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || requiresChatEvidence}
            className="h-11 w-full rounded-xl bg-brand font-sans text-[13px] font-semibold text-[#17130f] transition-colors hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "提交中…" : "確認提交"}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
