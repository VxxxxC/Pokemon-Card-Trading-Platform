import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getAdminRewardActivity,
  setAdminRewardActivityStatus,
  upsertAdminRewardActivity,
} from "@/app/actions/admin-reward-activities";
import {
  clearSessionCache,
  getBuyerClient,
  getBuyerUserId,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { createServiceRoleClient } from "../shared/supabase-admin";
import { cleanupMatrixRun } from "./helpers/cleanup";
import { hasRewardsIntegrationEnv } from "./helpers/env";
import {
  buildAutoGrantDiscountInput,
  buildAutoGrantPointsInput,
  buildFlashWithCatalogConflictInput,
  buildPointsCatalogDiscountInput,
  uniqueTitle,
} from "./helpers/fixtures";
import { publishActivity } from "./helpers/publish";
import { activityRowToForm } from "@/lib/admin-rewards/template-form";
import { seedUserPoints } from "../shared/seed-user-points";

const RUN_ID = `catalog-${Date.now()}`;
const TITLE_PREFIX = `Vitest Catalog ${RUN_ID}`;

type CatalogRow = Record<string, unknown>;

async function setBuyerPointsBalance(target: number): Promise<void> {
  const buyer = getBuyerClient();
  await seedUserPoints(getBuyerUserId(), target, buyer);
}

async function listCatalogForBuyer(): Promise<CatalogRow[]> {
  const buyer = getBuyerClient();
  const { data, error } = await buyer.rpc("rpc_list_points_redemption_catalog");
  if (error) {
    throw new Error(`[listCatalogForBuyer] ${error.message}`);
  }
  return data as CatalogRow[];
}

describe.skipIf(!hasRewardsIntegrationEnv())("points redemption catalog", () => {
  let catalogId: string | null = null;
  let templateId: string | null = null;

  beforeAll(async () => {
    await warmSession("buyer");
    await warmSession("admin");
  });

  afterAll(async () => {
    await cleanupMatrixRun(TITLE_PREFIX, getBuyerUserId());
    clearSessionCache();
  });

  it("I-G8 admin upsert creates catalog row", async () => {
    const title = uniqueTitle("I-G8", RUN_ID);
    templateId = await publishActivity(
      buildPointsCatalogDiscountInput(title, { pointsCost: 120, stock: 3 }),
    );

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("reward_redemption_catalog")
      .select("id, points_cost, stock, is_active, template_id")
      .eq("template_id", templateId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data!.points_cost).toBe(120);
    expect(data!.stock).toBe(3);
    expect(data!.is_active).toBe(true);

    const activity = await runAsAdmin(async () =>
      getAdminRewardActivity(templateId!),
    );
    expect(activity.success).toBe(true);
    if (activity.success) {
      expect(activity.data.is_infinite).toBe(true);
      expect(activity.data.trigger_conditions).toEqual({ kind: "none" });
    }

    catalogId = data!.id;
  });

  it("I-G1 list returns active catalog with can_redeem", async () => {
    expect(catalogId).toBeTruthy();
    await setBuyerPointsBalance(500);

    const rows = await listCatalogForBuyer();
    const row = rows.find((entry) => entry.catalog_id === catalogId);
    expect(row).toBeTruthy();
    expect(row!.points_cost).toBe(120);
    expect(row!.can_redeem).toBe(true);
  });

  it("I-G3 redeem happy path deducts points and stock", async () => {
    expect(catalogId).toBeTruthy();
    await setBuyerPointsBalance(500);

    const buyer = getBuyerClient();
    const before = await buyer.rpc("rpc_list_points_redemption_catalog");
    const item = (before.data as CatalogRow[]).find(
      (entry) => entry.catalog_id === catalogId,
    );
    expect(item?.stock).toBe(3);

    const { data, error } = await buyer.rpc("rpc_redeem_points_catalog_item", {
      p_catalog_id: catalogId!,
    });

    expect(error).toBeNull();
    const payload = data as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(payload.points_redeemed).toBe(120);
    expect(payload.points_balance).toBe(380);
    expect(typeof payload.user_reward_id).toBe("string");

    const admin = createServiceRoleClient();
    const { data: catalogRow } = await admin
      .from("reward_redemption_catalog")
      .select("stock")
      .eq("id", catalogId!)
      .single();
    expect(catalogRow?.stock).toBe(2);

    const { data: ledgerRows } = await admin
      .from("point_ledger")
      .select("amount, source_type, source_ref")
      .eq("user_id", getBuyerUserId())
      .eq("source_type", "redemption")
      .eq("source_ref", catalogId!)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(ledgerRows?.[0]?.amount).toBe(-120);
  });

  it("I-G4 insufficient points rejects redeem", async () => {
    expect(catalogId).toBeTruthy();
    await setBuyerPointsBalance(10);

    const buyer = getBuyerClient();
    const { error } = await buyer.rpc("rpc_redeem_points_catalog_item", {
      p_catalog_id: catalogId!,
    });

    expect(error?.message).toMatch(/積分不足/);
  });

  it("I-G2a archived template excluded from list", async () => {
    const title = uniqueTitle("I-G2a", RUN_ID);
    const archivedTemplateId = await publishActivity(
      buildPointsCatalogDiscountInput(title, { pointsCost: 80, stock: 2 }),
    );

    const admin = createServiceRoleClient();
    const { data: catalogRow } = await admin
      .from("reward_redemption_catalog")
      .select("id")
      .eq("template_id", archivedTemplateId)
      .single();
    expect(catalogRow?.id).toBeTruthy();

    const archived = await runAsAdmin(async () =>
      setAdminRewardActivityStatus(archivedTemplateId, "archived"),
    );
    expect(archived.success).toBe(true);

    const rows = await listCatalogForBuyer();
    expect(
      rows.some((entry) => entry.catalog_id === catalogRow!.id),
    ).toBe(false);
  });

  it("I-G2b points template catalog excluded from list", async () => {
    const title = uniqueTitle("I-G2b", RUN_ID);
    const pointsTemplateId = await publishActivity(buildAutoGrantPointsInput(title));

    const admin = createServiceRoleClient();
    const { error: insertError } = await admin
      .from("reward_redemption_catalog")
      .insert({
        template_id: pointsTemplateId,
        points_cost: 50,
        stock: 1,
        initial_stock: 1,
        is_active: true,
        display_order: 0,
      });
    expect(insertError).toBeNull();

    const { data: inserted } = await admin
      .from("reward_redemption_catalog")
      .select("id")
      .eq("template_id", pointsTemplateId)
      .single();

    const rows = await listCatalogForBuyer();
    expect(
      rows.some((entry) => entry.catalog_id === inserted?.id),
    ).toBe(false);
  });

  it("I-G5 sold out catalog shows can_redeem false and rejects redeem", async () => {
    const title = uniqueTitle("I-G5", RUN_ID);
    const soldOutTemplateId = await publishActivity(
      buildPointsCatalogDiscountInput(title, { pointsCost: 60, stock: 1 }),
    );

    const admin = createServiceRoleClient();
    const { data: soldOutCatalog } = await admin
      .from("reward_redemption_catalog")
      .select("id")
      .eq("template_id", soldOutTemplateId)
      .single();
    expect(soldOutCatalog?.id).toBeTruthy();

    await setBuyerPointsBalance(500);
    const buyer = getBuyerClient();
    const redeem = await buyer.rpc("rpc_redeem_points_catalog_item", {
      p_catalog_id: soldOutCatalog!.id,
    });
    expect(redeem.error).toBeNull();

    const rows = await listCatalogForBuyer();
    const row = rows.find((entry) => entry.catalog_id === soldOutCatalog!.id);
    expect(row).toBeTruthy();
    expect(row!.stock).toBe(0);
    expect(row!.can_redeem).toBe(false);

    const retry = await buyer.rpc("rpc_redeem_points_catalog_item", {
      p_catalog_id: soldOutCatalog!.id,
    });
    expect(retry.error?.message).toMatch(/商品已兌完/);
  });

  it("I-G6 concurrent redeem only one succeeds for last stock", async () => {
    const title = uniqueTitle("I-G6", RUN_ID);
    const raceTemplateId = await publishActivity(
      buildPointsCatalogDiscountInput(title, { pointsCost: 40, stock: 1 }),
    );

    const admin = createServiceRoleClient();
    const { data: raceCatalog } = await admin
      .from("reward_redemption_catalog")
      .select("id")
      .eq("template_id", raceTemplateId)
      .single();
    expect(raceCatalog?.id).toBeTruthy();

    await setBuyerPointsBalance(500);
    const buyer = getBuyerClient();

    const results = await Promise.allSettled([
      buyer.rpc("rpc_redeem_points_catalog_item", {
        p_catalog_id: raceCatalog!.id,
      }),
      buyer.rpc("rpc_redeem_points_catalog_item", {
        p_catalog_id: raceCatalog!.id,
      }),
    ]);

    const successes = results.filter(
      (result) =>
        result.status === "fulfilled" &&
        result.value.error === null &&
        (result.value.data as Record<string, unknown> | null)?.success === true,
    );
    const failures = results.filter(
      (result) =>
        result.status === "fulfilled" &&
        (result.value.error !== null ||
          (result.value.data as Record<string, unknown> | null)?.success !==
            true),
    );

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    await expect
      .poll(async () => {
        const { data: catalogRow } = await admin
          .from("reward_redemption_catalog")
          .select("stock")
          .eq("id", raceCatalog!.id)
          .single();
        const { count } = await admin
          .from("reward_redemption_claims")
          .select("id", { count: "exact", head: true })
          .eq("catalog_id", raceCatalog!.id);
        return { stock: catalogRow?.stock ?? -1, claims: count ?? 0 };
      })
      .toEqual({ stock: 0, claims: 1 });
  });

  it("I-G10 redeem rejects when template is_infinite is false", async () => {
    const title = uniqueTitle("I-G10", RUN_ID);
    const finiteTemplateId = await publishActivity({
      ...buildAutoGrantDiscountInput(title),
      is_infinite: false,
      max_claims: 10,
    });

    const admin = createServiceRoleClient();
    const { error: insertError } = await admin
      .from("reward_redemption_catalog")
      .insert({
        template_id: finiteTemplateId,
        points_cost: 30,
        stock: 2,
        initial_stock: 2,
        is_active: true,
        display_order: 0,
      });
    expect(insertError).toBeNull();

    const { data: finiteCatalog } = await admin
      .from("reward_redemption_catalog")
      .select("id")
      .eq("template_id", finiteTemplateId)
      .single();
    expect(finiteCatalog?.id).toBeTruthy();

    const activity = await runAsAdmin(async () =>
      getAdminRewardActivity(finiteTemplateId),
    );
    expect(activity.success).toBe(true);
    if (activity.success) {
      expect(activity.data.is_infinite).not.toBe(true);
    }

    await setBuyerPointsBalance(500);
    const buyer = getBuyerClient();
    const { error } = await buyer.rpc("rpc_redeem_points_catalog_item", {
      p_catalog_id: finiteCatalog!.id,
    });
    expect(error?.message).toMatch(/積分商城需無限庫存模板/);
  });

  it("admin ignores redemption catalog for points type (G1.3)", async () => {
    const title = uniqueTitle("AdminPointsNeg", RUN_ID);
    const result = await runAsAdmin(async () =>
      upsertAdminRewardActivity({
        ...buildAutoGrantPointsInput(title),
        redemption_catalog: {
          enabled: true,
          points_cost: 100,
          stock: 5,
          is_active: true,
          display_order: 0,
        },
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("reward_redemption_catalog")
      .select("id")
      .eq("template_id", result.data.activityId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("admin rejects flash_only with redemption catalog", async () => {
    const title = uniqueTitle("AdminNeg", RUN_ID);
    const result = await runAsAdmin(async () =>
      upsertAdminRewardActivity(
        buildFlashWithCatalogConflictInput(title, `Flash ${RUN_ID}`),
      ),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/搶券活動不可同時上架積分商城/);
    }
  });

  it("I-G11 per-user lifetime limit blocks repeat redeem", async () => {
    const title = uniqueTitle("I-G11", RUN_ID);
    const limitedTemplateId = await publishActivity(
      buildPointsCatalogDiscountInput(title, {
        pointsCost: 50,
        stock: 10,
        maxRedemptionsPerUser: 1,
      }),
    );

    const admin = createServiceRoleClient();
    const { data: limitedCatalog } = await admin
      .from("reward_redemption_catalog")
      .select("id, max_redemptions_per_user")
      .eq("template_id", limitedTemplateId)
      .single();
    expect(limitedCatalog?.max_redemptions_per_user).toBe(1);

    await setBuyerPointsBalance(500);
    const buyer = getBuyerClient();

    const first = await buyer.rpc("rpc_redeem_points_catalog_item", {
      p_catalog_id: limitedCatalog!.id,
    });
    expect(first.error).toBeNull();

    const rows = await listCatalogForBuyer();
    const row = rows.find((entry) => entry.catalog_id === limitedCatalog!.id);
    expect(row).toBeTruthy();
    expect(row!.user_redemption_count).toBe(1);
    expect(row!.can_redeem).toBe(false);

    const retry = await buyer.rpc("rpc_redeem_points_catalog_item", {
      p_catalog_id: limitedCatalog!.id,
    });
    expect(retry.error?.message).toMatch(/你已達此商品的兌換上限/);
  });

  it("I-G12 admin cannot lower per-user limit below existing claims", async () => {
    const title = uniqueTitle("I-G12", RUN_ID);
    const limitTemplateId = await publishActivity(
      buildPointsCatalogDiscountInput(title, {
        pointsCost: 30,
        stock: 10,
        maxRedemptionsPerUser: null,
      }),
    );

    const admin = createServiceRoleClient();
    const { data: catalogRow } = await admin
      .from("reward_redemption_catalog")
      .select("id")
      .eq("template_id", limitTemplateId)
      .single();
    expect(catalogRow?.id).toBeTruthy();

    await setBuyerPointsBalance(500);
    const buyer = getBuyerClient();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const redeem = await buyer.rpc("rpc_redeem_points_catalog_item", {
        p_catalog_id: catalogRow!.id,
      });
      expect(redeem.error).toBeNull();
    }

    const activity = await runAsAdmin(async () =>
      getAdminRewardActivity(limitTemplateId),
    );
    expect(activity.success).toBe(true);
    if (!activity.success) {
      return;
    }

    const form = activityRowToForm(activity.data);
    const update = await runAsAdmin(async () =>
      upsertAdminRewardActivity({
        ...form,
        redemption_catalog: {
          ...form.redemption_catalog!,
          max_redemptions_per_user: 1,
        },
      }),
    );

    expect(update.success).toBe(false);
    if (!update.success) {
      expect(update.error).toMatch(/每人限兌次數不可低於已有用戶的兌換次數/);
    }
  });
});
