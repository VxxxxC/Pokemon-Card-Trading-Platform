import { test, expect, type Page } from "@playwright/test";
import {
  buildPublicProfilePath,
  getMerchantProductDetailFixtures,
  hasBuyerAuthFixtures,
  hasBunnyStorageFixtures,
  hasPublicProfileFixtures,
} from "./fixtures/test-data";
import {
  deletePendingReports,
  countPendingReports,
  ensureDbChatRoom,
  getBuyerProfileIdFromEnv,
  getLatestReport,
  getProfileDisplayName,
  getReportAttachmentsForReport,
  submitChatReportViaBuyerRpc,
} from "./fixtures/supabase-admin";
import { LISTING_PHOTO_FIXTURE } from "./helpers/collection-asset";
import {
  chatConsoleRoot,
  dismissBlockingOverlays,
  openChatRoom,
} from "./helpers/member-trading";
import { expectPublicProfileReady } from "./helpers/public-profile-contract";

const REPORT_CATEGORY = "惡意欺詐 / 虛假交易";
const REPORT_CATEGORY_SLUG = "fraud";
const CHAT_REPORT_DETAILS = "E2E chat report details";
const PROFILE_REPORT_DETAILS = "E2E profile report details";

test.describe.configure({ mode: "serial" });

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

async function fillAndSubmitReportDialog(
  page: Page,
  details: string,
  categoryLabel: RegExp = /惡意欺詐 \/ 虛假交易/,
): Promise<void> {
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: categoryLabel }).click();

  await dialog.locator("textarea").fill(details);

  await dialog
    .getByRole("button", { name: /確認提交/ })
    .click();

  await expect(page.getByText("舉報信號已受理")).toBeVisible({
    timeout: 45_000,
  });
  await expect(dialog).toBeHidden({ timeout: 5_000 });
}

async function submitReportDialogExpectError(
  page: Page,
  details: string,
  expectedError: RegExp,
  categoryLabel: RegExp = /惡意欺詐 \/ 虛假交易/,
  options?: { reporterId?: string; targetId?: string; maxPendingCount?: number },
): Promise<void> {
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: categoryLabel }).click();

  await dialog.locator("textarea").fill(details);

  await dialog
    .getByRole("button", { name: /確認提交/ })
    .click();

  await expect
    .poll(
      async () => {
        const stillSubmitting = await dialog
          .getByRole("button", { name: /提交中/ })
          .isVisible()
          .catch(() => false);
        if (stillSubmitting) {
          return "pending";
        }

        const errorToast = page
          .locator("[data-sonner-toast]")
          .filter({ hasText: expectedError });
        if ((await errorToast.count()) > 0) {
          return "error";
        }
        const duplicateToast = page.locator("[data-sonner-toast]").filter({
          hasText: /您已對該用戶提交過待審核的舉報|您已在此對話提交過待審核的舉報/,
        });
        if ((await duplicateToast.count()) > 0) {
          return "error";
        }
        const accepted = page.locator("[data-sonner-toast]").filter({
          hasText: /舉報信號已受理/,
        });
        if ((await accepted.count()) > 0) {
          return "accepted";
        }

        if (
          options?.reporterId &&
          options?.targetId &&
          options.maxPendingCount !== undefined
        ) {
          const pendingCount = await countPendingReports({
            reporterId: options.reporterId,
            targetId: options.targetId,
          });
          if (pendingCount > options.maxPendingCount) {
            return "accepted";
          }
          if (pendingCount <= options.maxPendingCount) {
            return "error";
          }
        }

        return "pending";
      },
      { timeout: 90_000 },
    )
    .toBe("error");
  await expect(
    dialog.getByRole("button", { name: /確認提交/ }),
  ).toBeVisible({ timeout: 10_000 });
}

test.describe("User report submission", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only report E2E");
    if (!hasBuyerAuthFixtures() || !hasPublicProfileFixtures()) {
      test.skip(true, "Missing E2E buyer auth or seller profile fixtures");
    }
  });

  test("buyer submits report from chat console", async ({ page }) => {
    const { sellerId } = getMerchantProductDetailFixtures();
    const buyerId = await getBuyerProfileIdFromEnv();

    if (!sellerId || !buyerId) {
      test.skip(true, "Missing buyer or seller profile id");
      return;
    }

    const roomId = await ensureDbChatRoom(buyerId, sellerId);
    const partnerName = await getProfileDisplayName(sellerId);

    await deletePendingReports({ reporterId: buyerId, targetId: sellerId });

    await openChatRoom(page, roomId, partnerName, sellerId);
    await expect(
      chatConsoleRoot(page).getByRole("button", { name: "舉報" }),
    ).toBeVisible({ timeout: 20_000 });
    await chatConsoleRoot(page).getByRole("button", { name: "舉報" }).click();
    await fillAndSubmitReportDialog(page, CHAT_REPORT_DETAILS);

    await expect.poll(
      async () => {
        const report = await getLatestReport({
          reporterId: buyerId,
          targetId: sellerId,
        });
        return report?.reason ?? null;
      },
      { timeout: 15_000 },
    ).toContain("[SOURCE] chat_room");

    const report = await getLatestReport({
      reporterId: buyerId,
      targetId: sellerId,
    });

    expect(report).not.toBeNull();
    expect(report?.target_type).toBe("user");
    expect(report?.status).toBe("pending");
    expect(report?.reason).toContain(`[ROOM_ID] ${roomId}`);
    expect(report?.reason).toContain(`[CATEGORY] ${REPORT_CATEGORY}`);
    expect(report?.reason).toContain(CHAT_REPORT_DETAILS);
    expect(report?.category).toBe(REPORT_CATEGORY_SLUG);
    expect(report?.case_id).toBeTruthy();
    expect(report?.contribution_score).toBe(44);

    await deletePendingReports({ reporterId: buyerId, targetId: sellerId });
  });

  test("buyer submits report from public profile page", async ({ page }) => {
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
    await fillAndSubmitReportDialog(page, PROFILE_REPORT_DETAILS);

    await expect.poll(
      async () => {
        const report = await getLatestReport({
          reporterId: buyerId,
          targetId: sellerId,
        });
        return report?.reason ?? null;
      },
      { timeout: 15_000 },
    ).toContain("[SOURCE] profile");

    const report = await getLatestReport({
      reporterId: buyerId,
      targetId: sellerId,
    });

    expect(report).not.toBeNull();
    expect(report?.target_type).toBe("user");
    expect(report?.status).toBe("pending");
    expect(report?.reason).not.toContain("[ROOM_ID]");
    expect(report?.reason).toContain(`[CATEGORY] ${REPORT_CATEGORY}`);
    expect(report?.reason).toContain(PROFILE_REPORT_DETAILS);
    expect(report?.category).toBe(REPORT_CATEGORY_SLUG);
    expect(report?.case_id).toBeTruthy();
    expect(report?.contribution_score).toBe(40);

    await deletePendingReports({ reporterId: buyerId, targetId: sellerId });
  });

  test("profile report blocks chat-required offline trade category", async ({
    page,
  }) => {
    const { sellerId } = getMerchantProductDetailFixtures();
    const buyerId = await getBuyerProfileIdFromEnv();

    if (!sellerId || !buyerId) {
      test.skip(true, "Missing buyer or seller profile id");
      return;
    }

    await page.goto(buildPublicProfilePath(sellerId), {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expectPublicProfileReady(page);

    await page.getByRole("button", { name: /舉報用戶/ }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: /誘導私下交易/ }).click();

    await expect(
      dialog.getByText("此類別需在對話視窗內舉報，請返回聊天後再提交。"),
    ).toBeVisible();

    const submitButton = dialog.getByRole("button", {
      name: /確認提交/,
    });
    await expect(submitButton).toBeDisabled();
  });

  test("buyer submits chat report with evidence image", async ({ page }) => {
    if (!hasBunnyStorageFixtures()) {
      test.skip(true, "Missing Bunny storage env for report evidence upload");
      return;
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    const buyerId = await getBuyerProfileIdFromEnv();

    if (!sellerId || !buyerId) {
      test.skip(true, "Missing buyer or seller profile id");
      return;
    }

    const roomId = await ensureDbChatRoom(buyerId, sellerId);
    const partnerName = await getProfileDisplayName(sellerId);

    await deletePendingReports({ reporterId: buyerId, targetId: sellerId });

    await openChatRoom(page, roomId, partnerName, sellerId);
    await chatConsoleRoot(page).getByRole("button", { name: "舉報" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("combobox").click();
    await page
      .getByRole("option", { name: /惡意欺詐 \/ 虛假交易/ })
      .click();
    await dialog.locator("textarea").fill("E2E chat report with evidence");
    await dialog.locator('input[type="file"]').setInputFiles(LISTING_PHOTO_FIXTURE);
    await dialog
      .getByRole("button", { name: /確認提交/ })
      .click();

    await expect(page.getByText("舉報信號已受理")).toBeVisible({
      timeout: 30_000,
    });

    const report = await getLatestReport({
      reporterId: buyerId,
      targetId: sellerId,
    });

    expect(report?.id).toBeTruthy();

    await expect.poll(
      async () => {
        const attachments = await getReportAttachmentsForReport(report!.id);
        return attachments.length;
      },
      { timeout: 15_000 },
    ).toBe(1);

    const attachments = await getReportAttachmentsForReport(report!.id);
    expect(attachments[0]?.report_id).toBe(report?.id);
    expect(attachments[0]?.reporter_id).toBe(buyerId);
    expect(attachments[0]?.storage_path).toContain("reports/pending/");

    await deletePendingReports({ reporterId: buyerId, targetId: sellerId });
  });

  test("buyer submits chat then profile reports into same case", async ({
    page,
  }) => {
    const { sellerId } = getMerchantProductDetailFixtures();
    const buyerId = await getBuyerProfileIdFromEnv();

    if (!sellerId || !buyerId) {
      test.skip(true, "Missing buyer or seller profile id");
      return;
    }

    const roomId = await ensureDbChatRoom(buyerId, sellerId);
    const partnerName = await getProfileDisplayName(sellerId);

    await deletePendingReports({ reporterId: buyerId, targetId: sellerId });

    await openChatRoom(page, roomId, partnerName, sellerId);
    await chatConsoleRoot(page).getByRole("button", { name: "舉報" }).click();
    await fillAndSubmitReportDialog(page, CHAT_REPORT_DETAILS);

    const chatReport = await getLatestReport({
      reporterId: buyerId,
      targetId: sellerId,
    });

    expect(chatReport?.case_id).toBeTruthy();

    await page.goto(buildPublicProfilePath(sellerId), {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expectPublicProfileReady(page);

    await page.getByRole("button", { name: /舉報用戶/ }).click();
    await fillAndSubmitReportDialog(page, PROFILE_REPORT_DETAILS);

    const profileReport = await getLatestReport({
      reporterId: buyerId,
      targetId: sellerId,
    });

    expect(profileReport?.case_id).toBe(chatReport?.case_id);
    expect(
      await countPendingReports({ reporterId: buyerId, targetId: sellerId }),
    ).toBe(2);

    await deletePendingReports({ reporterId: buyerId, targetId: sellerId });
  });

  test("profile duplicate report same category is blocked", async ({ page }) => {
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
    await fillAndSubmitReportDialog(page, PROFILE_REPORT_DETAILS);

    await page.getByRole("button", { name: /舉報用戶/ }).click();
    await submitReportDialogExpectError(
      page,
      "E2E duplicate profile report",
      /您已在此用戶公開資料提交過同類別的待審核舉報/,
    );

    expect(
      await countPendingReports({ reporterId: buyerId, targetId: sellerId }),
    ).toBe(1);

    await deletePendingReports({ reporterId: buyerId, targetId: sellerId });
  });

  test("E2E-R6 duplicate chat room report is blocked", async ({ page }) => {
    const { sellerId } = getMerchantProductDetailFixtures();
    const buyerId = await getBuyerProfileIdFromEnv();

    if (!sellerId || !buyerId) {
      test.skip(true, "Missing buyer or seller profile id");
      return;
    }

    const roomId = await ensureDbChatRoom(buyerId, sellerId);
    const partnerName = await getProfileDisplayName(sellerId);

    await deletePendingReports({ reporterId: buyerId, targetId: sellerId });

    await openChatRoom(page, roomId, partnerName, sellerId);
    await chatConsoleRoot(page).getByRole("button", { name: "舉報" }).click();
    await fillAndSubmitReportDialog(page, `E2E-R6 first chat report ${Date.now()}`);

    await expect
      .poll(
        async () =>
          countPendingReports({ reporterId: buyerId, targetId: sellerId }),
        { timeout: 15_000 },
      )
      .toBe(1);

    await expect(
      chatConsoleRoot(page).getByRole("button", { name: "舉報" }),
    ).toBeVisible({ timeout: 10_000 });

    // Duplicate leg via RPC (I-R6 contract) — UI double-submit can hang on 提交中…
    const duplicate = await submitChatReportViaBuyerRpc({
      sellerId,
      roomId,
      details: "E2E duplicate chat room report",
    });
    expect(duplicate.success).toBe(false);
    if (!duplicate.success) {
      expect(duplicate.error).toMatch(/此對話提交過待審核的舉報/);
    }

    expect(
      await countPendingReports({ reporterId: buyerId, targetId: sellerId }),
    ).toBe(1);

    await deletePendingReports({ reporterId: buyerId, targetId: sellerId });
  });
});
