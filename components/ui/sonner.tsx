"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from "lucide-react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const TOAST_BASE_CLASS =
  "group toast w-[min(100vw-2rem,22rem)] items-start gap-2.5 rounded-lg border border-white/[0.08] bg-[#26211C]/95 py-2.5 pl-3 pr-8 font-sans shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-md";

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group [&_[data-sonner-toaster]]:pointer-events-none [&_[data-sonner-toast]]:pointer-events-auto"
      icons={{
        success: (
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
        ),
        error: <AlertCircle className="size-4 shrink-0 text-error" aria-hidden />,
        warning: (
          <AlertTriangle className="size-4 shrink-0 text-brand" aria-hidden />
        ),
        info: <Info className="size-4 shrink-0 text-text-secondary" aria-hidden />,
        loading: (
          <Loader2
            className="size-4 shrink-0 animate-spin text-brand"
            aria-hidden
          />
        ),
        close: <X className="size-3.5" aria-hidden />,
      }}
      toastOptions={{
        duration: 4000,
        classNames: {
          toast: TOAST_BASE_CLASS,
          title:
            "font-sans text-[12px] font-semibold leading-snug text-text-primary",
          description:
            "font-sans text-[11px] leading-snug text-text-secondary",
          content: "flex items-start gap-2.5",
          icon: "mt-0.5 shrink-0",
          closeButton:
            "absolute right-1 top-1 flex size-6 items-center justify-center rounded-md border-0 bg-transparent text-text-disabled opacity-70 transition-colors hover:bg-white/[0.06] hover:text-text-primary hover:opacity-100",
          actionButton:
            "inline-flex h-7 items-center rounded-lg bg-brand px-2.5 font-sans text-[11px] font-bold text-[#17130f] transition-colors hover:bg-brand-hover",
          cancelButton:
            "inline-flex h-7 items-center rounded-lg border border-white/10 bg-transparent px-2.5 font-sans text-[11px] text-text-secondary transition-colors hover:bg-white/[0.05]",
          success: "!border-l-2 !border-l-success/60",
          error: "!border-l-2 !border-l-error/60",
          warning: "!border-l-2 !border-l-brand/60",
          info: "!border-l-2 !border-l-white/20",
        },
      }}
      {...props}
    />
  );
}
