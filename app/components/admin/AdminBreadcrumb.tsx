"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ADMIN_ROOT_HREF,
  ADMIN_ROOT_LABEL,
  findAdminNavMatch,
  getAdminNavPageTitle,
  getAdminSubPathLabel,
  isAdminIndexPage,
} from "@/app/admin/admin-nav";

type Crumb = {
  href: string;
  label: string;
};

function buildAdminBreadcrumbs(pathname: string): Crumb[] {
  const navMatch = findAdminNavMatch(pathname);
  if (!navMatch) {
    return [{ href: ADMIN_ROOT_HREF, label: ADMIN_ROOT_LABEL }];
  }

  const subLabel = getAdminSubPathLabel(pathname, navMatch.href);

  if (navMatch.href === ADMIN_ROOT_HREF) {
    if (subLabel) {
      return [
        { href: ADMIN_ROOT_HREF, label: ADMIN_ROOT_LABEL },
        { href: pathname, label: subLabel },
      ];
    }
    return [{ href: ADMIN_ROOT_HREF, label: getAdminNavPageTitle(navMatch) }];
  }

  const crumbs: Crumb[] = [
    { href: ADMIN_ROOT_HREF, label: ADMIN_ROOT_LABEL },
    {
      href: navMatch.href,
      label: isAdminIndexPage(pathname)
        ? getAdminNavPageTitle(navMatch)
        : navMatch.label,
    },
  ];

  if (subLabel) {
    crumbs.push({ href: pathname, label: subLabel });
  }

  return crumbs;
}

export function AdminBreadcrumb({ className }: { className?: string }) {
  const pathname = usePathname();
  const crumbs = buildAdminBreadcrumbs(pathname);
  const pageHeadingOnBreadcrumb = isAdminIndexPage(pathname);

  return (
    <nav aria-label="麵包屑導航" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-0.5 sm:gap-1">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          const isRoot = index === 0;

          return (
            <li
              key={`${index}-${crumb.label}`}
              className="flex min-w-0 items-center gap-0.5 sm:gap-1"
            >
              {index > 0 ? (
                <ChevronRight
                  className="size-2.5 shrink-0 text-text-disabled/60"
                  aria-hidden="true"
                />
              ) : null}
              {isLast ? (
                pageHeadingOnBreadcrumb ? (
                  <h1
                    className="truncate font-sans text-[12px] font-semibold text-text-primary sm:text-[13px]"
                    aria-current="page"
                  >
                    {crumb.label}
                  </h1>
                ) : (
                  <span
                    className="truncate font-sans text-[12px] font-semibold text-text-primary sm:text-[13px]"
                    aria-current="page"
                  >
                    {crumb.label}
                  </span>
                )
              ) : (
                <Link
                  href={crumb.href}
                  className={cn(
                    "truncate transition-colors hover:text-brand active:scale-[0.98]",
                    isRoot
                      ? "max-w-[5.5rem] font-mono text-[10px] text-text-disabled sm:max-w-none sm:text-[11px]"
                      : "max-w-[6.5rem] font-sans text-[11px] font-medium text-text-secondary sm:max-w-none sm:text-[12px]",
                  )}
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
