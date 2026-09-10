"use client";

import { memo, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CircleCheck,
  PartyPopper,
  PenLine,
} from "lucide-react";
import { resolveChatCompletionOrderId } from "@/app/actions/reviews";
import { resolveMemberOrderIdFromChatRoom } from "@/app/lib/chat/resolveMemberOrderId";
import {
  useHkCardVaultStore,
  type Message,
  type OfferLedgerEntry,
} from "@/app/store/useHkCardVaultStore";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChatInlineIconText } from "./ChatInlineIconText";

export type SystemOrderCompletedMessageProps = {
  messageId: string;
  roomId: string;
  roomMessages: Message[];
  offers?: Record<string, OfferLedgerEntry>;
  orderId?: string;
  revieweeId: string;
  partnerName?: string;
  onOpenReview?: (orderId: string, revieweeId: string) => void;
  reviewedOrderIds?: ReadonlySet<string> | null;
  isReviewLoading?: boolean;
};

function pickInitialOrderId(
  orderId?: string,
  roomMessages?: Message[],
  offers?: Record<string, OfferLedgerEntry>,
): string {
  const fromProp = orderId?.trim();
  if (fromProp) {
    return fromProp;
  }

  return resolveMemberOrderIdFromChatRoom(roomMessages ?? [], offers) ?? "";
}

function SystemOrderCompletedMessageComponent({
  messageId,
  roomId,
  roomMessages,
  offers,
  orderId: initialOrderId,
  revieweeId,
  partnerName,
  onOpenReview,
  reviewedOrderIds = null,
  isReviewLoading = false,
}: SystemOrderCompletedMessageProps) {
  const setIsChatOpen = useHkCardVaultStore((state) => state.setIsChatOpen);
  const [resolvedOrderId, setResolvedOrderId] = useState(() =>
    pickInitialOrderId(initialOrderId, roomMessages, offers),
  );
  const [isOpeningReview, setIsOpeningReview] = useState(false);

  useEffect(() => {
    const localOrderId = pickInitialOrderId(
      initialOrderId,
      roomMessages,
      offers,
    );
    if (localOrderId) {
      setResolvedOrderId(localOrderId);
    }
  }, [initialOrderId, offers, roomMessages]);

  const hasReviewedByMe =
    Boolean(resolvedOrderId) &&
    Boolean(reviewedOrderIds?.has(resolvedOrderId));

  const showReviewCta =
    Boolean(onOpenReview) && !hasReviewedByMe && !isReviewLoading;

  const resolveOrderIdForAction = useCallback(async (): Promise<string> => {
    const cachedOrderId = resolvedOrderId.trim();
    if (cachedOrderId) {
      return cachedOrderId;
    }

    const localOrderId = pickInitialOrderId(
      initialOrderId,
      roomMessages,
      offers,
    );
    if (localOrderId) {
      setResolvedOrderId(localOrderId);
      return localOrderId;
    }

    const result = await resolveChatCompletionOrderId({
      messageId,
      roomId,
      revieweeId,
    });

    if (result.success && result.orderId) {
      setResolvedOrderId(result.orderId);
      return result.orderId;
    }

    if (!result.success) {
      toast.error(result.error);
    }

    return "";
  }, [
    initialOrderId,
    messageId,
    offers,
    resolvedOrderId,
    revieweeId,
    roomId,
    roomMessages,
  ]);

  const handleOpenReview = useCallback(async () => {
    if (!onOpenReview || hasReviewedByMe || isOpeningReview) {
      return;
    }

    setIsOpeningReview(true);

    try {
      const orderId = await resolveOrderIdForAction();
      if (!orderId) {
        toast.error("無法取得訂單資料，請至「我的訂單」頁面評價");
        return;
      }

      if (reviewedOrderIds?.has(orderId)) {
        return;
      }

      onOpenReview(orderId, revieweeId);
    } finally {
      setIsOpeningReview(false);
    }
  }, [
    hasReviewedByMe,
    isOpeningReview,
    onOpenReview,
    resolveOrderIdForAction,
    reviewedOrderIds,
    revieweeId,
  ]);

  const reviewButtonLabel = isOpeningReview ? "載入中…" : "給予對手評價";

  return (
    <Card className="my-2 w-full overflow-hidden border border-[#d4a574]/25 bg-[#1A1612] font-sans text-[12.5px]">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-white/5 pb-3">
        <div className="space-y-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#d4a574]">
            <ChatInlineIconText icon={PartyPopper}>
              交易完結通知
            </ChatInlineIconText>
          </p>
          <CardTitle className="text-[13px] font-black text-[#eae1da]">
            雙方已確認交易完成
          </CardTitle>
        </div>
        <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#60a5fa] bg-[#60a5fa]/10 border border-[#60a5fa]/20">
          ● 已完成
        </span>
      </CardHeader>

      <CardContent className="space-y-3 pt-3">
        <Alert className="border-[#d4a574]/30 bg-[#d4a574]/10 text-[#d4a574]">
          <CircleCheck className="size-4" />
          <AlertDescription className="text-[12px] font-medium leading-relaxed">
            此筆訂單已順利結案。商品交付與款項結算流程已結束。
          </AlertDescription>
        </Alert>
        {partnerName ? (
          <p className="text-[11px] text-text-disabled">
            感謝您與{" "}
            <span className="font-bold text-brand">{partnerName}</span>{" "}
            的愉快交易！
          </p>
        ) : null}

        {showReviewCta ? (
          <div className="rounded-xl border border-brand/20 bg-brand/5 px-3 py-2.5">
            <p className="text-[11px] leading-relaxed text-text-secondary">
              您尚未為此次交易留下評價。分享體驗可幫助社群建立信任。
            </p>
            <button
              type="button"
              onClick={() => void handleOpenReview()}
              disabled={isOpeningReview}
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[11px] font-bold text-[#17130f] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {!isOpeningReview ? (
                <PenLine className="size-3.5 shrink-0" aria-hidden />
              ) : null}
              {reviewButtonLabel}
            </button>
          </div>
        ) : null}

        {hasReviewedByMe ? (
          <p className="font-mono text-[10px] text-text-disabled/80">
            ✓ 您已提交此次交易的評價
          </p>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2 border-t border-white/5 bg-transparent px-4 py-3">
        <Link
          href="/profile/user/trading"
          onClick={() => setIsChatOpen(false)}
          className="inline-flex h-8 items-center rounded-lg border border-white/10 bg-[#17130f] px-3 text-[11px] font-bold text-text-secondary hover:text-brand"
        >
          查看我的訂單
        </Link>
      </CardFooter>
    </Card>
  );
}

export const SystemOrderCompletedMessage = memo(
  SystemOrderCompletedMessageComponent,
);
