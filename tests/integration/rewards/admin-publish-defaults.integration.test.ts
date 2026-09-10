import { afterAll, describe, expect, it } from "vitest";
import { setAdminRewardActivityStatus } from "@/app/actions/admin-reward-activities";
import {
  buildDefaultActivityForm,
  restrictionsForTypeChange,
  rewardValueForType,
} from "@/lib/admin-rewards/template-form";
import type { AdminRewardActivityUpsertInput } from "@/lib/admin-rewards/types";
import { runAsAdmin, warmSession } from "../shared/auth-context";
import {
  getRewardTemplateRowByTitle,
  getTemplateIdByTitle,
} from "./helpers/db-assert";
import { hasRewardsIntegrationEnv } from "./helpers/env";
import { uniqueTitle } from "./helpers/fixtures";
import { publishActivity } from "./helpers/publish";

function simulateAdminFormTypeChange(
  type: "free_shipping" | "discount_coupon",
): AdminRewardActivityUpsertInput {
  const base = buildDefaultActivityForm();
  return {
    ...base,
    title: uniqueTitle(`CC-INT ${type}`, String(Date.now())),
    type,
    reward_value: rewardValueForType(type),
    restrictions: restrictionsForTypeChange(
      type,
      base.restrictions ?? undefined,
    ),
    trigger_conditions: { kind: "event_once", event: "profile_complete", once_per_user: true },
  };
}

describe.skipIf(!hasRewardsIntegrationEnv())(
  "Admin publish defaults contract (CC-INT / J-CPN-07)",
  () => {
    const trackedTitles: string[] = [];

    afterAll(async () => {
      await runAsAdmin(async () => {
        for (const title of trackedTitles) {
          const activityId = await getTemplateIdByTitle(title);
          if (!activityId) {
            continue;
          }
          await setAdminRewardActivityStatus(activityId, "archived");
        }
      });
    });

    it("free_shipping default form persists order_kinds merchant+member (C2C parity)", async () => {
      await warmSession("admin");
      const input = simulateAdminFormTypeChange("free_shipping");
      trackedTitles.push(input.title);

      await publishActivity(input);

      const row = await getRewardTemplateRowByTitle(input.title);
      expect(row).not.toBeNull();

      const orderKinds = Array.isArray(row?.restrictions.order_kinds)
        ? (row!.restrictions.order_kinds as string[])
        : [];
      expect(orderKinds).toContain("merchant");
      expect(orderKinds).toContain("member");

      expect(Number(row?.reward_value.max_subsidy_hkd ?? 0)).toBeGreaterThan(0);
    });

    it("discount_coupon default form keeps order_kinds merchant-only", async () => {
      await warmSession("admin");
      const input = simulateAdminFormTypeChange("discount_coupon");
      trackedTitles.push(input.title);

      await publishActivity(input);

      const row = await getRewardTemplateRowByTitle(input.title);
      expect(row).not.toBeNull();

      const orderKinds = Array.isArray(row?.restrictions.order_kinds)
        ? (row!.restrictions.order_kinds as string[])
        : [];
      expect(orderKinds).toEqual(["merchant"]);

      expect(Number(row?.reward_value.min_spend_hkd ?? -1)).toBe(100);
    });
  },
);
