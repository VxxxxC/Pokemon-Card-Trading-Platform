"use client";

import { Banknote } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ListingAuthServiceToggle } from "@/app/components/listings/ListingAuthServiceToggle";
import { ListingGradingSelect } from "@/app/components/listings/ListingGradingSelect";
import { CardListingPhotoGrid } from "@/app/components/listings/CardListingPhotoGrid";
import { LISTING_DESCRIPTION_MAX } from "@/lib/listings/validation";
import type {
  CreateListingPhotoSlot,
  EditListingPhotoSlot,
} from "@/lib/listings/card-listing-photo-slots";

type CardListingMerchFieldsProps = {
  idPrefix: string;
  price: string;
  onPriceChange: (value: string) => void;
  gradingOptionId: string;
  onGradingOptionChange: (value: string) => void;
  gradingVariant: "create" | "edit";
  showGrading?: boolean;
  showAuthToggle: boolean;
  acceptsBuyerAuth: boolean;
  onAcceptsBuyerAuthChange: (checked: boolean) => void;
  conditionDesc: string;
  onConditionDescChange: (value: string) => void;
  showExtraShipping?: boolean;
  extraShippingFee?: string;
  onExtraShippingFeeChange?: (value: string) => void;
  itemKind: "card" | "box_set";
  photoMode: "create" | "edit";
  createPhotoSlots?: CreateListingPhotoSlot[];
  editPhotoSlots?: EditListingPhotoSlot[];
  onCreatePhotoSlotClick?: (index: number) => void;
  onCreatePhotoSlotRemove?: (index: number) => void;
  onCreatePhotoDescriptionChange?: (index: number, value: string) => void;
  onEditPhotoReplaceClick?: (index: number) => void;
  onEditPhotoViewerOpen?: (index: number) => void;
  onEditPhotoRemarkChange?: (index: number, value: string) => void;
  /** When true, price + grading share one row (edit layout). */
  priceGradingRow?: boolean;
  listingId?: string;
  showListingActive?: boolean;
  isListingActive?: boolean;
  onListingActiveChange?: (checked: boolean) => void;
  /** Edit flow: overlay slot labels instead of remark inputs under photos. */
  compactEditPhotos?: boolean;
};

const fieldLabelClass =
  "font-mono text-[10px] text-[#8A8680] leading-none h-3.5 flex items-center";

export function CardListingMerchFields({
  idPrefix,
  price,
  onPriceChange,
  gradingOptionId,
  onGradingOptionChange,
  gradingVariant,
  showGrading = true,
  showAuthToggle,
  acceptsBuyerAuth,
  onAcceptsBuyerAuthChange,
  conditionDesc,
  onConditionDescChange,
  showExtraShipping,
  extraShippingFee = "",
  onExtraShippingFeeChange,
  itemKind,
  photoMode,
  createPhotoSlots,
  editPhotoSlots,
  onCreatePhotoSlotClick,
  onCreatePhotoSlotRemove,
  onCreatePhotoDescriptionChange,
  onEditPhotoReplaceClick,
  onEditPhotoViewerOpen,
  onEditPhotoRemarkChange,
  priceGradingRow = false,
  listingId,
  showListingActive = false,
  isListingActive = false,
  onListingActiveChange,
  compactEditPhotos = false,
}: CardListingMerchFieldsProps) {
  const priceField = (
    <div className="space-y-1 min-w-0">
      <label htmlFor={`${idPrefix}-price`} className={fieldLabelClass}>
        {priceGradingRow ? (
          <>
            售價
            <span className="text-brand ml-0.5">*</span>
          </>
        ) : (
          <>
            <Banknote
              className="size-3 text-brand shrink-0 mr-1"
              strokeWidth={2.25}
            />
            售價
            <span className="text-brand ml-0.5">*</span>
          </>
        )}
      </label>
      <div className="flex items-center h-9 bg-[#17130f] border border-white/[0.06] rounded-lg overflow-hidden focus-within:border-brand/40 transition-colors">
        <span className="px-2.5 font-mono text-[11px] font-bold text-[#8a8680] bg-[#26211C] border-r border-white/[0.06] h-full flex items-center shrink-0">
          HK$
        </span>
        <input
          id={`${idPrefix}-price`}
          type="number"
          required
          min={1}
          placeholder="一口價"
          value={price}
          onChange={(e) => onPriceChange(e.target.value)}
          className="flex-1 h-full bg-transparent px-2.5 font-mono text-[13px] text-brand focus:outline-none font-bold min-w-0"
        />
      </div>
    </div>
  );

  const gradingField =
    showGrading && itemKind === "card" ? (
      <div className="space-y-1 min-w-0">
        <label className={fieldLabelClass}>鑑定／品相</label>
        <ListingGradingSelect
          value={gradingOptionId}
          onValueChange={onGradingOptionChange}
          variant={gradingVariant}
        />
      </div>
    ) : null;

  const descriptionField = (
    <div className="space-y-1 min-w-0">
      <div className="flex items-center justify-between gap-1">
        <label htmlFor={`${idPrefix}-desc`} className={fieldLabelClass}>
          品相描述
          <span className="text-text-disabled font-normal ml-1">(選填)</span>
        </label>
        <span className="font-mono text-[9px] text-[#8A8680] tabular-nums shrink-0">
          {conditionDesc.length}/{LISTING_DESCRIPTION_MAX}
        </span>
      </div>
      <textarea
        id={`${idPrefix}-desc`}
        rows={3}
        maxLength={LISTING_DESCRIPTION_MAX}
        placeholder="卡面狀況、印刷、鏡面完整度…"
        value={conditionDesc}
        onChange={(e) => onConditionDescChange(e.target.value)}
        className="bg-[#17130f] border border-white/[0.06] rounded-lg text-[#eae1da] px-2.5 py-2 font-sans text-[11px] w-full min-h-[3.25rem] max-h-20 focus:outline-none focus:border-brand/30 placeholder-[#50453b] resize-none leading-snug"
      />
    </div>
  );

  const extraShippingField = showExtraShipping ? (
    <div className="space-y-1 min-w-0">
      <label htmlFor={`${idPrefix}-shipping`} className={fieldLabelClass}>
        附加運費
        <span className="text-text-disabled font-normal ml-1">(選填)</span>
      </label>
      <div className="flex items-center h-9 bg-[#17130f] border border-white/[0.06] rounded-lg overflow-hidden focus-within:border-brand/40 transition-colors">
        <span className="px-2.5 font-mono text-[11px] font-bold text-[#8a8680] bg-[#26211C] border-r border-white/[0.06] h-full flex items-center shrink-0">
          HK$
        </span>
        <input
          id={`${idPrefix}-shipping`}
          name="extraShippingFee"
          type="number"
          min={0}
          max={200}
          step={1}
          placeholder="0"
          value={extraShippingFee}
          onChange={(e) => onExtraShippingFeeChange?.(e.target.value)}
          className="flex-1 h-full bg-transparent px-2.5 font-mono text-[13px] text-[#eae1da] focus:outline-none min-w-0"
        />
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-1.5">
      {listingId ? (
        <p
          title={listingId}
          className="font-mono text-[9px] text-[#8A8680] leading-relaxed truncate"
        >
          <span className="text-text-disabled">Listing ID </span>
          <span className="text-[#aeb0b6] select-all">{listingId}</span>
        </p>
      ) : null}

      {showListingActive ? (
        <div className="flex items-center justify-between gap-3 bg-[#17130f] border border-white/[0.06] rounded-lg px-3 py-1.5">
          <span className="font-sans font-bold text-[#d4c4b7] text-[12px]">
            商品上架
          </span>
          <Switch
            checked={isListingActive}
            onCheckedChange={onListingActiveChange}
            className="data-checked:bg-brand data-unchecked:bg-[#39342f] shrink-0"
          />
        </div>
      ) : null}

      {priceGradingRow && gradingField ? (
        <div className="grid grid-cols-2 gap-2">
          {priceField}
          {gradingField}
        </div>
      ) : null}

      {!priceGradingRow && gradingField ? gradingField : null}

      {showExtraShipping && priceGradingRow ? extraShippingField : null}

      {showAuthToggle ? (
        <ListingAuthServiceToggle
          checked={acceptsBuyerAuth}
          onCheckedChange={onAcceptsBuyerAuthChange}
        />
      ) : null}

      <CardListingPhotoGrid
        mode={photoMode}
        itemKind={itemKind}
        createSlots={createPhotoSlots}
        editSlots={editPhotoSlots}
        onCreateSlotClick={onCreatePhotoSlotClick}
        onCreateSlotRemove={onCreatePhotoSlotRemove}
        onCreateDescriptionChange={onCreatePhotoDescriptionChange}
        onEditReplaceClick={onEditPhotoReplaceClick}
        onEditViewerOpen={onEditPhotoViewerOpen}
        onEditRemarkChange={onEditPhotoRemarkChange}
        compactEditLabels={compactEditPhotos}
      />

      {descriptionField}

      {!priceGradingRow ? priceField : null}

      {showExtraShipping && !priceGradingRow ? extraShippingField : null}
    </div>
  );
}
