"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AnnouncementDetailLinkProps = {
  linkUrl: string;
  className?: string;
};

export function AnnouncementDetailLink({
  linkUrl,
  className,
}: AnnouncementDetailLinkProps) {
  const classes = cn(
    buttonVariants({ size: "sm" }),
    "bg-brand text-[#17130f] font-bold hover:bg-[#e8b896]",
    className,
  );

  if (linkUrl.startsWith("/")) {
    return (
      <Link href={linkUrl} className={classes}>
        查看詳情
      </Link>
    );
  }

  return (
    <a
      href={linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={classes}
    >
      查看詳情
    </a>
  );
}
