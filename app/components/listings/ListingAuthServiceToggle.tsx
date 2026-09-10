"use client";

import { CircleHelp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LISTING_AUTH_SERVICE_TOOLTIP_TITLE,
  buildAuthServiceTooltipBullets,
} from "@/lib/listings/auth-service-copy";
import { usePlatformAuthFee } from "@/lib/platform/use-platform-auth-fee";

type ListingAuthServiceToggleProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function ListingAuthServiceToggle({
  checked,
  onCheckedChange,
}: ListingAuthServiceToggleProps) {
  const authServiceFeeHkd = usePlatformAuthFee();

  return (
    <div className="bg-[#17130f] border border-brand/20 rounded-lg px-3 py-2 animate-fadeIn">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-sans font-bold text-[#d4c4b7] text-[12px]">
            接受買家加購平台鑑定
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                type="button"
                delay={0}
                closeOnClick={false}
                className="shrink-0 text-[#8A8680] hover:text-brand focus:outline-none focus-visible:ring-1 focus-visible:ring-brand/40 rounded-full"
                aria-label="平台鑑定託管說明"
              >
                <CircleHelp className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="start"
                sideOffset={6}
                className="flex w-[14.5rem] flex-col items-stretch gap-2 border border-white/10 bg-[#26211C] px-3 py-2.5 text-left shadow-lg"
              >
                <p className="font-sans text-[11px] font-bold leading-snug text-brand">
                  {LISTING_AUTH_SERVICE_TOOLTIP_TITLE}
                </p>
                <ul className="m-0 flex w-full flex-col gap-2 p-0 font-sans text-[10px] leading-snug text-[#d4c4b7]">
                  {buildAuthServiceTooltipBullets(authServiceFeeHkd).map(
                    (line) => (
                      <li key={line} className="block w-full">
                        {line}
                      </li>
                    ),
                  )}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="data-checked:bg-brand data-unchecked:bg-[#39342f] shrink-0"
        />
      </div>
    </div>
  );
}
