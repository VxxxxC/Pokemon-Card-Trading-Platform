"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, MoreVertical } from "lucide-react";
import type { CollectionEntry } from "@/app/lib/collection/types";
import {
  catalogItemKindFromType,
  formatSealedProductLabel,
  isSealedCatalogType,
  isSealedProductGrade,
  normalizeSealedProductScore,
} from "@/lib/catalog/item-kind";
import { Pagination } from "@/app/components/ui/Pagination";
import { useUIStore } from "@/app/store/useUIStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GRADING_OPTIONS } from "@/lib/grading/options";
import type { GradingOption } from "@/lib/grading/options";

const MOBILE_COLLECTION_ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_4.25rem_4.5rem] gap-x-1.5 items-center";

const MOBILE_COLLECTION_PRICE_HEADER =
  "font-mono text-[9px] text-text-disabled/80 uppercase tracking-wider text-right";

function formatCollectionMobilePrice(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toLocaleString("en-HK")}`;
}

function truncateCollectionMobileName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 5) return trimmed;
  return `${trimmed.slice(0, 5)}…`;
}

function formatHkd(value: number | null): string {
  if (value == null) return "—";
  return `HK$ ${value.toLocaleString("en-HK")}`;
}

function collectionRowKey(entry: CollectionEntry): string {
  return entry.collectionId;
}

function GraderBadge({
  company,
  score,
}: {
  company: string;
  score?: string;
}) {
  if (isSealedProductGrade(company, score)) {
    return (
      <span className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded border text-orange-400 bg-orange-500/10 border-orange-500/20">
        {formatSealedProductLabel(company, score)}
      </span>
    );
  }

  const map: Record<string, string> = {
    PSA: "text-[#3b9eff] bg-[rgba(59,158,255,0.12)] border-[rgba(59,158,255,0.20)]",
    BGS: "text-[#a855f7] bg-[rgba(168,85,247,0.12)] border-[rgba(168,85,247,0.20)]",
    CGC: "text-[#22d3ee] bg-[rgba(34,211,238,0.12)] border-[rgba(34,211,238,0.20)]",
    RAW: "text-[#d4c4b7] bg-[#2e2925] border-[rgba(237,232,224,0.12)]",
  };
  const style =
    map[company] ??
    "text-[#d4c4b7] bg-[#2e2925] border-[rgba(237,232,224,0.12)]";
  return (
    <span
      className={`font-mono text-[10px] font-medium px-1.5 py-0.5 rounded border ${style}`}
    >
      {company}
    </span>
  );
}

function StatusPill({ status }: { status: CollectionEntry["status"] }) {
  const map: Record<
    CollectionEntry["status"],
    { label: string; className: string }
  > = {
    holding: { label: "持有中", className: "text-[#d4c4b7] bg-[#2e2925]" },
    listed: {
      label: "已上架",
      className: "text-[#d4a574] bg-[rgba(212,165,116,0.12)]",
    },
    in_trade: {
      label: "交易中",
      className: "text-[#3b9eff] bg-[rgba(59,158,255,0.12)]",
    },
    sold: {
      label: "已售出",
      className: "text-[#8A8680] bg-[rgba(138,134,128,0.12)]",
    },
  };
  const { label, className } = map[status];
  return (
    <span
      className={`font-mono text-[10px] font-medium px-1.5 py-0.5 rounded ${className}`}
    >
      {label}
    </span>
  );
}

function CollectionThumbnail({
  entry,
  productHref,
}: {
  entry: CollectionEntry;
  productHref: string;
}) {
  const imageUrl = entry.imageUrl?.trim();

  return (
    <Link
      href={productHref}
      className="relative w-9 h-12 rounded-md bg-[#17130f] border border-[rgba(237,232,224,0.08)] shrink-0 overflow-hidden block"
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes="36px"
          className="object-cover object-top"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] text-[#50453b] font-bold">
          {entry.gradingCompany}
        </span>
      )}
    </Link>
  );
}

function GradeSelectCell({
  entry,
  onGradeChange,
  readOnly = false,
}: {
  entry: CollectionEntry;
  onGradeChange?: (
    entry: CollectionEntry,
    option: GradingOption,
  ) => Promise<boolean>;
  readOnly?: boolean;
}) {
  if (isSealedCatalogType(entry.catalogType) || isSealedProductGrade(entry.gradingCompany, entry.gradingScore)) {
    return (
      <span className="font-mono text-[9.5px] text-orange-400">
        {formatSealedProductLabel(entry.gradingCompany, entry.gradingScore)}
      </span>
    );
  }

  if (!onGradeChange || readOnly) {
    return (
      <span className="inline-flex items-center max-w-full font-mono text-[10px] text-text-secondary bg-bg-page/80 border border-[rgba(237,232,224,0.12)] px-1.5 py-0.5 rounded-md">
        <span className="truncate">{entry.gradeLabel}</span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1 max-w-full font-mono text-[10px] text-text-secondary bg-bg-page/80 border border-[rgba(237,232,224,0.12)] hover:border-brand/35 hover:text-brand px-1.5 py-0.5 rounded-md transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-brand/40"
        aria-label={`更改 ${entry.name} 鑑定規格`}
      >
        <span className="truncate">{entry.gradeLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        className="max-h-64 overflow-y-auto min-w-44"
      >
        {GRADING_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.id}
            disabled={option.id === entry.gradingOptionId}
            onClick={() => void onGradeChange(entry, option)}
            className="font-mono text-[11px]"
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CollectionGradeMenuSection({
  entry,
  onGradeChange,
}: {
  entry: CollectionEntry;
  onGradeChange?: (
    entry: CollectionEntry,
    option: GradingOption,
  ) => Promise<boolean>;
}) {
  if (
    !onGradeChange ||
    isSealedCatalogType(entry.catalogType) ||
    isSealedProductGrade(entry.gradingCompany, entry.gradingScore)
  ) {
    return null;
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>更改鑑定規格</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-64 overflow-y-auto min-w-44">
        {GRADING_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.id}
            disabled={option.id === entry.gradingOptionId}
            onClick={() => void onGradeChange(entry, option)}
            className="font-mono text-[11px]"
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

interface CollectionTableProps {
  entries: CollectionEntry[];
  isLoading?: boolean;
  emptyMessage?: string;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onRemove?: (entry: CollectionEntry) => void | Promise<void>;
  onUpdateGrade?: (
    entry: CollectionEntry,
    option: GradingOption,
  ) => Promise<boolean>;
}

export function CollectionTable({
  entries,
  isLoading = false,
  emptyMessage = "此篩選條件下沒有卡牌",
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onRemove,
  onUpdateGrade,
}: CollectionTableProps) {
  const router = useRouter();
  const openAddAssetModal = useUIStore((state) => state.openAddAssetModal);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove = async (entry: CollectionEntry) => {
    if (!onRemove) return;
    setRemovingId(entry.collectionId);
    try {
      await onRemove(entry);
    } finally {
      setRemovingId(null);
    }
  };

  const handleSell = (entry: CollectionEntry) => {
    const itemKind = catalogItemKindFromType(entry.catalogType);
    openAddAssetModal({
      mode: "merch",
      sellPrefill: {
        collectionId: entry.collectionId,
        productId: entry.productId,
        itemKind,
        sealState: isSealedProductGrade(entry.gradingCompany, entry.gradingScore)
          ? normalizeSealedProductScore(entry.gradingCompany, entry.gradingScore)
          : undefined,
        catalog: {
          name: entry.name,
          displayId: entry.cardCode || null,
          cardNumber: entry.cardCode || null,
          setCode: entry.setCode,
          imageUrl: entry.imageUrl,
          rarity: entry.rarity,
          catalogType: entry.catalogType,
        },
        gradingOptionId: entry.gradingOptionId,
        sellingPrice: entry.purchasePrice,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="font-sans text-[15px] text-[#8A8680]">載入收藏庫中…</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-14 text-center">
        <p className="font-mono text-[13px] text-[#8A8680]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="lg:hidden">
        <div
          className={`${MOBILE_COLLECTION_ROW_GRID} pb-2 border-b border-[rgba(237,232,224,0.06)] pr-7`}
        >
          <span className="font-mono text-[9px] text-text-disabled/80 uppercase tracking-wider">
            商品資料
          </span>
          <span className={MOBILE_COLLECTION_PRICE_HEADER}>入手價</span>
          <span className={MOBILE_COLLECTION_PRICE_HEADER}>市價</span>
        </div>
        <div className="divide-y divide-[rgba(237,232,224,0.06)]">
        {entries.map((entry) => {
          const pnl =
            entry.currentMarketValue != null
              ? entry.currentMarketValue - entry.purchasePrice
              : null;
          const pnlDir = pnl != null && pnl >= 0 ? "up" : "down";
          const showPnl = pnl != null && pnl !== 0;
          const trend30d = entry.trend30d;
          const hasTrend = trend30d != null;
          const trendDir = hasTrend && trend30d >= 0 ? "up" : "down";
          const productHref = `/marketplace/product/${entry.productId}`;
          const subtitleLabel = `${entry.cardCode || entry.productId}${entry.setCode ? ` · ${entry.setCode}` : ""}`;

          return (
            <div
              key={collectionRowKey(entry)}
              className={`relative ${MOBILE_COLLECTION_ROW_GRID} py-3 pr-7 animate-fadeIn`}
            >
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={removingId === entry.collectionId}
                  className="absolute top-1/2 right-0 z-10 inline-flex w-7 h-7 -translate-y-1/2 items-center justify-center rounded-md text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors focus:outline-none disabled:opacity-50"
                  aria-label={`${entry.name} 更多操作`}
                >
                  <MoreVertical className="size-4" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  side="bottom"
                  className="min-w-52"
                >
                  <DropdownMenuItem onClick={() => router.push(productHref)}>
                    查看公開市場
                  </DropdownMenuItem>
                  {entry.status !== "listed" &&
                  entry.status !== "in_trade" &&
                  entry.status !== "sold" ? (
                    <DropdownMenuItem
                      onClick={() => handleSell(entry)}
                      className="text-brand focus:bg-[#322a24] focus:text-brand font-bold"
                    >
                      出售收藏品
                    </DropdownMenuItem>
                  ) : null}
                  <CollectionGradeMenuSection
                    entry={entry}
                    onGradeChange={onUpdateGrade}
                  />
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={removingId === entry.collectionId}
                    onClick={() => void handleRemove(entry)}
                  >
                    移除出資產庫
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex items-center gap-2 min-w-0">
                <Link
                  href={productHref}
                  className="relative w-9 aspect-5/7 rounded-sm bg-bg-elevated border border-[rgba(237,232,224,0.08)] shrink-0 overflow-hidden block"
                >
                  {entry.imageUrl?.trim() ? (
                    <Image
                      src={entry.imageUrl.trim()}
                      alt=""
                      fill
                      sizes="36px"
                      className="object-cover object-top"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center font-mono text-[7px] text-text-disabled font-bold">
                      {entry.gradingCompany}
                    </span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={productHref}
                    title={entry.name}
                    className="font-sans font-semibold text-[12px] text-text-primary leading-tight hover:text-brand transition-colors block"
                  >
                    {truncateCollectionMobileName(entry.name)}
                  </Link>
                  <p className="font-mono text-[9px] text-text-disabled truncate mt-0.5 leading-tight">
                    {subtitleLabel}
                  </p>
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    <GradeSelectCell
                      entry={entry}
                      onGradeChange={onUpdateGrade}
                      readOnly
                    />
                    <StatusPill status={entry.status} />
                    {hasTrend ? (
                      <span
                        className={`font-mono text-[9px] ${
                          trendDir === "up" ? "text-success" : "text-error"
                        }`}
                      >
                        30D {trendDir === "up" ? "▲" : "▼"}
                        {Math.abs(trend30d!).toFixed(1)}%
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="text-right tabular-nums min-w-0 self-center">
                <p className="font-mono font-semibold text-[12px] text-text-secondary leading-tight truncate">
                  {formatCollectionMobilePrice(entry.purchasePrice)}
                </p>
              </div>
              <div className="text-right tabular-nums min-w-0 self-center">
                <p className="font-mono font-bold text-[12px] text-text-primary leading-tight truncate">
                  {formatCollectionMobilePrice(entry.currentMarketValue)}
                </p>
                {entry.currentMarketValue == null ? (
                  <p className="font-mono text-[9px] text-text-disabled leading-tight">
                    暫無市價
                  </p>
                ) : showPnl ? (
                  <p
                    className={`font-mono text-[9px] leading-tight truncate ${
                      pnlDir === "up" ? "text-success" : "text-error"
                    }`}
                  >
                    {pnl! >= 0 ? "+" : ""}$
                    {Math.abs(pnl!).toLocaleString("en-HK")}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      <div className="max-lg:hidden overflow-x-auto -mx-4 lg:mx-0">
        <table className="w-full min-w-[660px] border-collapse">
          <thead>
            <tr className="border-b border-[rgba(237,232,224,0.08)]">
              {(
                [
                  {
                    label: "卡牌資料",
                    align: "text-left",
                    extra: "pl-4 lg:pl-0 pr-3",
                  },
                  {
                    label: "鑑定規格 / 狀態",
                    align: "text-center",
                    extra: "px-3",
                  },
                  {
                    label: "收錄價格",
                    align: "text-right",
                    extra: "px-3",
                  },
                  {
                    label: "現市價格",
                    sublabel: "SNKRDUNK · 無則平台價",
                    align: "text-right",
                    extra: "px-3",
                  },
                  {
                    label: "30D 走勢",
                    sublabel: "SNKRDUNK 參考",
                    align: "text-center",
                    extra: "px-3",
                  },
                  {
                    label: "操作",
                    align: "text-right",
                    extra: "pr-4 lg:pr-0",
                  },
                ] as const
              ).map(({ label, align, extra, ...rest }) => (
                <th
                  key={label}
                  className={`font-mono text-[11px] text-[#8A8680] uppercase tracking-wider pb-3 pt-3 ${align} ${extra}`}
                >
                  <span className="block">{label}</span>
                  {"sublabel" in rest && rest.sublabel ? (
                    <span className="block text-[9px] normal-case tracking-normal text-[#8A8680]/70 mt-0.5">
                      {rest.sublabel}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const pnl =
                entry.currentMarketValue != null
                  ? entry.currentMarketValue - entry.purchasePrice
                  : null;
              const pnlDir = pnl != null && pnl >= 0 ? "up" : "down";
              const trend30d = entry.trend30d;
              const hasTrend = trend30d != null;
              const trendDir = hasTrend && trend30d >= 0 ? "up" : "down";
              const productHref = `/marketplace/product/${entry.productId}`;

              return (
                <tr
                  key={collectionRowKey(entry)}
                  className="border-b border-[rgba(237,232,224,0.04)] hover:bg-[#39342f]/30 transition-colors animate-fadeIn"
                >
                  <td className="py-3 pl-4 lg:pl-0 pr-3">
                    <div className="flex items-center gap-3">
                      <CollectionThumbnail
                        entry={entry}
                        productHref={productHref}
                      />
                      <div className="min-w-0">
                        <Link
                          href={productHref}
                          className="font-sans font-medium text-[13px] text-[#eae1da] truncate hover:text-brand transition-colors block"
                        >
                          {entry.name}
                        </Link>
                        <p className="font-mono text-[10px] text-[#d4c4b7]">
                          {entry.cardCode || entry.productId}
                          {entry.setCode ? ` · ${entry.setCode}` : ""}
                        </p>
                        <GraderBadge
                          company={entry.gradingCompany}
                          score={entry.gradingScore}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <GradeSelectCell
                        entry={entry}
                        onGradeChange={onUpdateGrade}
                      />
                      <StatusPill status={entry.status} />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <p className="font-mono text-[13px] text-[#d4c4b7]">
                      {formatHkd(entry.purchasePrice)}
                    </p>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <p className="font-mono font-semibold text-[14px] text-[#eae1da]">
                      {formatHkd(entry.currentMarketValue)}
                    </p>
                    {entry.status === "sold" ? (
                      <p className="font-mono text-[9px] text-[#8A8680]">
                        成交價
                        {entry.soldAt
                          ? ` · ${new Date(entry.soldAt).toLocaleDateString("zh-HK")}`
                          : ""}
                      </p>
                    ) : entry.valuationSource === "purchase_price" ? (
                      <p className="font-mono text-[9px] text-[#8A8680]">
                        入手價估計
                      </p>
                    ) : entry.valuationSource === "platform" ? (
                      <p className="font-mono text-[9px] text-[#8A8680]">
                        平台成交估計
                      </p>
                    ) : null}
                    {pnl != null ? (
                      <p
                        className={`font-mono text-[10px] ${pnlDir === "up" ? "text-[#10b981]" : "text-[#ef4444]"}`}
                      >
                        {pnl >= 0 ? "+" : ""}HK${" "}
                        {Math.abs(pnl).toLocaleString("en-HK")}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      {hasTrend ? (
                        <span
                          className={`font-mono text-[12px] font-semibold ${trendDir === "up" ? "text-[#10b981]" : "text-[#ef4444]"}`}
                        >
                          {trendDir === "up" ? "▲" : "▼"}{" "}
                          {Math.abs(trend30d!).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-[#8A8680]">
                          —
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pl-3 pr-4 lg:pr-0 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex w-8 h-8 items-center justify-center rounded-lg border border-transparent hover:bg-[#322a24] hover:border-[rgba(237,232,224,0.10)] text-[#d4c4b7] hover:text-[#eae1da] transition-all font-mono text-[15px] focus:outline-none cursor-pointer select-none">
                        ⋯
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        side="bottom"
                        className="min-w-52"
                      >
                        <DropdownMenuItem
                          onClick={() => router.push(productHref)}
                        >
                          查看公開市場
                        </DropdownMenuItem>
                        {entry.status !== "listed" &&
                        entry.status !== "in_trade" &&
                        entry.status !== "sold" ? (
                          <DropdownMenuItem
                            onClick={() => handleSell(entry)}
                            className="text-brand focus:bg-[#322a24] focus:text-brand font-bold"
                          >
                            出售收藏品
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={removingId === entry.collectionId}
                          onClick={() => void handleRemove(entry)}
                        >
                          移除出資產庫
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        itemLabel="張卡牌"
        totalItems={totalItems}
        itemsPerPage={itemsPerPage}
        hideControls={false}
        enableScroll={true}
        scrollToViewId="cards-heading"
      />
    </div>
  );
}
