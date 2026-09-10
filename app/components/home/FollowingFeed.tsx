"use client";

import Image from "next/image";
import Link from "next/link";
import {
  HOME_SECTION_CLASS,
  HOME_SECTION_HEADER_ROW_CLASS,
  HOME_SECTION_LINK_CLASS,
  HOME_SECTION_TITLE_CLASS,
} from "@/app/components/home/home-section-ui";

// TODO: [API] Fetch user's following feed from Supabase — JOIN `user_favorites` + `listings` for lowest-price followed cards
// TODO: [database] Create compound index on `user_favorites(user_id, listing_id)` and `(user_id, merchant_id)` for optimized query
// TODO: [server] For logged-out users, return global hot recommendations from a cached Edge Function

const feedCards = [
  { id: "sv2a-182", name: "Charizard ex SAR", price: "HK$3,500", image: "https://picsum.photos/seed/follow-charizard/200/280", tag: "全港最低" },
  { id: "sv2a-189", name: "Mewtwo ex SAR", price: "HK$4,050", image: "https://picsum.photos/seed/follow-mewtwo/200/280", tag: "今日新上架" },
  { id: "sv6a-109", name: "Umbreon ex SAR", price: "HK$2,960", image: "https://picsum.photos/seed/follow-umbreon/200/280", tag: "降價通知" },
  { id: "sv2a-215", name: "Pikachu AR", price: "HK$660", image: "https://picsum.photos/seed/follow-pikachu/200/280", tag: "全港最低" },
  { id: "sv2a-233", name: "Mimikyu ex SAR", price: "HK$2,180", image: "https://picsum.photos/seed/follow-mimikyu/200/280", tag: "今日新上架" },
];

export function FollowingFeed() {
  return (
    <section className={HOME_SECTION_CLASS} aria-labelledby="following-heading">
      <div className={HOME_SECTION_HEADER_ROW_CLASS}>
        <h2 id="following-heading" className={HOME_SECTION_TITLE_CLASS}>
          我的心水情報
        </h2>
        <Link
          href="/profile/user"
          prefetch={false}
          className={HOME_SECTION_LINK_CLASS}
        >
          管理追蹤 →
        </Link>
      </div>
      <p className="font-sans text-[13px] text-text-secondary mb-4">
        登入追蹤心水神卡，降價即時通知
      </p>

      {/* Horizontal scrollable slider */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        {feedCards.map((card) => (
          <Link
            key={card.id}
            href={`/marketplace?card=${card.id}`}
            className="shrink-0 w-[150px] bg-bg-card rounded-[12px] border border-[rgba(237,232,224,0.08)] overflow-hidden hover:shadow-[0_4px_16px_rgba(0,0,0,0.50)] transition-shadow active:scale-[0.98]"
          >
            <div className="relative w-full aspect-[5/7] bg-bg-elevated">
              <Image
                src={card.image}
                alt={card.name}
                fill
                className="object-cover"
                sizes="150px"
              />
              <span className="absolute top-2 left-2 font-mono text-[10px] text-[#17130f] bg-brand px-1.5 py-0.5 rounded-[4px]">
                {card.tag}
              </span>
            </div>
            <div className="p-2.5">
              <p className="font-sans text-[12px] text-text-primary font-medium truncate">
                {card.name}
              </p>
              <p className="font-mono text-[11px] text-text-secondary mt-0.5">
                {card.id}
              </p>
              <p className="font-mono text-[14px] text-brand font-semibold mt-1">
                {card.price}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
