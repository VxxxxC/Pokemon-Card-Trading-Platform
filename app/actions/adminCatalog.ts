"use server";

import type { CatalogType } from "@/lib/constants/commerce";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin 卡牌資料庫專用 item kind。
 * － card：獨立卡（single_card）
 * － box_set：盒裝／套組（booster_pack / gift_set / starter_deck）
 */
export type AdminCatalogItemKind = "card" | "box_set";

export type AdminCatalogEntry = {
  id: string;
  nameJa: string;
  nameEn: string | null;
  nameZh: string | null;
  setCode: string;
  cardNumber: string | null;
  displayId: string | null;
  janCode: string | null;
  imageUrl: string;
  type: CatalogType;
  rarity: string | null;
  pokemonStage: string | null;
  updatedAt: string;
};

export type ListAdminCatalogParams = {
  query?: string;
  itemKind: AdminCatalogItemKind;
  page: number; // 1-based
  pageSize: number;
  setCode?: string;
  rarity?: string;
};

export type ListAdminCatalogResult =
  | {
      success: true;
      data: AdminCatalogEntry[];
      total: number;
      page: number;
      totalPages: number;
    }
  | { success: false; error: string };

/**
 * 管理員卡牌資料庫專用範圍：排除 booster_box（內容等同 booster_pack）
 * 與 accessories（周邊商品，非目標資料）。
 * ⚠️ 此處不使用 lib/constants/commerce.ts 的 CATALOG_TYPES_BOX_SET，
 *    因為 marketplace 前台仍需要 booster_box，而 admin 字典不想納入它。
 */
const ADMIN_CATALOG_CARD_TYPES = ["single_card"] as const;
const ADMIN_CATALOG_BOX_SET_TYPES = [
  "booster_pack",
  "gift_set",
  "starter_deck",
] as const;

/** 單次查詢可回傳的最大筆數上限，防止過大的 pageSize 拖垮 DB。 */
const MAX_ADMIN_CATALOG_PAGE_SIZE = 100;

const PRODUCT_CATALOG_COLUMNS = [
  "id",
  "name_ja",
  "name_en",
  "name_zh",
  "set_code",
  "card_number",
  "display_id",
  "jan_code",
  "image_url",
  "type",
  "rarity",
  "pokemon_stage",
  "updated_at",
].join(", ");

/**
 * Escape Postgres ILIKE 特殊字元（%, _）以及 Supabase PostgREST `.or()`
 * 用於分隔多個條件的逗號 ,，避免用戶輸入破壞查詢語法或產生意外的全表匹配。
 *
 * 參考：lib/search/card-identifier.ts 提供的是客戶端字串比對函式，
 * 沒有現成的 SQL-like escape helper，因此在這裡自行實作。
 */
function escapeIlike(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "\\,")
    // PostgREST 的 .or() 以括號界定條件群組；未轉義的括號（例如卡名
    // "Pikachu (25th)"）會令解析器配對失敗並回 HTTP 400。
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function toAdminCatalogEntry(row: {
  id: string;
  name_ja: string;
  name_en: string | null;
  name_zh: string | null;
  set_code: string;
  card_number: string | null;
  display_id: string | null;
  jan_code: string | null;
  image_url: string;
  type: CatalogType;
  rarity: string | null;
  pokemon_stage: string | null;
  updated_at: string;
}): AdminCatalogEntry {
  return {
    id: row.id,
    nameJa: row.name_ja,
    nameEn: row.name_en,
    nameZh: row.name_zh,
    setCode: row.set_code,
    cardNumber: row.card_number,
    displayId: row.display_id,
    janCode: row.jan_code,
    imageUrl: row.image_url,
    type: row.type,
    rarity: row.rarity,
    pokemonStage: row.pokemon_stage,
    updatedAt: row.updated_at,
  };
}

/**
 * 管理員卡牌字典分頁查詢。
 *
 * 不使用 search_product_catalog RPC 的原因：
 * 1. 該 RPC 是 autocomplete 專用，hard limit 12 筆且無分頁資訊，
 *    不適合後台資料庫瀏覽+分頁場景。
 * 2. Admin 字典需要精確的 count / page / totalPages，以及按 set_code
 *    與 card_number 穩定排序，因此直接對 product_catalog 做 SELECT
 *    搭配 count("exact") 與 range 分頁更可控。
 * 3. 搜尋欄位需要跨 name_ja / name_en / name_zh / card_number / display_id
 *    / set_code / jan_code 做 OR ilike，將邏輯封裝在 server action 中
 *    可避免前端拼湊 PostgREST filter。
 */
export async function listAdminCatalogEntries(
  params: ListAdminCatalogParams,
): Promise<ListAdminCatalogResult> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: "未登入" };
    }

    const user = await getOptionalAuthUser();
    if (!user) {
      return { success: false, error: "未登入" };
    }

    const supabase = await createClient();

    const isAdmin = await isCurrentUserAdmin(supabase, user.id);
    if (!isAdmin) {
      return { success: false, error: "權限不足" };
    }

    const { query, itemKind, page, pageSize, setCode, rarity } = params;

    if (page < 1) {
      return { success: false, error: "頁碼不能小於 1" };
    }
    if (pageSize < 1) {
      return { success: false, error: "每頁筆數不能小於 1" };
    }

    // 上界 clamp：防止惡意或誤傳的巨大 pageSize 觸發全表掃描與記憶體壓力。
    const safePageSize = Math.min(pageSize, MAX_ADMIN_CATALOG_PAGE_SIZE);

    const types: CatalogType[] =
      itemKind === "card"
        ? [...ADMIN_CATALOG_CARD_TYPES]
        : [...ADMIN_CATALOG_BOX_SET_TYPES];

    let builder = supabase
      .from("product_catalog")
      .select(PRODUCT_CATALOG_COLUMNS, { count: "exact" })
      .in("type", types);

    const trimmedQuery = query?.trim();
    if (trimmedQuery) {
      const escaped = escapeIlike(trimmedQuery);
      const pattern = `%${escaped}%`;

      builder = builder.or(
        `name_ja.ilike.${pattern},name_en.ilike.${pattern},name_zh.ilike.${pattern},card_number.ilike.${pattern},display_id.ilike.${pattern},set_code.ilike.${pattern},jan_code.ilike.${pattern}`,
        { foreignTable: undefined },
      );
    }

    const trimmedSetCode = setCode?.trim();
    if (trimmedSetCode) {
      const escapedSetCode = escapeIlike(trimmedSetCode);
      builder = builder.ilike("set_code", `%${escapedSetCode}%`);
    }

    const trimmedRarity = rarity?.trim();
    if (trimmedRarity) {
      builder = builder.eq("rarity", trimmedRarity);
    }

    const from = (page - 1) * safePageSize;
    const to = page * safePageSize - 1;

    const { data, error, count } = await builder
      .order("set_code", { ascending: true })
      .order("card_number", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("[listAdminCatalogEntries] query", error.message);
      return { success: false, error: "查詢卡牌資料庫時發生錯誤" };
    }

    const rows = (data ?? []) as unknown as {
      id: string;
      name_ja: string;
      name_en: string | null;
      name_zh: string | null;
      set_code: string;
      card_number: string | null;
      display_id: string | null;
      jan_code: string | null;
      image_url: string;
      type: CatalogType;
      rarity: string | null;
      pokemon_stage: string | null;
      updated_at: string;
    }[];

    const total = count ?? 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / safePageSize);

    return {
      success: true,
      data: rows.map(toAdminCatalogEntry),
      total,
      page,
      totalPages,
    };
  } catch (error) {
    console.error("[listAdminCatalogEntries]", error);
    return { success: false, error: "無法連線至卡牌資料庫" };
  }
}
