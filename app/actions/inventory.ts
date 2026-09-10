"use server";

import type {
  GetUserInventoryGroupsInput,
  InventoryGroupsPage,
  InventoryPageBootstrap,
  InventoryStatusFilter,
  InventorySummary,
} from "@/app/lib/inventory/types";
import { DEFAULT_INVENTORY_STATUS_FILTER } from "@/app/lib/inventory/types";
import {
  INVENTORY_DEFAULT_PAGE_SIZE,
  INVENTORY_MAX_PAGE_SIZE,
} from "@/lib/listings/constants";
import {
  loadUserInventoryView,
  type UserInventoryViewInput,
} from "@/lib/listings/load-user-inventory";
import {
  inventoryPerfLog,
  inventoryPerfNow,
  isInventoryPerfLogEnabled,
} from "@/lib/listings/perf-log";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type InventoryResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getAuthenticatedUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

function normalizeInventoryStatusFilter(
  value: InventoryStatusFilter | undefined,
): InventoryStatusFilter {
  if (value === "active" || value === "inactive" || value === "sold") {
    return value;
  }
  return DEFAULT_INVENTORY_STATUS_FILTER;
}

function normalizeGroupsInput(input: GetUserInventoryGroupsInput): UserInventoryViewInput {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(
    INVENTORY_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(input.pageSize ?? INVENTORY_DEFAULT_PAGE_SIZE)),
  );
  const query = (input.query ?? "").trim();

  return {
    page,
    pageSize,
    query,
    sellerPersona: input.sellerPersona,
    statusFilter: normalizeInventoryStatusFilter(input.statusFilter),
  };
}

async function loadViewForUser(userId: string, input: UserInventoryViewInput) {
  const supabase = await createClient();
  return loadUserInventoryView(supabase, userId, input, "inventory");
}

export async function getInventoryPageBootstrap(
  input: GetUserInventoryGroupsInput = {},
): Promise<InventoryResult<InventoryPageBootstrap>> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { success: false, error: "請先登入" };
  }

  const viewInput = normalizeGroupsInput(input);
  const totalStart = isInventoryPerfLogEnabled() ? inventoryPerfNow() : 0;

  try {
    const supabase = await createClient();
    const view = await loadUserInventoryView(supabase, userId, viewInput, "bootstrap");

    if (isInventoryPerfLogEnabled()) {
      inventoryPerfLog(
        `bootstrap.totalMs=${Math.round(inventoryPerfNow() - totalStart)} listings=${view.summary.totalListings} groups=${view.page.totalGroups} query=${viewInput.query || "(none)"}`,
      );
    }

    return {
      success: true,
      data: {
        summary: view.summary,
        page: view.page,
      },
    };
  } catch (error) {
    console.error("[getInventoryPageBootstrap]", error);
    return { success: false, error: "無法載入庫存商品" };
  }
}

export async function getUserInventorySummary(): Promise<
  InventoryResult<InventorySummary>
> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { success: false, error: "請先登入" };
  }

  try {
    const view = await loadViewForUser(userId, {
      page: 1,
      pageSize: INVENTORY_DEFAULT_PAGE_SIZE,
      query: "",
      sellerPersona: "member",
    });

    return { success: true, data: view.summary };
  } catch (error) {
    console.error("[getUserInventorySummary]", error);
    return { success: false, error: "無法載入庫存統計" };
  }
}

export async function getUserInventoryGroups(
  input: GetUserInventoryGroupsInput = {},
): Promise<InventoryResult<InventoryGroupsPage>> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { success: false, error: "請先登入" };
  }

  const viewInput = normalizeGroupsInput(input);

  try {
    const view = await loadViewForUser(userId, viewInput);
    return { success: true, data: view.page };
  } catch (error) {
    console.error("[getUserInventoryGroups]", error);
    return { success: false, error: "無法載入庫存商品" };
  }
}
