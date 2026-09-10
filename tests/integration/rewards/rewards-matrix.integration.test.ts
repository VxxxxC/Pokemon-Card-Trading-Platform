import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listAdminRewardActivities } from "@/app/actions/admin-reward-activities";
import {
  claimFlashReward,
  listActiveFlashCampaigns,
} from "@/app/actions/reward-flash";
import {
  executeDailyCheckIn,
  getUserRewardCoupons,
} from "@/app/actions/rewards";
import {
  clearSessionCache,
  getBuyerUserId,
  runAsAdmin,
  runAsBuyer,
  warmSession,
} from "../shared/auth-context";
import { cleanupMatrixRun } from "./helpers/cleanup";
import {
  assertRewardCampaignExists,
  assertTemplateStatusActive,
  findLatestUserRewardForTemplate,
  getFlashCampaignClaimedCount,
  getFlashCampaignIdForTemplate,
  getPointLedgerGrantForTemplate,
  getTemplateIdByTitle,
  invokeAutoGrantForUser,
  setProfileCompletedTradesCount,
} from "./helpers/db-assert";
import { hasRewardsIntegrationEnv } from "./helpers/env";
import {
  buildAutoGrantDiscountInput,
  buildAutoGrantPointsInput,
  buildFlashFreeShipInput,
  buildFutureFlashFreeShipInput,
  MATRIX_PREFIX,
  uniqueTitle,
} from "./helpers/fixtures";
import { publishActivity } from "./helpers/publish";

describe.skipIf(!hasRewardsIntegrationEnv()).sequential(
  "Rewards integration matrix",
  () => {

  const runId = String(Date.now());
  const titlePrefix = `${MATRIX_PREFIX} ${runId}`;
  const buyerId = () => getBuyerUserId();

  beforeAll(async () => {
    await warmSession("admin");
    await warmSession("buyer");
  });

  beforeEach(async () => {
    await cleanupMatrixRun(titlePrefix, buyerId());
  });

  afterAll(async () => {
    await cleanupMatrixRun(titlePrefix, buyerId());
    await clearSessionCache();
  });

  it("I-A1 admin publishes auto_grant discount coupon", async () => {
    const title = uniqueTitle("I-A1", runId);
    const activityId = await publishActivity(buildAutoGrantDiscountInput(title));

    expect(activityId).toBeTruthy();

    await runAsAdmin(async () => {
      const list = await listAdminRewardActivities({ status: "active" });
      expect(list.success).toBe(true);
      if (!list.success) {
        return;
      }

      const row = list.data.rows.find((entry) => entry.title === title);
      expect(row).toBeTruthy();
      expect(row?.activity_id).toBe(activityId);
      expect(row?.status).toBe("active");
    });

    const templateId = await getTemplateIdByTitle(title);
    expect(templateId).toBeTruthy();
    await assertTemplateStatusActive(templateId!);
  });

  it("I-A2 admin publishes flash_only free shipping", async () => {
    const title = uniqueTitle("I-A2", runId);
    const campaignName = `${titlePrefix} I-A2 Flash`;
    await publishActivity(buildFlashFreeShipInput(title, campaignName));

    const templateId = await getTemplateIdByTitle(title);
    expect(templateId).toBeTruthy();
    await assertTemplateStatusActive(templateId!);
    await assertRewardCampaignExists(templateId!);
  });

  it("I-G1 trade_count auto-grants discount coupon", async () => {
    const title = uniqueTitle("I-G1", runId);
    await publishActivity(buildAutoGrantDiscountInput(title));

    const templateId = await getTemplateIdByTitle(title);
    expect(templateId).toBeTruthy();

    await setProfileCompletedTradesCount(buyerId(), 1);
    await invokeAutoGrantForUser(buyerId());

    const rewardId = await findLatestUserRewardForTemplate({
      userId: buyerId(),
      templateId: templateId!,
    });
    expect(rewardId).toBeTruthy();
  });

  it("I-G2 trade_count auto-grants points", async () => {
    const title = uniqueTitle("I-G2", runId);
    await publishActivity(buildAutoGrantPointsInput(title));

    const templateId = await getTemplateIdByTitle(title);
    expect(templateId).toBeTruthy();

    await setProfileCompletedTradesCount(buyerId(), 1);
    await invokeAutoGrantForUser(buyerId());

    const pointsGrant = await getPointLedgerGrantForTemplate({
      userId: buyerId(),
      templateId: templateId!,
    });
    expect(pointsGrant).toBeGreaterThanOrEqual(77);
  });

  it("I-F1 flash claim succeeds", async () => {
    const title = uniqueTitle("I-F1", runId);
    const campaignName = `${titlePrefix} I-F1 Flash`;
    await publishActivity(buildFlashFreeShipInput(title, campaignName));

    const templateId = await getTemplateIdByTitle(title);
    expect(templateId).toBeTruthy();
    const campaignId = await getFlashCampaignIdForTemplate(templateId!);
    expect(campaignId).toBeTruthy();

    await runAsBuyer(async () => {
      const list = await listActiveFlashCampaigns();
      expect(list.success).toBe(true);
      if (!list.success) {
        return;
      }

      const campaign = list.data.find(
        (entry) => entry.id === campaignId || entry.name === campaignName,
      );
      expect(campaign).toBeTruthy();

      const claim = await claimFlashReward(campaignId!);
      expect(claim.success).toBe(true);
    });

    const claims = await getFlashCampaignClaimedCount(templateId!);
    expect(claims).toBe(1);
  });

  it("I-F2 second flash claim same day fails", async () => {
    const title = uniqueTitle("I-F2", runId);
    const campaignName = `${titlePrefix} I-F2 Flash`;
    await publishActivity(buildFlashFreeShipInput(title, campaignName));

    const templateId = await getTemplateIdByTitle(title);
    expect(templateId).toBeTruthy();
    const campaignId = await getFlashCampaignIdForTemplate(templateId!);
    expect(campaignId).toBeTruthy();

    await runAsBuyer(async () => {
      await expect
        .poll(async () => {
          const list = await listActiveFlashCampaigns();
          if (!list.success) {
            return false;
          }
          const campaign = list.data.find((entry) => entry.id === campaignId);
          return campaign?.can_claim === true;
        }, { timeout: 20_000 })
        .toBe(true);

      const first = await claimFlashReward(campaignId!);
      expect(first.success, first.success ? "" : first.error).toBe(true);

      const second = await claimFlashReward(campaignId!);
      expect(second.success).toBe(false);
      if (!second.success) {
        expect(second.error).toMatch(/今日搶券上限/);
      }
    });
  });

  it("I-F3: future flash campaign cannot claim before starts_at", async () => {
    const title = uniqueTitle("I-F3", runId);
    const campaignName = `${titlePrefix} I-F3 Flash`;
    await publishActivity(buildFutureFlashFreeShipInput(title, campaignName, 24));

    const templateId = await getTemplateIdByTitle(title);
    expect(templateId).toBeTruthy();
    const campaignId = await getFlashCampaignIdForTemplate(templateId!);
    expect(campaignId).toBeTruthy();

    await runAsBuyer(async () => {
      const list = await listActiveFlashCampaigns();
      expect(list.success).toBe(true);
      if (!list.success) {
        return;
      }

      const campaign = list.data.find((entry) => entry.id === campaignId);
      expect(campaign).toBeTruthy();
      expect(campaign!.can_claim).toBe(false);

      const claim = await claimFlashReward(campaignId!);
      expect(claim.success).toBe(false);
      if (!claim.success) {
        expect(claim.error).toMatch(/尚未開始/);
      }
    });

    const claims = await getFlashCampaignClaimedCount(templateId!);
    expect(claims).toBe(0);
  });

  it("I-W1 wallet shows granted coupon", async () => {
    const title = uniqueTitle("I-W1", runId);
    await publishActivity(buildAutoGrantDiscountInput(title));

    const templateId = await getTemplateIdByTitle(title);
    expect(templateId).toBeTruthy();

    await setProfileCompletedTradesCount(buyerId(), 1);
    await invokeAutoGrantForUser(buyerId());

    await runAsBuyer(async () => {
      const wallet = await getUserRewardCoupons();
      expect(wallet.success).toBe(true);
      if (!wallet.success) {
        return;
      }

      const names = [
        ...wallet.data.wallet.redeemable.map((entry) => entry.name),
        ...wallet.data.wallet.redeemed.map((entry) => entry.name),
        ...wallet.data.wallet.expired.map((entry) => entry.name),
      ];
      expect(names).toContain(title);
    });
  });

  it("I-C1 daily check-in succeeds or reports already checked in", async () => {
    await runAsBuyer(async () => {
      const result = await executeDailyCheckIn();
      if (result.success) {
        expect(result.data?.pointsEarned).toBeGreaterThanOrEqual(0);
        return;
      }
      expect(result.error).toMatch(/今日已簽到|簽到計劃已暫停/);
    });
  });
});
