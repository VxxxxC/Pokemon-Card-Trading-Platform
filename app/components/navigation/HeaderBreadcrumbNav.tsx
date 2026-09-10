import Link from "next/link";
import { IoChevronBack } from "react-icons/io5";
import type { HeaderBreadcrumb } from "@/lib/navigation/header-breadcrumb";

type HeaderBreadcrumbNavProps = {
  breadcrumb: HeaderBreadcrumb;
  compact?: boolean;
};

export function HeaderBreadcrumbNav({
  breadcrumb,
  compact = false,
}: HeaderBreadcrumbNavProps) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Link
        href={breadcrumb.parentHref}
        aria-label={`返回${breadcrumb.parentLabel}`}
        className="shrink-0 w-8 h-8 -ml-1 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors focus:outline-none"
      >
        <IoChevronBack className="w-5 h-5" />
      </Link>
      <nav
        className={`min-w-0 font-mono text-text-secondary flex items-center gap-1.5 ${
          compact ? "text-[10px]" : "text-[11px]"
        }`}
        aria-label="麵包屑"
      >
        <Link
          href={breadcrumb.parentHref}
          className="hover:text-brand transition-colors truncate"
        >
          {breadcrumb.parentLabel}
        </Link>
        <span className="text-text-disabled shrink-0">/</span>
        <span className="text-text-disabled truncate">
          {breadcrumb.currentLabel}
        </span>
      </nav>
    </div>
  );
}
