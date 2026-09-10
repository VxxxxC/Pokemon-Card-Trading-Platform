type SellerReputationMetaProps = {
  rating: number;
  reviewCount?: number | null;
  totalTrades?: number | null;
  className?: string;
};

export function SellerReputationMeta({
  rating,
  reviewCount,
  totalTrades,
  className = "",
}: SellerReputationMetaProps) {
  const hasReviews = reviewCount != null && reviewCount > 0;
  const hasTrades = totalTrades != null && totalTrades > 0;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono shrink-0 ${className}`}
      title={`賣家信譽評級: ${rating} 星`}
    >
      <span className="flex items-center gap-1 shrink-0">
        <span className="text-brand text-[11px]">⭐</span>
        <span className="text-[10px] font-bold text-[#d4c4b7]">
          {rating.toFixed(1)}
        </span>
      </span>
      {hasReviews ? (
        <span className="text-[10px] text-[#8A8680] shrink-0">
          {reviewCount} 則評價
        </span>
      ) : (
        <span className="text-[10px] text-[#8A8680] shrink-0">暫無評價</span>
      )}
      {hasTrades ? (
        <span className="text-[10px] text-[#8A8680] shrink-0">
          · {totalTrades} 筆成交
        </span>
      ) : null}
    </div>
  );
}
