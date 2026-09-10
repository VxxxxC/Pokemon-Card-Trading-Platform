import type {
  AdminRewardCampaignRow,
  AdminRewardCampaignStatus,
} from "@/lib/admin-rewards/types";

function parseCampaignStatus(value: unknown): AdminRewardCampaignStatus {
  if (
    value === "draft" ||
    value === "active" ||
    value === "paused" ||
    value === "ended"
  ) {
    return value;
  }
  return "draft";
}

export function parseAdminRewardCampaignRow(
  data: unknown,
): AdminRewardCampaignRow | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.template_id !== "string") {
    return null;
  }

  return {
    id: row.id,
    template_id: row.template_id,
    name: typeof row.name === "string" ? row.name : "未命名活動",
    status: parseCampaignStatus(row.status),
    starts_at: typeof row.starts_at === "string" ? row.starts_at : "",
    ends_at: typeof row.ends_at === "string" ? row.ends_at : "",
    max_claims: Number(row.max_claims ?? 0),
    claimed_count: Number(row.claimed_count ?? 0),
    max_claims_per_user: Number(row.max_claims_per_user ?? 1),
    override_valid_days:
      row.override_valid_days == null ? null : Number(row.override_valid_days),
    created_by: typeof row.created_by === "string" ? row.created_by : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    template_title:
      typeof row.template_title === "string" ? row.template_title : null,
    template_type:
      typeof row.template_type === "string" ? row.template_type : null,
  };
}

export function parseAdminRewardCampaignListPayload(data: unknown): {
  rows: AdminRewardCampaignRow[];
  total: number;
  page: number;
  pageSize: number;
} {
  if (!data || typeof data !== "object") {
    return { rows: [], total: 0, page: 1, pageSize: 20 };
  }

  const payload = data as Record<string, unknown>;
  const rows = Array.isArray(payload.rows)
    ? payload.rows.flatMap((entry) => {
        const parsed = parseAdminRewardCampaignRow(entry);
        return parsed ? [parsed] : [];
      })
    : [];

  return {
    rows,
    total: Number(payload.total ?? rows.length),
    page: Number(payload.page ?? 1),
    pageSize: Number(payload.page_size ?? 20),
  };
}
