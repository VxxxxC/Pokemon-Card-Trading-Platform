"use client";

import React, {
  useState,
  useRef,
  useEffect,
  TouchEvent,
  MouseEvent,
} from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface ImageViewerProps {
  isOpen: boolean;
  onClose: () => void;
  images: string[];
  remarks?: (string | null | undefined)[] | null;
  initialIndex?: number;
}

export function ImageViewer({
  isOpen,
  onClose,
  images,
  initialIndex = 0,
}: ImageViewerProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevInitialIndex, setPrevInitialIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(false);
  const [panStyle, setPanStyle] = useState<React.CSSProperties>({});

  // Mobile touch gesture zoom states
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const touchStartRef = useRef<{ dist: number; x: number; y: number } | null>(
    null,
  );
  const currentPosRef = useRef({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  // Sync index on open directly in render phase to avoid cascading renders
  if (isOpen !== prevIsOpen || initialIndex !== prevInitialIndex) {
    setPrevIsOpen(isOpen);
    setPrevInitialIndex(initialIndex);
    setActiveIndex(initialIndex);
    setZoom(false);
    setPanStyle({});
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }

  const resetZoom = () => {
    setZoom(false);
    setPanStyle({});
    setScale(1);
    setPosition({ x: 0, y: 0 });
    currentPosRef.current = { x: 0, y: 0 };
  };

  // Lock body scroll when open and reset ref
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      currentPosRef.current = { x: 0, y: 0 };
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || images.length === 0) return null;

  const currentImageUrl = images[activeIndex];

  // Desktop Mouse Magnifier (Move to pan zoomed image)
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!zoom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate percentage coordinates
    const px = (x / rect.width) * 100;
    const py = (y / rect.height) * 100;

    setPanStyle({
      transformOrigin: `${px}% ${py}%`,
      transform: "scale(2.5)",
    });
  };

  const handleMouseEnter = () => {
    setZoom(true);
  };

  const handleMouseLeave = () => {
    resetZoom();
  };

  // Helper distance between two fingers
  const getDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Helper center point of two fingers
  const getCenter = (touches: React.TouchList) => {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  };

  // Mobile Touch Gestures
  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      // Pinch to Zoom
      const dist = getDistance(e.touches);
      const center = getCenter(e.touches);
      touchStartRef.current = { dist, x: center.x, y: center.y };
    } else if (e.touches.length === 1 && scale > 1) {
      // Drag to Pan
      const touch = e.touches[0];
      touchStartRef.current = {
        dist: 0,
        x: touch.clientX - position.x,
        y: touch.clientY - position.y,
      };
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;

    if (e.touches.length === 2 && touchStartRef.current.dist > 0) {
      e.preventDefault();
      const dist = getDistance(e.touches);
      const factor = dist / touchStartRef.current.dist;
      const nextScale = Math.min(Math.max(1, scale * factor), 4);
      setScale(nextScale);

      // Keep track of zoom ratio
      touchStartRef.current.dist = dist;
    } else if (e.touches.length === 1 && scale > 1) {
      e.preventDefault();
      const touch = e.touches[0];
      const nextX = touch.clientX - touchStartRef.current.x;
      const nextY = touch.clientY - touchStartRef.current.y;

      // Calculate boundary limits based on zoom scale
      const bound = (scale - 1) * 150; // Approximated viewport bounds
      const clampedX = Math.min(Math.max(nextX, -bound), bound);
      const clampedY = Math.min(Math.max(nextY, -bound), bound);

      setPosition({ x: clampedX, y: clampedY });
      currentPosRef.current = { x: clampedX, y: clampedY };
    }
  };

  const handleTouchEnd = () => {
    if (scale <= 1.05) {
      resetZoom();
    }
    touchStartRef.current = null;
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    resetZoom();
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    resetZoom();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[900] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-fadeIn select-none"
    >
      {/* Absolute Close Button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-5 right-5 z-[950] w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center border border-white/10 transition-colors cursor-pointer text-white focus:outline-none shadow-lg active:scale-95"
        aria-label="關閉預覽"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Main viewport frame */}
      <div
        ref={containerRef}
        className="relative w-full h-full flex flex-col items-center justify-center p-4 lg:p-10"
        onClick={onClose}
      >
        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-4 lg:left-8 z-[910] w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer focus:outline-none"
              aria-label="上一張"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-4 lg:right-8 z-[910] w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer focus:outline-none"
              aria-label="下一張"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </>
        )}

        {/* Image Container Wrapper */}
        <div
          ref={imageRef}
          onClick={(e) => e.stopPropagation()}
          className="relative max-w-full max-h-[75dvh] lg:max-h-[85dvh] aspect-[3/4] w-[90%] md:w-[65%] lg:w-[40%] rounded-2xl overflow-hidden bg-[#120f0c]/60 border border-white/5 shadow-2xl flex items-center justify-center cursor-zoom-in"
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="w-full h-full relative transition-transform duration-100 ease-out"
            style={
              scale > 1
                ? {
                    transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
                    transformOrigin: "center",
                  }
                : panStyle
            }
          >
            <Image
              src={currentImageUrl}
              alt="實物圖片超大特寫"
              fill
              priority
              className="object-contain"
              unoptimized
            />
          </div>

          {/* Context HUD info overlay */}
          <div className="absolute bottom-4 left-4 pointer-events-none select-none">
            <span className="inline-flex px-2.5 py-1 rounded-md bg-black/85 backdrop-blur-md border border-white/10 font-mono text-[10px] text-brand uppercase tracking-wider shadow-md">
              🔎{" "}
              {zoom || scale > 1
                ? "按住拖曳或滑動檢索"
                : "觸控縮放 / 滑鼠移入放大"}{" "}
              ({activeIndex + 1} / {images.length})
            </span>
          </div>
        </div>

        {/* Thumbnail Selector List (Bottom indicator row) */}
        {images.length > 1 && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[910] flex items-center gap-2 px-4 py-2 rounded-2xl bg-black/60 backdrop-blur-md border border-white/5 shadow-lg overflow-x-scroll no-scrollbar max-w-[85%]"
            onClick={(e) => e.stopPropagation()}
          >
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setActiveIndex(i);
                  resetZoom();
                }}
                className={cn(
                  "relative w-12 h-16 rounded-lg overflow-hidden border transition-all shrink-0 cursor-pointer focus:outline-none",
                  activeIndex === i
                    ? "border-brand ring-2 ring-brand/30 scale-105"
                    : "border-white/10 opacity-60 hover:opacity-100",
                )}
              >
                <Image
                  src={img}
                  alt={`細節照 ${i + 1}`}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
