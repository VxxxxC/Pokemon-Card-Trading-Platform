"use client";

import { useEffect, useState } from "react";
import { Accordion } from "@/app/components/ui/Accordion";
import { getMarketplaceRarities } from "@/app/actions/marketplace";
import { Slider } from "@/components/ui/slider";
import {
  GRADING_OPTION_GROUPS,
  getGradingOptionsByGroup,
  type GradingOption,
} from "@/lib/grading/options";
import {
  MARKETPLACE_PRODUCT_KIND_OPTIONS,
  MARKETPLACE_SEAL_STATE_OPTIONS,
  MARKETPLACE_SELLER_SOURCE_OPTIONS,
} from "@/lib/marketplace/filter-options";

interface AccordionFiltersProps {
  activeRarities: string[];
  onRarityToggle: (rarity: string) => void;
  activeGrades: string[];
  onGradeToggle: (grade: string) => void;
  activeTypes?: string[];
  onTypeToggle?: (type: string) => void;
  activeProductKinds?: string[];
  onProductKindToggle?: (kind: string) => void;
  hideTypeSection?: boolean;
  hideProductKindSection?: boolean;
  /** Optional override; defaults to distinct `product_catalog.rarity` values. */
  rarities?: string[];
  /** When true, skip internal fetch. */
  disableRarityFetch?: boolean;
  /** Tighter chip layout for mobile slide-over panels. */
  compact?: boolean;
  priceRange?: [number, number];
  onPriceRangeChange?: (range: [number, number]) => void;
  priceMin?: number;
  priceMax?: number;
}

function getGradeChipLabel(option: GradingOption, groupLabel: string): string {
  const prefix = `${groupLabel} `;
  if (option.label.startsWith(prefix)) {
    return option.label.slice(prefix.length);
  }
  return option.label;
}

export function AccordionFilters({
  activeRarities,
  onRarityToggle,
  activeGrades,
  onGradeToggle,
  activeTypes = [],
  onTypeToggle,
  activeProductKinds = [],
  onProductKindToggle,
  hideTypeSection = false,
  hideProductKindSection = false,
  rarities: raritiesProp,
  disableRarityFetch = false,
  compact = false,
  priceRange,
  onPriceRangeChange,
  priceMin,
  priceMax,
}: AccordionFiltersProps) {
  const showPriceSection =
    priceRange != null &&
    onPriceRangeChange != null &&
    priceMin != null &&
    priceMax != null;

  const [openSections, setOpenSections] = useState({
    price: true,
    productKind: true,
    rarity: true,
    grade: !compact,
    type: true,
  });
  const [catalogRarities, setCatalogRarities] = useState<string[]>([]);
  const [raritiesLoading, setRaritiesLoading] = useState(
    !raritiesProp && !disableRarityFetch,
  );

  useEffect(() => {
    if (raritiesProp || disableRarityFetch) return;

    let cancelled = false;

    void (async () => {
      setRaritiesLoading(true);
      const result = await getMarketplaceRarities();
      if (cancelled) return;

      if (result.success) {
        setCatalogRarities(result.data);
      }
      setRaritiesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [raritiesProp, disableRarityFetch]);

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const rarities = (raritiesProp ?? catalogRarities).filter(
    (rarity) => rarity.toLowerCase() !== "common",
  );

  const showCardGradeGroups =
    activeProductKinds.length === 0 ||
    activeProductKinds.includes("single_card");
  const showSealStateSection =
    activeProductKinds.length === 0 ||
    activeProductKinds.includes("sealed_product");

  const chipClass = (isActive: boolean) =>
    compact
      ? `h-6 px-2 rounded-md font-mono text-[10px] font-medium border transition-all active:scale-95 ${
          isActive
            ? "bg-[rgba(212,165,116,0.15)] text-[#d4a574] border-[#d4a574]/40"
            : "bg-[#17130f] text-[#d4c4b7] border-[rgba(237,232,224,0.08)] hover:border-[rgba(212,165,116,0.20)]"
        }`
      : `h-7 px-3 rounded-[6px] font-mono text-[11px] font-medium border transition-all active:scale-95 ${
          isActive
            ? "bg-[rgba(212,165,116,0.15)] text-[#d4a574] border-[#d4a574]/40"
            : "bg-[#17130f] text-[#d4c4b7] border-[rgba(237,232,224,0.08)] hover:border-[rgba(212,165,116,0.20)]"
        }`;

  const renderChip = (
    key: string,
    label: string,
    isActive: boolean,
    onToggle: () => void,
  ) => (
    <button
      key={key}
      type="button"
      onClick={onToggle}
      className={chipClass(isActive)}
    >
      {label}
    </button>
  );

  const renderCheckboxOption = (
    key: string,
    label: string,
    isActive: boolean,
    onToggle: () => void,
    labelClassName = "font-sans text-[13px]",
  ) => (
    <button
      key={key}
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2.5 w-full text-left py-1 group/item"
    >
      <div
        className={`w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0 ${
          isActive
            ? "bg-[#d4a574] border-[#d4a574]"
            : "border-[rgba(237,232,224,0.20)] group-hover/item:border-[#d4a574]/50"
        }`}
      >
        {isActive && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1A1612"
            strokeWidth="3.5"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <span
        className={`${labelClassName} transition-colors ${
          isActive
            ? "text-[#eae1da] font-medium"
            : "text-[#d4c4b7] group-hover/item:text-[#eae1da]"
        }`}
      >
        {label}
      </span>
    </button>
  );

  const shellClass = compact
    ? "space-y-0 bg-[#26211C] p-3 rounded-xl border border-white/[0.06]"
    : "space-y-1 bg-[#26211C] p-4 rounded-2xl border border-[rgba(237,232,224,0.08)]";

  return (
    <div className={shellClass}>
      {showPriceSection ? (
        <Accordion
          title="價格區間 (HK$)"
          isOpen={openSections.price}
          onToggle={() => toggleSection("price")}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-[#8A8680]">HK$</span>
              <span className="font-mono text-[10px] text-brand font-bold shrink-0">
                {priceRange[0].toLocaleString()} — {priceRange[1].toLocaleString()}
              </span>
            </div>
            <Slider
              value={priceRange}
              onValueChange={(val) =>
                onPriceRangeChange(val as [number, number])
              }
              min={priceMin}
              max={priceMax}
              step={50}
              className="w-full"
            />
          </div>
        </Accordion>
      ) : null}

      {!hideProductKindSection && (
        <Accordion
          title="商品類型"
          isOpen={openSections.productKind}
          onToggle={() => toggleSection("productKind")}
        >
          <div className={compact ? "flex flex-wrap gap-1.5" : "space-y-2"}>
            {MARKETPLACE_PRODUCT_KIND_OPTIONS.map(({ key, label }) =>
              compact
                ? renderChip(
                    key,
                    label,
                    activeProductKinds.includes(key),
                    () => onProductKindToggle?.(key),
                  )
                : renderCheckboxOption(
                    key,
                    label,
                    activeProductKinds.includes(key),
                    () => onProductKindToggle?.(key),
                  ),
            )}
          </div>
        </Accordion>
      )}

      {!hideTypeSection && (
        <Accordion
          title="刊登來源"
          isOpen={openSections.type}
          onToggle={() => toggleSection("type")}
        >
          <div className={compact ? "flex flex-wrap gap-1.5" : "space-y-2"}>
            {MARKETPLACE_SELLER_SOURCE_OPTIONS.map(({ key, label }) =>
              compact
                ? renderChip(
                    key,
                    label,
                    activeTypes.includes(key),
                    () => onTypeToggle?.(key),
                  )
                : renderCheckboxOption(
                    key,
                    label,
                    activeTypes.includes(key),
                    () => onTypeToggle?.(key),
                  ),
            )}
          </div>
        </Accordion>
      )}

      <Accordion
        title="稀有度"
        isOpen={openSections.rarity}
        onToggle={() => toggleSection("rarity")}
      >
        {raritiesLoading ? (
          <p className="font-mono text-[11px] text-[#8A8680]">載入稀有度選項…</p>
        ) : rarities.length === 0 ? (
          <p className="font-mono text-[11px] text-[#8A8680]">暫無稀有度資料</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {rarities.map((rarity) =>
              renderChip(
                rarity,
                rarity,
                activeRarities.includes(rarity),
                () => onRarityToggle(rarity),
              ),
            )}
          </div>
        )}
      </Accordion>

      <Accordion
        title="鑑定／品相"
        isOpen={openSections.grade}
        onToggle={() => toggleSection("grade")}
        className={compact ? "border-b-0" : ""}
      >
        <div
          className={
            compact
              ? "space-y-2.5 max-h-52 overflow-y-auto pr-0.5 scrollbar-none"
              : "max-h-72 overflow-y-auto space-y-4 pr-1 scrollbar-none"
          }
        >
          {showCardGradeGroups
            ? GRADING_OPTION_GROUPS.map((group) => (
                <div key={group.key}>
                  <p className="font-mono text-[9px] text-[#8A8680] uppercase tracking-wider mb-1.5">
                    {group.label}
                  </p>
                  {compact ? (
                    <div className="flex flex-wrap gap-1.5">
                      {getGradingOptionsByGroup(group.key).map((option) =>
                        renderChip(
                          option.id,
                          getGradeChipLabel(option, group.label),
                          activeGrades.includes(option.id),
                          () => onGradeToggle(option.id),
                        ),
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {getGradingOptionsByGroup(group.key).map((option) =>
                        renderCheckboxOption(
                          option.id,
                          option.label,
                          activeGrades.includes(option.id),
                          () => onGradeToggle(option.id),
                          "font-mono text-[12px]",
                        ),
                      )}
                    </div>
                  )}
                </div>
              ))
            : null}

          {showSealStateSection ? (
            <div>
              <p className="font-mono text-[9px] text-[#8A8680] uppercase tracking-wider mb-1.5">
                盒組狀態
              </p>
              {compact ? (
                <div className="flex flex-wrap gap-1.5">
                  {MARKETPLACE_SEAL_STATE_OPTIONS.map(({ key, label }) =>
                    renderChip(
                      key,
                      label,
                      activeGrades.includes(key),
                      () => onGradeToggle(key),
                    ),
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {MARKETPLACE_SEAL_STATE_OPTIONS.map(({ key, label }) =>
                    renderCheckboxOption(
                      key,
                      label,
                      activeGrades.includes(key),
                      () => onGradeToggle(key),
                      "font-mono text-[12px]",
                    ),
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </Accordion>
    </div>
  );
}
