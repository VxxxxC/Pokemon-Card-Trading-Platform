"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Autoplay from "embla-carousel-autoplay";
import {
  Megaphone,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PlatformAnnouncement } from "@/lib/announcements/types";
import { AnnouncementDetailLink } from "@/lib/announcements/announcement-detail-link";
import { markAnnouncementsAsRead } from "@/lib/announcements/read-state";

type AnnouncementModalProps = {
  announcements: PlatformAnnouncement[];
};

export function AnnouncementModal({ announcements }: AnnouncementModalProps) {
  const [open, setOpen] = useState(false);
  const [activeAnnouncements, setActiveAnnouncements] = useState<
    PlatformAnnouncement[]
  >([]);
  const [api, setApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [count, setCount] = useState(0);

  const autoplayPlugin = useRef(
    Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true }),
  );

  useEffect(() => {
    const hasSeenModal = sessionStorage.getItem("hasSeenAnnouncementsModal");
    setActiveAnnouncements(announcements);

    if (!hasSeenModal && announcements.length > 0) {
      const timer = setTimeout(() => {
        setOpen(true);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [announcements]);

  useEffect(() => {
    if (!api) return;

    setCount(api.scrollSnapList().length);
    setCurrentSlide(api.selectedScrollSnap());

    api.on("select", () => {
      setCurrentSlide(api.selectedScrollSnap());
    });
  }, [api]);

  const handleClose = () => {
    setOpen(false);
    sessionStorage.setItem("hasSeenAnnouncementsModal", "true");
    markAnnouncementsAsRead(activeAnnouncements);
  };

  if (activeAnnouncements.length === 0) {
    return null;
  }

  const slideCount = count || activeAnnouncements.length;
  const hasMultipleSlides = activeAnnouncements.length > 1;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100vw-2rem)] max-w-md sm:max-w-lg p-0 overflow-hidden border border-[rgba(237,232,224,0.15)] bg-[#26211C] text-text-primary shadow-2xl rounded-2xl outline-none min-w-0 flex flex-col max-h-[min(90dvh,540px)]"
      >
        <div className="flex items-center gap-3 border-b border-[rgba(237,232,224,0.08)] bg-[#17130f] px-4 py-3 sm:px-5 shrink-0">
          <Megaphone className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0 flex-1">
            <DialogTitle
              className="font-sans text-sm font-bold text-text-primary tracking-tight"
            >
              <span className="truncate">最新活動與公告</span>
            </DialogTitle>
            <DialogDescription className="text-[10px] font-mono text-text-secondary mt-0.5 hidden sm:block">
              HKCardVault Official Announcements
            </DialogDescription>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasMultipleSlides ? (
              <Badge
                variant="outline"
                className="border-brand/30 bg-brand/10 font-mono text-[10px] text-brand px-2 py-0.5"
              >
                {currentSlide + 1} / {slideCount}
              </Badge>
            ) : null}
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-8 w-8 text-text-secondary hover:bg-[#2e2925] hover:text-text-primary"
                />
              }
            >
              <X className="h-4 w-4" />
              <span className="sr-only">關閉</span>
            </DialogClose>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 overflow-hidden bg-[#26211C]">
          <Carousel
            setApi={setApi}
            plugins={[autoplayPlugin.current]}
            opts={{
              loop: true,
              align: "start",
            }}
            className="h-full w-full min-w-0 max-w-full overflow-hidden"
          >
            <CarouselContent className="-ml-0 min-w-0 max-w-full flex h-full">
              {activeAnnouncements.map((item) => (
                <CarouselItem
                  key={item.id}
                  className="pl-0 min-w-0 shrink-0 grow-0 basis-full max-w-full w-full overflow-hidden"
                >
                  <div className="flex flex-col h-full w-full min-w-0 max-w-full overflow-hidden">
                    <div className="relative w-full aspect-[16/9] max-h-[min(42vh,220px)] shrink-0 overflow-hidden bg-[#17130f]">
                      <Image
                        src={item.imageUrl}
                        alt={item.title}
                        fill
                        className="object-cover"
                        priority
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#26211C]/90 via-transparent to-black/15" />
                      <div className="absolute bottom-2.5 left-3 sm:bottom-3 sm:left-4">
                        <span className="rounded-full border border-[rgba(237,232,224,0.15)] bg-black/70 backdrop-blur-md px-2.5 py-0.5 sm:px-3 sm:py-1 font-mono text-[10px] sm:text-xs font-bold text-brand">
                          活動期間: {item.startDate} ~ {item.endDate}
                        </span>
                      </div>
                    </div>

                    <div className="px-4 py-3.5 sm:px-5 sm:py-4 bg-[#26211C] w-full min-w-0 overflow-y-auto">
                      <h3 className="font-sans text-[15px] sm:text-base font-bold text-text-primary leading-snug break-words">
                        {item.title}
                      </h3>
                      <p className="mt-1.5 font-sans text-xs sm:text-sm text-text-secondary leading-relaxed break-words whitespace-pre-line">
                        {item.content}
                      </p>
                      {item.linkUrl ? (
                        <div className="mt-3">
                          <AnnouncementDetailLink
                            linkUrl={item.linkUrl}
                            className="h-9 px-4 text-xs sm:text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          {hasMultipleSlides ? (
            <>
              <button
                type="button"
                onClick={() => api?.scrollPrev()}
                className="absolute left-2 sm:left-3 top-[min(21vh,110px)] -translate-y-1/2 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur-md opacity-80 hover:opacity-100 transition-opacity hover:bg-black/90 active:scale-95 z-10"
                aria-label="Previous slide"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => api?.scrollNext()}
                className="absolute right-2 sm:right-3 top-[min(21vh,110px)] -translate-y-1/2 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur-md opacity-80 hover:opacity-100 transition-opacity hover:bg-black/90 active:scale-95 z-10"
                aria-label="Next slide"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          ) : null}
        </div>

        {hasMultipleSlides ? (
          <div className="flex items-center justify-center gap-1.5 border-t border-[rgba(237,232,224,0.08)] bg-[#17130f] px-4 py-2.5 sm:px-5 shrink-0">
            {activeAnnouncements.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => api?.scrollTo(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  currentSlide === idx
                    ? "w-5 sm:w-6 bg-brand"
                    : "w-1.5 bg-[#39342f] hover:bg-text-secondary"
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
