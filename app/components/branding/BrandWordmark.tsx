import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type BrandWordmarkProps = ComponentPropsWithoutRef<"span">;

/** Site wordmark: HK (brand) + CardVault (primary). */
export function BrandWordmark({ className, ...props }: BrandWordmarkProps) {
  return (
    <span
      className={cn("font-sans font-bold tracking-tight", className)}
      {...props}
    >
      <span className="text-brand">HK</span>
      <span className="text-text-primary">CardVault</span>
    </span>
  );
}
