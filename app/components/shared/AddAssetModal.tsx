"use client";

import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Rocket, Star, X } from "lucide-react";
import { toast } from "sonner";
import { addToCollection } from "@/app/actions/collection";
import { submitCardListingWithProgress } from "@/lib/listings/submit-card-listing";
import { submitSealedListingWithProgress } from "@/lib/listings/submit-sealed-listing";
import {
  CollectionAddAfterListingDialog,
  type CollectionAddAfterListingPayload,
} from "@/app/components/shared/CollectionAddAfterListingDialog";
import { useUIStore, type SellFromCollectionPrefill } from "@/app/store/useUIStore";
import { useIsMemberPersonaActive } from "@/app/lib/hooks/useIsMemberPersonaActive";
import { MEMBER_PERSONA_FEATURES_BLOCKED_ERROR } from "@/lib/auth/member-persona-features";
import { useListingSubmitStore } from "@/app/store/useListingSubmitStore";
import { useProductCatalogSearch } from "@/app/lib/hooks/useProductCatalogSearch";
import type { ProductCatalogSuggestion } from "@/app/actions/productCatalog";
import {
  DEFAULT_GRADING_OPTION_ID,
  getGradingOption,
  gradingOptionToFields,
  isRawGradingOption,
} from "@/lib/grading/options";
import {
  LISTING_IMAGE_MAX,
  LISTING_PHOTO_SLOT_LABELS,
  type ListingImage,
} from "@/lib/listings/images";
import { createEmptyCreatePhotoSlots } from "@/lib/listings/card-listing-photo-slots";
import {
  LISTING_DESCRIPTION_MAX,
  validateCreateCardListing,
  validateCreateSealedListing,
  validateImageFile,
} from "@/lib/listings/validation";
import { CardListingMerchFields } from "@/app/components/listings/CardListingMerchFields";
import { ListingGradingSelect } from "@/app/components/listings/ListingGradingSelect";
import { useListingGradingAuthFields } from "@/lib/listings/use-listing-grading-auth-fields";
import {
  catalogItemKindFromType,
  defaultSealedProductScore,
  type SealedProductScore,
} from "@/lib/catalog/item-kind";
import type { CatalogType } from "@/lib/constants/commerce";

type LocalPhotoSlot = {
  file: File | null;
  previewUrl: string | null;
  description: string;
};

function createEmptyPhotoSlots(): LocalPhotoSlot[] {
  return createEmptyCreatePhotoSlots();
}

function revokePhotoSlots(slots: LocalPhotoSlot[]) {
  for (const slot of slots) {
    if (slot.previewUrl) {
      URL.revokeObjectURL(slot.previewUrl);
    }
  }
}

function suggestionFromSellPrefill(
  prefill: SellFromCollectionPrefill,
): ProductCatalogSuggestion {
  return {
    id: prefill.productId,
    name: prefill.catalog.name,
    nameJa: prefill.catalog.name,
    nameEn: null,
    nameZh: null,
    setCode: prefill.catalog.setCode,
    cardNumber: prefill.catalog.cardNumber ?? null,
    displayId: prefill.catalog.displayId ?? null,
    imageUrl: prefill.catalog.imageUrl ?? "",
    type: (prefill.catalog.catalogType ?? "single_card") as CatalogType,
    rarity: prefill.catalog.rarity ?? null,
    pokemonStage: null,
  };
}

function catalogSelectionError(itemType: "card" | "box_set"): string {
  return itemType === "box_set"
    ? "⚠️ 請從搜尋結果中選擇商品"
    : "⚠️ 請從搜尋結果中選擇一張卡牌";
}

// 嚴格定義全域資產數據合約
export interface GlobalAssetPayload {
  id: string;
  name: string;
  set: string;
  cardNo: string;
  grade: string;
  grader: "PSA" | "BGS" | "CGC" | "RAW" | "OTHER" | string;
  purchasePrice: number; // 僅收藏愛好使用
  currentValue: number; // 僅收藏愛好使用
  sellingPrice: number; // 僅新增商品使用
  status: "holding" | "listed" | "grading";
  isHobbyOnly: boolean;
  images: string[] | ListingImage[];
  condition?: string;
  conditionDesc?: string;
  photosRemark?: string[];
}

export function AddAssetModal() {
  const isOpen = useUIStore((state) => state.isAddAssetOpen);
  const globalMode = useUIStore((state) => state.addAssetMode);
  const sellPrefill = useUIStore((state) => state.addAssetSellPrefill);
  const addAssetSellerPersona = useUIStore((state) => state.addAssetSellerPersona);
  const closeAddAssetModal = useUIStore((state) => state.closeAddAssetModal);
  const isMemberPersonaActive = useIsMemberPersonaActive();
  // 模式 Toggle 狀態
  const [mode, setMode] = useState<"hobby" | "merch">("hobby");

  // 🏛️ Symmetrical Item-Type State
  const [itemType, setItemType] = useState<"card" | "box_set">("card");

  // 🟢 核心對齊：整合統一的單一 SKU 搜尋狀態，消除個別欄位
  const [set, setSet] = useState(""); // 擴充包系列仍為選填欄位

  const catalogItemType = itemType === "box_set" ? "box_set" : "card";
  const catalogSearch = useProductCatalogSearch(catalogItemType, {
    enabled: isOpen,
  });

  const [sealState, setSealState] = useState<SealedProductScore>(
    defaultSealedProductScore(),
  );
  const {
    gradingOptionId,
    setGradingOptionId,
    setGradingOptionIdState,
    acceptsBuyerAuth,
    setAcceptsBuyerAuth,
    resolvedUseAuthentication,
    showListingAuthToggle,
  } = useListingGradingAuthFields({
    enableAuthOnRawGradingSelect: true,
  });

  // 收藏愛好專屬欄位
  const [purchasePrice, setPurchasePrice] = useState("");

  // 新增商品專屬欄位
  const [sellingPrice, setSellingPrice] = useState("");
  const [extraShippingFee, setExtraShippingFee] = useState("");
  const [collectionAddPrompt, setCollectionAddPrompt] =
    useState<CollectionAddAfterListingPayload | null>(null);

  // 圖片預覽槽（僅於提交時上傳至 Bunny.net）
  const [photoSlots, setPhotoSlots] = useState<LocalPhotoSlot[]>(
    createEmptyPhotoSlots,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 收藏愛好模式沿用簡易預覽陣列
  const [hobbyImages, setHobbyImages] = useState<string[]>([]);

  const [conditionDesc, setConditionDesc] = useState("");
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const listingSubmitPhase = useListingSubmitStore((state) => state.phase);
  const listingSubmitOpen = useListingSubmitStore((state) => state.isOpen);
  const isSubmitting =
    listingSubmitOpen &&
    listingSubmitPhase !== "idle" &&
    listingSubmitPhase !== "error";

  // 🟢 記憶體時空守衛
  const [prevIsOpen, setPrevIsOpen] = useState(false);

  const photoSlotsRef = useRef<LocalPhotoSlot[]>(createEmptyPhotoSlots());

  useEffect(() => {
    photoSlotsRef.current = photoSlots;
  }, [photoSlots]);

  const resetPhotoSlots = useCallback(() => {
    setPhotoSlots((prev) => {
      revokePhotoSlots(prev);
      return createEmptyPhotoSlots();
    });
  }, []);

  useEffect(() => {
    return () => {
      revokePhotoSlots(photoSlotsRef.current);
    };
  }, []);

  const displayMode = sellPrefill
    ? "上架出售收藏"
    : mode === "hobby"
      ? "收藏愛好"
      : "新增商品";

  const boxSetBadge = useMemo(() => {
    if (itemType !== "box_set" || !catalogSearch.query) return null;
    const lower = catalogSearch.query.toLowerCase();
    if (lower.includes("box") || lower.includes("盒")) {
      return (
        <span className="text-orange-400 bg-orange-500/10 border border-orange-500/20 font-mono px-1.5 py-0.5 rounded text-[10px] uppercase font-bold shrink-0 animate-fadeIn">
          BOX
        </span>
      );
    }
    if (lower.includes("set") || lower.includes("套")) {
      return (
        <span className="text-purple-400 bg-purple-500/10 border border-purple-500/20 font-mono px-1.5 py-0.5 rounded text-[10px] uppercase font-bold shrink-0 animate-fadeIn">
          SET
        </span>
      );
    }
    return null;
  }, [itemType, catalogSearch.query]);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      catalogSearch.clearSearch();
      if (sellPrefill) {
        const suggestion = suggestionFromSellPrefill(sellPrefill);
        catalogSearch.selectSuggestion(suggestion);
        setMode("merch");
        setItemType(sellPrefill.itemKind ?? catalogItemKindFromType(suggestion.type));
        setSet(sellPrefill.catalog.setCode);
        setGradingOptionIdState(sellPrefill.gradingOptionId);
        setSealState(sellPrefill.sealState ?? defaultSealedProductScore());
        setSellingPrice(String(sellPrefill.sellingPrice));
        setAcceptsBuyerAuth(
          isRawGradingOption(getGradingOption(sellPrefill.gradingOptionId)),
        );
        setPurchasePrice("");
        setHobbyImages([]);
        resetPhotoSlots();
        setConditionDesc("");
        setActiveSlotIndex(null);
      } else {
        setMode(globalMode);
        setItemType("card");
        setSet("");
        setGradingOptionIdState(DEFAULT_GRADING_OPTION_ID);
        setSealState(defaultSealedProductScore());
        setPurchasePrice("");
        setSellingPrice("");
        setExtraShippingFee("");
        setAcceptsBuyerAuth(false);
        setHobbyImages([]);
        resetPhotoSlots();
        setConditionDesc("");
        setActiveSlotIndex(null);
      }
    }
  }

  if (!isOpen) {
    return (
      <CollectionAddAfterListingDialog
        payload={collectionAddPrompt}
        onClose={() => setCollectionAddPrompt(null)}
      />
    );
  }

  const buildNextPhotoSlots = (
    prev: LocalPhotoSlot[],
    files: File[],
    startIndex: number,
  ): {
    next: LocalPhotoSlot[];
    assigned: number;
    skipped: number;
    fileErrors: string[];
  } => {
    const next = [...prev];
    let slotIndex = startIndex;
    let assigned = 0;
    let skipped = 0;
    const fileErrors: string[] = [];

    for (const file of files) {
      if (slotIndex >= LISTING_IMAGE_MAX) {
        skipped += 1;
        continue;
      }

      const fileError = validateImageFile(file);
      if (fileError) {
        fileErrors.push(`${file.name}: ${fileError}`);
        skipped += 1;
        continue;
      }

      const existing = next[slotIndex];
      if (existing.previewUrl) {
        URL.revokeObjectURL(existing.previewUrl);
      }

      next[slotIndex] = {
        file,
        previewUrl: URL.createObjectURL(file),
        description: existing.description || "",
      };
      assigned += 1;
      slotIndex += 1;
    }

    return { next, assigned, skipped, fileErrors };
  };

  const applyFilesToPhotoSlots = (
    files: File[],
    startIndex: number,
  ): { assigned: number; skipped: number; fileErrors: string[] } => {
    const built = buildNextPhotoSlots(photoSlots, files, startIndex);

    setPhotoSlots(built.next);

    for (const message of built.fileErrors) {
      toast.error(`⚠️ ${message}`);
    }

    return {
      assigned: built.assigned,
      skipped: built.skipped,
      fileErrors: built.fileErrors,
    };
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);

    if (mode === "merch") {
      const startIndex =
        activeSlotIndex ??
        photoSlots.findIndex((slot) => !slot.file);

      if (startIndex === -1) {
        toast.error(`⚠️ 已達 ${LISTING_IMAGE_MAX} 張上限`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const { assigned, skipped } = applyFilesToPhotoSlots(files, startIndex);

      if (assigned > 0 && skipped > 0) {
        toast.message(
          `已加入 ${assigned} 張相片，${skipped} 張未加入（上限或格式不符）`,
        );
      }

      setActiveSlotIndex(null);
    } else {
      const remaining = LISTING_IMAGE_MAX - hobbyImages.length;
      if (remaining <= 0) {
        toast.error(`⚠️ 抱歉，實體相片上載上限為 ${LISTING_IMAGE_MAX} 張！`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const accepted: string[] = [];
      let skipped = 0;

      for (const file of files) {
        if (accepted.length >= remaining) {
          skipped += 1;
          continue;
        }

        const fileError = validateImageFile(file);
        if (fileError) {
          toast.error(`⚠️ ${file.name}: ${fileError}`);
          skipped += 1;
          continue;
        }

        accepted.push(URL.createObjectURL(file));
      }

      if (accepted.length > 0) {
        setHobbyImages((prev) => [...prev, ...accepted]);
      }

      if (accepted.length > 0 && skipped > 0) {
        toast.message(
          `已加入 ${accepted.length} 張相片，${skipped} 張未加入（上限或格式不符）`,
        );
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemovePhotoSlot = (indexToRemove: number) => {
    setPhotoSlots((prev) => {
      const next = [...prev];
      const existing = next[indexToRemove];
      if (existing.previewUrl) {
        URL.revokeObjectURL(existing.previewUrl);
      }
      next[indexToRemove] = { file: null, previewUrl: null, description: "" };
      return next;
    });
  };

  const handleRemoveHobbyImage = (indexToRemove: number) => {
    setHobbyImages((prev) => {
      const target = prev[indexToRemove];
      if (target) URL.revokeObjectURL(target);
      return prev.filter((_, idx) => idx !== indexToRemove);
    });
  };

  const openPhotoPicker = (slotIndex: number) => {
    setActiveSlotIndex(slotIndex);
    fileInputRef.current?.click();
  };

  const handleSelectCatalogSuggestion = (
    suggestion: ProductCatalogSuggestion,
  ) => {
    catalogSearch.selectSuggestion(suggestion);
    setSet(suggestion.setCode);
  };

  const handleCloseAndReset = () => {
    if (isSubmitting) return;
    closeAddAssetModal();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "hobby") {
      if (!isMemberPersonaActive) {
        toast.error(MEMBER_PERSONA_FEATURES_BLOCKED_ERROR);
        return;
      }

      if (!catalogSearch.selected) {
        toast.error(catalogSelectionError(itemType));
        return;
      }

      const parsedPurchasePrice = Number(purchasePrice);
      if (!Number.isFinite(parsedPurchasePrice) || parsedPurchasePrice < 0) {
        toast.error("⚠️ 請輸入有效的入手成本");
        return;
      }

      const result = await addToCollection({
        productId: catalogSearch.selected.id,
        gradingOptionId: gradingOptionId,
        purchasePrice: parsedPurchasePrice,
        sealState: itemType === "box_set" ? sealState : undefined,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        itemType === "box_set"
          ? "★ 已成功收錄密封盒組至您的私藏愛好清單"
          : "★ 已成功收錄進您的私藏愛好清單",
      );
      handleCloseAndReset();
      window.dispatchEvent(new CustomEvent("collection-should-refresh"));
      return;
    }

    if (mode === "merch" && itemType === "box_set") {
      const imageFiles = photoSlots
        .map((slot) => slot.file)
        .filter((file): file is File => file !== null);

      const validationError = validateCreateSealedListing(
        {
          productId: catalogSearch.selected?.id ?? "",
          price: Number(sellingPrice),
          sellerDescription: conditionDesc || undefined,
        },
        imageFiles,
      );

      if (validationError) {
        toast.error(`⚠️ ${validationError}`);
        return;
      }

      if (!catalogSearch.selected) {
        toast.error(catalogSelectionError(itemType));
        return;
      }

      const photosRemark = photoSlots
        .map((slot, originalIdx) => {
          if (!slot.file) return null;
          const defaultDesc = `實體照 ${originalIdx + 1}`;
          return slot.description?.trim() || defaultDesc;
        })
        .filter((remark): remark is string => remark !== null);

      const result = await submitSealedListingWithProgress({
        productId: catalogSearch.selected.id,
        price: Number(sellingPrice),
        sellerDescription: conditionDesc || undefined,
        sourceCollectionId: sellPrefill?.collectionId,
        sellerPersona: addAssetSellerPersona,
        imageFiles,
        photosRemark,
        sealState,
        extraShippingFee:
          addAssetSellerPersona === "merchant" && extraShippingFee.trim()
            ? Number(extraShippingFee)
            : undefined,
      });

      if (!result.success) {
        return;
      }

      const hadSellPrefill = Boolean(sellPrefill);

      window.dispatchEvent(new CustomEvent("inventory-should-refresh"));

      if (hadSellPrefill) {
        window.dispatchEvent(new CustomEvent("collection-should-refresh"));
      }

      toast.success(
        hadSellPrefill
          ? "🏛️ 密封盒組已成功上架發售"
          : "🏪 密封盒組已成功錄入並直接上架交易所大盤",
      );
      handleCloseAndReset();

      if (!hadSellPrefill && catalogSearch.selected && isMemberPersonaActive) {
        setCollectionAddPrompt({
          productId: catalogSearch.selected.id,
          productName: catalogSearch.selected.name,
          itemKind: "box_set",
          sealState,
        });
      }
      return;
    }

    if (mode === "merch" && itemType === "card") {
      const imageFiles = photoSlots
        .map((slot) => slot.file)
        .filter((file): file is File => file !== null);

      const validationError = validateCreateCardListing(
        {
          productId: catalogSearch.selected?.id ?? "",
          gradingOptionId: gradingOptionId,
          price: Number(sellingPrice),
          sellerDescription: conditionDesc || undefined,
        },
        imageFiles,
      );

      if (validationError) {
        toast.error(`⚠️ ${validationError}`);
        return;
      }

      if (!catalogSearch.selected) {
        toast.error(catalogSelectionError(itemType));
        return;
      }

      const photosRemark = photoSlots
        .map((slot, originalIdx) => {
          if (!slot.file) return null;
          const slotLabel = itemType === "card" ? LISTING_PHOTO_SLOT_LABELS[originalIdx] : null;
          const defaultDesc = slotLabel || `實體照 ${originalIdx + 1}`;
          return slot.description?.trim() || defaultDesc;
        })
        .filter((remark): remark is string => remark !== null);

      const result = await submitCardListingWithProgress({
        mode: "create",
        productId: catalogSearch.selected.id,
        gradingOptionId: gradingOptionId,
        price: Number(sellingPrice),
        sellerDescription: conditionDesc || undefined,
        useAuthentication: resolvedUseAuthentication,
        sourceCollectionId: sellPrefill?.collectionId,
        sellerPersona: addAssetSellerPersona,
        imageFiles,
        photosRemark,
        extraShippingFee:
          addAssetSellerPersona === "merchant" && extraShippingFee.trim()
            ? Number(extraShippingFee)
            : undefined,
      });

      if (!result.success) {
        return;
      }

      const hadSellPrefill = Boolean(sellPrefill);
      const gradingFields = gradingOptionToFields(getGradingOption(gradingOptionId));

      const payload: GlobalAssetPayload = {
        id: result.data.listingId,
        name: catalogSearch.selected.name,
        set: set || catalogSearch.selected.setCode,
        cardNo:
          catalogSearch.selected.displayId ??
          catalogSearch.selected.cardNumber ??
          "",
        grade: gradingFields.gradeLabel,
        grader: gradingFields.grader,
        purchasePrice: 0,
        currentValue: 0,
        sellingPrice: Number(sellingPrice),
        status: "listed",
        isHobbyOnly: false,
        images: result.data.images,
        condition: gradingFields.condition,
        conditionDesc: conditionDesc || undefined,
        photosRemark: photoSlots
          .map((slot, originalIdx) => {
            if (!slot.previewUrl) return null;
            const slotLabel = itemType === "card" ? LISTING_PHOTO_SLOT_LABELS[originalIdx] : null;
            const defaultDesc = slotLabel || `實體照 ${originalIdx + 1}`;
            return slot.description?.trim() || defaultDesc;
          })
          .filter((remark): remark is string => remark !== null),
      };

      window.dispatchEvent(
        new CustomEvent("global-asset-successfully-added", { detail: payload }),
      );

      window.dispatchEvent(new CustomEvent("inventory-should-refresh"));

      if (hadSellPrefill) {
        window.dispatchEvent(new CustomEvent("collection-should-refresh"));
      }

      toast.success(
        hadSellPrefill
          ? "🏛️ 收藏品已成功上架發售"
          : "🏪 商品已成功錄入並直接上架交易所大盤",
      );
      handleCloseAndReset();

      if (!hadSellPrefill && catalogSearch.selected && isMemberPersonaActive) {
        setCollectionAddPrompt({
          productId: catalogSearch.selected.id,
          gradingOptionId: gradingOptionId,
          productName: catalogSearch.selected.name,
        });
      }
      return;
    }
  };

  const showMerchAuthToggle =
    mode === "merch" && itemType === "card" && showListingAuthToggle;

  return (
    <>
    <div
      className="fixed inset-0 z-[350] flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-asset-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-xs"
        onClick={handleCloseAndReset}
      />

      <div className="relative bg-[#2e2925] border border-white/[0.08] rounded-xl w-full max-w-md shadow-2xl text-left flex flex-col max-h-[calc(100dvh-1rem)] overflow-y-auto animate-scaleUp">
        <div className="shrink-0 px-3 pt-1.5 pb-1 border-b border-white/[0.06] flex items-start justify-between gap-2">
          <h2
            id="add-asset-modal-title"
            className="font-sans font-bold text-[16px] text-brand leading-tight min-w-0"
          >
            {displayMode}
          </h2>
          <button
            type="button"
            onClick={handleCloseAndReset}
            className="shrink-0 inline-flex w-8 h-8 items-center justify-center rounded-lg text-[#d4c4b7] hover:bg-white/5 hover:text-[#eae1da] transition-colors focus:outline-none cursor-pointer -mr-1 -mt-0.5"
            aria-label="關閉"
          >
            <X className="size-4" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="text-[13px]">
          <div className="px-3 py-1.5 space-y-1.5">
          {!sellPrefill ? (
          <div className="flex items-stretch gap-2">
            <div className="relative flex shrink-0 w-[4.75rem] h-9 bg-[#17130f] rounded-lg p-0.5 border border-white/[0.06] select-none">
              <div
                className="absolute top-0.5 bottom-0.5 rounded-md bg-[rgba(212,165,116,0.14)] border border-[rgba(212,165,116,0.22)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none"
                style={{
                  width: "calc(50% - 2px)",
                  transform:
                    itemType === "card"
                      ? "translateX(0)"
                      : "translateX(calc(100% + 2px))",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (itemType === "card") return;
                  setItemType("card");
                  catalogSearch.invalidateResults();
                }}
                className={`relative flex-1 font-sans text-[10px] font-bold rounded-md transition-colors z-10 ${
                  itemType === "card"
                    ? "text-brand"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                單卡
              </button>
              <button
                type="button"
                onClick={() => {
                  if (itemType === "box_set") return;
                  setItemType("box_set");
                  catalogSearch.invalidateResults();
                }}
                className={`relative flex-1 font-sans text-[10px] font-bold rounded-md transition-colors z-10 ${
                  itemType === "box_set"
                    ? "text-brand"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                盒組
              </button>
            </div>

            <div className="relative flex-1 min-w-0 flex items-center gap-1.5">
              {boxSetBadge}
              <div className="relative flex-1 min-w-0">
                <div className="flex items-center bg-[#17130f] border border-white/5 rounded-lg h-9 overflow-hidden">
                  <input
                    type="text"
                    required
                    placeholder={
                      itemType === "box_set"
                        ? "盒組名稱或條碼…"
                        : "卡號或名稱…"
                    }
                    aria-label={
                      itemType === "box_set" ? "盒組搜尋" : "卡號或名稱搜尋"
                    }
                    value={catalogSearch.query}
                    onChange={(e) => catalogSearch.setQuery(e.target.value)}
                    className="flex-1 h-full min-w-0 bg-transparent px-2.5 font-sans text-[12px] text-[#eae1da] placeholder-[#50453b] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={catalogSearch.searchNow}
                    className="px-3 h-full shrink-0 font-mono text-[11px] text-brand hover:bg-[rgba(212,165,116,0.08)] transition-colors border-l border-white/5 cursor-pointer focus:outline-none"
                  >
                    {catalogSearch.isSearching ? "…" : "搜尋"}
                  </button>
                </div>

                {(catalogSearch.isSearching ||
                  catalogSearch.error ||
                  catalogSearch.results.length > 0) && (
                  <div className="absolute z-50 top-full mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-[#26211C] shadow-lg">
                    {catalogSearch.isSearching && (
                      <p className="px-3 py-2 font-mono text-[11px] text-[#8A8680]">
                        搜尋中…
                      </p>
                    )}
                    {catalogSearch.error && (
                      <p className="px-3 py-2 font-mono text-[11px] text-warning">
                        {catalogSearch.error}
                      </p>
                    )}
                    {catalogSearch.results.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectCatalogSuggestion(item)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[rgba(212,165,116,0.08)] border-b border-white/5 last:border-b-0"
                      >
                        <div className="relative w-14 h-[4.5rem] shrink-0 rounded-md overflow-hidden bg-[#17130f] border border-white/10">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            width={56}
                            height={72}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-sans text-[13px] text-[#eae1da] truncate">
                            {item.name}
                          </p>
                          <p className="font-mono text-[10px] text-[#8A8680] truncate mt-0.5">
                            {[
                              item.displayId,
                              item.rarity,
                              item.pokemonStage,
                              item.cardNumber,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </button>
                    ))}
                    {catalogSearch.hasMore && (
                      <p className="px-3 py-2 font-mono text-[10px] text-[#8A8680] border-t border-white/5 leading-relaxed">
                        顯示最相關的 {catalogSearch.results.length} 筆，共{" "}
                        {catalogSearch.total.toLocaleString()} 筆符合
                        {catalogSearch.total > 50
                          ? " — 請輸入更精確的編號或名稱以縮小範圍"
                          : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          ) : null}

          {sellPrefill ? (
            <p className="font-mono text-[11px] text-[#8A8680] leading-relaxed">
              卡牌與規格已從收藏庫帶入。請上傳 6 張實物相片並確認放售價格。
            </p>
          ) : null}

          {catalogSearch.selected && (
            <div className="flex items-center gap-2 rounded-lg border border-brand/15 bg-[rgba(212,165,116,0.04)] px-2 py-1.5">
              <div className="relative w-9 h-11 shrink-0 rounded overflow-hidden bg-[#17130f] border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={catalogSearch.selected.imageUrl}
                  alt={catalogSearch.selected.name}
                  width={56}
                  height={72}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[12px] text-[#eae1da] font-semibold truncate leading-tight">
                  {catalogSearch.selected.name}
                </p>
                <p className="font-mono text-[10px] text-brand truncate leading-tight">
                  {itemType === "box_set"
                    ? catalogSearch.selected.setCode || "—"
                    : catalogSearch.selected.displayId ??
                      catalogSearch.selected.cardNumber ??
                      "—"}
                </p>
                {itemType === "card" && catalogSearch.selected.rarity && (
                  <p className="font-mono text-[10px] text-[#8A8680] mt-0.5 truncate">
                    {catalogSearch.selected.rarity}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* === 2. OPTIONAL EXPANSION + GRADING (compact row) === */}
          {!sellPrefill ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="font-mono text-[10px] text-[#8A8680]">
                擴充包系列
                <span className="text-text-disabled font-normal"> (選填)</span>
              </label>
              <input
                type="text"
                placeholder="選填"
                value={set}
                onChange={(e) => setSet(e.target.value)}
                className="w-full h-9 bg-[#17130f] border border-white/5 rounded-lg px-3 text-[12px] text-[#eae1da] placeholder-[#50453b] focus:outline-none focus:border-brand/30"
              />
            </div>
            {itemType === "card" ? (
              <div className="space-y-1">
                <label className="font-mono text-[10px] text-[#8A8680]">
                  鑑定／品相
                </label>
                <ListingGradingSelect
                  value={gradingOptionId}
                  onValueChange={setGradingOptionId}
                  variant="create"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="font-mono text-[10px] text-[#8A8680]">
                  密封狀態
                </label>
                <div className="flex gap-1.5">
                  {(
                    [
                      { value: "SEALED" as const, label: "密封" },
                      { value: "UNSEALED" as const, label: "已開封" },
                    ] as const
                  ).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSealState(value)}
                      className={`flex-1 h-9 rounded-lg border font-mono text-[11px] transition-colors ${
                        sealState === value
                          ? "border-brand bg-[rgba(212,165,116,0.12)] text-brand"
                          : "border-white/10 bg-[#17130f] text-[#d4c4b7]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          ) : null}

          {itemType === "box_set" && sellPrefill ? (
            <div className="space-y-1">
              <label className="font-mono text-[10px] text-[#8A8680]">
                密封狀態
              </label>
              <div className="flex gap-1.5">
                {(
                  [
                    { value: "SEALED" as const, label: "密封" },
                    { value: "UNSEALED" as const, label: "已開封" },
                  ] as const
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSealState(value)}
                    className={`flex-1 h-9 rounded-lg border font-mono text-[11px] transition-colors ${
                      sealState === value
                        ? "border-brand bg-[rgba(212,165,116,0.12)] text-brand"
                        : "border-white/10 bg-[#17130f] text-[#d4c4b7]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {mode === "merch" ? (
            <CardListingMerchFields
              idPrefix="add-asset"
              price={sellingPrice}
              onPriceChange={setSellingPrice}
              gradingOptionId={gradingOptionId}
              onGradingOptionChange={setGradingOptionId}
              gradingVariant="create"
              showGrading={false}
              showAuthToggle={showMerchAuthToggle}
              acceptsBuyerAuth={acceptsBuyerAuth}
              onAcceptsBuyerAuthChange={setAcceptsBuyerAuth}
              conditionDesc={conditionDesc}
              onConditionDescChange={setConditionDesc}
              showExtraShipping={addAssetSellerPersona === "merchant"}
              extraShippingFee={extraShippingFee}
              onExtraShippingFeeChange={setExtraShippingFee}
              itemKind={itemType}
              photoMode="create"
              createPhotoSlots={photoSlots}
              onCreatePhotoSlotClick={openPhotoPicker}
              onCreatePhotoSlotRemove={handleRemovePhotoSlot}
              onCreatePhotoDescriptionChange={(index, value) => {
                setPhotoSlots((prev) =>
                  prev.map((slot, idx) =>
                    idx === index ? { ...slot, description: value } : slot,
                  ),
                );
              }}
            />
          ) : null}

          {/* === 5. MODE-SPECIFIC VALUE FIELDS === */}
          {mode === "hobby" ? (
            <div className="space-y-1.5 animate-fadeIn">
              <label className="font-sans font-bold text-[#d4c4b7]">
                入手成本 (HK$)
              </label>
              <input
                type="number"
                placeholder="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                className="w-full h-10 bg-[#17130f] border border-white/5 rounded-xl px-3 text-brand focus:outline-none font-mono"
              />
            </div>
          ) : null}

          <input
            type="file"
            ref={fileInputRef}
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
            multiple
            onChange={handleImageChange}
            className="hidden"
          />
          </div>

          <div className="shrink-0 px-3 py-1.5 border-t border-white/[0.06] bg-[#2e2925]">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-9 bg-brand hover:bg-[#e8b896] disabled:opacity-60 disabled:cursor-not-allowed text-[#1A1612] font-sans font-bold text-[12px] rounded-lg active:scale-[0.98] transition-all cursor-pointer focus:outline-none flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                "上載中…"
              ) : sellPrefill ? (
                <>
                  <Rocket className="size-4 shrink-0" strokeWidth={2.25} />
                  確認上架發售
                </>
              ) : mode === "hobby" ? (
                <>
                  <Star className="size-4 shrink-0" strokeWidth={2.25} />
                  收錄至私藏愛好
                </>
              ) : (
                <>
                  <Rocket className="size-4 shrink-0" strokeWidth={2.25} />
                  立即發佈商品上架
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
    <CollectionAddAfterListingDialog
      payload={collectionAddPrompt}
      onClose={() => setCollectionAddPrompt(null)}
    />
  </>
  );
}

// 快捷全域派發器
export const triggerGlobalAddAssetModal = (
  defaultMode: "hobby" | "merch" = "hobby",
) => {
  useUIStore.getState().openAddAssetModal({ mode: defaultMode });
};
