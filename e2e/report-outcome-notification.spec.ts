import { test, expect, type Page } from "@playwright/test";
import {
  buildPublicProfilePath,
  getMerchantProductDetailFixtures,
  hasBuyerAuthFixtures,
  hasPublicProfileFixtures,
} from "./fixtures/test-data";
import {
  deletePendingReports,
  getBuyerProfileIdFromEnv,
  getLatestReport,
  resolveModerationCaseForE2e,
} from "./fixtures/supabase-admin";
import { dismissBlockingOverlays } from "./helpers/member-trading";
import { expectPublicProfileReady } from "./helpers/public-profile-contract";

const OUTCOME_PROBE_DETAILS = "E2E outcome notification probe";

test.describe.configure({ mode: "serial" });

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

async function fillAndSubmitProfileReport(
  page: Page,
  details: string,
): Promise<void> {
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: /惡意欺詐 \/ 虛假交易/ }).click();
  await dialog.locator("textarea").fill(details);
  await dialog.getByRole("button", { name: /確認提交/ }).click();

  await expect(page.getByText("舉報信號已受理")).toBeVisible({
    timeout: 45_000,
  });
  await expect(dialog).toBeHidden({ timeout: 5_000 });
}

test.describe("Reporter outcome notification", () => {
  test("E2E-N1 reporter sees outcome modal and acknowledges", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only outcome notification E2E");
    if (!hasBuyerAuthFixtures() || !hasPublicProfileFixtures()) {
      test.skip(true, "Missing E2E buyer auth or seller profile fixtures");
      return;
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    const buyerId = await getBuyerProfileIdFromEnv();
    if (!sellerId || !buyerId) {
      test.skip(true, "Missing buyer or seller profile id");
      return;
    }

    await deletePendingReports({ reporterId: buyerId, targetId: sellerId });

    await page.goto(buildPublicProfilePath(sellerId), {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expectPublicProfileReady(page);

    await page.getByRole("button", { name: /舉報用戶/ }).click();
    await fillAndSubmitProfileReport(page, OUTCOME_PROBE_DETAILS);

    const report = await getLatestReport({
      reporterId: buyerId,
      targetId: sellerId,
    });
    expect(report?.case_id).toBeTruthy();

    await resolveModerationCaseForE2e({
      caseId: report!.case_id!,
      resolution: "dismissed",
      notifyReporter: true,
    });

    await page.goto("/profile/user", { waitUntil: "domcontentloaded" });

    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("舉報結果通知")).toBeVisible({
      timeout: 30_000,
    });
    await expect(dialog.getByText(/已結案/)).toBeVisible({ timeout: 15_000 });

    await dialog.getByRole("button", { name: "我知道了" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("舉報結果通知")).toHaveCount(0, {
      timeout: 10_000,
    });

    await deletePendingReports({ reporterId: buyerId, targetId: sellerId });
  });
});
