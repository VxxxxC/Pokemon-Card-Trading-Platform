"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  orderKindsToScope,
  ORDER_KINDS_SCOPE_LABELS,
  restrictionsForTypeChange,
  rewardValueForType,
  scopeToOrderKinds,
  type OrderKindsScope,
} from "@/lib/admin-rewards/template-form";
import {
  DEFAULT_ADMIN_REWARD_RESTRICTIONS,
  type AdminRewardEventOnceEvent,
  type AdminRewardTemplateType,
  type AdminRewardTemplateUpsertInput,
  type AdminRewardTriggerKind,
} from "@/lib/admin-rewards/types";

type RewardTemplateDefinitionStepProps = {
  form: AdminRewardTemplateUpsertInput;
  onChange: (next: AdminRewardTemplateUpsertInput) => void;
};

export function RewardTemplateDefinitionStep({
  form,
  onChange,
}: RewardTemplateDefinitionStepProps) {
  const triggerKind = (form.trigger_conditions.kind ??
    "event_once") as AdminRewardTriggerKind;
  const isLegacyCheckInTrigger =
    triggerKind === "check_in_streak" || triggerKind === "check_in_cycle_day";

  const updateRewardValue = (patch: Record<string, unknown>) => {
    onChange({
      ...form,
      reward_value: { ...form.reward_value, ...patch },
    });
  };

  const updateTrigger = (patch: Record<string, unknown>) => {
    onChange({
      ...form,
      trigger_conditions: { ...form.trigger_conditions, ...patch },
    });
  };

  const updateRestrictions = (
    patch: Partial<AdminRewardTemplateUpsertInput["restrictions"]>,
  ) => {
    onChange({
      ...form,
      restrictions: {
        ...(form.restrictions ?? DEFAULT_ADMIN_REWARD_RESTRICTIONS),
        ...patch,
      },
    });
  };

  const handleTypeChange = (type: AdminRewardTemplateType) => {
    onChange({
      ...form,
      type,
      reward_value: rewardValueForType(type),
      restrictions: restrictionsForTypeChange(
        type,
        form.restrictions ?? DEFAULT_ADMIN_REWARD_RESTRICTIONS,
      ),
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <div>
          <Label htmlFor="template-title">標題</Label>
          <Input
            id="template-title"
            value={form.title}
            onChange={(event) =>
              onChange({ ...form, title: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="template-description">描述</Label>
          <Input
            id="template-description"
            value={form.description ?? ""}
            onChange={(event) =>
              onChange({ ...form, description: event.target.value })
            }
          />
        </div>
        <div>
          <Label>類型</Label>
          <Select
            value={form.type}
            onValueChange={(value) =>
              handleTypeChange(value as AdminRewardTemplateType)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="points">積分</SelectItem>
              <SelectItem value="discount_coupon">折扣券</SelectItem>
              <SelectItem value="free_shipping">免運券</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.type === "points" ? (
          <div>
            <Label htmlFor="reward-points">積分數</Label>
            <Input
              id="reward-points"
              type="number"
              value={String(form.reward_value.points ?? 0)}
              onChange={(event) =>
                updateRewardValue({ points: Number(event.target.value) })
              }
            />
            <p className="mt-1 text-xs text-[#8A8680]">
              每日簽到 PTS 階梯仍由系統獨立計算，與此模板無關。
            </p>
          </div>
        ) : null}

        {form.type === "discount_coupon" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="reward-amount">折扣金額 (HK$)</Label>
              <Input
                id="reward-amount"
                type="number"
                value={String(form.reward_value.amount_hkd ?? 0)}
                onChange={(event) =>
                  updateRewardValue({
                    amount_hkd: Number(event.target.value),
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="reward-min-spend">最低消費 (HK$)</Label>
              <Input
                id="reward-min-spend"
                type="number"
                value={String(form.reward_value.min_spend_hkd ?? 0)}
                onChange={(event) =>
                  updateRewardValue({
                    min_spend_hkd: Number(event.target.value),
                  })
                }
              />
            </div>
          </div>
        ) : null}

        {form.type === "free_shipping" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="reward-max-subsidy">平台補貼上限 (HK$)</Label>
              <Input
                id="reward-max-subsidy"
                type="number"
                value={String(form.reward_value.max_subsidy_hkd ?? 0)}
                onChange={(event) =>
                  updateRewardValue({
                    max_subsidy_hkd: Number(event.target.value),
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="reward-shipping-min">最低消費 (HK$)</Label>
              <Input
                id="reward-shipping-min"
                type="number"
                value={String(form.reward_value.min_spend_hkd ?? 0)}
                onChange={(event) =>
                  updateRewardValue({
                    min_spend_hkd: Number(event.target.value),
                  })
                }
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <div>
          <Label>觸發條件</Label>
          <Select
            value={triggerKind}
            onValueChange={(value) => {
              const kind = value as AdminRewardTriggerKind;
              if (kind === "event_once") {
                updateTrigger({
                  kind,
                  event: "profile_complete",
                  once_per_user: true,
                });
              } else {
                updateTrigger({
                  kind: "trade_count",
                  role: "buyer",
                  count: 1,
                  once_per_user: true,
                });
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="event_once">一次性事件</SelectItem>
              <SelectItem value="trade_count">成交筆數</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {triggerKind === "event_once" ? (
          <div>
            <Label>事件</Label>
            <Select
              value={String(form.trigger_conditions.event ?? "profile_complete")}
              onValueChange={(value) =>
                updateTrigger({
                  event: value as AdminRewardEventOnceEvent,
                  once_per_user: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="profile_complete">完善個人資料</SelectItem>
                <SelectItem value="first_listing">首次上架</SelectItem>
                <SelectItem value="first_chat">首次聊天</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {triggerKind === "trade_count" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>角色</Label>
              <Select
                value={String(form.trigger_conditions.role ?? "buyer")}
                onValueChange={(value) =>
                  updateTrigger({ role: value, once_per_user: true })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buyer">買家</SelectItem>
                  <SelectItem value="merchant">商戶</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="trade-count">筆數</Label>
              <Input
                id="trade-count"
                type="number"
                value={String(form.trigger_conditions.count ?? 1)}
                onChange={(event) =>
                  updateTrigger({
                    count: Number(event.target.value),
                    once_per_user: true,
                  })
                }
              />
            </div>
          </div>
        ) : null}

        {isLegacyCheckInTrigger ? (
          <p className="text-sm text-amber-200/90">
            此簽到獎勵已遷移至「簽到計劃」分頁；此活動已封存，無法編輯。
          </p>
        ) : null}

        <div>
          <Label>適用訂單</Label>
          <Select
            value={orderKindsToScope(
              form.restrictions?.order_kinds ??
                DEFAULT_ADMIN_REWARD_RESTRICTIONS.order_kinds,
            )}
            onValueChange={(value) =>
              updateRestrictions({
                order_kinds: scopeToOrderKinds(value as OrderKindsScope),
              })
            }
          >
            <SelectTrigger id="reward-order-kinds">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ORDER_KINDS_SCOPE_LABELS) as OrderKindsScope[]).map(
                (scope) => (
                  <SelectItem key={scope} value={scope}>
                    {ORDER_KINDS_SCOPE_LABELS[scope]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>適用鑑定</Label>
          <Select
            value={form.restrictions?.requires_authentication ?? "any"}
            onValueChange={(value) =>
              updateRestrictions({
                requires_authentication: value as "any" | "true" | "false",
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">全部訂單</SelectItem>
              <SelectItem value="true">僅鑑定單</SelectItem>
              <SelectItem value="false">僅非鑑定單</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="valid-days">領取後有效天數</Label>
            <Input
              id="valid-days"
              type="number"
              value={String(form.valid_duration_days ?? "")}
              onChange={(event) =>
                onChange({
                  ...form,
                  valid_duration_days: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="max-claims">限量（空白=無限）</Label>
            <Input
              id="max-claims"
              type="number"
              value={form.is_infinite ? "" : String(form.max_claims ?? "")}
              onChange={(event) => {
                const raw = event.target.value.trim();
                if (!raw) {
                  onChange({
                    ...form,
                    is_infinite: true,
                    max_claims: null,
                  });
                  return;
                }
                onChange({
                  ...form,
                  is_infinite: false,
                  max_claims: Number(raw),
                });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
