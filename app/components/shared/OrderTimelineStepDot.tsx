import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type OrderTimelineStepDotProps = {
  isCompleted?: boolean;
  isActive?: boolean;
  activeTone?: "brand" | "warning";
  className?: string;
};

export function OrderTimelineStepDot({
  isCompleted = false,
  isActive = false,
  activeTone = "brand",
  className,
}: OrderTimelineStepDotProps) {
  return (
    <div
      className={cn(
        "absolute left-[-23px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 transition-all",
        isCompleted
          ? "border-success bg-success text-white"
          : isActive
            ? activeTone === "warning"
              ? "animate-pulse border-amber-500 bg-amber-500"
              : "animate-pulse border-brand bg-brand"
            : "border-white/20 bg-[#1A1612]",
        className,
      )}
    >
      {isCompleted ? (
        <Check className="size-[7px] stroke-[4]" aria-hidden="true" />
      ) : null}
    </div>
  );
}
