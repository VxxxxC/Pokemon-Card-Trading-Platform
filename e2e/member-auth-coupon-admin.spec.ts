import { test, expect, type Page } from "@playwright/test";
import {
  ensureListingAcceptsAuthentication,
  getProfileIdByEmail,
  resolveE2eMarketplaceFixture,
} from "./fixtures/supabase-admin";
import { getChatRealtimeFixtures } from "./fixtures/chat-test-data";
import { hasMemberTradingFixtures } from "./fixtures/test-data";
import { gotoCheckout } from "./helpers/member-trading";
import {
  getRewardTemplateIdByTitle,
  getRewardTemplateRestrictions,
  grantUserRewardForE2e,
  publishRewardActivityViaAdmin,
  seedMemberAuthPendingOrderForE2e,
} from "./helpers/platform-rewards";
import { loginAsAdmin, withAdminPage } from "./helpers/admin-auth";
import {
  waitForCheckoutCouponOptionEnabled,
  waitForCheckoutCouponPicker,
} from "./helpers/rewards-checkout-coupon";
import {
  guardTcE13EnvInGateMode,
  hasTcE13Env,
  isFailIfEnvMissingMode,
} from "./helpers/env-guard";

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

function hasAdminAuthFixtures(): boolean {
  return Boolean(readEnv("E2E_ADMIN_EMAIL") && readEnv("E2E_ADMIN_PASSWORD"));
}

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

test.describe("Member auth coupon — admin order_kinds parity", () => {
  const templateTitle = `E2E C2C Free Ship ${Date.now()}`;
  let templateId: string | null = null;
  let couponRewardId: string | null = null;
  let memberOrderId: string | null = null;

  test.beforeAll(() => {
    guardTcE13EnvInGateMode();
  });

  test("C2C-ADM-1 admin publishes free_shipping with member scope", async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Runs on buyer project");
    if (!isFailIfEnvMissingMode()) {
      test.skip(!hasAdminAuthFixtures(), "Missing admin E2E credentials");
    }

    await withAdminPage(browser, async (page) => {
      await publishRewardActivityViaAdmin(page, {
        title: templateTitle,
        type: "free_shipping",
        orderKindsScope: "both",
        maxSubsidy: 30,
        trigger: { kind: "event_once", event: "profile_complete" },
      });
    });

    templateId = await getRewardTemplateIdByTitle(templateTitle);
    expect(templateId).toBeTruthy();

    const restrictions = await getRewardTemplateRestrictions(templateId!);
    const orderKinds = Array.isArray(restrictions?.order_kinds)
      ? restrictions!.order_kinds
      : [];
    expect(orderKinds).toContain("member");
    expect(orderKinds).toContain("merchant");
  });

  test("C2C-ADM-1b admin free_shipping default form persists member without order_kinds click", async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Runs on buyer project");
    if (!isFailIfEnvMissingMode()) {
      test.skip(!hasAdminAuthFixtures(), "Missing admin E2E credentials");
    }

    const defaultTitle = `E2E C2C Default Form ${Date.now()}`;
    await withAdminPage(browser, async (page) => {
      await publishRewardActivityViaAdmin(page, {
        title: defaultTitle,
        type: "free_shipping",
        applyOrderKindsScope: false,
        maxSubsidy: 30,
        trigger: { kind: "event_once", event: "profile_complete" },
      });
    });

    const defaultTemplateId = await getRewardTemplateIdByTitle(defaultTitle);
    expect(defaultTemplateId).toBeTruthy();

    const restrictions = await getRewardTemplateRestrictions(defaultTemplateId!);
    const orderKinds = Array.isArray(restrictions?.order_kinds)
      ? restrictions!.order_kinds
      : [];
    expect(orderKinds).toContain("member");
    expect(orderKinds).toContain("merchant");
  });

  test("C2C-ADM-2 member auth checkout can select admin-published coupon", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Runs on buyer project");
    test.skip(!templateId, "Template not published in C2C-ADM-1");
    if (!isFailIfEnvMissingMode()) {
      test.skip(!hasMemberTradingFixtures(), "Missing member trading E2E env");
    } else if (!hasTcE13Env()) {
      throw new Error("[SEC-06] TC-E13 member trading env incomplete");
    }

    const fixtureResult = await resolveE2eMarketplaceFixture({
      requiredSellerPersona: "member",
    });
    if (!fixtureResult.ok) {
      test.skip(true, fixtureResult.skipReason);
      return;
    }

    const { listingId } = fixtureResult.fixture;
    await ensureListingAcceptsAuthentication(listingId);

    const fixtures = getChatRealtimeFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    if (!buyerId) {
      test.skip(true, "Could not resolve buyer profile");
      return;
    }

    memberOrderId = await seedMemberAuthPendingOrderForE2e({
      listingId,
      buyerId,
    });

    couponRewardId = await grantUserRewardForE2e({
      userId: buyerId,
      templateId: templateId!,
    });

    await gotoCheckout(page, memberOrderId);
    await waitForCheckoutCouponPicker(page, { rewardId: couponRewardId! });
    await waitForCheckoutCouponOptionEnabled(page, couponRewardId!);

    const option = page.locator(
      `#checkout-coupon option[value="${couponRewardId}"]`,
    );
    await expect(option).toBeEnabled();
    await expect(option).not.toContainText("此優惠券不適用於會員訂單");
  });
});
