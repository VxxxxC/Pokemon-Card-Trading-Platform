import { test, expect, type Page } from "@playwright/test";
import { getProfileIdByEmail } from "./fixtures/supabase-admin";
import { hasBuyerAuthFixtures } from "./fixtures/test-data";
import {
  findLatestUserRewardForTemplate,
  findPointsCatalogCardByTitle,
  getRewardTemplateIdByTitle,
  gotoMemberRewardsPage,
  publishRewardActivityViaAdmin,
  seedBuyerPointsForE2e,
} from "./helpers/platform-rewards";
import { loginAsAdmin } from "./helpers/admin-auth";

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

function hasAdminAuthFixtures(): boolean {
  return Boolean(readEnv("E2E_ADMIN_EMAIL") && readEnv("E2E_ADMIN_PASSWORD"));
}

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

test.describe("Platform rewards Phase 4 E2E", () => {
  const templateTitle = `E2E Phase4 Catalog ${Date.now()}`;
  let templateId: string | null = null;
  let buyerUserId: string | null = null;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    if (testInfo.project.name !== "buyer") {
      return;
    }
    if (!hasAdminAuthFixtures() || !hasBuyerAuthFixtures()) {
      throw new Error("Missing E2E admin/buyer env for Phase 4 bootstrap");
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for DB assertions");
    }

    const buyerEmail = readEnv("E2E_BUYER_EMAIL");
    if (!buyerEmail) {
      throw new Error("Missing E2E_BUYER_EMAIL");
    }
    buyerUserId = await getProfileIdByEmail(buyerEmail);
    if (!buyerUserId) {
      throw new Error("Could not resolve buyer profile id");
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);
    await publishRewardActivityViaAdmin(page, {
      title: templateTitle,
      type: "discount_coupon",
      amount: 10,
      minSpend: 0,
      trigger: { kind: "trade_count", role: "buyer", count: 1 },
      redemptionCatalog: { pointsCost: 200, stock: 5 },
    });
    templateId = await getRewardTemplateIdByTitle(templateTitle);
    expect(templateId).toBeTruthy();
    await context.close();
  });

  test("C4.1 member redeems catalog item from rewards page", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only Phase 4");
    if (!buyerUserId || !templateId) {
      throw new Error("Phase 4 bootstrap missing template or buyer");
    }

    await seedBuyerPointsForE2e(buyerUserId, 500);

    const catalogCard = await findPointsCatalogCardByTitle(page, templateTitle);
    await expect(catalogCard.getByText("200 PTS")).toBeVisible();

    await catalogCard.getByRole("button", { name: "兌換" }).click();

    await expect
      .poll(
        async () =>
          findLatestUserRewardForTemplate({
            userId: buyerUserId!,
            templateId: templateId!,
          }),
        { timeout: 30_000 },
      )
      .toBeTruthy();
  });

  test("C4.2 redeemed coupon appears in wallet", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only Phase 4");
    if (!buyerUserId || !templateId) {
      throw new Error("Phase 4 bootstrap missing template or buyer");
    }

    const userRewardId = await findLatestUserRewardForTemplate({
      userId: buyerUserId,
      templateId,
    });
    expect(userRewardId).toBeTruthy();

    await gotoMemberRewardsPage(page);

    const redeemList = page.locator("#redeem-list");
    await expect
      .poll(
        async () => {
          const hasTitle = await redeemList
            .getByText(templateTitle)
            .first()
            .isVisible()
            .catch(() => false);
          if (hasTitle) {
            return "title";
          }
          const hasVoucher = await redeemList
            .getByText("VOUCHER TOKEN")
            .first()
            .isVisible()
            .catch(() => false);
          return hasVoucher ? "voucher" : "pending";
        },
        { timeout: 30_000 },
      )
      .not.toBe("pending");
  });
});
