"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import Autoplay from "embla-carousel-autoplay";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import type { HomeBannerItem } from "@/app/lib/home/types";
import {
  HOME_SECTION_CLASS,
  HOME_SECTION_TITLE_CLASS,
} from "@/app/components/home/home-section-ui";

type HomeBannerProps = {
  banners?: HomeBannerItem[];
};

function BannerSlide({ banner }: { banner: HomeBannerItem }) {
  const alt = banner.altText?.trim() || banner.title;
  const imageClassName =
    "object-cover transition-transform duration-500 group-hover:scale-[1.02]";
  const frameClassName =
    "group relative block w-full overflow-hidden rounded-2xl border border-[rgba(237,232,224,0.08)] bg-[#17130f] aspect-[21/9] max-h-[min(32vh,200px)] sm:max-h-[min(36vh,240px)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";

  const image = (
  <>
      <Image
        src={banner.imageUrl}
        alt={alt}
        fill
        className={imageClassName}
        sizes="(max-width: 768px) 100vw, 1100px"
        priority
        unoptimized
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#17130f]/80 via-[#17130f]/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 px-3 py-2.5 sm:px-4 sm:py-3">
        <p className="font-sans font-bold text-[12px] sm:text-[14px] text-text-primary leading-snug line-clamp-2">
          {banner.title}
        </p>
      </div>
    </>
  );

  const href = banner.linkUrl?.trim();
  if (href?.startsWith("/")) {
    return (
      <Link href={href} className={frameClassName} aria-label={banner.title}>
        {image}
      </Link>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={frameClassName}
        aria-label={banner.title}
      >
        {image}
      </a>
    );
  }

  return (
    <div className={frameClassName} aria-label={banner.title}>
      {image}
    </div>
  );
}

export function HomeBanner({ banners = [] }: HomeBannerProps) {
  const [api, setApi] = React.useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = React.useState(0);

  const plugin = React.useMemo(
    () =>
      Autoplay({
        delay: 4500,
        playOnInit: banners.length > 1,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
        stopOnFocusIn: true,
      }),
    [banners.length],
  );

  React.useEffect(() => {
    if (!api) return;

    setCurrentSlide(api.selectedScrollSnap());
    api.on("select", () => {
      setCurrentSlide(api.selectedScrollSnap());
    });
  }, [api]);

  if (banners.length === 0) {
    return null;
  }

  const hasMultiple = banners.length > 1;

  return (
    <section
      className={`${HOME_SECTION_CLASS} mt-2 sm:mt-3`}
      aria-labelledby="home-banner-heading"
    >
      <div className="mb-3">
        <h2 id="home-banner-heading" className={HOME_SECTION_TITLE_CLASS}>
          最新消息
        </h2>
      </div>

      {hasMultiple ? (
        <Carousel
          setApi={setApi}
          plugins={[plugin]}
          className="w-full"
          onMouseEnter={plugin.stop}
          onMouseLeave={plugin.reset}
          opts={{
            align: "start",
            loop: true,
          }}
        >
          <CarouselContent className="-ml-0">
            {banners.map((banner) => (
              <CarouselItem key={banner.id} className="pl-0 basis-full">
                <BannerSlide banner={banner} />
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      ) : (
        <BannerSlide banner={banners[0]} />
      )}

      {hasMultiple ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          {banners.map((banner, idx) => (
            <button
              key={banner.id}
              type="button"
              onClick={() => api?.scrollTo(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentSlide === idx
                  ? "w-5 bg-brand"
                  : "w-1.5 bg-[#39342f] hover:bg-text-secondary"
              }`}
              aria-label={`第 ${idx + 1} 則最新消息`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
