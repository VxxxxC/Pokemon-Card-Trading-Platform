"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SmartSearch } from "@/app/components/marketplace/filters/SmartSearch";
import { CatalogCard } from "@/app/components/admin/CatalogCard";
import { ImageViewer } from "@/app/components/shared/ImageViewer";
import { Pagination } from "@/app/components/ui/Pagination";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";
import {
  listAdminCatalogEntries,
  type AdminCatalogEntry,
  type AdminCatalogItemKind,
  type ListAdminCatalogParams,
} from "@/app/actions/adminCatalog";
import {
  type CatalogType,
} from "@/lib/constants/commerce";
import {
  FILTER_CHIP_CLASS,
  FILTER_CHIP_SM_CLASS,
  FILTER_INPUT_CLASS,
  FILTER_SEARCH_CLASS,
  FILTER_SELECT_TRIGGER_CLASS,
  MANUAL_FIELD_ERROR_CLASS,
  MANUAL_FORM_BLOCK_CLASS,
  MANUAL_INPUT_CLASS,
  MANUAL_INPUT_MONO_CLASS,
  MANUAL_LABEL_CLASS,
  MANUAL_SECTION_CLASS,
  MANUAL_SELECT_TRIGGER_CLASS,
  SELECT_CONTENT_CLASS,
  SELECT_ITEM_CLASS,
} from "./catalog-ui";

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;

const RARITY_OPTIONS = [
  { value: "SAR", label: "SAR" },
  { value: "UR", label: "UR" },
  { value: "SR", label: "SR" },
  { value: "AR", label: "AR" },
  { value: "RR", label: "RR" },
  { value: "R", label: "R" },
  { value: "U", label: "U" },
  { value: "C", label: "C" },
  { value: "Holo", label: "Holo" },
  { value: "PROMO", label: "PROMO" },
];

const BOX_SET_CATEGORY_OPTIONS: { value: CatalogType | "jan_code"; label: string }[] = [
  { value: "booster_pack", label: "補充包" },
  { value: "gift_set", label: "禮盒組" },
  { value: "starter_deck", label: "起始牌組" },
  { value: "jan_code", label: "JAN 條碼規格" },
];

const RARITY_LABEL_BY_VALUE = Object.fromEntries(
  RARITY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<string, string>;

const BOX_SET_CATEGORY_LABEL_BY_VALUE = Object.fromEntries(
  BOX_SET_CATEGORY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<string, string>;

const RARITY_FILTER_LABEL_BY_VALUE: Record<string, string> = {
  all: "全部罕有度",
  ...RARITY_LABEL_BY_VALUE,
};

type ManualEntryBase = {
  id: string;
  cardNumber: string;
  setCode: string;
  nameEn: string;
  nameZh: string;
  nameJa: string;
  rarity: string;
  imageSource: string;
  createdAt: string;
};

type ManualCardEntry = ManualEntryBase & {
  itemKind: "card";
};

type ManualBoxSetEntry = ManualEntryBase & {
  itemKind: "box_set";
  category: CatalogType | "jan_code";
};

type ManualEntry = ManualCardEntry | ManualBoxSetEntry;

type FormErrors = {
  cardNumber?: boolean;
  setCode?: boolean;
  nameLanguages?: boolean;
  category?: boolean;
  image?: boolean;
  rarity?: boolean;
};

const BTN_OUTLINE_CLASS =
  "shrink-0 border-[rgba(237,232,224,0.12)] bg-transparent hover:border-brand/30 hover:bg-brand/10 hover:text-brand text-text-primary text-[12px] active:scale-[0.98]";

function formatCatalogCount(value: number): string {
  return value.toLocaleString("en-US");
}

function buildCatalogListParams(
  filters: {
    query?: string;
    setCode?: string;
    rarity?: string;
  },
  itemKind: AdminCatalogItemKind,
  page: number,
  pageSize: number,
): ListAdminCatalogParams {
  return {
    query: filters.query,
    itemKind,
    page,
    pageSize,
    ...(filters.setCode ? { setCode: filters.setCode } : {}),
    ...(filters.rarity ? { rarity: filters.rarity } : {}),
  };
}

export default function AdminCatalogPage() {
  // ── Catalog browsing state
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [setCodeFilter, setSetCodeFilter] = useState("");
  const [debouncedSetCode, setDebouncedSetCode] = useState("");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [itemKind, setItemKind] = useState<AdminCatalogItemKind>("card");
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<AdminCatalogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindCounts, setKindCounts] = useState<Record<AdminCatalogItemKind, number>>({
    card: 0,
    box_set: 0,
  });

  // ── Manual entry local state (db has no INSERT policy yet)
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [isManualDialogOpen, setIsManualDialogOpen] = useState(false);
  const [manualTab, setManualTab] = useState<AdminCatalogItemKind>("card");
  const [pendingManualEntries, setPendingManualEntries] = useState<
    Record<
      AdminCatalogItemKind,
      | Omit<ManualCardEntry, "id" | "itemKind" | "createdAt">
      | Omit<ManualBoxSetEntry, "id" | "itemKind" | "createdAt">
    >
  >({
    card: {
      cardNumber: "",
      setCode: "",
      nameEn: "",
      nameZh: "",
      nameJa: "",
      rarity: "",
      imageSource: "",
    },
    box_set: {
      cardNumber: "",
      setCode: "",
      nameEn: "",
      nameZh: "",
      nameJa: "",
      rarity: "",
      imageSource: "",
      category: "booster_pack",
    },
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [imagePreview, setImagePreview] = useState("");
  const [imageFileName, setImageFileName] = useState("");
  const objectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Image viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

  const catalogFilters = useMemo(
    () => ({
      query: debouncedQuery || undefined,
      setCode: debouncedSetCode || undefined,
      rarity: rarityFilter !== "all" ? rarityFilter : undefined,
    }),
    [debouncedQuery, debouncedSetCode, rarityFilter],
  );

  // ── Search debounce
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSetCode(setCodeFilter.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [setCodeFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, debouncedSetCode, rarityFilter, itemKind]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      listAdminCatalogEntries(
        buildCatalogListParams(catalogFilters, "card", 1, 1),
      ),
      listAdminCatalogEntries(
        buildCatalogListParams(catalogFilters, "box_set", 1, 1),
      ),
    ]).then(([cardResult, boxSetResult]) => {
      if (cancelled) {
        return;
      }
      setKindCounts({
        card: cardResult.success ? cardResult.total : 0,
        box_set: boxSetResult.success ? boxSetResult.total : 0,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [catalogFilters]);

  // ── Fetch catalog entries with race-condition guard
  useEffect(() => {
    let stale = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      const result = await listAdminCatalogEntries(
        buildCatalogListParams(catalogFilters, itemKind, page, PAGE_SIZE),
      );

      if (stale) return;

      if (!result.success) {
        setError(result.error);
        setEntries([]);
        setTotal(0);
        setIsLoading(false);
        return;
      }

      setEntries(result.data);
      setTotal(result.total);
      setKindCounts((prev) => ({ ...prev, [itemKind]: result.total }));
      setError(null);
      setIsLoading(false);
    }

    load();

    return () => {
      stale = true;
    };
  }, [catalogFilters, itemKind, page]);

  // 手動錄入條目僅存在於前端 local state（product_catalog 未有 INSERT policy）。
  //
  // 【設計決策】唔可以將 local 條目混入 DB 嘅 server-side 分頁：
  // server 用 .range() 按 PAGE_SIZE 切片，如果前端再 prepend 本地條目並裁切，
  // 就會將該頁最後一筆 DB 資料擠走，而下一頁嘅 range 又唔會補回，造成資料永久遺失。
  // 因此手動條目獨立成一個 pending section 顯示，完全唔參與 DB 分頁計算。
  const manualForKind = useMemo<AdminCatalogEntry[]>(
    () =>
      manualEntries
        .filter((m) => m.itemKind === itemKind)
        .map((m) => ({
          id: m.id,
          nameJa: m.nameJa || m.nameZh || m.nameEn,
          nameEn: m.nameEn || null,
          nameZh: m.nameZh || null,
          setCode: m.setCode,
          cardNumber: m.cardNumber || null,
          displayId: null,
          janCode:
            m.itemKind === "box_set" && m.category === "jan_code"
              ? m.cardNumber
              : null,
          imageUrl: m.imageSource,
          type:
            m.itemKind === "box_set"
              ? m.category === "jan_code"
                ? "booster_pack"
                : m.category
              : "single_card",
          rarity: m.rarity,
          pokemonStage: null,
          updatedAt: m.createdAt,
        })),
    [manualEntries, itemKind],
  );

  const totalPages = useMemo(
    () => (total === 0 ? 0 : Math.ceil(total / PAGE_SIZE)),
    [total],
  );
  const safePage = useMemo(
    () => (totalPages === 0 ? 1 : Math.min(page, totalPages)),
    [page, totalPages],
  );

  useEffect(() => {
    if (safePage !== page && totalPages > 0) {
      setPage(safePage);
    }
  }, [safePage, page, totalPages]);

  // ImageViewer 以「pending section 在前、DB Grid 在後」嘅視覺順序組成單一圖片陣列，
  // 令左右揭頁次序同畫面所見一致。
  const viewerEntries = useMemo(
    () => [...manualForKind, ...entries],
    [manualForKind, entries],
  );

  const viewerImages = useMemo(
    () => viewerEntries.map((entry) => entry.imageUrl),
    [viewerEntries],
  );

  function handleImageClick(entry: AdminCatalogEntry) {
    const index = viewerEntries.findIndex((e) => e.id === entry.id);
    setViewerInitialIndex(Math.max(0, index));
    setViewerOpen(true);
  }

  function clearObjectUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  function resetImagePreview() {
    clearObjectUrl();
    setImagePreview("");
    setImageFileName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function resetManualForm(kind: AdminCatalogItemKind) {
    setPendingManualEntries((prev) => ({
      ...prev,
      [kind]:
        kind === "card"
          ? {
              cardNumber: "",
              setCode: "",
              nameEn: "",
              nameZh: "",
              nameJa: "",
              rarity: "",
              imageSource: "",
            }
          : {
              cardNumber: "",
              setCode: "",
              nameEn: "",
              nameZh: "",
              nameJa: "",
              rarity: "",
              imageSource: "",
              category: "booster_pack",
            },
    }));
    resetImagePreview();
    setFormErrors({});
  }

  function handleOpenManualDialog() {
    setManualTab(itemKind);
    resetManualForm(itemKind);
    setIsManualDialogOpen(true);
  }

  function handleCloseManualDialog() {
    setIsManualDialogOpen(false);
    resetImagePreview();
  }

  function updateManualField<K extends keyof ManualEntryBase>(
    kind: AdminCatalogItemKind,
    field: K,
    value: ManualEntryBase[K],
  ) {
    setPendingManualEntries((prev) => ({
      ...prev,
      [kind]: { ...prev[kind], [field]: value },
    }));
    if (formErrors[field as keyof FormErrors]) {
      setFormErrors((prev) => ({ ...prev, [field]: false }));
    }
  }

  function updateBoxSetField(
    field: "category",
    value: CatalogType | "jan_code",
  ) {
    setPendingManualEntries((prev) => ({
      ...prev,
      box_set: { ...prev.box_set, [field]: value },
    }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: false }));
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("僅支援圖片格式檔案 (image/*)");
      return;
    }
    clearObjectUrl();
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setImagePreview(url);
    setImageFileName(file.name);
    updateManualField(manualTab, "imageSource", url);
    setFormErrors((prev) => ({ ...prev, image: false }));
  }

  function handleImageUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.trim();
    updateManualField(manualTab, "imageSource", value);
    if (value) {
      clearObjectUrl();
      setImageFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setImagePreview(value);
    } else if (!objectUrlRef.current) {
      setImagePreview("");
    }
    setFormErrors((prev) => ({ ...prev, image: false }));
  }

  function validateManualForm(): boolean {
    const current = pendingManualEntries[manualTab];
    const errors: FormErrors = {};

    if (!current.cardNumber.trim()) {
      errors.cardNumber = true;
    }
    if (!current.setCode.trim()) {
      errors.setCode = true;
    }
    if (
      !current.nameEn.trim() &&
      !current.nameZh.trim() &&
      !current.nameJa.trim()
    ) {
      errors.nameLanguages = true;
    }
    if (!current.rarity.trim()) {
      errors.rarity = true;
    }
    if (!current.imageSource.trim()) {
      errors.image = true;
    }

    if (manualTab === "box_set") {
      const box = current as ManualBoxSetEntry;
      if (!box.category) {
        errors.category = true;
      }
      if (box.category === "jan_code") {
        if (!/^\d+$/.test(box.cardNumber.trim())) {
          errors.cardNumber = true;
        }
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleManualSubmit() {
    if (!validateManualForm()) {
      if (formErrors.nameLanguages) {
        toast.error("請至少輸入一種語言嘅卡牌名稱（英文／中文／日文）");
      } else if (
        manualTab === "box_set" &&
        (pendingManualEntries.box_set as ManualBoxSetEntry).category ===
          "jan_code" &&
        formErrors.cardNumber
      ) {
        toast.error("輸入之 JAN Code 必須為全數字 13 位條碼");
      } else if (formErrors.rarity) {
        toast.error("請選擇罕有度");
      } else {
        toast.error("請填寫所有必填欄位並檢查格式");
      }
      return;
    }

    const current = pendingManualEntries[manualTab];
    const newEntry: ManualEntry =
      manualTab === "box_set"
        ? {
            ...(current as ManualBoxSetEntry),
            id: `MANUAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            itemKind: "box_set",
            createdAt: new Date().toISOString(),
          }
        : {
            ...(current as ManualCardEntry),
            id: `MANUAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            itemKind: "card",
            createdAt: new Date().toISOString(),
          };

    // TODO: [Supabase Wiring] Target Table: product_catalog | RPC: insert_card_catalog_entry
    // 目前 product_catalog 只有 SELECT policy，未有 INSERT policy。
    // 待補 migration（admin insert policy + is_admin() SECURITY DEFINER）後改為真正寫入。
    setManualEntries((prev) => [newEntry, ...prev]);
    toast.success("已新增手動錄入條目（尚未寫入資料庫）");

    handleCloseManualDialog();
    resetManualForm(manualTab);
  }

  const gridItemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.05,
        type: "spring" as const,
        stiffness: 300,
        damping: 25,
      },
    }),
  };

  return (
    <div className="space-y-5 pb-8">
      <p className="font-sans text-[13px] text-text-secondary">
        檢視平台卡牌字典；手動錄入供無 API 覆蓋的小眾或舊版卡牌
      </p>

      <div className="sticky top-0 z-20 -mx-4 space-y-1.5 border-b border-white/[0.08] bg-[#17130f]/95 px-4 pb-2 backdrop-blur-sm lg:-mx-6 lg:px-6">
        <div className="flex w-full min-w-0 items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-disabled"
              aria-hidden="true"
            />
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋編號、卡名、系列…"
              className={FILTER_SEARCH_CLASS}
            />
            <SmartSearch
              query={query}
              onSelect={() => {}}
              listings={[]}
              isOpen={false}
              suppressDropdown
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleOpenManualDialog}
            className={`h-8 shrink-0 px-2.5 text-[11px] sm:px-3 ${BTN_OUTLINE_CLASS}`}
          >
            <Plus className="size-3.5 sm:mr-1" aria-hidden="true" />
            <span className="hidden sm:inline">手動錄入</span>
            <span className="sm:hidden">錄入</span>
          </Button>
          <div className="hidden sm:flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setItemKind("card")}
              className={FILTER_CHIP_SM_CLASS(itemKind === "card")}
            >
              獨立卡 ({formatCatalogCount(kindCounts.card)})
            </button>
            <button
              type="button"
              onClick={() => setItemKind("box_set")}
              className={FILTER_CHIP_SM_CLASS(itemKind === "box_set")}
            >
              Box ({formatCatalogCount(kindCounts.box_set)})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto sm:hidden">
          <button
            type="button"
            onClick={() => setItemKind("card")}
            className={FILTER_CHIP_SM_CLASS(itemKind === "card")}
          >
            獨立卡 ({formatCatalogCount(kindCounts.card)})
          </button>
          <button
            type="button"
            onClick={() => setItemKind("box_set")}
            className={FILTER_CHIP_SM_CLASS(itemKind === "box_set")}
          >
            Box ({formatCatalogCount(kindCounts.box_set)})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Input
            type="text"
            value={setCodeFilter}
            onChange={(e) => setSetCodeFilter(e.target.value)}
            placeholder="系列代碼"
            className={`w-24 sm:w-28 ${FILTER_INPUT_CLASS}`}
            aria-label="系列代碼篩選"
          />
          <Select
            value={rarityFilter}
            onValueChange={(value) => setRarityFilter(value ?? "")}
          >
            <SelectTrigger className={FILTER_SELECT_TRIGGER_CLASS}>
              <SelectValue placeholder="罕有度">
                {RARITY_FILTER_LABEL_BY_VALUE[rarityFilter] ?? rarityFilter}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className={SELECT_CONTENT_CLASS}>
              <SelectItem value="all" className={SELECT_ITEM_CLASS}>
                全部罕有度
              </SelectItem>
              {RARITY_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className={SELECT_ITEM_CLASS}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {setCodeFilter || rarityFilter !== "all" ? (
            <button
              type="button"
              onClick={() => {
                setSetCodeFilter("");
                setRarityFilter("all");
              }}
              className="font-sans text-[11px] text-brand hover:text-text-primary"
            >
              清除篩選
            </button>
          ) : null}
        </div>
      </div>

      {renderGrid()}

      <ImageViewer
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        images={viewerImages}
        initialIndex={viewerInitialIndex}
      />

      {/* ── Full-screen Manual Entry Dialog ─────────────────────────────
          注意：DialogContent base class 含 `sm:max-w-sm` 同 `ring-1`。
          tailwind-merge 無法以無斷點嘅 `max-w-full` 蓋過帶斷點嘅 `sm:max-w-sm`，
          故必須顯式加 `sm:max-w-full`；`ring-0` 同理用嚟清走 base 嘅 ring。 */}
      <Dialog open={isManualDialogOpen} onOpenChange={setIsManualDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className="fixed inset-0 top-0 left-0 z-[70] w-full max-w-full sm:max-w-full h-[100dvh] max-h-[100dvh] translate-x-0 translate-y-0 rounded-none p-0 gap-0 flex flex-col overflow-hidden bg-bg-card border-0 ring-0"
        >
          {/* Sticky header */}
          <DialogHeader className="shrink-0 flex flex-row items-center justify-between gap-3 px-4 py-3 border-b border-[rgba(237,232,224,0.08)] bg-bg-card">
            <DialogTitle className="font-sans font-semibold text-[16px] text-text-primary">
              手動錄入卡牌
            </DialogTitle>
            <button
              type="button"
              onClick={handleCloseManualDialog}
              className="flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
              aria-label="關閉"
            >
              ✕
            </button>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 py-2">
            <div className="mx-auto max-w-3xl space-y-3">
              <div className={`${MANUAL_FORM_BLOCK_CLASS} flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between`}>
                <div className="space-y-1.5 shrink-0">
                  <span className={MANUAL_SECTION_CLASS}>類型</span>
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setManualTab("card")}
                      className={FILTER_CHIP_SM_CLASS(manualTab === "card")}
                    >
                      獨立卡
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualTab("box_set")}
                      className={FILTER_CHIP_SM_CLASS(manualTab === "box_set")}
                    >
                      Box / Set
                    </button>
                  </div>
                </div>

                {manualTab === "box_set" ? (
                  <div className="min-w-0 flex-1 space-y-1 sm:max-w-[14rem]">
                    <Label className={MANUAL_LABEL_CLASS}>
                      品類 <span className="text-warning">*</span>
                    </Label>
                    <Select
                      value={
                        (pendingManualEntries.box_set as ManualBoxSetEntry).category
                      }
                      onValueChange={(value) =>
                        updateBoxSetField(
                          "category",
                          (value as CatalogType | "jan_code") ?? "booster_pack",
                        )
                      }
                    >
                      <SelectTrigger
                        className={`${MANUAL_SELECT_TRIGGER_CLASS} ${
                          formErrors.category ? MANUAL_FIELD_ERROR_CLASS : ""
                        }`}
                      >
                        <SelectValue placeholder="選擇品類">
                          {BOX_SET_CATEGORY_LABEL_BY_VALUE[
                            (pendingManualEntries.box_set as ManualBoxSetEntry)
                              .category
                          ]}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className={SELECT_CONTENT_CLASS}>
                        {BOX_SET_CATEGORY_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            className={SELECT_ITEM_CLASS}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              {manualTab === "card"
                ? renderManualForm("card")
                : renderManualForm("box_set")}
            </div>
          </div>

          {/* Sticky footer */}
          <DialogFooter
            className="shrink-0 flex-row justify-stretch gap-2 border-t border-[rgba(237,232,224,0.08)] bg-bg-page px-4 py-2 m-0 rounded-none"
          >
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseManualDialog}
              className="h-8 min-h-0 flex-1 px-3 rounded-lg border-[rgba(237,232,224,0.12)] bg-bg-card text-text-secondary font-sans font-semibold text-[12px] hover:bg-bg-elevated hover:text-text-primary active:scale-[0.98] sm:flex-none sm:min-w-[5rem]"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleManualSubmit}
              className="h-8 min-h-0 flex-1 px-3 bg-brand text-[#17130f] font-sans font-bold text-[12px] rounded-lg hover:bg-brand-hover active:scale-[0.98] sm:flex-none sm:min-w-[5rem]"
            >
              送出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  function renderGrid() {
    if (isLoading) {
      return (
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-5">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-white/[0.08] bg-bg-card/40 p-2 space-y-2"
            >
              <Skeleton className="w-full aspect-[3/4] rounded-lg bg-bg-card" />
              <Skeleton className="h-3 w-3/4 bg-bg-card" />
              <Skeleton className="h-3 w-1/2 bg-bg-card" />
            </div>
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="rounded-lg border border-white/[0.08] bg-bg-card/30 px-4 py-12 text-center">
          <p className="font-sans text-[15px] text-warning text-center">
            {error}
          </p>
          <p className="font-sans text-[13px] text-text-secondary mt-2 text-center">
            請稍後再試，或檢查搜尋關鍵字是否包含特殊字元。
          </p>
        </div>
      );
    }

    if (manualForKind.length === 0 && entries.length === 0) {
      return (
        <div className="rounded-lg border border-white/[0.08] bg-bg-card/30 px-4 py-12 text-center">
          <p className="font-sans text-[15px] text-text-primary text-center">
            暫無符合條件的卡牌資料
          </p>
          <p className="font-sans text-[13px] text-text-secondary mt-2 text-center">
            調整搜尋關鍵字，或是點擊「手動錄入卡牌」新增一筆資料。
          </p>
        </div>
      );
    }

    const pageStart =
      total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
    const pageEnd = total === 0 ? 0 : Math.min(safePage * PAGE_SIZE, total);

    return (
      <div className="space-y-3">
        <p className="font-mono text-[12px] text-text-disabled">
          顯示第 {formatCatalogCount(pageStart)}–{formatCatalogCount(pageEnd)}{" "}
          筆 · 本類型共 {formatCatalogCount(total)} 筆
        </p>

        {/* ── Pending manual entries — 獨立區塊，不參與 DB 分頁 ───────── */}
        <AnimatePresence>
          {manualForKind.length > 0 && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
              aria-labelledby="pending-manual-heading"
            >
              <div className="space-y-2 rounded-lg border border-brand/20 bg-brand/5 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-brand text-[13px]">✎</span>
                  <h3
                    id="pending-manual-heading"
                    className={SECTION_TITLE_CLASS}
                  >
                    待寫入資料庫的手動錄入條目
                    <span className="ml-2 font-mono text-brand">
                      {manualForKind.length}
                    </span>
                  </h3>
                </div>
                <p className="font-sans text-[12px] text-text-secondary">
                  以下條目僅暫存於本次瀏覽階段，尚未寫入
                  <span className="font-mono"> product_catalog</span>
                  ，重新整理後將會消失。
                </p>
                <div className="grid grid-cols-3 gap-3 lg:grid-cols-5">
                  {manualForKind.map((entry, i) => (
                    <div key={entry.id} className="relative">
                      <div className="absolute -top-2 -right-2 z-10">
                        <span className="font-mono text-[9px] font-bold px-2 py-0.5 rounded-full bg-brand text-[#17130f] border border-brand/30 shadow-md">
                          待審核
                        </span>
                      </div>
                      <CatalogCard
                        entry={entry}
                        onImageClick={handleImageClick}
                        imagePriority={i < 4}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <motion.div
          initial="hidden"
          animate="visible"
          className="grid grid-cols-3 gap-3 lg:grid-cols-5"
        >
          {entries.map((entry, i) => (
            <motion.div
              key={entry.id}
              custom={i}
              variants={gridItemVariants}
              className="relative"
            >
              <CatalogCard
                entry={entry}
                onImageClick={handleImageClick}
                imagePriority={manualForKind.length === 0 && i < 4}
              />
            </motion.div>
          ))}
        </motion.div>

        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={total}
          itemsPerPage={PAGE_SIZE}
          itemLabel="筆資料"
          enableScroll={true}
        />
      </div>
    );
  }

  function renderManualForm(kind: AdminCatalogItemKind) {
    const current = pendingManualEntries[kind];
    const isJanCodeCategory =
      kind === "box_set" &&
      (current as ManualBoxSetEntry).category === "jan_code";

    return (
      <div className="space-y-3">
        <section className={MANUAL_FORM_BLOCK_CLASS}>
          <h3 className={MANUAL_SECTION_CLASS}>基本資訊</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1 min-w-0">
              <Label className={MANUAL_LABEL_CLASS}>
                編號 <span className="text-warning">*</span>
              </Label>
              <Input
                type={isJanCodeCategory ? "number" : "text"}
                value={current.cardNumber}
                onChange={(e) =>
                  updateManualField(kind, "cardNumber", e.target.value)
                }
                placeholder={
                  isJanCodeCategory ? "4904140548311" : "promo-102"
                }
                className={`${MANUAL_INPUT_MONO_CLASS} ${
                  formErrors.cardNumber ? MANUAL_FIELD_ERROR_CLASS : ""
                }`}
              />
            </div>

            <div className="space-y-1 min-w-0">
              <Label className={MANUAL_LABEL_CLASS}>
                系列代碼 <span className="text-warning">*</span>
              </Label>
              <Input
                type="text"
                value={current.setCode}
                onChange={(e) =>
                  updateManualField(kind, "setCode", e.target.value)
                }
                placeholder="SV2a"
                className={`${MANUAL_INPUT_MONO_CLASS} ${
                  formErrors.setCode ? MANUAL_FIELD_ERROR_CLASS : ""
                }`}
              />
            </div>
          </div>
          {isJanCodeCategory ? (
            <p className="font-mono text-[11px] text-brand">
              JAN Code 須為 13 位全數字
            </p>
          ) : null}
        </section>

        <section className={MANUAL_FORM_BLOCK_CLASS}>
          <h3 className={MANUAL_SECTION_CLASS}>名稱（至少填一種）</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="space-y-1 min-w-0">
              <Label className={MANUAL_LABEL_CLASS}>英文</Label>
              <Input
                type="text"
                value={current.nameEn}
                onChange={(e) =>
                  updateManualField(kind, "nameEn", e.target.value)
                }
                placeholder="Pikachu PROMO"
                className={`${MANUAL_INPUT_CLASS} ${
                  formErrors.nameLanguages ? MANUAL_FIELD_ERROR_CLASS : ""
                }`}
              />
            </div>

            <div className="space-y-1 min-w-0">
              <Label className={MANUAL_LABEL_CLASS}>中文</Label>
              <Input
                type="text"
                value={current.nameZh}
                onChange={(e) =>
                  updateManualField(kind, "nameZh", e.target.value)
                }
                placeholder="皮卡丘 推廣卡"
                className={`${MANUAL_INPUT_CLASS} ${
                  formErrors.nameLanguages ? MANUAL_FIELD_ERROR_CLASS : ""
                }`}
              />
            </div>

            <div className="space-y-1 min-w-0">
              <Label className={MANUAL_LABEL_CLASS}>日文</Label>
              <Input
                type="text"
                value={current.nameJa}
                onChange={(e) =>
                  updateManualField(kind, "nameJa", e.target.value)
                }
                placeholder="ピカチュウ"
                className={`${MANUAL_INPUT_CLASS} ${
                  formErrors.nameLanguages ? MANUAL_FIELD_ERROR_CLASS : ""
                }`}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className={MANUAL_LABEL_CLASS}>
              罕有度 <span className="text-warning">*</span>
            </Label>
            <Select
              value={current.rarity}
              onValueChange={(value) =>
                updateManualField(kind, "rarity", value ?? "")
              }
            >
              <SelectTrigger
                className={`${MANUAL_SELECT_TRIGGER_CLASS} font-mono ${
                  formErrors.rarity ? MANUAL_FIELD_ERROR_CLASS : ""
                }`}
              >
                <SelectValue placeholder="選擇罕有度">
                  {current.rarity
                    ? (RARITY_LABEL_BY_VALUE[current.rarity] ?? current.rarity)
                    : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className={SELECT_CONTENT_CLASS}>
                {RARITY_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className={SELECT_ITEM_CLASS}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formErrors.nameLanguages ? (
            <p className="font-sans text-[11px] text-warning">
              請至少輸入一種語言名稱（英文／中文／日文）
            </p>
          ) : null}
        </section>

        <section className={MANUAL_FORM_BLOCK_CLASS}>
          <h3 className={MANUAL_SECTION_CLASS}>卡牌圖片</h3>
          <div className="flex gap-2.5">
            {imagePreview ? (
              <div className="relative h-20 w-14 shrink-0">
                  <Image
                    src={imagePreview}
                    alt="預覽"
                    fill
                    className="rounded-lg object-cover border border-white/10"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      resetImagePreview();
                      updateManualField(kind, "imageSource", "");
                    }}
                    aria-label="移除圖片"
                    className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-white active:scale-[0.9] transition-transform"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-white/[0.12] bg-transparent">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#50453b"
                    strokeWidth="2"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
              )}
            <div className="min-w-0 flex-1 space-y-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full text-[10px] font-sans text-text-disabled file:mr-2 file:h-7 file:rounded-md file:border-0 file:bg-brand/15 file:px-2.5 file:text-[10px] file:font-semibold file:text-brand file:cursor-pointer hover:file:bg-brand/25"
              />
              <Input
                type="text"
                value={current.imageSource}
                onChange={handleImageUrlChange}
                placeholder="或貼上圖片 URL"
                className={`${MANUAL_INPUT_MONO_CLASS} h-8 text-[11px] ${
                  formErrors.image ? MANUAL_FIELD_ERROR_CLASS : ""
                }`}
              />
              {imageFileName ? (
                <p className="truncate font-mono text-[10px] text-text-disabled">
                  已選：{imageFileName}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    );
  }
}
