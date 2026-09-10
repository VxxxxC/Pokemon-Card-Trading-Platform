"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminRewardTemplateUpsertInput } from "@/lib/admin-rewards/types";

type RewardDistributionStepProps = {
  form: AdminRewardTemplateUpsertInput;
  onChange: (next: AdminRewardTemplateUpsertInput) => void;
};

export function RewardDistributionStep({
  form,
  onChange,
}: RewardDistributionStepProps) {
  const mode = form.distribution_mode ?? "auto_grant";

  return (
    <div className="space-y-4">
      <div>
        <Label>發放方式</Label>
        <Select
          value={mode}
          onValueChange={(value) =>
            onChange({
              ...form,
              distribution_mode: value as "auto_grant" | "flash_only",
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto_grant">條件達成自動發放</SelectItem>
            <SelectItem value="flash_only">限時搶領（需加檔期）</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "auto_grant" ? (
        <p className="text-sm text-[#d4c4b7]">
          用戶滿足觸發條件後，系統會自動將獎勵發放入錢包。
        </p>
      ) : (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          已選擇「限時搶領」。請於 Step 3 設定檔期，發布後會員可在獎勵中心搶券。
        </div>
      )}
    </div>
  );
}
