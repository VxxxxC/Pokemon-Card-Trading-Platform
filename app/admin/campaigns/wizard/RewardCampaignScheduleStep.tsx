"use client";

import type {
  AdminRewardTemplateFlashSchedule,
  AdminRewardTemplateUpsertInput,
} from "@/lib/admin-rewards/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RewardCampaignScheduleStepProps = {
  form: AdminRewardTemplateUpsertInput;
  onChange: (next: AdminRewardTemplateUpsertInput) => void;
};

function patchSchedule(
  form: AdminRewardTemplateUpsertInput,
  patch: Partial<AdminRewardTemplateFlashSchedule>,
): AdminRewardTemplateUpsertInput {
  const current = form.flash_schedule ?? {
    campaign_name: form.title,
    starts_at: "",
    ends_at: "",
    max_claims: 100,
    max_claims_per_user: 1,
    override_valid_days: null,
  };

  return {
    ...form,
    flash_schedule: {
      ...current,
      ...patch,
    },
  };
}

export function RewardCampaignScheduleStep({
  form,
  onChange,
}: RewardCampaignScheduleStepProps) {
  const isFlashOnly = form.distribution_mode === "flash_only";
  const schedule = form.flash_schedule;

  if (!isFlashOnly) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#17130f] px-4 py-3 text-sm text-[#d4c4b7]">
        此模板為自動發放模式，無需設定搶券檔期。你可直接發布模板，或於 Step 2 改為「限時搶領」。
      </div>
    );
  }

  if (!schedule) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-[#17130f] px-4 py-3 text-sm text-[#d4c4b7]">
        設定限時搶券檔期：活動開始後會員可在獎勵中心搶領，庫存搶完即止。
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="campaign-name">活動名稱</Label>
          <Input
            id="campaign-name"
            value={schedule.campaign_name}
            onChange={(event) =>
              onChange(patchSchedule(form, { campaign_name: event.target.value }))
            }
            placeholder="例：週末限時免運搶券"
          />
        </div>
        <div>
          <Label htmlFor="campaign-starts">活動開始</Label>
          <Input
            id="campaign-starts"
            type="datetime-local"
            value={schedule.starts_at}
            onChange={(event) =>
              onChange(patchSchedule(form, { starts_at: event.target.value }))
            }
          />
        </div>
        <div>
          <Label htmlFor="campaign-ends">活動結束</Label>
          <Input
            id="campaign-ends"
            type="datetime-local"
            value={schedule.ends_at}
            onChange={(event) =>
              onChange(patchSchedule(form, { ends_at: event.target.value }))
            }
          />
        </div>
        <div>
          <Label htmlFor="campaign-stock">場次庫存</Label>
          <Input
            id="campaign-stock"
            type="number"
            min={1}
            value={schedule.max_claims}
            onChange={(event) =>
              onChange(
                patchSchedule(form, {
                  max_claims: Number(event.target.value || 0),
                }),
              )
            }
          />
        </div>
        <div>
          <Label htmlFor="campaign-per-user">每人限搶（每日）</Label>
          <Input
            id="campaign-per-user"
            type="number"
            min={1}
            value={schedule.max_claims_per_user}
            onChange={(event) =>
              onChange(
                patchSchedule(form, {
                  max_claims_per_user: Number(event.target.value || 1),
                }),
              )
            }
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="campaign-override-days">領取後有效天數（選填，覆寫模板）</Label>
          <Input
            id="campaign-override-days"
            type="number"
            min={1}
            value={schedule.override_valid_days ?? ""}
            onChange={(event) =>
              onChange(
                patchSchedule(form, {
                  override_valid_days: event.target.value
                    ? Number(event.target.value)
                    : null,
                }),
              )
            }
            placeholder="留空則沿用模板設定"
          />
        </div>
      </div>
    </div>
  );
}
