export const CERTIFIED_MERCHANT_BADGE_LABEL = "認證商戶";
export const CERTIFIED_MERCHANT_BADGE_COMPACT_LABEL = "商戶";

type CertifiedMerchantBadgeSize = "default" | "compact";

type CertifiedMerchantBadgeProps = {
  className?: string;
  label?: string;
  size?: CertifiedMerchantBadgeSize;
};

const SIZE_CLASS: Record<CertifiedMerchantBadgeSize, string> = {
  default:
    "text-[9px] px-1.5 py-0.5 rounded-[3px] tracking-wide",
  compact:
    "text-[8px] px-1 py-px rounded-[2px] tracking-normal leading-none",
};

export function CertifiedMerchantBadge({
  className = "",
  label,
  size = "default",
}: CertifiedMerchantBadgeProps) {
  const resolvedLabel =
    label ??
    (size === "compact"
      ? CERTIFIED_MERCHANT_BADGE_COMPACT_LABEL
      : CERTIFIED_MERCHANT_BADGE_LABEL);

  return (
    <span
      title={CERTIFIED_MERCHANT_BADGE_LABEL}
      aria-label={CERTIFIED_MERCHANT_BADGE_LABEL}
      className={
        "inline-flex items-center font-mono font-bold text-brand bg-[rgba(212,165,116,0.06)] border border-brand/20 max-w-max select-none shrink-0 " +
        SIZE_CLASS[size] +
        " " +
        className
      }
    >
      {resolvedLabel}
    </span>
  );
}
