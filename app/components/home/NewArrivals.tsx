"use client";

import { useState, useRef, useEffect, PointerEvent, useMemo } from "react";
import Link from "next/link";
import { motion, useAnimationControls, PanInfo } from "framer-motion";
import { type MarketplaceListing } from "@/app/components/marketplace/MarketplaceCard";
import type { HomeListingCard } from "@/app/lib/home/types";
import { HomeShelfListingCard } from "@/app/components/home/HomeShelfListingCard";
import { useIsMemberPersonaActive } from "@/app/lib/hooks/useIsMemberPersonaActive";
import { buildSellerListingDetailHref } from "@/lib/marketplace/listing-detail-href";
import {
  formatListingGrade,
  formatRelativeDateTime,
} from "@/lib/marketplace/listing-display";
import {
  HOME_SECTION_CLASS,
  HOME_SECTION_HEADER_ROW_CLASS,
  HOME_SECTION_LINK_CLASS,
  HOME_SECTION_TITLE_CLASS,
  HOME_HORIZONTAL_CARD_CLASS,
} from "@/app/components/home/home-section-ui";

type NewArrivalsProps = {
  listings?: HomeListingCard[];
  currentUserId?: string | null;
  favoredKeys?: string[];
};

function toMarketplaceListing(card: HomeListingCard): MarketplaceListing {
  const grade = formatListingGrade(card.gradingCompany, card.gradingScore);

  return {
    id: card.listingId,
    productId: card.productId,
    cardNo: card.cardCode || card.displayId || card.productId,
    name: card.name,
    set: card.setCode,
    rarity: card.rarity,
    grade: {
      authority: grade.authority,
      score: grade.score || card.gradeLabel,
    },
    gradingCompany: card.gradingCompany,
    gradingScore: card.gradingScore,
    price: card.price,
    delta: 0,
    deltaDirection: "up",
    image: card.imageUrl,
    seller: card.sellerName,
    sellerId: card.sellerId,
    detailHref: buildSellerListingDetailHref(card.sellerId, card.listingId),
  };
}

export function NewArrivals({
  listings = [],
  currentUserId = null,
  favoredKeys = [],
}: NewArrivalsProps) {
  const isMemberPersonaActive = useIsMemberPersonaActive();
  const showWishlist = currentUserId != null && isMemberPersonaActive;
  const favoredKeySet = new Set(favoredKeys);
  const arrivals = useMemo(
    () => listings.map(toMarketplaceListing),
    [listings],
  );

  const tripleArrivals =
    arrivals.length > 0
      ? [...arrivals, ...arrivals, ...arrivals]
      : [];

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const controls = useAnimationControls();

  const [dragConstraints, setDragConstraints] = useState({ left: 0, right: 0 });
  const [pauseMarquee, setPauseMarquee] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const currentX = useRef(0);

  useEffect(() => {
    if (containerRef.current && trackRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const trackWidth = trackRef.current.scrollWidth;
      setDragConstraints({
        left: -(trackWidth - containerWidth),
        right: 0,
      });
    }
  }, [tripleArrivals.length]);

  useEffect(() => {
    if (arrivals.length === 0) return;

    let animationFrameId: number;
    const speed = 0.6;

    const animate = () => {
      if (!pauseMarquee && !isDragging && trackRef.current) {
        currentX.current -= speed;

        const halfWidth = trackRef.current.scrollWidth / 3;
        if (Math.abs(currentX.current) >= halfWidth * 2) {
          currentX.current = -halfWidth;
        }

        controls.set({ x: currentX.current });
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [pauseMarquee, isDragging, controls, arrivals.length]);

  const handleDrag = (
    _event: PointerEvent | MouseEvent | TouchEvent,
    info: PanInfo,
  ) => {
    if (trackRef.current) {
      currentX.current += info.delta.x;
    }
  };

  const listingCreatedAtById = useMemo(
    () => new Map(listings.map((row) => [row.listingId, row.createdAt])),
    [listings],
  );

  return (
    <section
      className={HOME_SECTION_CLASS}
      aria-labelledby="arrivals-heading"
    >
      <div className={HOME_SECTION_HEADER_ROW_CLASS}>
        <h2 id="arrivals-heading" className={HOME_SECTION_TITLE_CLASS}>
          最新會員現貨上架
        </h2>
        <Link
          href="/marketplace?source=member"
          className={HOME_SECTION_LINK_CLASS}
        >
          查看全部 →
        </Link>
      </div>

      {arrivals.length === 0 ? (
        <p className="font-sans text-[13px] text-text-secondary py-6 text-center border border-[rgba(237,232,224,0.08)] rounded-xl bg-[#26211C]">
          暫無會員現貨上架
        </p>
      ) : (
        <div
          ref={containerRef}
          className="w-full overflow-hidden pb-4 -mx-1 px-1 scrollbar-none [&::-webkit-scrollbar]:hidden select-none"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          onMouseEnter={() => setPauseMarquee(true)}
          onMouseLeave={() => {
            setPauseMarquee(false);
            setIsDragging(false);
          }}
          onTouchStart={() => setPauseMarquee(true)}
          onTouchEnd={() => setPauseMarquee(false)}
        >
          <motion.div
            ref={trackRef}
            drag="x"
            dragConstraints={dragConstraints}
            dragElastic={0.1}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setIsDragging(false)}
            onDrag={handleDrag}
            animate={controls}
            className="flex gap-3 w-max active:cursor-grabbing cursor-grab"
          >
            {tripleArrivals.map((item, index) => {
              const sourceCard = listings[index % listings.length];
              const listedLabel = formatRelativeDateTime(
                listingCreatedAtById.get(item.id) ?? sourceCard?.createdAt,
              );

              return (
                <div
                  key={`${item.id}-${index}`}
                  className={`${HOME_HORIZONTAL_CARD_CLASS} select-none`}
                >
                  <HomeShelfListingCard
                    listing={item}
                    currentUserId={currentUserId}
                    favoredKeys={favoredKeySet}
                    showWishlist={showWishlist}
                    catalogImageUrl={sourceCard?.catalogImageUrl}
                    listedLabel={listedLabel}
                    imagePriority={index < 3}
                    className="h-full border-0 shadow-none hover:shadow-none"
                    onLinkClick={(e) => {
                      if (isDragging) {
                        e.preventDefault();
                      }
                    }}
                  />
                </div>
              );
            })}
          </motion.div>
        </div>
      )}
    </section>
  );
}
