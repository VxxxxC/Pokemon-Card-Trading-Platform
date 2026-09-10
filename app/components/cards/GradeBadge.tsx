type GradeBadgeProps = {
  authority: string;
  score: string;
  size?: "sm" | "md";
};

function formatAuthorityLabel(authority: string): string {
  const normalized = authority.toUpperCase().trim();
  if (normalized === "RAW" || normalized === "RAW CARD") {
    return "裸卡";
  }
  return authority;
}

export function GradeBadge({
  authority,
  score,
  size = "md",
}: GradeBadgeProps) {
  const authorityLabel = formatAuthorityLabel(authority);
  const trimmedScore = score?.trim() ?? "";
  const label = trimmedScore
    ? `${authorityLabel} ${trimmedScore}`
    : authorityLabel;

  const sizeClass =
    size === "sm"
      ? "text-[9px] px-1.5 py-0.5 rounded-md border border-brand/25 bg-[rgba(23,19,15,0.88)] backdrop-blur-md"
      : "text-[11px] px-2 py-0.5 rounded-[4px] border border-brand/15 bg-[rgba(212,165,116,0.15)]";

  return (
    <span
      className={`inline-flex items-center font-mono font-semibold text-[#eae1da] leading-none shrink-0 whitespace-nowrap ${sizeClass}`}
    >
      {label}
    </span>
  );
}
