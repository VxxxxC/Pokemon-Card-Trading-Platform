import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ChatInlineIconTextProps = {
  icon: LucideIcon;
  iconClassName?: string;
  className?: string;
  children: ReactNode;
};

export function ChatInlineIconText({
  icon: Icon,
  iconClassName,
  className,
  children,
}: ChatInlineIconTextProps) {
  return (
    <span className={cn("inline-flex items-start gap-1.5", className)}>
      <Icon
        className={cn("size-3.5 shrink-0 translate-y-[1px]", iconClassName)}
        aria-hidden
      />
      <span className="min-w-0">{children}</span>
    </span>
  );
}
