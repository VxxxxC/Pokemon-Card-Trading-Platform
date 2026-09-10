"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CircleCheck,
  CircleX,
  Hourglass,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  acceptOffer,
  getOfferCardContext,
  modifyOffer,
  rejectOffer,
  type OfferCardContext,
} from "@/app/actions/offers";
import {
  invalidateOfferCardContextCache,
  readCachedOfferCardContext,
  writeCachedOfferCardContext,
} from "@/app/lib/chat/offerCardContextCache";
import { GradeBadge } from "@/app/components/cards/GradeBadge";
import {
  resolveOfferAcceptedCardStatusText,
  resolveSystemOfferRejectedText,
  SYSTEM_OFFER_CANCELLED_TEXT,
  SYSTEM_ORDER_CANCELLED_TEXT,
} from "@/app/lib/chat/offerSystemMessageCopy";
import { useHkCardVaultStore } from "@/app/store/useHkCardVaultStore";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  isCatalogImageUrl,
  isValidOfferCardImageUrl,
  needsOfferCardListingImageFetch,
  resolveOfferCardHeroImageUrl,
} from "@/app/lib/chat/offerCardImage";
import { DEFAULT_AUTH_FEE_HKD } from "@/lib/platform/auth-escrow-config";
import type { Tables } from "@/types/supabase";
import { ChatInlineIconText } from "./ChatInlineIconText";

export type OfferCardMessage = {
  id: string;
  offer_id: string | null;
  content?: string | null;
  room_id?: string | null;
};

export type OfferCardProps = {
  message: OfferCardMessage;
  currentUserId: string | null;
  roomId?: string;
  /** Hydration from Zustand / makeOffer — skips first paint skeleton when present */
  initialContext?: OfferCardContext | null;
};

function formatModifyOfferNotice(newPrice: number): string {
  return `修改了出價需求：HK$ ${newPrice.toLocaleString()}`;
}

function readModifiedCountFromRow(offer: Tables<"offers">): number {
  const value = (offer as Tables<"offers"> & { modified_count?: number })
    .modified_count;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mergeOfferContext(
  base: OfferCardContext,
  offer: Tables<"offers">,
): OfferCardContext {
  return {
    ...base,
    offer: {
      ...base.offer,
      offer_price: offer.offer_price,
      status: offer.status,
      modified_count: readModifiedCountFromRow(offer),
      use_authentication: offer.use_authentication,
    },
  };
}

function isRenderableOfferContext(
  context: OfferCardContext | null | undefined,
): boolean {
  return Boolean(
    context?.offer.id &&
      context.cardName &&
      context.sellerId &&
      context.buyerName,
  );
}

function isTerminalOfferStatus(
  status: Tables<"offers">["status"] | undefined,
): boolean {
  return (
    status === "accepted" || status === "rejected" || status === "cancelled"
  );
}

function needsAcceptedOrderContext(
  context: OfferCardContext | null | undefined,
): boolean {
  if (context?.offer.status !== "accepted") {
    return false;
  }
  return !context.orderId;
}

function shouldShowOfferCardGrade(
  authority: string | undefined,
  score: string | null | undefined,
): boolean {
  const trimmedAuthority = authority?.trim() ?? "";
  if (!trimmedAuthority) {
    return false;
  }

  const normalized = trimmedAuthority.toUpperCase();
  if (normalized === "RAW" || normalized === "RAW CARD") {
    return Boolean(score?.trim());
  }

  return true;
}

function OfferCardThumbnail({
  imageUrl,
  cardName,
}: {
  imageUrl?: string;
  cardName: string;
}) {
  if (!isValidOfferCardImageUrl(imageUrl)) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#17130f] px-2 text-center font-mono text-[10px] leading-tight text-text-disabled">
        暫無圖片
      </div>
    );
  }

  const src = imageUrl.trim();

  if (isCatalogImageUrl(src)) {
    return (
      <Image
        src={src}
        alt={cardName}
        fill
        className="object-cover"
        sizes="min(95vw, 360px)"
      />
    );
  }

  return (
    <img
      src={src}
      alt={cardName}
      className="h-full w-full object-cover"
      loading="lazy"
    />
  );
}

function OfferCardHeroImage({
  imageUrl,
  cardName,
}: {
  imageUrl?: string;
  cardName: string;
}) {
  return (
    <div className="relative mx-auto w-[42.1875%] aspect-5/7 overflow-hidden bg-[#17130f]">
      <OfferCardThumbnail
        imageUrl={imageUrl}
        cardName={cardName}
      />
    </div>
  );
}

export function OfferCardComponent({
  message,
  currentUserId,
  roomId,
  initialContext = null,
}: OfferCardProps) {
  const router = useRouter();
  const activeRoomId = useHkCardVaultStore((state) => state.activeRoomId);
  const roomMessages = useHkCardVaultStore((state) => {
    const room = state.chats.find((entry) => entry.id === (roomId ?? activeRoomId));
    return room?.messages ?? [];
  });
  const setIsChatOpen = useHkCardVaultStore((state) => state.setIsChatOpen);
  const applyOfferModification = useHkCardVaultStore(
    (state) => state.applyOfferModification,
  );
  const applyOfferAccepted = useHkCardVaultStore(
    (state) => state.applyOfferAccepted,
  );
  const applyOfferRejected = useHkCardVaultStore(
    (state) => state.applyOfferRejected,
  );

  const offerId = message.offer_id?.trim() ?? "";
  const offerLedger = useHkCardVaultStore((state) =>
    offerId ? state.offers[offerId] : undefined,
  );

  const resolvedRoomId =
    roomId ?? message.room_id?.trim() ?? activeRoomId;

  const [context, setContext] = useState<OfferCardContext | null>(
    initialContext,
  );
  const [isLoadingContext, setIsLoadingContext] = useState(
    () => Boolean(offerId) && !isRenderableOfferContext(initialContext),
  );
  const [contextError, setContextError] = useState<string | null>(null);

  const [offerPrice, setOfferPrice] = useState(
    initialContext?.offer.offer_price ?? 0,
  );
  const [offerStatus, setOfferStatus] = useState<
    Tables<"offers">["status"]
  >(initialContext?.offer.status ?? "pending");
  const [modifiedCount, setModifiedCount] = useState(
    initialContext?.offer.modified_count ?? 0,
  );

  const [modifyInput, setModifyInput] = useState(offerPrice);
  const [modifyDialogKey, setModifyDialogKey] = useState(0);
  const [modifyDialogOpen, setModifyDialogOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isModifying, setIsModifying] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const authServiceFeeHkd = context?.authServiceFeeHkd ?? DEFAULT_AUTH_FEE_HKD;

  const applyFetchedContext = useCallback((data: OfferCardContext) => {
    setContext(data);
    setOfferPrice(data.offer.offer_price);
    setOfferStatus(data.offer.status);
    setModifiedCount(data.offer.modified_count);
    setModifyInput(data.offer.offer_price);
    writeCachedOfferCardContext(data.offer.id, data);
  }, []);

  const loadContext = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!offerId) {
        setContextError("此訊息未綁定出價紀錄");
        setIsLoadingContext(false);
        return;
      }

      const cached = readCachedOfferCardContext(offerId);
      if (
        cached &&
        !needsAcceptedOrderContext(cached) &&
        !needsOfferCardListingImageFetch(cached)
      ) {
        applyFetchedContext(cached);
        setContextError(null);
        setIsLoadingContext(false);
        return;
      }

      if (!options?.silent) {
        setIsLoadingContext(true);
      }
      setContextError(null);

      const result = await getOfferCardContext(offerId);
      if (!result.success) {
        setContextError(result.error);
        setIsLoadingContext(false);
        return;
      }

      applyFetchedContext(result.data);
      setIsLoadingContext(false);
    },
    [applyFetchedContext, offerId],
  );

  useEffect(() => {
    if (initialContext) {
      setContext(initialContext);
      setOfferPrice(initialContext.offer.offer_price);
      setOfferStatus(initialContext.offer.status);
      setModifiedCount(initialContext.offer.modified_count);
      setModifyInput(initialContext.offer.offer_price);
    }

    if (!offerId) {
      setIsLoadingContext(false);
      return;
    }

    const hydrated = isRenderableOfferContext(initialContext);
    const terminal = isTerminalOfferStatus(initialContext?.offer.status);
    const needsOrderContext = needsAcceptedOrderContext(initialContext);
    const needsListingImage = needsOfferCardListingImageFetch(initialContext);

    if (hydrated && terminal && !needsOrderContext && !needsListingImage) {
      setIsLoadingContext(false);
      return;
    }

    if (hydrated && !needsOrderContext && !needsListingImage) {
      setIsLoadingContext(false);
      return;
    }

    void loadContext({ silent: hydrated });
  }, [initialContext, loadContext, offerId]);

  const isBuyer =
    currentUserId != null &&
    context != null &&
    currentUserId === context.offer.buyer_id;
  const isSeller =
    currentUserId != null &&
    context != null &&
    currentUserId === context.sellerId;
  const isPending = offerStatus === "pending";
  const isAccepted = offerStatus === "accepted";
  const isRejected = offerStatus === "rejected";
  const isCancelled = offerStatus === "cancelled";
  const useAuthentication = context?.offer.use_authentication ?? false;

  const statusBadge = useMemo(() => {
    if (isAccepted) {
      return {
        label: "● 已接受",
        cls: "text-brand",
      };
    }
    if (isRejected) {
      return {
        label: "● 已拒絕",
        cls: "text-error",
      };
    }
    if (isCancelled) {
      return {
        label: "● 已取消",
        cls: "text-text-disabled",
      };
    }
    if (modifiedCount >= 1) {
      return {
        label: "● 出價已修改",
        cls: "text-orange-400 font-black",
      };
    }
    return {
      label: "● 待確認",
      cls: "text-brand",
    };
  }, [isAccepted, isCancelled, isRejected, modifiedCount]);

  const handleAccept = async () => {
    if (!offerId || isAccepting) return;

    setIsAccepting(true);
    try {
      const result = await acceptOffer(offerId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setOfferStatus("accepted");
      applyOfferAccepted(
        offerId,
        result.data.order.id,
        result.data.orderKind,
      );
      invalidateOfferCardContextCache(offerId);

      toast.success("🤝 交易協定已達成！", {
        description: "您已成功接受此出價，商品已進入 Hold 貨狀態。",
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "接受出價時發生錯誤";
      toast.error(msg);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    if (!offerId || isRejecting) return;

    setIsRejecting(true);
    try {
      const result = await rejectOffer(offerId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const { offer } = result.data;
      setOfferStatus("rejected");
      if (context) {
        setContext(mergeOfferContext(context, offer));
      }

      applyOfferRejected(offerId);
      invalidateOfferCardContextCache(offerId);

      toast.warning("❌ 已拒絕此議價", {
        description: "買家將收到拒絕通知。",
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "拒絕出價時發生錯誤";
      toast.error(msg);
    } finally {
      setIsRejecting(false);
    }
  };

  const handleModifyOffer = async (): Promise<boolean> => {
    if (!offerId || isModifying) return false;

    if (!Number.isFinite(modifyInput) || modifyInput <= 0) {
      toast.error("⚠️ 請輸入有效的出價金額");
      return false;
    }

    if (modifyInput === offerPrice) {
      toast.error("請輸入與目前不同的出價金額");
      return false;
    }

    setIsModifying(true);
    try {
      const result = await modifyOffer(offerId, modifyInput);
      if (!result.success) {
        toast.error(result.error);
        return false;
      }

      const { offer, messageId } = result.data;
      const newPrice = offer.offer_price;
      const newModifiedCount = readModifiedCountFromRow(offer);
      const messageContent = formatModifyOfferNotice(newPrice);
      const storeRoomId =
        context?.offer.room_id?.trim() || resolvedRoomId;

      setOfferPrice(newPrice);
      setModifiedCount(newModifiedCount);
      setModifyInput(newPrice);
      if (context) {
        setContext(mergeOfferContext(context, offer));
      }

      applyOfferModification({
        roomId: storeRoomId,
        offerId,
        newPrice,
        modifiedCount: newModifiedCount,
        messageId,
        messageContent,
      });
      invalidateOfferCardContextCache(offerId);

      toast.info("🛠️ 出價已修改", {
        description: `已修改報價為 HK$ ${newPrice.toLocaleString()}。`,
      });
      setModifyDialogKey((key) => key + 1);
      return true;
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "修改出價時發生錯誤";
      toast.error(msg);
      return false;
    } finally {
      setIsModifying(false);
    }
  };

  if (!offerId) {
    return (
      <Card className="my-2 w-full border-white/10 bg-[#26211C] text-text-disabled">
        <CardContent className="py-4 text-[12px]">此訊息未綁定出價紀錄。</CardContent>
      </Card>
    );
  }

  if (isLoadingContext && !context) {
    return (
      <Card className="my-2 w-full border-brand/20 bg-[#26211C]">
        <CardContent className="flex items-center justify-center gap-2 py-8 text-text-disabled">
          <Spinner className="size-4 text-brand" />
          <span className="font-mono text-[11px]">載入出價卡片中…</span>
        </CardContent>
      </Card>
    );
  }

  if (contextError && !context) {
    return (
      <Card className="my-2 w-full border-error/30 bg-[#26211C]">
        <CardContent className="space-y-3 py-4">
          <p className="text-[12px] text-error">{contextError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadContext()}
          >
            重新載入
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!context) return null;

  const ledgerOrderId =
    offerLedger?.orderKind === "merchant"
      ? offerLedger.merchantOrderId
      : offerLedger?.memberOrderId;
  const resolvedOrderId = context.orderId ?? ledgerOrderId ?? null;
  const resolvedOrderKind =
    context.orderKind ?? offerLedger?.orderKind ?? undefined;
  const ledgerPaymentHref = offerLedger?.paymentHref ?? null;
  const resolvedPaymentHref =
    context.paymentHref ??
    ledgerPaymentHref ??
    (resolvedOrderKind === "merchant" && resolvedOrderId
      ? `/checkout/${resolvedOrderId}`
      : (context.canPayAuth ||
            (useAuthentication && isBuyer && resolvedOrderKind === "member")) &&
          resolvedOrderId
        ? `/profile/user/orderDetail/${resolvedOrderId}`
        : null);
  const resolvedOrderDetailHref =
    context.orderDetailHref ??
    (resolvedOrderId
      ? `/profile/user/orderDetail/${resolvedOrderId}`
      : null);
  const resolvedSellerOrderDetailHref = resolvedOrderId
    ? resolvedOrderKind === "merchant"
      ? `/profile/merchant/orderDetail/${resolvedOrderId}`
      : `/profile/user/orderDetail/${resolvedOrderId}`
    : null;

  const isOrderCancelled = resolvedOrderId
    ? roomMessages.some(
        (message) =>
          message.type === "system_order_cancelled" &&
          message.orderData?.orderId === resolvedOrderId,
      )
    : false;

  const acceptedStatusSuffix =
    resolvedOrderKind === "merchant" && context.pendingPayment
      ? "merchant_payment"
      : resolvedOrderKind === "member" &&
          useAuthentication &&
          isBuyer &&
          resolvedPaymentHref
        ? "auth_payment"
        : "none";

  const acceptedStatusText = resolveOfferAcceptedCardStatusText({
    isSeller,
    suffix: acceptedStatusSuffix,
  });

  const cardTone = isRejected
    ? "border-error/20 bg-[#26211C] text-[#eae1da] shadow-none ring-0"
    : isOrderCancelled || isCancelled
      ? "border-white/[0.06] bg-[#26211C]/90 text-text-secondary shadow-none ring-0"
      : "border-white/[0.06] bg-[#26211C] text-[#eae1da] shadow-none ring-0";

  const statusNoteClass = "rounded-md border border-brand/20 bg-[#1A1612] px-2.5 py-1.5";
  const statusNoteTextClass =
    "text-[11px] font-medium leading-snug text-text-secondary";

  const cardMeta = [
    context.setCode,
    context.cardNumber ?? context.displayId,
  ]
    .filter(Boolean)
    .join(" · ");

  const displayStatusBadge = isOrderCancelled
    ? { label: "● 已取消", cls: "text-text-disabled" }
    : statusBadge;

  const showGradeBadge = shouldShowOfferCardGrade(
    context.gradeAuthority,
    context.gradeScore,
  );
  const heroImageUrl = resolveOfferCardHeroImageUrl(context);

  return (
    <Card
      className={`my-2 w-full overflow-hidden rounded-lg border font-sans text-[12.5px] transition-all duration-300 gap-0 py-0 ${cardTone}`}
    >
      <div className="flex items-center justify-end gap-2 px-3 pt-2.5 pb-1.5">
        <span
          className={`shrink-0 font-mono text-[9px] font-bold ${displayStatusBadge.cls}`}
        >
          {displayStatusBadge.label}
        </span>
      </div>

      <OfferCardHeroImage
        imageUrl={heroImageUrl}
        cardName={context.cardName}
      />

      <div className="space-y-0.5 px-3 pt-2 pb-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="min-w-0 truncate font-sans font-bold text-[13px] leading-tight text-text-primary">
            {context.cardName}
          </h3>
          {showGradeBadge ? (
            <GradeBadge
              authority={context.gradeAuthority ?? ""}
              score={context.gradeScore ?? ""}
              size="sm"
            />
          ) : null}
        </div>
        {cardMeta ? (
          <p className="truncate font-mono text-[10px] leading-tight text-text-disabled">
            {cardMeta}
          </p>
        ) : null}
        <p
          className="truncate font-mono text-[9px] leading-tight tabular-nums text-text-disabled"
          title={`上架序號：${context.listingId}`}
        >
          上架序號：{context.listingId}
        </p>
        <p className="pt-0.5 font-mono text-[14px] font-bold leading-none tabular-nums text-brand">
          HK$ {offerPrice.toLocaleString("en-HK")}
        </p>
      </div>

      <CardContent className="space-y-2 px-3 pb-2.5 pt-1.5">
        {isPending && isSeller ? (
          <div className={statusNoteClass}>
            <p className={statusNoteTextClass}>請確認是否接受此出價。</p>
          </div>
        ) : null}

        {useAuthentication && isPending && isSeller ? (
          <div className={statusNoteClass}>
            <p className={statusNoteTextClass}>
              <ChatInlineIconText icon={Search} iconClassName="text-brand/80">
                買家要求平台鑑定加購服務（HK$
                {authServiceFeeHkd.toLocaleString()}），成交後需寄卡至平台鑑定，請確認可配合託管流程後再接受出價。
              </ChatInlineIconText>
            </p>
          </div>
        ) : null}

        {useAuthentication && isPending && isBuyer ? (
          <div className={statusNoteClass}>
            <p className={statusNoteTextClass}>
              您已加購平台第三方鑑定服務；賣家接受後將走託管鑑定流程。
            </p>
          </div>
        ) : null}

        {isAccepted && !isOrderCancelled ? (
          <div className={statusNoteClass}>
            <p className={statusNoteTextClass}>
              <ChatInlineIconText icon={CircleCheck} iconClassName="text-success">
                {acceptedStatusText}
              </ChatInlineIconText>
            </p>
          </div>
        ) : null}

        {isOrderCancelled ? (
          <div className="rounded-md border border-error/20 bg-[#17130f] px-2.5 py-1.5">
            <p className={statusNoteTextClass}>
              <ChatInlineIconText icon={CircleX} iconClassName="text-error/90">
                {SYSTEM_ORDER_CANCELLED_TEXT} 商品已解除鎖定，交易流程已終止。
              </ChatInlineIconText>
            </p>
          </div>
        ) : null}

        {isRejected ? (
          <div className="rounded-md border border-error/25 bg-[#1A1612] px-2.5 py-1.5">
            <p className="text-[11px] font-medium leading-snug text-error/90">
              <ChatInlineIconText icon={CircleX}>
                {resolveSystemOfferRejectedText(isSeller)}
              </ChatInlineIconText>
            </p>
          </div>
        ) : null}

        {isCancelled ? (
          <div className="rounded-md border border-white/10 bg-[#1A1612] px-2.5 py-1.5">
            <p className="text-[11px] font-medium leading-snug text-text-disabled">
              <ChatInlineIconText icon={CircleX} iconClassName="text-text-disabled">
                {SYSTEM_OFFER_CANCELLED_TEXT}
              </ChatInlineIconText>
            </p>
          </div>
        ) : null}

        {isPending && isBuyer ? (
          <div className={statusNoteClass}>
            <p className={statusNoteTextClass}>
              <ChatInlineIconText icon={Hourglass} iconClassName="text-brand/80">
                等待賣家回應中… 您的出價為{" "}
                <span className="font-mono font-bold text-brand">
                  HK$ {offerPrice.toLocaleString()}
                </span>
              </ChatInlineIconText>
            </p>
            {modifiedCount >= 1 ? (
              <p className="mt-1 font-mono text-[9.5px] text-text-disabled">
                （已達修改上限）
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>

      {isPending ? (
        <CardFooter className="flex flex-col gap-2 border-t-0 bg-transparent px-3 py-2.5">
          {isSeller ? (
            <>
              <AlertDialog>
                <AlertDialogTrigger
                  disabled={isAccepting}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand text-[12px] font-bold text-[#1A1612] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAccepting ? (
                    <>
                      <Spinner className="size-3.5" />
                      處理中…
                    </>
                  ) : (
                    "接受出價"
                  )}
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-sm rounded-2xl border border-brand/25 bg-bg-card p-6 text-text-primary shadow-[0_0_50px_rgba(0,0,0,0.45)]">
                  <AlertDialogHeader className="text-left">
                    <AlertDialogTitle className="text-[15px] font-bold text-[#eae1da]">
                      確認接受出價
                    </AlertDialogTitle>
                  </AlertDialogHeader>
                  <p className="py-3 text-[12.5px] leading-relaxed text-text-secondary">
                    您即將以{" "}
                    <span className="font-mono font-bold tabular-nums text-brand">
                      HK$ {offerPrice.toLocaleString()}
                    </span>{" "}
                    接受來自{" "}
                    <span className="font-bold text-brand">
                      {context.buyerName}
                    </span>{" "}
                    的出價。確認後商品將進入待交易狀態。
                    {useAuthentication ? (
                      <>
                        {" "}
                        此出價含平台鑑定加購（HK${" "}
                        {authServiceFeeHkd.toLocaleString()}），成交後將啟動託管鑑定流程。
                      </>
                    ) : null}
                  </p>
                  <div className="flex flex-col gap-2">
                    <AlertDialogAction
                      onClick={(event) => {
                        event.preventDefault();
                        void handleAccept();
                      }}
                      disabled={isAccepting}
                      className="h-11 rounded-xl bg-brand font-bold text-[#1A1612] hover:bg-brand-hover disabled:opacity-50"
                    >
                      {isAccepting ? (
                        <span className="inline-flex items-center gap-2">
                          <Spinner className="size-4" />
                          接受中…
                        </span>
                      ) : (
                        "確認接受"
                      )}
                    </AlertDialogAction>
                    <AlertDialogCancel className="h-10 rounded-xl border border-[rgba(237,232,224,0.12)] bg-bg-page/80 text-text-secondary hover:bg-bg-elevated/40 hover:text-text-primary">
                      返回
                    </AlertDialogCancel>
                  </div>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger
                  disabled={isRejecting}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-transparent text-[12px] font-bold text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRejecting ? (
                    <>
                      <Spinner className="size-3.5" />
                      處理中…
                    </>
                  ) : (
                    "拒絕出價"
                  )}
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-sm rounded-2xl border border-[#ef4444]/30 bg-[#26211C] p-6 text-[#eae1da]">
                  <AlertDialogHeader className="text-left">
                    <AlertDialogTitle className="text-[15px] font-black">
                      確認拒絕出價
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-[11px] font-mono uppercase tracking-wider text-[#8A8680]">
                      Reject Offer
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <p className="py-3 text-[12.5px] leading-relaxed text-[#d4c4b7]">
                    您即將婉拒{" "}
                    <span className="font-bold text-brand">
                      {context.buyerName}
                    </span>{" "}
                    的 HK$ {offerPrice.toLocaleString()} 出價。
                  </p>
                  <div className="flex flex-col gap-2">
                    <AlertDialogAction
                      onClick={() => void handleReject()}
                      disabled={isRejecting}
                      className="h-11 rounded-xl bg-[#ef4444] font-black text-white hover:bg-[#dc2626] disabled:opacity-50"
                    >
                      確認拒絕
                    </AlertDialogAction>
                    <AlertDialogCancel className="h-10 rounded-xl border border-white/10 bg-[#120F0C]">
                      返回
                    </AlertDialogCancel>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null}

          {isBuyer && modifiedCount < 1 ? (
            <AlertDialog
              key={`modify-offer-${modifyDialogKey}`}
              open={modifyDialogOpen}
              onOpenChange={setModifyDialogOpen}
            >
              <AlertDialogTrigger
                disabled={isModifying}
                render={
                  <button
                    type="button"
                    className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-transparent text-[12px] font-bold text-brand hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                }
              >
                {isModifying ? (
                  <>
                    <Spinner className="size-3.5" />
                    送出中…
                  </>
                ) : (
                  "修改出價"
                )}
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-sm rounded-2xl border border-orange-500/40 bg-[#26211C] p-6 text-[#eae1da]">
                <AlertDialogHeader className="text-left">
                  <AlertDialogTitle className="text-[15px] font-black">
                    修改出價
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-[11px] font-mono uppercase tracking-wider text-[#8A8680]">
                    Modify Offer
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="space-y-4 py-3">
                  <Alert className="border-orange-500/30 bg-orange-500/10 text-orange-400">
                    <AlertTriangle className="size-4" />
                    <AlertDescription className="text-[11.5px] leading-relaxed">
                      每筆出價僅能修改一次價格，提交後將重新進入賣家複核隊列。
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-1.5">
                    <label
                      htmlFor={`modify-offer-${message.id}`}
                      className="block font-mono text-[10px] uppercase tracking-wide text-[#d4c4b7]"
                    >
                      新出價金額 (HK$)
                    </label>
                    <input
                      id={`modify-offer-${message.id}`}
                      type="number"
                      value={modifyInput}
                      onChange={(event) =>
                        setModifyInput(Number(event.target.value))
                      }
                      className="h-10 w-full rounded-xl border border-orange-500/20 bg-[#17130f] px-3 font-mono text-[13px] text-[#eae1da] focus:border-orange-500/40 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <AlertDialogAction
                    type="button"
                    disabled={isModifying}
                    className="h-11 rounded-xl bg-orange-500 font-black text-[#17130f] hover:bg-orange-400 disabled:opacity-50"
                    onClick={(event) => {
                      event.preventDefault();
                      void handleModifyOffer().then((success) => {
                        if (success) {
                          setModifyDialogOpen(false);
                        }
                      });
                    }}
                  >
                    {isModifying ? (
                      <span className="inline-flex items-center gap-2">
                        <Spinner className="size-4" />
                        送出中…
                      </span>
                    ) : (
                      "確認送出"
                    )}
                  </AlertDialogAction>
                  <AlertDialogCancel
                    onClick={() => setModifyInput(offerPrice)}
                    className="h-10 rounded-xl border border-white/10 bg-[#120F0C]"
                  >
                    取消
                  </AlertDialogCancel>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </CardFooter>
      ) : null}

      {isAccepted && isBuyer && !isOrderCancelled ? (
        <CardFooter className="flex flex-col gap-2 border-t-0 bg-transparent px-3 py-2.5">
          {resolvedPaymentHref ? (
            <Button
              type="button"
              className="h-9 w-full rounded-lg bg-brand font-bold text-[#1A1612] hover:bg-[#e8b896]"
              onClick={() => {
                router.push(resolvedPaymentHref);
                setIsChatOpen(false);
              }}
            >
              {resolvedOrderKind === "merchant" && context.pendingPayment
                ? "前往結帳"
                : "前往付款"}
            </Button>
          ) : null}
          {resolvedOrderDetailHref && !resolvedPaymentHref ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full rounded-lg border-white/15 bg-transparent text-[12px] font-bold text-brand hover:bg-brand/10"
              onClick={() => {
                router.push(resolvedOrderDetailHref);
                setIsChatOpen(false);
              }}
            >
              {resolvedOrderKind === "member" && !useAuthentication
                ? "查看訂單"
                : "查看訂單詳情"}
            </Button>
          ) : null}
        </CardFooter>
      ) : null}

      {isAccepted && isSeller && !isOrderCancelled && resolvedSellerOrderDetailHref ? (
        <CardFooter className="flex flex-col gap-2 border-t-0 bg-transparent px-3 py-2.5">
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full rounded-lg border-white/15 bg-transparent text-[12px] font-bold text-brand hover:bg-brand/10"
            onClick={() => {
              router.push(resolvedSellerOrderDetailHref);
              setIsChatOpen(false);
            }}
          >
            查看訂單
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

export const OfferCard = memo(OfferCardComponent);
