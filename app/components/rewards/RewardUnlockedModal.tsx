"use client";

import Link from "next/link";
import {
  CouponTicketShell,
  REDEEMABLE_COUPON_TICKET_TONE,
} from "@/app/components/rewards/CouponTicketShell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatRewardGrantValueLabel,
  REWARD_TYPE_LABELS,
  type UnacknowledgedRewardGrant,
} from "@/lib/constants/rewards";

export type RewardUnlockedModalProps = {
  open: boolean;
  grants: UnacknowledgedRewardGrant[];
  onClose: () => void;
  isAcknowledging?: boolean;
};

export function RewardUnlockedModal({
  open,
  grants,
  onClose,
  isAcknowledging = false,
}: RewardUnlockedModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !isAcknowledging && onClose()}>
      <DialogContent className="bg-[#26211C] border-[rgba(237,232,224,0.12)] text-[#eae1da] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-sans text-[18px] text-brand">
            恭喜解鎖獎勵
          </DialogTitle>
          <DialogDescription className="text-[#d4c4b7] text-[13px]">
            你已符合資格，系統已自動發放以下獎勵。
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
          {grants.map((grant) => (
            <li key={grant.userRewardId}>
              <CouponTicketShell
                accentClass={REDEEMABLE_COUPON_TICKET_TONE.accentClass}
                borderClass={REDEEMABLE_COUPON_TICKET_TONE.borderClass}
                bgClass={REDEEMABLE_COUPON_TICKET_TONE.bgClass}
                stubClass={REDEEMABLE_COUPON_TICKET_TONE.stubClass}
                valueLabel={formatRewardGrantValueLabel(grant)}
              >
                <div className="space-y-1.5">
                  <h4 className="font-sans text-[12.5px] font-bold leading-snug text-text-primary line-clamp-2">
                    {grant.title}
                  </h4>
                  <p className="font-sans text-[11px] leading-snug text-text-secondary">
                    {grant.description?.trim() ||
                      REWARD_TYPE_LABELS[grant.type] ||
                      grant.type}
                  </p>
                  <div className="flex items-center justify-between gap-3 border-t border-dashed border-white/[0.08] pt-2">
                    <span className="truncate rounded-md border border-white/[0.06] bg-black/25 px-2 py-0.5 font-mono text-[10px] font-medium text-text-secondary">
                      {REWARD_TYPE_LABELS[grant.type] ?? grant.type}
                    </span>
                    <span className="shrink-0 text-[10px] font-medium text-success">
                      已自動發放
                    </span>
                  </div>
                </div>
              </CouponTicketShell>
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2 sm:gap-0">
          <Link
            href="/profile/user/rewards"
            className="font-mono text-[12px] text-brand hover:text-brand-hover font-bold"
            onClick={onClose}
          >
            查看獎勵專區 →
          </Link>
          <button
            type="button"
            disabled={isAcknowledging}
            onClick={onClose}
            className="h-10 px-5 rounded-xl bg-brand text-[#1A1612] font-sans font-bold text-[13px] hover:bg-[#e8b896] disabled:opacity-60"
          >
            {isAcknowledging ? "處理中…" : "太好了"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
