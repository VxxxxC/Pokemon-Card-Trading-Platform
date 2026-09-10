import Image from "next/image";
import { cn } from "@/lib/utils";

type OrderCatalogThumbProps = {
  catalogImageUrl?: string | null;
  alt: string;
  className?: string;
};

const ORDER_CATALOG_THUMB_CLASS =
  "w-14 aspect-[3/4] shrink-0 overflow-hidden rounded-md border border-white/10 bg-bg-page";

export function OrderCatalogThumb({
  catalogImageUrl,
  alt,
  className,
}: OrderCatalogThumbProps) {
  const src = catalogImageUrl?.trim() ?? "";

  if (!src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center font-mono text-[9px] text-text-disabled",
          ORDER_CATALOG_THUMB_CLASS,
          className,
        )}
        aria-hidden="true"
      >
        無圖
      </div>
    );
  }

  return (
    <div className={cn("relative", ORDER_CATALOG_THUMB_CLASS, className)}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        sizes="56px"
      />
    </div>
  );
}
