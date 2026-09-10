import type { PointsRedemptionCatalogView } from "@/lib/admin-rewards/types";

export function parsePointsRedemptionCatalogList(
  data: unknown,
): PointsRedemptionCatalogView[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const row = entry as Record<string, unknown>;
    const template =
      row.template && typeof row.template === "object"
        ? (row.template as Record<string, unknown>)
        : null;

    if (typeof row.catalog_id !== "string" || !template) {
      return [];
    }

    const maxPerUserRaw = row.max_redemptions_per_user;
    const maxRedemptionsPerUser =
      maxPerUserRaw == null || maxPerUserRaw === ""
        ? null
        : Number(maxPerUserRaw);

    return [
      {
        catalogId: row.catalog_id,
        pointsCost: Number(row.points_cost ?? 0),
        stock: Number(row.stock ?? 0),
        userRedemptionCount: Number(row.user_redemption_count ?? 0),
        maxRedemptionsPerUser:
          maxRedemptionsPerUser != null && Number.isFinite(maxRedemptionsPerUser)
            ? maxRedemptionsPerUser
            : null,
        canRedeem: row.can_redeem === true,
        userPointsBalance: Number(row.user_points_balance ?? 0),
        template: {
          id: typeof template.id === "string" ? template.id : "",
          title: typeof template.title === "string" ? template.title : "優惠券",
          description:
            typeof template.description === "string"
              ? template.description
              : null,
          type:
            typeof template.type === "string"
              ? template.type
              : "discount_coupon",
          rewardValue:
            template.reward_value && typeof template.reward_value === "object"
              ? (template.reward_value as Record<string, unknown>)
              : {},
          restrictions:
            template.restrictions && typeof template.restrictions === "object"
              ? (template.restrictions as Record<string, unknown>)
              : {},
        },
      },
    ];
  });
}

export function rewardLabelFromCatalogItem(
  item: PointsRedemptionCatalogView,
): string {
  if (item.template.type === "free_shipping") {
    const cap = Number(item.template.rewardValue.max_subsidy_hkd ?? 0);
    return cap > 0 ? `免運（最高 HK$${cap}）` : "免運券";
  }

  const amount = Number(item.template.rewardValue.amount_hkd ?? 0);
  return amount > 0 ? `折扣 HK$${amount}` : item.template.title;
}
