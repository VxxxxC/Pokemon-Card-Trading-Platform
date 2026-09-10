"use client";

import { useState, useRef, useMemo } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { useProductCatalogSearch } from "@/app/lib/hooks/useProductCatalogSearch";
import {
  defaultSealedProductScore,
  type SealedProductScore,
} from "@/lib/catalog/item-kind";
import { submitSealedListingWithProgress } from "@/lib/listings/submit-sealed-listing";
import { validateCreateSealedListing } from "@/lib/listings/validation";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LISTING_IMAGE_MAX,
  LISTING_PHOTO_SLOT_LABELS,
} from "@/lib/listings/images";

/** 平台主題輸入框基準樣式（黑金量產規格） */
const INPUT_BASE =
  "bg-[#17130f] border border-white/5 rounded-xl h-11 text-text-primary px-4";

/** Textarea 基準樣式（對齊 EditCardInstanceDialog） */
const TEXTAREA_BASE =
  "bg-[#17130f] border border-white/5 rounded-xl text-text-primary px-4 py-3 font-sans text-[13px] w-full focus:outline-none placeholder-text-disabled resize-none leading-relaxed";

/** 複合輸入群組外框（內部欄位自帶 padding，故外框不掛 px-4） */
const INPUT_GROUP_BASE =
  "flex items-center bg-[#17130f] border border-white/5 rounded-xl h-11 text-text-primary overflow-hidden";

/**
 * 新增商品上架表單 — React 19 原生非受控表單 Actions 與受控實物相片管理。
 */
export function NewListingForm() {
  const [photos, setPhotos] = useState<
    { url: string; remark: string; file: File | null }[]
  >(
    Array.from({ length: 6 }, () => ({
      url: "",
      remark: "",
      file: null,
    })),
  );
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🟢 核心對齊：引進 3 軌狀態控制與級聯連動機制
  const [selectedGrader, setSelectedGrader] = useState<string>("PSA"); // "RAW", "PSA", "CGC", "BGS", "ARS"
  const [selectedScore, setSelectedScore] = useState<string>("10");    // "1" through "10"
  const [selectedCondition, setSelectedCondition] = useState<string>("A"); // "A", "B", "C", "D"

  // 🏛️ Symmetrical Item-Type Switch State
  const [itemType, setItemType] = useState<"card" | "box_set">("card");
  const [cardQuery, setCardQuery] = useState("");
  const [sealState, setSealState] = useState<SealedProductScore>(
    defaultSealedProductScore(),
  );
  const catalogItemType = itemType === "box_set" ? "box_set" : "card";
  const catalogSearch = useProductCatalogSearch(catalogItemType);

  const isScoreDisabled = selectedGrader === "RAW";

  // 🟢 核心對齊：動態評級分數範圍矩陣 (Enterprise-Grade Grading Scale Matrix)
  const graderScoreOptions = useMemo(() => {
    if (selectedGrader === "RAW") return [];
    if (selectedGrader === "PSA") return ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"];
    if (selectedGrader === "ARS") return ["10+", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1"];
    if (selectedGrader === "BGS") {
      return ["10 (Black Label)", "10 (Pristine)", "9.5", "9.0", "8.5", "8.0", "7.5", "7.0", "6.5", "6.0", "5.0", "4.0", "3.0", "2.0", "1.0"];
    }
    if (selectedGrader === "CGC") {
      return ["10 (Pristine)", "10 (Gem Mint)", "9.5", "9.0", "8.5", "8.0", "7.5", "7.0", "6.5", "6.0", "5.0", "4.0", "3.0", "2.0", "1.0"];
    }
    return ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"];
  }, [selectedGrader]);

  // 🟢 核心對齊：自動初始化分數防線
  const getFirstScoreForGrader = (grader: string): string => {
    if (grader === "RAW") return "";
    if (grader === "PSA") return "10";
    if (grader === "ARS") return "10+";
    if (grader === "BGS") return "10 (Black Label)";
    if (grader === "CGC") return "10 (Pristine)";
    return "10";
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const newUrl = URL.createObjectURL(file);

    if (activeSlotIndex !== null) {
      setPhotos((prev) => {
        const next = [...prev];
        next[activeSlotIndex] = {
          ...next[activeSlotIndex],
          url: newUrl,
          file,
        };
        return next;
      });
      setActiveSlotIndex(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveImage = (index: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], url: "", file: null };
      return next;
    });
  };

  // Dynamic Chip Visual Simulation based on cardQuery contents
  const boxSetBadge = useMemo(() => {
    if (itemType !== "box_set" || !cardQuery) return null;
    const lower = cardQuery.toLowerCase();
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
  }, [itemType, cardQuery]);

  async function publishListing(formData: FormData) {
    const validPhotosCount = photos.filter((p) => p.url).length;
    if (itemType === "card") {
      if (validPhotosCount < LISTING_IMAGE_MAX) {
        toast.error(
          "⚠️ 新增商品失敗！大盤為保證品相真實性，強制規定必須上載全部 6 張卡牌相片（正面、背面及四個角）。"
        );
        return;
      }

      const cardQueryValue = String(formData.get("card-query") ?? "");
      toast.success(`「${cardQueryValue || "新商品"}」已提交上架（單卡流程待後端接通）`);
      window.dispatchEvent(new CustomEvent("inventory-should-refresh"));
      return;
    }

    if (validPhotosCount < 1) {
      toast.error(
        "新增 Box/Set 失敗！必須至少上載 1 張商品實物相片以資證明物況。"
      );
      return;
    }

    if (!catalogSearch.selected) {
      toast.error("請從搜尋結果中選擇盒組商品");
      return;
    }

    const price = Number(formData.get("ask-price"));
    const extraShippingFee = Number(formData.get("extraShippingFee") ?? 0);

    const imageFiles = photos
      .map((photo) => photo.file)
      .filter((file): file is File => file !== null);

    const validationError = validateCreateSealedListing(
      {
        productId: catalogSearch.selected.id,
        price,
      },
      imageFiles,
    );

    if (validationError) {
      toast.error(validationError);
      return;
    }

    const result = await submitSealedListingWithProgress({
      productId: catalogSearch.selected.id,
      price,
      extraShippingFee,
      sellerPersona: "merchant",
      imageFiles,
      sealState,
    });

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(`「${catalogSearch.selected.name}」已成功上架`);
    window.dispatchEvent(new CustomEvent("inventory-should-refresh"));
  }

  return (
    <form action={publishListing} className="space-y-4">
      {/* Symmetrical Item-Type Sharding Switch Chassis */}
      <div className="relative flex bg-[#17130f] rounded-xl p-1 border border-[rgba(237,232,224,0.08)] w-full max-w-xs mb-4 select-none">
        <div
          className="absolute top-1 bottom-1 rounded-lg bg-[rgba(212,165,116,0.14)] border border-[rgba(212,165,116,0.22)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none"
          style={{
            width: "calc(50% - 4px)",
            transform:
              itemType === "card"
                ? "translateX(0)"
                : "translateX(calc(100% + 4px))",
          }}
        />
        <button
          type="button"
          onClick={() => setItemType("card")}
          className={`relative flex-1 h-9 font-sans text-[13px] font-bold rounded-lg transition-colors z-10 ${
            itemType === "card"
              ? "text-brand"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          單卡交易 (CARD)
        </button>
        <button
          type="button"
          onClick={() => setItemType("box_set")}
          className={`relative flex-1 h-9 font-sans text-[13px] font-bold rounded-lg transition-colors z-10 ${
            itemType === "box_set"
              ? "text-brand"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          密封盒組 (BOX/SET)
        </button>
      </div>

      {/* 隱藏輔助欄位，保障 React 19 FormData 相容性 */}
      {itemType === "card" ? (
        <>
          <input
            type="hidden"
            name="card-grade"
            value={
              isScoreDisabled
                ? "RAW"
                : `${selectedGrader} ${selectedScore}`.trim()
            }
          />
          <input type="hidden" name="card-condition" value={selectedCondition} />
        </>
      ) : null}

      {itemType === "box_set" ? (
        <div className="space-y-1.5">
          <label className="font-mono text-[12px] text-text-secondary block">
            密封狀態
          </label>
          <div className="flex gap-2 max-w-xs">
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
                className={`flex-1 h-9 rounded-lg border font-mono text-[12px] ${
                  sealState === value
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-white/10 text-text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Row 1: 卡牌搜尋 + 售價 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="card-query"
              className="font-mono text-[12px] text-text-secondary block"
            >
              {itemType === "box_set" ? "盒組／禮盒名稱搜尋" : "卡牌編號 / 名稱搜尋"} <span className="text-warning">*</span>
            </label>
            {boxSetBadge}
          </div>
          <div className={INPUT_GROUP_BASE}>
            <input
              id="card-query"
              name="card-query"
              type="text"
              required
              placeholder={itemType === "box_set" ? "例：151 Booster Box 或 20th Anniversary Set" : "sv2a-182 或 Charizard ex SAR"}
              value={cardQuery}
              onChange={(e) => {
                setCardQuery(e.target.value);
                catalogSearch.setQuery(e.target.value);
              }}
              className="flex-1 h-full bg-transparent px-4 font-sans text-[14px] text-text-primary placeholder-text-disabled focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void catalogSearch.searchNow()}
              className="px-3 h-full font-mono text-[11px] text-brand hover:bg-[rgba(212,165,116,0.08)] transition-colors border-l border-white/5 cursor-pointer"
            >
              搜尋
            </button>
          </div>
          {catalogSearch.results.length > 0 ? (
            <div className="mt-2 space-y-1">
              {catalogSearch.results.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={() => {
                    catalogSearch.selectSuggestion(suggestion);
                    setCardQuery(suggestion.name);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg border border-white/5 bg-[#17130f] hover:border-brand/30"
                >
                  <span className="font-sans text-[13px] text-text-primary">
                    {suggestion.name}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div>
          <label
            htmlFor="ask-price"
            className="font-mono text-[12px] text-text-secondary block mb-1.5"
          >
            售價 (HK$) <span className="text-warning">*</span>
          </label>
          <div className={INPUT_GROUP_BASE}>
            <span className="px-3 font-mono text-[13px] text-text-disabled border-r border-white/5 shrink-0">
              HK$
            </span>
            <input
              id="ask-price"
              name="ask-price"
              type="number"
              min={1}
              required
              placeholder="0"
              className="flex-1 h-full bg-transparent px-3 font-mono text-[14px] text-text-primary focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="extra-shipping-fee"
            className="font-mono text-[12px] text-text-secondary block mb-1.5"
          >
            附加運費 (HK$)
          </label>
          <div className={INPUT_GROUP_BASE}>
            <span className="px-3 font-mono text-[13px] text-text-disabled border-r border-white/5 shrink-0">
              HK$
            </span>
            <input
              id="extra-shipping-fee"
              name="extraShippingFee"
              type="number"
              min={0}
              max={200}
              step={1}
              placeholder="0"
              className="flex-1 h-full bg-transparent px-3 font-mono text-[14px] text-text-primary focus:outline-none"
            />
          </div>
          <p className="mt-1 font-mono text-[11px] text-text-disabled">
            選填，疊加店舖基本運費
          </p>
        </div>
      </div>

      {/* Row 2: 3-Column Cascading Dropdowns */}
      {itemType === "card" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="font-mono text-[12px] text-text-secondary block">鑑定機構</label>
            <Select
              value={selectedGrader}
              onValueChange={(val) => {
                const safeVal = val ?? "RAW";
                setSelectedGrader(safeVal);
                if (safeVal === "RAW") {
                  setSelectedScore("");
                } else {
                  setSelectedScore(getFirstScoreForGrader(safeVal));
                }
              }}
            >
              <SelectTrigger className="w-full h-11 bg-[#17130f] border border-white/5 rounded-xl px-4 text-text-primary focus:ring-0">
                <SelectValue placeholder="選擇鑑定機構" />
              </SelectTrigger>
              <SelectContent className="bg-[#26211C] border border-white/10 text-text-primary">
                <SelectGroup>
                  <SelectLabel>認證鑑定機構 (Grader)</SelectLabel>
                  <SelectItem value="RAW">裸卡 (RAW)</SelectItem>
                  <SelectItem value="PSA">PSA</SelectItem>
                  <SelectItem value="CGC">CGC</SelectItem>
                  <SelectItem value="BGS">BGS</SelectItem>
                  <SelectItem value="ARS">ARS</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[12px] text-text-secondary block">鑑定等級</label>
            <Select
              value={selectedScore}
              onValueChange={(val) => setSelectedScore(val ?? "")}
              disabled={isScoreDisabled}
            >
              <SelectTrigger className="w-full h-11 bg-[#17130f] border border-white/5 rounded-xl px-4 text-text-primary focus:ring-0 disabled:opacity-40">
                <SelectValue placeholder={isScoreDisabled ? "裸卡無分數" : "選擇分數"} />
              </SelectTrigger>
              <SelectContent className="bg-[#26211C] border border-white/10 text-text-primary">
                <SelectGroup>
                  <SelectLabel>鑑定評級分數</SelectLabel>
                  {graderScoreOptions.map((score) => (
                    <SelectItem key={score} value={score}>
                      {score}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[12px] text-text-secondary block">品相分級</label>
            <Select
              value={selectedCondition}
              onValueChange={(val) => setSelectedCondition(val ?? "A")}
            >
              <SelectTrigger className="w-full h-11 bg-[#17130f] border border-white/5 rounded-xl px-4 text-text-primary focus:ring-0">
                <SelectValue placeholder="選擇品相分級" />
              </SelectTrigger>
              <SelectContent className="bg-[#26211C] border border-white/10 text-text-primary">
                <SelectGroup>
                  <SelectLabel>玩家品相指標</SelectLabel>
                  <SelectItem value="A">【A 級 — 美品】</SelectItem>
                  <SelectItem value="B">【B 級 — 微傷】</SelectItem>
                  <SelectItem value="C">【C 級 — 有傷】</SelectItem>
                  <SelectItem value="D">【D 級 — 嚴重傷】</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Row 3: 品相備註 */}
      <div className="space-y-1.5">
        <label
          htmlFor="condition-notes"
          className="font-mono text-[12px] text-text-secondary block"
        >
          品相備註
        </label>
        <input
          id="condition-notes"
          name="condition-notes"
          type="text"
          placeholder="例：角落完美，居中良好"
          className={`w-full font-sans text-[14px] placeholder-text-disabled focus:outline-none ${INPUT_BASE}`}
        />
      </div>

      {/* Row 4: 品相描述（詳細）+ 邊角磨損屬性（both optional） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="condition-desc"
            className="font-mono text-[12px] text-text-secondary block mb-1.5"
          >
            品相描述（詳細）
            <span className="ml-1.5 text-text-disabled font-normal">選填</span>
          </label>
          <textarea
            id="condition-desc"
            name="condition-desc"
            rows={3}
            placeholder="詳細描述卡面狀況、印刷品質、鏡面完整度等..."
            className={TEXTAREA_BASE}
          />
        </div>
        <div>
          <label
            htmlFor="edge-wear"
            className="font-mono text-[12px] text-text-secondary block mb-1.5"
          >
            邊角磨損屬性
            <span className="ml-1.5 text-text-disabled font-normal">選填</span>
          </label>
          <textarea
            id="edge-wear"
            name="edge-wear"
            rows={3}
            placeholder="描述各角磨損、白邊情況、封殼狀態..."
            className={TEXTAREA_BASE}
          />
        </div>
      </div>

      {/* Photo Upload — adaptive limits */}
      <div>
        <p className="font-mono text-[12px] text-text-secondary block mb-1.5">
          {itemType === "box_set" ? "實物照片 (必須至少 1 張)" : "實物照片 (必須 6 張)"} <span className="text-warning">*</span>
        </p>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
          {photos.map((photo, i) => {
            const isRequired = itemType === "box_set" ? i < 1 : i < LISTING_IMAGE_MAX;
            const slotLabel =
              itemType === "card" ? LISTING_PHOTO_SLOT_LABELS[i] : null;
            return (
              <div key={i} className="flex flex-col">
                <div
                  className={`relative aspect-[3/4] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors overflow-hidden ${
                    photo.url
                      ? "border-brand/30 bg-[#17130f]"
                      : isRequired
                      ? "border-brand/40 bg-[rgba(212,165,116,0.06)]"
                      : "border-[rgba(237,232,224,0.12)] bg-[#17130f] hover:border-brand/30"
                  }`}
                  onClick={() => {
                    if (photo.url) return;
                    setActiveSlotIndex(i);
                    fileInputRef.current?.click();
                  }}
                >
                  {photo.url ? (
                    <>
                      <Image
                        src={photo.url}
                        alt={slotLabel ?? `實體照 ${i + 1}`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveImage(i);
                        }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 text-white hover:bg-brand hover:text-[#1A1612] flex items-center justify-center font-sans text-[10px] font-black cursor-pointer transition-colors focus:outline-none"
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={isRequired ? "#d4a574" : "#50453b"}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <span className="font-mono text-[9px] text-text-disabled mt-1">
                        {isRequired ? "必填" : "選填"}
                      </span>
                    </>
                  )}
                </div>
                {slotLabel ? (
                  <span className="font-mono text-[9px] text-text-disabled text-center mt-1">
                    {slotLabel}
                  </span>
                ) : null}
                <input
                  type="text"
                  name={`photo-remark-${i}`}
                  placeholder="照片備註（例：背面左上角微白）"
                  value={photo.remark}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPhotos((prev) => {
                      const next = [...prev];
                      next[i] = { ...next[i], remark: val };
                      return next;
                    });
                  }}
                  className="w-full bg-[#17130f] border border-white/5 rounded-lg h-8 px-2 font-sans text-[11px] text-text-primary focus:outline-none placeholder-text-disabled mt-1.5"
                />
              </div>
            );
          })}
        </div>
        <p className="font-mono text-[10px] text-text-disabled mt-1.5">
          {itemType === "box_set" 
            ? "請上載商品正面或外包裝實拍，確保封膜完整度與盒況透明。最大 10MB / 張。"
            : "請拍攝正面、背面及四個角，確保品相透明。最大 10MB / 張。"}
        </p>
      </div>

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleImageChange}
        className="hidden"
      />

      {/* Action Footer: 商品上架 toggle (left) + confirm button (right) */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer group select-none shrink-0">
          <input
            type="checkbox"
            name="is-active"
            defaultChecked={true}
            className="w-4 h-4 rounded accent-brand cursor-pointer"
          />
          <span className="font-mono text-[13px] text-text-secondary group-hover:text-text-primary transition-colors">
            商品上架
          </span>
        </label>
        <button
          type="submit"
          className="flex-1 h-11 bg-brand text-[#17130f] font-sans font-semibold text-[14px] rounded-xl hover:bg-brand-hover active:scale-[0.98] active:translate-y-px transition-transform cursor-pointer"
        >
          確認新增商品
        </button>
      </div>
    </form>
  );
}
