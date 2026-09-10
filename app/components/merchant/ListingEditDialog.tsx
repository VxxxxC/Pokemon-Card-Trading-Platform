"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageViewer } from "@/app/components/shared/ImageViewer";
import {
  formatSkuCatalogLine,
  type CardInstance,
  type SKUGroup,
} from "@/app/components/merchant/InventoryAccordion";
import { CardListingMerchFields } from "@/app/components/listings/CardListingMerchFields";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DEFAULT_GRADING_OPTION_ID } from "@/lib/grading/options";
import {
  buildEditListingPhotoSlots,
  type EditListingPhotoSlot,
} from "@/lib/listings/card-listing-photo-slots";
import { submitCardListingWithProgress } from "@/lib/listings/submit-card-listing";
import {
  LISTING_DESCRIPTION_MAX,
  validateImageFile,
  validateUpdateListingImageCount,
} from "@/lib/listings/validation";
import { useListingGradingAuthFields } from "@/lib/listings/use-listing-grading-auth-fields";

type ListingEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sku: Pick<SKUGroup, "cardName" | "cardNo" | "setCode" | "cardNumber">;
  item: CardInstance;
  inventoryContext?: "merchant" | "member";
  onSaved?: () => void;
};

export function ListingEditDialog({
  open,
  onOpenChange,
  sku,
  item,
  inventoryContext = "member",
  onSaved,
}: ListingEditDialogProps) {
  const [price, setPrice] = useState(String(item.askPrice));
  const [extraShippingFee, setExtraShippingFee] = useState(
    item.extraShippingFee != null && item.extraShippingFee > 0
      ? String(item.extraShippingFee)
      : "",
  );
  const {
    gradingOptionId,
    setGradingOptionId,
    acceptsBuyerAuth,
    setAcceptsBuyerAuth,
    resolvedUseAuthentication,
    showListingAuthToggle,
  } = useListingGradingAuthFields({
    initialGradingOptionId: item.gradingOptionId || DEFAULT_GRADING_OPTION_ID,
    initialAcceptsBuyerAuth: item.useAuthentication,
  });
  const [sellerDescription, setSellerDescription] = useState(item.conditionDesc);
  const [isActive, setIsActive] = useState(item.status === "active");
  const [photoSlots, setPhotoSlots] = useState<EditListingPhotoSlot[]>(() =>
    buildEditListingPhotoSlots(item.images),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [activeReplaceIndex, setActiveReplaceIndex] = useState<number | null>(
    null,
  );

  const itemKind = item.isSealedListing ? "box_set" : "card";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoSlotsRef = useRef<EditListingPhotoSlot[]>(photoSlots);

  useEffect(() => {
    photoSlotsRef.current = photoSlots;
  }, [photoSlots]);

  useEffect(() => {
    return () => {
      for (const slot of photoSlotsRef.current) {
        if (slot.file && slot.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(slot.previewUrl);
        }
      }
    };
  }, []);

  const viewerImages = useMemo(
    () =>
      photoSlots
        .map((slot) => slot.previewUrl)
        .filter((url): url is string => Boolean(url)),
    [photoSlots],
  );

  const viewerRemarks = useMemo(
    () => photoSlots.map((slot) => slot.remark),
    [photoSlots],
  );

  const openViewerAt = (slotIndex: number) => {
    if (!photoSlots[slotIndex]?.previewUrl) return;
    const visibleIndex = photoSlots
      .slice(0, slotIndex + 1)
      .filter((slot) => slot.previewUrl).length - 1;
    if (visibleIndex < 0) return;
    setViewerIndex(visibleIndex);
    setIsViewerOpen(true);
  };

  const handleReplaceClick = (slotIndex: number) => {
    setActiveReplaceIndex(slotIndex);
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (!file || activeReplaceIndex === null) {
      return;
    }

    const fileError = validateImageFile(file);
    if (fileError) {
      toast.error(`⚠️ ${fileError}`);
      return;
    }

    const slotIndex = activeReplaceIndex;
    setPhotoSlots((prev) => {
      const next = [...prev];
      const existing = next[slotIndex];
      if (existing?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(existing.previewUrl);
      }

      next[slotIndex] = {
        ...existing,
        file,
        previewUrl: URL.createObjectURL(file),
        existingUrl: null,
        existingObjectKey: null,
      };
      return next;
    });
    setActiveReplaceIndex(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      toast.error("⚠️ 請輸入有效的售價");
      return;
    }

    if (sellerDescription.length > LISTING_DESCRIPTION_MAX) {
      toast.error(`品相描述不可超過 ${LISTING_DESCRIPTION_MAX} 字`);
      return;
    }

    const filledPhotoSlots = photoSlots.filter((slot) => slot.previewUrl);
    const imageCountError = validateUpdateListingImageCount(
      filledPhotoSlots.length,
      itemKind,
    );
    if (imageCountError) {
      toast.error(imageCountError);
      return;
    }

    if (itemKind === "card" && filledPhotoSlots.length !== photoSlots.length) {
      toast.error("必須上載全部 6 張卡牌相片（正面、背面及四個角）");
      return;
    }

    setIsSubmitting(true);

    const slotsToSubmit =
      itemKind === "box_set" ? filledPhotoSlots : photoSlots;

    const result = await submitCardListingWithProgress({
      mode: "edit",
      itemKind,
      listingId: item.id,
      gradingOptionId,
      price: parsedPrice,
      sellerDescription: sellerDescription.trim() || undefined,
      useAuthentication: resolvedUseAuthentication,
      isActive,
      sellerPersona: inventoryContext === "merchant" ? "merchant" : undefined,
      extraShippingFee:
        inventoryContext === "merchant" && extraShippingFee.trim()
          ? Number(extraShippingFee)
          : inventoryContext === "merchant"
            ? 0
            : undefined,
      imageSlots: slotsToSubmit.map((slot) => ({
        file: slot.file,
        existingUrl: slot.existingUrl ?? slot.previewUrl ?? undefined,
        existingObjectKey: slot.existingObjectKey ?? undefined,
        remark: slot.remark.trim() || undefined,
      })),
    });

    setIsSubmitting(false);

    if (!result.success) {
      return;
    }

    toast.success(`「${sku.cardName} · ${item.grade}」修改已儲存`);
    onOpenChange(false);
    onSaved?.();
    window.dispatchEvent(new CustomEvent("inventory-should-refresh"));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="w-full max-w-[calc(100%-2rem)] sm:max-w-md bg-[#2e2925] border border-white/[0.08] text-text-primary overflow-y-auto max-h-[calc(100dvh-1rem)] p-0 gap-0"
          showCloseButton
        >
          <DialogHeader className="shrink-0 px-3 pt-1.5 pb-1.5 border-b border-white/[0.06] space-y-0.5">
            <DialogTitle className="font-sans font-bold text-[15px] text-brand leading-tight pr-8">
              編輯商品
            </DialogTitle>
            <p className="font-sans text-[12px] text-[#eae1da] font-semibold truncate leading-tight">
              {sku.cardName}
            </p>
            <p className="font-mono text-[10px] text-[#8A8680] truncate uppercase">
              {[formatSkuCatalogLine(sku), item.grade].filter(Boolean).join(" · ")}
            </p>
          </DialogHeader>

          <form
            key={item.id}
            onSubmit={handleSubmit}
            className="text-[13px]"
          >
            <div className="px-3 py-1.5 space-y-1.5">
              <CardListingMerchFields
                idPrefix={`edit-${item.id}`}
                price={price}
                onPriceChange={setPrice}
                gradingOptionId={gradingOptionId}
                onGradingOptionChange={setGradingOptionId}
                gradingVariant="edit"
                showAuthToggle={showListingAuthToggle}
                acceptsBuyerAuth={acceptsBuyerAuth}
                onAcceptsBuyerAuthChange={setAcceptsBuyerAuth}
                conditionDesc={sellerDescription}
                onConditionDescChange={setSellerDescription}
                showExtraShipping={inventoryContext === "merchant"}
                extraShippingFee={extraShippingFee}
                onExtraShippingFeeChange={setExtraShippingFee}
                itemKind={itemKind}
                photoMode="edit"
                editPhotoSlots={photoSlots}
                onEditPhotoReplaceClick={handleReplaceClick}
                onEditPhotoViewerOpen={openViewerAt}
                onEditPhotoRemarkChange={(index, value) => {
                  setPhotoSlots((prev) =>
                    prev.map((entry, idx) =>
                      idx === index ? { ...entry, remark: value } : entry,
                    ),
                  );
                }}
                priceGradingRow
                listingId={item.id}
                showListingActive
                isListingActive={isActive}
                onListingActiveChange={setIsActive}
                compactEditPhotos
              />
            </div>

            <div className="shrink-0 px-3 py-1.5 border-t border-white/[0.06] bg-[#2e2925]">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-9 bg-brand hover:bg-[#e8b896] disabled:opacity-60 disabled:cursor-not-allowed text-[#1A1612] font-sans font-bold text-[12px] rounded-lg active:scale-[0.98] transition-all cursor-pointer focus:outline-none"
              >
                {isSubmitting ? "儲存中…" : "確認儲存修改"}
              </button>
            </div>
          </form>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
            onChange={handleFileChange}
            className="hidden"
          />
        </DialogContent>
      </Dialog>

      <ImageViewer
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        images={viewerImages}
        remarks={viewerRemarks}
        initialIndex={viewerIndex}
      />
    </>
  );
}
