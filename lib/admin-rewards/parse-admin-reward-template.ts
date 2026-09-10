import type {
  AdminRewardAuthRestriction,
  AdminRewardTemplateRestrictions,
  AdminRewardTemplateRow,
  AdminRewardTemplateType,
} from "@/lib/admin-rewards/types";

function parseRestrictions(raw: unknown): AdminRewardTemplateRestrictions {
  const value =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const orderKindsRaw = Array.isArray(value.order_kinds)
    ? value.order_kinds
    : ["merchant"];
  const order_kinds = orderKindsRaw.filter(
    (item): item is "merchant" | "member" =>
      item === "merchant" || item === "member",
  );

  const shippingRaw = Array.isArray(value.shipping_methods)
    ? value.shipping_methods
    : ["sf"];
  const shipping_methods = shippingRaw.filter(
    (item): item is "sf" | "meetup" => item === "sf" || item === "meetup",
  );

  const authRaw = value.requires_authentication;
  const requires_authentication: AdminRewardAuthRestriction =
    authRaw === "true" || authRaw === "false" || authRaw === "any"
      ? authRaw
      : "any";

  const min_item_subtotal_hkd =
    typeof value.min_item_subtotal_hkd === "number"
      ? value.min_item_subtotal_hkd
      : 0;

  return {
    order_kinds: order_kinds.length > 0 ? order_kinds : ["merchant"],
    requires_authentication,
    shipping_methods: shipping_methods.length > 0 ? shipping_methods : ["sf"],
    min_item_subtotal_hkd,
  };
}

function isTemplateType(value: unknown): value is AdminRewardTemplateType {
  return (
    value === "points" ||
    value === "discount_coupon" ||
    value === "free_shipping"
  );
}

export function parseAdminRewardTemplateRow(
  raw: unknown,
): AdminRewardTemplateRow | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.title !== "string") {
    return null;
  }

  if (!isTemplateType(row.type)) {
    return null;
  }

  if (
    row.status !== "draft" &&
    row.status !== "active" &&
    row.status !== "archived"
  ) {
    return null;
  }

  if (row.distribution_mode !== "auto_grant" && row.distribution_mode !== "flash_only") {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    description: typeof row.description === "string" ? row.description : null,
    type: row.type,
    reward_value:
      row.reward_value && typeof row.reward_value === "object"
        ? (row.reward_value as Record<string, unknown>)
        : {},
    trigger_conditions:
      row.trigger_conditions && typeof row.trigger_conditions === "object"
        ? (row.trigger_conditions as Record<string, unknown>)
        : {},
    is_active: typeof row.is_active === "boolean" ? row.is_active : null,
    is_infinite: typeof row.is_infinite === "boolean" ? row.is_infinite : null,
    max_claims: typeof row.max_claims === "number" ? row.max_claims : null,
    claimed_count:
      typeof row.claimed_count === "number" ? row.claimed_count : 0,
    valid_duration_days:
      typeof row.valid_duration_days === "number"
        ? row.valid_duration_days
        : null,
    fixed_expiry_date:
      typeof row.fixed_expiry_date === "string" ? row.fixed_expiry_date : null,
    status: row.status,
    distribution_mode: row.distribution_mode,
    restrictions: parseRestrictions(row.restrictions),
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export function parseAdminRewardTemplateListPayload(data: unknown): {
  rows: AdminRewardTemplateRow[];
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
      .map(parseAdminRewardTemplateRow)
      .filter((row): row is AdminRewardTemplateRow => row !== null),
    total: typeof payload.total === "number" ? payload.total : 0,
    page: typeof payload.page === "number" ? payload.page : 1,
    pageSize: typeof payload.page_size === "number" ? payload.page_size : 20,
  };
}
