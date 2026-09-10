"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_GRADING_OPTION_ID,
  GRADING_OPTION_GROUPS,
  getGradingOption,
  getGradingOptionsByGroup,
} from "@/lib/grading/options";

export type ListingGradingSelectVariant = "create" | "edit";

type ListingGradingSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  variant?: ListingGradingSelectVariant;
  id?: string;
};

const triggerClassName: Record<ListingGradingSelectVariant, string> = {
  create:
    "w-full h-9 bg-[#17130f] border border-white/[0.06] rounded-lg px-2.5 text-[#eae1da] focus:ring-0 text-[12px] focus-visible:border-brand/40",
  edit:
    "w-full h-9 bg-[#17130f] border border-white/[0.06] rounded-lg px-2.5 text-[13px] font-bold text-text-primary shadow-none focus:ring-0 focus-visible:border-brand/40",
};

export function ListingGradingSelect({
  value,
  onValueChange,
  variant = "create",
  id,
}: ListingGradingSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next ?? DEFAULT_GRADING_OPTION_ID)}
    >
      <SelectTrigger id={id} className={triggerClassName[variant]}>
        <SelectValue placeholder="選擇鑑定或裸卡品相">
          {value ? getGradingOption(value).label : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-[#26211C] border border-white/10 text-[#eae1da] max-h-72">
        {GRADING_OPTION_GROUPS.map((group) => (
          <SelectGroup key={group.key}>
            <SelectLabel>{group.label}</SelectLabel>
            {getGradingOptionsByGroup(group.key).map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
