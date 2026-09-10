import { parseAdminRewardTemplateRow } from "@/lib/admin-rewards/parse-admin-reward-template";
import type {
  AdminRedemptionCatalogInput,
  AdminRewardActivityRow,
  AdminRewardCampaignStatus,
} from "@/lib/admin-rewards/types";

function parseRedemptionCatalog(
  value: unknown,
): AdminRedemptionCatalogInput | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const pointsCost = Number(row.points_cost ?? 0);
  const stock = Number(row.stock ?? 0);

  const maxPerUserRaw = row.max_redemptions_per_user;
  const maxRedemptionsPerUser =
    maxPerUserRaw == null || maxPerUserRaw === ""
      ? null
      : Number(maxPerUserRaw);

  return {
    enabled: row.enabled === true || row.is_active === true,
    points_cost: pointsCost,
    stock,
    is_active: row.is_active === true,
    display_order:
      row.display_order == null ? 0 : Number(row.display_order),
    max_redemptions_per_user:
      maxRedemptionsPerUser != null && Number.isFinite(maxRedemptionsPerUser)
        ? maxRedemptionsPerUser
        : null,
  };
}

function parseCampaignStatus(value: unknown): AdminRewardCampaignStatus | null {
  if (
    value === "draft" ||
    value === "active" ||
    value === "paused" ||
    value === "ended"
  ) {
    return value;
  }
  return null;
}

export function parseAdminRewardActivityRow(
  raw: unknown,
): AdminRewardActivityRow | null {
  const template = parseAdminRewardTemplateRow(raw);
  if (!template) {
    return null;
  }

  const row = raw as Record<string, unknown>;

  return {
    ...template,
    activity_id:
      typeof row.activity_id === "string" ? row.activity_id : template.id,
    campaign_id: typeof row.campaign_id === "string" ? row.campaign_id : null,
    campaign_name:
      typeof row.campaign_name === "string" ? row.campaign_name : null,
    campaign_status: parseCampaignStatus(row.campaign_status),
    starts_at: typeof row.starts_at === "string" ? row.starts_at : null,
    ends_at: typeof row.ends_at === "string" ? row.ends_at : null,
    campaign_max_claims:
      typeof row.campaign_max_claims === "number"
        ? row.campaign_max_claims
        : null,
    campaign_claimed_count:
      typeof row.campaign_claimed_count === "number"
        ? row.campaign_claimed_count
        : null,
    max_claims_per_user:
      typeof row.max_claims_per_user === "number"
        ? row.max_claims_per_user
        : null,
    override_valid_days:
      row.override_valid_days == null
        ? null
        : Number(row.override_valid_days),
    display_status:
      typeof row.display_status === "string"
        ? row.display_status
        : template.status,
    redemption_catalog: parseRedemptionCatalog(row.redemption_catalog),
  };
}

export function parseAdminRewardActivityListPayload(data: unknown): {
  rows: AdminRewardActivityRow[];
  total: number;
  page: number;
  pageSize: number;
} | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;
  const rowsRaw = Array.isArray(payload.rows) ? payload.rows : [];

  return {
    rows: rowsRaw
      .map(parseAdminRewardActivityRow)
      .filter((row): row is AdminRewardActivityRow => row !== null),
    total: typeof payload.total === "number" ? payload.total : 0,
    page: typeof payload.page === "number" ? payload.page : 1,
    pageSize: typeof payload.page_size === "number" ? payload.page_size : 20,
  };
}
