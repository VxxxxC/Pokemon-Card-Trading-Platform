"use client";

import React, { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const COMPLETE_CHECKLIST = [
  {
    id: "cardIdentity",
    label: "官方卡牌編號與稀有度標籤（如 SAR/UR/SR）",
  },
  {
    id: "surfaceCondition",
    label: "實物表面狀態（卡角、刮痕等細節）",
  },
  {
    id: "authenticity",
    label: "確信此卡為正品",
  },
] as const;

type ChecklistId = (typeof COMPLETE_CHECKLIST)[number]["id"];

type ChecklistState = Record<ChecklistId, boolean>;

const EMPTY_CHECKLIST: ChecklistState = {
  cardIdentity: false,
  surfaceCondition: false,
  authenticity: false,
};

function ConfirmCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors",
        checked
          ? "bg-success border-success"
          : "bg-transparent border-[rgba(237,232,224,0.25)] hover:border-success/60",
      )}
    >
      {checked ? (
        <svg
          width="10"
          height="8"
          viewBox="0 0 10 8"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 4L3.5 6.5L9 1"
            stroke="#17130f"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  );
}

type MemberOrderCompleteConfirmDialogProps = {
  disabled?: boolean;
  isActionLoading?: boolean;
  onConfirm: () => Promise<boolean>;
  triggerClassName: string;
  triggerLabel?: string;
};

export function MemberOrderCompleteConfirmDialog({
  disabled = false,
  isActionLoading = false,
  onConfirm,
  triggerClassName,
  triggerLabel = "確認完成交易",
}: MemberOrderCompleteConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<ChecklistState>(EMPTY_CHECKLIST);

  const allChecked = COMPLETE_CHECKLIST.every((item) => checks[item.id]);

  const resetChecks = () => {
    setChecks(EMPTY_CHECKLIST);
  };

  const toggleCheck = (id: ChecklistId) => {
    setChecks((current) => ({
      ...current,
      [id]: !current[id],
    }));
  };

  const handleConfirm = async () => {
    if (!allChecked || isActionLoading) {
      return;
    }

    const success = await onConfirm();
    if (success) {
      setOpen(false);
      resetChecks();
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetChecks();
        }
      }}
    >
      <AlertDialogTrigger
        disabled={disabled || isActionLoading}
        className={cn(
          "inline-flex items-center justify-center gap-1.5",
          triggerClassName,
        )}
      >
        {isActionLoading ? (
          "處理中…"
        ) : (
          <>
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
            {triggerLabel}
          </>
        )}
      </AlertDialogTrigger>

      <AlertDialogContent className="max-w-md rounded-2xl border border-success/25 bg-[#26211C] p-6 text-[#eae1da]">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="text-[15px] font-black">
            確認完成交收
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[11px] font-mono uppercase tracking-wider text-[#8A8680]">
            Confirm Handover
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-[12.5px] leading-relaxed text-[#d4c4b7]">
            我確認已親自查驗此卡牌之：
          </p>

          <ul className="space-y-3">
            {COMPLETE_CHECKLIST.map((item) => (
              <li key={item.id}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <ConfirmCheckbox
                    checked={checks[item.id]}
                    onChange={() => toggleCheck(item.id)}
                  />
                  <span className="text-[12.5px] leading-relaxed text-[#eae1da]">
                    {item.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <p className="rounded-xl border border-warning/20 bg-warning/5 px-3 py-3 text-[11.5px] leading-relaxed text-[#c9b8a8]">
            <span className="font-semibold text-warning">法律聲明：</span>
            平台作為第三方提供商，在此確認後將不再受理任何關於此卡真偽、品相的售後爭議與賠償要求。此操作不可逆轉。
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={!allChecked || isActionLoading}
            className="h-11 rounded-xl bg-success font-black text-white hover:bg-success-hover disabled:opacity-50"
          >
            {isActionLoading ? "處理中…" : "確認完成交收"}
          </AlertDialogAction>
          <AlertDialogCancel className="h-10 rounded-xl border border-white/10 bg-[#120F0C]">
            返回
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
