import {
  HOME_HORIZONTAL_CARD_CLASS,
  HOME_HORIZONTAL_CARD_IMAGE_CLASS,
  HOME_SECTION_CLASS,
  HOME_SECTION_HEADER_ROW_CLASS,
  HOME_WISHLIST_SECTION_CLASS,
} from "@/app/components/home/home-section-ui";

export function WishlistSectionSkeleton() {
  return (
    <section
      aria-hidden="true"
      className={HOME_WISHLIST_SECTION_CLASS}
    >
      <div className={HOME_SECTION_HEADER_ROW_CLASS}>
        <div className="h-5 w-40 rounded bg-white/5 animate-pulse" />
        <div className="h-4 w-12 rounded bg-white/5 animate-pulse" />
      </div>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className={`${HOME_HORIZONTAL_CARD_CLASS} animate-pulse`}
          >
            <div className={`${HOME_HORIZONTAL_CARD_IMAGE_CLASS} bg-white/5`} />
            <div className="p-3 space-y-2">
              <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
              <div className="h-2.5 w-1/2 rounded bg-white/5 animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-white/5 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function MerchantSectionSkeleton() {
  return (
    <section aria-hidden="true" className={HOME_SECTION_CLASS}>
      <div className={HOME_SECTION_HEADER_ROW_CLASS}>
        <div className="h-5 w-48 rounded bg-white/5 animate-pulse" />
        <div className="h-4 w-16 rounded bg-white/5 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card p-3 animate-pulse"
          >
            <div className="w-full aspect-[5/7] rounded-lg bg-white/5 mb-2.5" />
            <div className="space-y-2">
              <div className="h-4 w-3/4 rounded bg-white/5" />
              <div className="h-3 w-1/2 rounded bg-white/5" />
              <div className="h-5 w-1/3 rounded bg-white/5 mt-3" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function C2cSectionSkeleton() {
  return (
    <section aria-hidden="true" className={HOME_SECTION_CLASS}>
      <div className={HOME_SECTION_HEADER_ROW_CLASS}>
        <div className="h-5 w-44 rounded bg-white/5 animate-pulse" />
        <div className="h-4 w-16 rounded bg-white/5 animate-pulse" />
      </div>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className={`${HOME_HORIZONTAL_CARD_CLASS} animate-pulse`}
          >
            <div className={`${HOME_HORIZONTAL_CARD_IMAGE_CLASS} bg-white/5`} />
            <div className="p-3 space-y-2">
              <div className="h-4 w-3/4 rounded bg-white/5" />
              <div className="h-3 w-1/2 rounded bg-white/5" />
              <div className="h-5 w-1/3 rounded bg-white/5" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
