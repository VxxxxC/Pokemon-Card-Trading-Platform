import {
  setAdminRewardActivityStatus,
  upsertAdminRewardActivity,
} from "@/app/actions/admin-reward-activities";
import type { AdminRewardActivityUpsertInput } from "@/lib/admin-rewards/types";
import { runAsAdmin } from "../../shared/auth-context";

export async function publishActivity(
  input: AdminRewardActivityUpsertInput,
): Promise<string> {
  return runAsAdmin(async () => {
    const save = await upsertAdminRewardActivity(input);
    if (!save.success) {
      throw new Error(save.error);
    }

    const publish = await setAdminRewardActivityStatus(
      save.data.activityId,
      "active",
    );
    if (!publish.success) {
      throw new Error(publish.error);
    }

    return save.data.activityId;
  });
}
