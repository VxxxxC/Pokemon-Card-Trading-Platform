type ProductCatalogRarity = string | null;

type RarityBadgeSize = "default" | "sm";

const RARITY_BADGE_SIZE_CLASS: Record<RarityBadgeSize, string> = {
  default: "text-[12px] px-2 py-0.5 rounded-[4px]",
  sm: "text-[9px] px-1.5 py-0 rounded-[3px]",
};

const RARITY_BADGE_BORDER_LEFT: Record<RarityBadgeSize, string> = {
  default: "3px solid #d4a574",
  sm: "2px solid #d4a574",
};

export function RarityBadge({
  rarity,
  className,
  size = "default",
}: {
  rarity: ProductCatalogRarity;
  className?: string;
  size?: RarityBadgeSize;
}) {
  if (!rarity) return null;

  return (
    <span
      className={`inline-flex items-center font-mono font-medium text-brand bg-bg-elevated shrink-0 ${RARITY_BADGE_SIZE_CLASS[size]} ${className ?? ""}`}
      style={{
        border: "1px solid rgba(237,232,224,0.08)",
        borderLeft: RARITY_BADGE_BORDER_LEFT[size],
      }}
    >
      {rarity}
    </span>
  );
}
