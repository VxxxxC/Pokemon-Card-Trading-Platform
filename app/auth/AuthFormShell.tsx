import type { ReactNode } from "react";
import Link from "next/link";
import { BrandWordmark } from "@/app/components/branding/BrandWordmark";

type AuthFormShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
};

export function AuthFormShell({
  title,
  description,
  children,
  backHref = "/auth",
  backLabel = "返回登入",
}: AuthFormShellProps) {
  return (
    <div className="min-h-dvh bg-bg-page flex flex-col relative">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 100% 50% at 50% 0%, rgba(212,165,116,0.06) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 flex flex-col flex-1 w-full max-w-100 mx-auto px-5 py-6 sm:px-6 sm:py-8 lg:py-16 lg:justify-center lg:min-h-dvh">
        <Link href="/" className="mb-3 inline-block">
          <BrandWordmark className="text-[18px]" />
        </Link>

        <Link
          href={backHref}
          className="mb-5 inline-flex items-center gap-1 font-sans text-[12px] text-text-secondary hover:text-brand transition-colors"
        >
          ← {backLabel}
        </Link>

        <section
          className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]"
          aria-labelledby="auth-shell-title"
        >
          <div className="px-3.5 py-3 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
            <h1
              id="auth-shell-title"
              className="font-sans font-semibold text-[22px] sm:text-[24px] text-text-primary leading-tight"
            >
              {title}
            </h1>
            <p className="mt-1 font-sans text-[13px] text-text-secondary leading-relaxed">
              {description}
            </p>
          </div>
          <div className="p-3.5 sm:p-4">{children}</div>
        </section>
      </div>
    </div>
  );
}
