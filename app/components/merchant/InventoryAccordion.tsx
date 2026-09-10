"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CiBullhorn } from "react-icons/ci";
import { ChartLine, Eye, Pencil } from "lucide-react";
import type { ListingStatus } from "@/app/lib/types/rbac";
import type { ListingImage } from "@/lib/listings/images";
import { Pagination } from "@/app/components/ui/Pagination";
import { ListingEditDialog } from "@/app/components/merchant/ListingEditDialog";

// ─── Data Contracts ────────────────────────────────────────────────────────────

export interface CardInstance {
  id: string;
  grade: string;
  grader: string;
  askPrice: number;
  status: ListingStatus;
  createdAt: string;
  conditionDesc: string;
  edgeWear: string;
  photos: number;
  images: ListingImage[];
  gradingOptionId: string;
  useAuthentication: boolean;
  views: number;
  offersCount?: number;
  isSealedListing?: boolean;
  isOrderReserved?: boolean;
  extraShippingFee?: number;
}

export interface SKUGroup {
  id: string;
  cardName: string;
  cardNo: string;
  nameZh?: string | null;
  setCode?: string;
  cardNumber?: string;
  rarity?: string | null;
  thumbnailSeed: string;
  imageUrl?: string | null;
  items: CardInstance[];
}

export function formatSkuCatalogLine(
  sku: Pick<SKUGroup, "setCode" | "cardNumber" | "cardNo" | "rarity">,
): string {
  const rarity = sku.rarity?.trim();
  const hasRarity =
    rarity != null &&
    rarity.length > 0 &&
    rarity !== "—" &&
    rarity !== "-" &&
    rarity !== "–";

  return [
    sku.setCode?.trim(),
    sku.cardNumber?.trim() || sku.cardNo?.trim(),
    hasRarity ? rarity : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ─── Status Display Map ────────────────────────────────────────────────────────

const STATUS_LABEL: Record<
  ListingStatus,
  { label: string; className: string; dotClassName: string }
> = {
  active: {
    label: "上架中",
    className: "text-success",
    dotClassName: "bg-success",
  },
  sold: {
    label: "已售出",
    className: "text-text-disabled",
    dotClassName: "bg-text-disabled",
  },
  draft: {
    label: "草稿",
    className: "text-warning",
    dotClassName: "bg-warning",
  },
  pending: {
    label: "審核中",
    className: "text-brand",
    dotClassName: "bg-brand",
  },
  inactive: {
    label: "未上架",
    className: "text-text-disabled",
    dotClassName: "bg-text-disabled",
  },
};

const ORDER_RESERVED_STATUS = {
  merchant: {
    label: "待買家付款",
    className: "text-warning",
    dotClassName: "bg-warning",
  },
  member: {
    label: "交易中",
    className: "text-brand",
    dotClassName: "bg-brand",
  },
} as const;

function formatInventoryMobilePrice(value: number): string {
  return `$${value.toLocaleString("en-HK")}`;
}

// ─── Card Instance Row with Edit Dialog ────────────────────────────────────────

interface CardInstanceRowProps {
  sku: Pick<SKUGroup, "cardName" | "cardNo" | "setCode" | "cardNumber">;
  item: CardInstance;
  inventoryContext?: "merchant" | "member";
}

function CardInstanceRow({
  sku,
  item,
  inventoryContext = "member",
}: CardInstanceRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const statusDisplay = item.isOrderReserved
    ? ORDER_RESERVED_STATUS[inventoryContext]
    : STATUS_LABEL[item.status];
  const { label, className, dotClassName } = statusDisplay;
  const canEdit = item.status !== "sold" && !item.isOrderReserved;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={!canEdit}
        aria-label={`編輯掛單 上架序號 ${item.id}`}
        className={`w-full flex flex-col gap-1 py-2 px-2.5 bg-bg-page/40 border border-[rgba(237,232,224,0.08)] rounded-lg transition-colors select-none group/row text-left ${
          canEdit
            ? "hover:bg-bg-elevated/40 cursor-pointer"
            : "opacity-80 cursor-not-allowed"
        }`}
      >
        <p className="font-mono text-[9px] text-text-disabled leading-tight break-all w-full">
          <span className="text-text-disabled/80">上架序號 </span>
          {item.id}
        </p>

        {inventoryContext === "merchant" ? (
          <div className="mt-0.5 flex items-center gap-2 flex-wrap min-w-0 font-mono text-[9px] text-text-disabled leading-tight">
            <span
              className="inline-flex items-center gap-0.5 shrink-0 tabular-nums"
              aria-label={`${item.views} 次瀏覽`}
            >
              <Eye className="h-3 w-3 shrink-0" aria-hidden />
              {item.views}
            </span>
            {item.offersCount && item.offersCount > 0 ? (
              <span className="inline-flex items-center gap-0.5 shrink-0 tabular-nums">
                <CiBullhorn className="h-3 w-3 shrink-0" aria-hidden />
                {item.offersCount} 次叫價
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1 flex-wrap min-w-0 flex-1">
            <span className="inline-flex items-center max-w-full font-mono text-[10px] text-text-secondary bg-bg-page/80 border border-[rgba(237,232,224,0.12)] px-1.5 py-0.5 rounded-md shrink-0">
              <span className="truncate">{item.grade}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1 font-mono text-[10px] font-medium shrink-0 ${className}`}
            >
              <span
                className={`size-1.5 rounded-full shrink-0 ${dotClassName}`}
                aria-hidden
              />
              {label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-mono font-semibold text-[12px] text-text-primary tabular-nums">
              {formatInventoryMobilePrice(item.askPrice)}
            </span>
            {canEdit ? (
              <span
                className="flex items-center justify-center w-7 h-7 rounded-md border border-[rgba(237,232,224,0.12)] bg-bg-page/80 text-text-secondary group-hover/row:border-brand/35 group-hover/row:text-brand transition-colors shrink-0"
                aria-hidden="true"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </span>
            ) : null}
          </div>
        </div>
      </button>

      {isOpen && canEdit ? (
        <ListingEditDialog
          open
          onOpenChange={setIsOpen}
          sku={sku}
          item={item}
          inventoryContext={inventoryContext}
        />
      ) : null}
    </>
  );
}

// ─── Sku Items List Module ───────────────────────────────────────────────────

interface SkuItemsListProps {
  sku: SKUGroup;
  inventoryContext?: "merchant" | "member";
}

function SkuItemsList({ sku, inventoryContext = "member" }: SkuItemsListProps) {
  const [itemPage, setItemPage] = useState(1);
  const itemsPerPage = 5;
  const totalItemPages = Math.ceil(sku.items.length / itemsPerPage);
  const paginatedItems = sku.items.slice(
    (itemPage - 1) * itemsPerPage,
    itemPage * itemsPerPage,
  );

  return (
    <div className="space-y-2">
      {paginatedItems.map((item) => (
        <CardInstanceRow
          key={item.id}
          sku={sku}
          item={item}
          inventoryContext={inventoryContext}
        />
      ))}

      <Pagination
        currentPage={itemPage}
        totalPages={totalItemPages}
        onPageChange={(page) => setItemPage(page)}
        itemLabel="張實物現貨"
        totalItems={sku.items.length}
        itemsPerPage={itemsPerPage}
        hideControls={true}
        enableScroll={false}
      />
    </div>
  );
}

// ─── Main SKU Inventory Accordion ─────────────────────────────────────────────

interface InventoryAccordionProps {
  analytics?: boolean;
  skuGroups: SKUGroup[];
  inventoryContext?: "merchant" | "member";
}

export function InventoryAccordion({
  skuGroups,
  analytics = true,
  inventoryContext = "member",
}: InventoryAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="divide-y divide-[rgba(237,232,224,0.06)]">
      {skuGroups.map((sku) => {
        const isOpen = openId === sku.id;
        const catalogLine = formatSkuCatalogLine(sku);

        return (
          <div key={sku.id}>
            <div
              className={`px-3 py-2.5 ${
                isOpen ? "bg-bg-elevated/50" : "hover:bg-bg-elevated/40"
              }`}
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : sku.id)}
                  aria-expanded={isOpen}
                  aria-controls={`sku-panel-${sku.id}`}
                  className="flex flex-1 items-center gap-2.5 min-w-0 text-left transition-colors cursor-pointer"
                >
                <div className="relative w-12 h-[3.5rem] rounded-md overflow-hidden border border-[rgba(237,232,224,0.08)] shrink-0">
                  <Image
                    src={
                      sku.imageUrl?.trim() ||
                      `https://picsum.photos/seed/${sku.thumbnailSeed}/112/160`
                    }
                    alt={`${sku.cardName} 縮圖`}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-sans text-[13px] font-medium text-text-primary truncate">
                      {sku.cardName}
                    </p>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[rgba(212,165,116,0.10)] text-brand border border-brand/20 shrink-0">
                      {sku.items.length} 張
                    </span>
                  </div>
                  {(sku.nameZh || catalogLine) ? (
                    <div className="mt-0.5 space-y-0.5 min-w-0">
                      {catalogLine ? (
                        <p className="font-mono text-[11px] text-text-secondary truncate uppercase">
                          {catalogLine}
                        </p>
                      ) : null}
                      {sku.nameZh ? (
                        <p className="font-sans text-[11px] text-text-secondary truncate">
                          {sku.nameZh}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="text-right shrink-0 hidden sm:block">
                  {sku.items.length > 0 && (
                    <>
                      <p className="font-mono font-semibold text-[13px] text-text-primary">
                        HK$ {Math.min(...sku.items.map((it) => it.askPrice)).toLocaleString()}
                        {sku.items.length > 1 && (
                          <span className="text-text-disabled text-[11px]"> 起</span>
                        )}
                      </p>
                      <p className="font-mono text-[10.5px] mt-0.5">
                        {sku.items.length > 1 ? (
                          <>
                            至 <span className="text-brand font-bold">HK$ {Math.max(...sku.items.map((it) => it.askPrice)).toLocaleString()}</span>
                          </>
                        ) : (
                          sku.items[0].grade
                        )}
                      </p>
                    </>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : sku.id)}
                aria-expanded={isOpen}
                aria-controls={`sku-panel-${sku.id}`}
                aria-label={isOpen ? "收起掛單" : "展開掛單"}
                className="shrink-0 p-1 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>

            {analytics ? (
              <div className="mt-2">
                <Link
                  href={`/profile/merchant/analytics?productId=${sku.id}`}
                  className="w-full flex items-center justify-center gap-1.5 h-9 bg-brand/10 text-brand border border-brand/25 font-mono text-[11px] font-semibold rounded-lg hover:bg-brand/15 active:scale-[0.98] transition-colors"
                >
                  <ChartLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  前往本卡牌進階商品分析
                </Link>
              </div>
            ) : null}
            </div>

            <div
              id={`sku-panel-${sku.id}`}
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div className="bg-[rgba(212,165,116,0.02)] border-t border-[rgba(212,165,116,0.08)] px-3 pt-2 pb-2 space-y-2">
                  <SkuItemsList sku={sku} inventoryContext={inventoryContext} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
