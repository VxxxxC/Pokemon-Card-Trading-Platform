"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { PublicProfileReviewItem } from "@/app/lib/reviews/types";
import {
  resolveReviewerProfileLinkTitle,
  resolveReviewerPublicProfileHref,
} from "@/lib/reviews/resolve-reviewer-profile-href";
import { CertifiedMerchantBadge } from "@/app/components/profile/CertifiedMerchantBadge";

type PublicReviewPreviewCardProps = {
  review: PublicProfileReviewItem;
  variant?: "default" | "embedded";
};

export function PublicReviewPreviewCard({
  review,
  variant = "default",
}: PublicReviewPreviewCardProps) {
  const reviewerHref = resolveReviewerPublicProfileHref(
    review.reviewerId,
    review.reviewerPersona,
  );
  const reviewerLinkTitle = resolveReviewerProfileLinkTitle(
    review.reviewerDisplayName,
    review.reviewerPersona,
  );

  const cardClassName =
    variant === "embedded"
      ? "flex flex-row gap-x-2 px-4 py-3 border-b border-[rgba(237,232,224,0.06)] last:border-b-0"
      : "flex flex-row gap-x-2 bg-bg-card rounded-2xl border border-[rgba(237,232,224,0.08)] p-4 hover:border-[rgba(237,232,224,0.15)] transition-colors";

  return (
    <div className={cardClassName}>
      <div className="self-start">
        <Link
          href={reviewerHref}
          className="block w-8 h-8 rounded-full border border-white/10 hover:opacity-80 transition-opacity cursor-pointer overflow-hidden shrink-0"
          title={reviewerLinkTitle}
        >
          <Avatar className="w-full h-full">
            <AvatarImage
              src={review.reviewerAvatarUrl}
              alt={`${review.reviewerDisplayName} 的頭像`}
              className="w-full h-full object-cover rounded-full"
            />
            <AvatarFallback className="text-[10px]">
              {review.reviewerDisplayName.substring(0, 2)}
            </AvatarFallback>
          </Avatar>
        </Link>
      </div>
      <div className="flex flex-col flex-1">
        <div className="flex flex-row justify-between items-center mb-1.5">
          <div className="flex items-center gap-2">
            <Link
              href={reviewerHref}
              className="font-sans text-[13px] font-bold text-text-primary hover:text-brand transition-colors cursor-pointer"
              title={reviewerLinkTitle}
            >
              {review.reviewerDisplayName}
            </Link>
            <span className="font-mono text-[12px] text-brand font-bold">
              ⭐ {review.rating}
            </span>
            {review.reviewerPersona === "merchant" ? (
              <CertifiedMerchantBadge />
            ) : null}
          </div>
          <span className="font-mono text-[11px] text-text-disabled">
            {review.dateLabel}
          </span>
        </div>
        <p className="font-sans text-[13px] text-text-secondary leading-relaxed">
          {review.comment || "（無留言）"}
        </p>
      </div>
    </div>
  );
}
