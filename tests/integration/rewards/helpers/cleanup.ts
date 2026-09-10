import {
  listAdminRewardActivities,
  setAdminRewardActivityStatus,
} from "@/app/actions/admin-reward-activities";
import { getAdminClient, runAsAdmin, warmSession } from "../../shared/auth-context";
import { createServiceRoleClient } from "../../shared/supabase-admin";

async function listTemplateIdsByTitlePrefix(
  titlePrefix: string,
): Promise<string[]> {
  return runAsAdmin(async () => {
    const list = await listAdminRewardActivities({
      status: "all",
      pageSize: 200,
    });
    if (!list.success) {
      throw new Error(`[cleanupTemplatesByTitlePrefix] ${list.error}`);
    }

    return list.data.rows
      .filter((row) => row.title.startsWith(titlePrefix))
      .map((row) => row.activity_id);
  });
}

export async function cleanupTemplatesByTitlePrefix(
  titlePrefix: string,
): Promise<void> {
  const templateIds = await listTemplateIdsByTitlePrefix(titlePrefix);
  if (templateIds.length === 0) {
    return;
  }

  await runAsAdmin(async () => {
    const list = await listAdminRewardActivities({
      status: "all",
      pageSize: 200,
    });
    if (!list.success) {
      throw new Error(`[cleanupTemplatesByTitlePrefix] ${list.error}`);
    }

    for (const row of list.data.rows) {
      if (!row.title.startsWith(titlePrefix)) {
        continue;
      }
      if (row.status === "archived") {
        continue;
      }
      const archived = await setAdminRewardActivityStatus(
        row.activity_id,
        "archived",
      );
      if (!archived.success) {
        throw new Error(`[cleanupTemplatesByTitlePrefix] ${archived.error}`);
      }
    }
  });

  const admin = createServiceRoleClient();

  const { error: ledgerError } = await admin
    .from("point_ledger")
    .delete()
    .eq("source_type", "reward_template")
    .in("source_ref", templateIds);
  if (ledgerError) {
    throw new Error(`[cleanupTemplatesByTitlePrefix] ${ledgerError.message}`);
  }
}

export async function resetBuyerProfile(buyerId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("profiles")
    .update({ completed_trades_count: 0 })
    .eq("id", buyerId);

  if (error) {
    throw new Error(`[resetBuyerProfile] ${error.message}`);
  }
}

export async function cleanupMatrixRun(
  titlePrefix: string,
  buyerId: string,
): Promise<void> {
  await cleanupTemplatesByTitlePrefix(titlePrefix);
  await resetBuyerProfile(buyerId);
}

export async function wipeCouponFsmRun(params: {
  orderIds: string[];
  userRewardIds: string[];
  templateIds?: string[];
}): Promise<void> {
  const admin = createServiceRoleClient();

  if (params.templateIds && params.templateIds.length > 0) {
    await warmSession("admin");
    await runAsAdmin(async () => {
      const client = getAdminClient();
      for (const templateId of params.templateIds ?? []) {
        const { error } = await client.rpc(
          "rpc_admin_set_reward_activity_status",
          {
            p_template_id: templateId,
            p_status: "archived",
          },
        );
        if (error) {
          throw new Error(
            `[wipeCouponFsmRun] archive template ${templateId}: ${error.message}`,
          );
        }
      }
    });
  }

  for (const orderId of params.orderIds) {
    const { error: merchantReleaseError } = await admin.rpc(
      "fn_release_merchant_order_coupon",
      { p_order_id: orderId },
    );
    if (
      merchantReleaseError &&
      !merchantReleaseError.message.includes("does not exist")
    ) {
      throw new Error(
        `[wipeCouponFsmRun] merchant release ${orderId}: ${merchantReleaseError.message}`,
      );
    }

    const { error: memberReleaseError } = await admin.rpc(
      "fn_release_member_order_coupon",
      { p_order_id: orderId },
    );
    if (
      memberReleaseError &&
      !memberReleaseError.message.includes("does not exist")
    ) {
      throw new Error(
        `[wipeCouponFsmRun] member release ${orderId}: ${memberReleaseError.message}`,
      );
    }
  }

  if (params.userRewardIds.length > 0) {
    const { error: rewardDeleteError } = await admin
      .from("user_rewards")
      .delete()
      .in("id", params.userRewardIds);

    if (rewardDeleteError) {
      throw new Error(`[wipeCouponFsmRun] rewards: ${rewardDeleteError.message}`);
    }
  }
}
