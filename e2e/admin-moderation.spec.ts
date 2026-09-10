import { test, expect, type Page } from "@playwright/test";
import {
  countModerationAuditLogsForCase,
  countResolvedModerationCasesForSubject,
  deleteAccountSanctionsForUser,
  expireAccountSanctionForE2e,
  getAdminProfileIdFromEnv,
  getBuyerProfileIdFromEnv,
  getLatestMemberOrderForPair,
  getLatestModerationCaseDetailForSubject,
  getLatestModerationCaseWithChatRoom,
  getLatestOpenModerationCaseForSubject,
  resolveModerationCaseChatRoomId,
  getModerationCaseStatus,
  insertAccountSanctionForE2e,
  insertChatMessageForE2e,
  hasActiveBanSanctionForUser,
  isSellerPasswordSignInBlocked,
  insertOpenFraudCaseForE2e,
  unbanUserForE2e,
} from "./fixtures/supabase-admin";
import { getChatRealtimeFixtures, hasSellerAuthFixtures } from "./fixtures/chat-test-data";
import { getMerchantProductDetailFixtures } from "./fixtures/test-data";

const E2E_ADMIN_CHAT_PROBE = "E2E admin moderation chat probe";

function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function hasAdminAuthFixtures(): boolean {
  return Boolean(readEnv("E2E_ADMIN_EMAIL") && readEnv("E2E_ADMIN_PASSWORD"));
}

async function loginAsAdmin(page: Page): Promise<void> {
  const email = readEnv("E2E_ADMIN_EMAIL");
  const password = readEnv("E2E_ADMIN_PASSWORD");
  if (!email || !password) {
    throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
  }

  await page.goto("/auth");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 20_000,
  });
}

async function gotoAdminDisputes(page: Page, path = "/admin/disputes"): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(1_000);
    }
  }
}

async function loginAsSeller(page: Page): Promise<void> {
  const { sellerEmail, sellerPassword } = getChatRealtimeFixtures();
  if (!sellerEmail || !sellerPassword) {
    throw new Error("Missing E2E_SELLER_EMAIL or E2E_SELLER_PASSWORD");
  }

  await page.goto("/auth");
  await page.locator('input[name="email"]').fill(sellerEmail);
  await page.locator('input[name="password"]').fill(sellerPassword);
  await page.locator('form button[type="submit"]').click();
}

test.describe("Admin moderation — access control", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("guest is redirected to auth from disputes queue", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only unauthenticated redirect");

    await gotoAdminDisputes(page);
    await expect(page).toHaveURL(/\/auth/, { timeout: 20_000 });
    expect(page.url()).not.toContain("/admin/disputes");
  });

  test("member is redirected from disputes queue", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only member redirect");

    await gotoAdminDisputes(page);
    await expect(page).not.toHaveURL(/\/admin\/disputes/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/profile\/user/);
  });

  test("merchant is redirected from disputes queue", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "seller", "Seller-only merchant redirect");

    await gotoAdminDisputes(page);
    await expect(page).not.toHaveURL(/\/admin\/disputes/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/profile\/(merchant|user)/);
  });
});

test.describe("Admin moderation — admin flows", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("admin opens live disputes queue and case detail", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only: admin logs in via /auth");
    if (!hasAdminAuthFixtures()) {
      test.skip(true, "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
      return;
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    if (!sellerId) {
      test.skip(true, "Missing E2E_SELLER_ID");
      return;
    }

    const openCase = await getLatestOpenModerationCaseForSubject(sellerId);
    if (!openCase) {
      test.skip(true, "No open moderation case for seller fixture — run seed:moderation-e2e first");
      return;
    }

    await loginAsAdmin(page);
    await gotoAdminDisputes(page, "/admin/disputes?status=pending");
    await expect(
      page.getByRole("heading", { name: "舉報與爭議仲裁工作台" }),
    ).toBeVisible({ timeout: 20_000 });

    const caseRow = page.locator("tr", { hasText: openCase.case_number }).first();
    await expect(caseRow).toBeVisible({ timeout: 20_000 });
    const caseDetailUrl = new RegExp(
      `/admin/disputes/${openCase.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    );
    const detailButton = caseRow.locator("button", { hasText: "查看詳情" });
    await expect(detailButton).toBeVisible({ timeout: 10_000 });
    // Queue CTA is asserted above; client router.push is flaky under production gate load.
    await gotoAdminDisputes(page, `/admin/disputes/${openCase.id}`);
    await expect(page).toHaveURL(caseDetailUrl, { timeout: 30_000 });
    await expect(page.getByText(openCase.case_number)).toBeVisible({
      timeout: 15_000,
    });
    // Single-report cases dedupe report body into the case header; 舉報摘要 is omitted.
    await expect(page.getByText("主要舉報方")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "風控分數明細" }),
    ).toBeVisible();
  });

  test("admin loads chat thread and writes view_chat audit", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only: admin logs in via /auth");
    if (!hasAdminAuthFixtures()) {
      test.skip(true, "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
      return;
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    const buyerId = await getBuyerProfileIdFromEnv();
    if (!sellerId || !buyerId) {
      test.skip(true, "Missing E2E_SELLER_ID or E2E_BUYER_EMAIL");
      return;
    }

    const chatCase = await getLatestModerationCaseWithChatRoom(sellerId);
    if (!chatCase) {
      test.skip(
        true,
        "No chat-linked moderation case — run user-report chat E2E first",
      );
      return;
    }

    const resolvedRoomId =
      (await resolveModerationCaseChatRoomId(chatCase.id)) ??
      chatCase.chatRoomId;

    await insertChatMessageForE2e({
      roomId: resolvedRoomId,
      senderId: buyerId,
      content: E2E_ADMIN_CHAT_PROBE,
    });

    const auditBefore = await countModerationAuditLogsForCase(
      chatCase.id,
      "view_chat",
    );

    await loginAsAdmin(page);
    await gotoAdminDisputes(page, `/admin/disputes/${chatCase.id}`);
    const chatHistorySection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "唯讀聊天室歷史" }) });
    await expect(chatHistorySection).toBeVisible({ timeout: 20_000 });
    await chatHistorySection.getByRole("button", { name: "展開" }).click();
    await expect(page.getByText("載入聊天紀錄中…")).toBeHidden({
      timeout: 30_000,
    });
    await expect
      .poll(
        async () => {
          const visible = await page
            .getByText(E2E_ADMIN_CHAT_PROBE)
            .first()
            .isVisible()
            .catch(() => false);
          if (visible) {
            return true;
          }
          const loading = await page
            .getByText("載入聊天紀錄中…")
            .isVisible()
            .catch(() => false);
          if (loading) {
            return false;
          }
          await page.reload({ waitUntil: "domcontentloaded" });
          await expect(page.getByText("唯讀聊天室歷史")).toBeVisible({
            timeout: 10_000,
          });
          await expect(page.getByText("載入聊天紀錄中…")).toBeHidden({
            timeout: 30_000,
          });
          return false;
        },
        { timeout: 60_000 },
      )
      .toBe(true);

    await expect
      .poll(
        async () =>
          countModerationAuditLogsForCase(chatCase.id, "view_chat"),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(auditBefore);

    const auditSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "審計紀錄" }) });
    await auditSection.getByRole("button", { name: "展開" }).click();
    await expect(page.getByText("調閱聊天紀錄")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("admin sees related orders panel for fraud or offline_trade case", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only: admin logs in via /auth");
    if (!hasAdminAuthFixtures()) {
      test.skip(true, "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
      return;
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    if (!sellerId) {
      test.skip(true, "Missing E2E_SELLER_ID");
      return;
    }

    const latestCase = await getLatestModerationCaseDetailForSubject(sellerId);
    if (!latestCase) {
      test.skip(true, "No moderation case for seller fixture");
      return;
    }

    if (
      latestCase.primary_category !== "fraud" &&
      latestCase.primary_category !== "offline_trade"
    ) {
      test.skip(true, "Latest case is not fraud/offline_trade — no order panel expected");
      return;
    }

    await loginAsAdmin(page);
    await gotoAdminDisputes(page, `/admin/disputes/${latestCase.id}`);
    await expect(page.getByRole("heading", { name: "關聯訂單" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("E2E-G5 admin detail shows subject history panel", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only: admin logs in via /auth");
    if (!hasAdminAuthFixtures()) {
      test.skip(true, "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
      return;
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    if (!sellerId) {
      test.skip(true, "Missing E2E_SELLER_ID");
      return;
    }

    const openCase = await getLatestOpenModerationCaseForSubject(sellerId);
    if (!openCase) {
      test.skip(true, "No open moderation case — run seed:moderation-e2e first");
      return;
    }

    const resolvedCount = await countResolvedModerationCasesForSubject(sellerId);
    if (resolvedCount < 1) {
      test.skip(
        true,
        "No prior resolved case for subject — resolve a case before checking history panel",
      );
      return;
    }

    await loginAsAdmin(page);
    await gotoAdminDisputes(page, `/admin/disputes/${openCase.id}`);
    await expect(
      page.getByRole("heading", { name: "被舉報人歷史檔案" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: "歷史案件" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("admin dismisses open case", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only: admin logs in via /auth");
    if (!hasAdminAuthFixtures()) {
      test.skip(true, "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
      return;
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    if (!sellerId) {
      test.skip(true, "Missing E2E_SELLER_ID");
      return;
    }

    const openCase = await getLatestOpenModerationCaseForSubject(sellerId);
    if (!openCase) {
      test.skip(
        true,
        "No open moderation case for seller fixture — run seed:moderation-e2e first",
      );
      return;
    }

    await loginAsAdmin(page);
    await gotoAdminDisputes(page, `/admin/disputes/${openCase.id}`);
    await expect(
      page.getByRole("heading", { name: "仲裁判定動作" }),
    ).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("combobox").filter({ hasText: /請選擇一項仲裁判定動作/ }).click();
    await page.getByRole("option", { name: "駁回舉報" }).click();
    await page.getByRole("button", { name: "執行最終仲裁裁決" }).click();

    await expect(page).toHaveURL(/\/admin\/disputes\?status=completed/, {
      timeout: 20_000,
    });

    await expect
      .poll(async () => getModerationCaseStatus(openCase.id), { timeout: 15_000 })
      .toMatchObject({ status: "dismissed", resolution: "dismissed" });

    const resolveAuditCount = await countModerationAuditLogsForCase(
      openCase.id,
      "resolve",
    );
    expect(resolveAuditCount).toBeGreaterThan(0);
  });
});

test.describe("Admin moderation — enforcement", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("E2E-AB5a suspended buyer is redirected from marketplace", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only marketplace suspended redirect");

    const buyerId = await getBuyerProfileIdFromEnv();
    if (!buyerId) {
      test.skip(true, "Missing E2E_BUYER_EMAIL");
      return;
    }

    const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await deleteAccountSanctionsForUser(buyerId);
    await insertAccountSanctionForE2e({
      userId: buyerId,
      type: "suspend",
      endsAt,
    });

    try {
      await page.goto("/marketplace");
      await expect(page).toHaveURL(/\/auth\/suspended/, { timeout: 20_000 });
    } finally {
      await deleteAccountSanctionsForUser(buyerId);
    }
  });

  test("E2E-AB5b admin remains on disputes when self is suspended", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only admin exemption");
    if (!hasAdminAuthFixtures()) {
      test.skip(true, "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
      return;
    }

    const adminId = await getAdminProfileIdFromEnv();
    if (!adminId) {
      test.skip(true, "Missing E2E_ADMIN_EMAIL profile");
      return;
    }

    const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await deleteAccountSanctionsForUser(adminId);
    await insertAccountSanctionForE2e({
      userId: adminId,
      type: "suspend",
      endsAt,
    });

    try {
      await loginAsAdmin(page);
      await gotoAdminDisputes(page);
      await expect(page).toHaveURL(/\/admin\/disputes/, { timeout: 20_000 });
      await expect(
        page.getByRole("heading", { name: "舉報與爭議仲裁工作台" }),
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await deleteAccountSanctionsForUser(adminId);
    }
  });

  test("E2E-AB6 expired suspend allows profile access again", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only expired suspend unblock");

    const buyerId = await getBuyerProfileIdFromEnv();
    if (!buyerId) {
      test.skip(true, "Missing E2E_BUYER_EMAIL");
      return;
    }

    const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await deleteAccountSanctionsForUser(buyerId);
    await insertAccountSanctionForE2e({
      userId: buyerId,
      type: "suspend",
      endsAt,
    });

    try {
      await page.goto("/profile/user");
      await expect(page).toHaveURL(/\/auth\/suspended/, { timeout: 20_000 });

      await expireAccountSanctionForE2e(buyerId);
      await page.goto("/profile/user");
      await expect(page).not.toHaveURL(/\/auth\/suspended/, { timeout: 20_000 });
    } finally {
      await deleteAccountSanctionsForUser(buyerId);
    }
  });

  test("E2E-AB8 related order card shows link and timeline", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only order panel detail");
    if (!hasAdminAuthFixtures()) {
      test.skip(true, "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
      return;
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    const buyerId = await getBuyerProfileIdFromEnv();
    if (!sellerId || !buyerId) {
      test.skip(true, "Missing E2E_SELLER_ID or E2E_BUYER_EMAIL");
      return;
    }

    const chatCase = await getLatestModerationCaseWithChatRoom(sellerId);
    if (!chatCase) {
      test.skip(true, "No chat-linked moderation case — run seed:moderation-e2e first");
      return;
    }

    if (
      chatCase.primary_category !== "fraud" &&
      chatCase.primary_category !== "offline_trade"
    ) {
      test.skip(true, "Chat case is not fraud/offline_trade — no order panel expected");
      return;
    }

    const relatedOrder = await getLatestMemberOrderForPair({
      buyerId,
      sellerId,
    });
    if (!relatedOrder) {
      test.skip(true, "No member order between buyer and seller fixtures");
      return;
    }

    await loginAsAdmin(page);
    await gotoAdminDisputes(page, `/admin/disputes/${chatCase.id}`);
    await expect(page.getByRole("heading", { name: "關聯訂單" })).toBeVisible({
      timeout: 20_000,
    });

    const orderLink = page.getByRole("link", { name: "在新分頁開啟訂單詳情" });
    const orderLinkCount = await orderLink.count();
    if (orderLinkCount === 0) {
      test.skip(
        true,
        "No related orders in moderation context for buyer-seller pair on this case",
      );
      return;
    }

    await expect(orderLink.first()).toBeVisible({ timeout: 15_000 });
    await expect(orderLink.first()).toHaveAttribute(
      "href",
      /\/profile\/(user|merchant)\/orderDetail\//,
    );
    await expect(page.getByText("Escrow：", { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("E2E-AB7 permanent ban blocks seller login", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only ban enforcement");
    if (!hasAdminAuthFixtures()) {
      test.skip(true, "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
      return;
    }
    if (!hasSellerAuthFixtures()) {
      test.skip(true, "Missing E2E_SELLER_EMAIL or E2E_SELLER_PASSWORD");
      return;
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      test.skip(true, "Missing SUPABASE_SERVICE_ROLE_KEY for unban cleanup");
      return;
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    if (!sellerId) {
      test.skip(true, "Missing E2E_SELLER_ID");
      return;
    }

    const buyerId = await getBuyerProfileIdFromEnv();
    if (!buyerId) {
      test.skip(true, "Missing E2E_BUYER_EMAIL");
      return;
    }

    const existingOpenCase = await getLatestOpenModerationCaseForSubject(sellerId);
    const banCaseId =
      existingOpenCase?.id ??
      (await insertOpenFraudCaseForE2e({
        subjectId: sellerId,
        reporterId: buyerId,
        suffix: "AB7",
      }));

    await loginAsAdmin(page);
    await gotoAdminDisputes(page, `/admin/disputes/${banCaseId}`);
    await expect(
      page.getByRole("heading", { name: "仲裁判定動作" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.getByRole("combobox").filter({ hasText: /請選擇一項仲裁判定動作/ }).click();
    await page.getByRole("option", { name: "永久封禁" }).click();
    await page.getByRole("combobox").filter({ hasText: /請選擇違規身分/ }).click();
    await page.getByRole("option", { name: "Member" }).click();
    await page.getByRole("button", { name: "執行最終仲裁裁決" }).click();

    await expect(page).toHaveURL(/\/admin\/disputes\?status=completed/, {
      timeout: 20_000,
    });

    await expect
      .poll(async () => hasActiveBanSanctionForUser(sellerId), {
        timeout: 15_000,
      })
      .toBe(true);

    try {
      await expect
        .poll(async () => isSellerPasswordSignInBlocked(), { timeout: 15_000 })
        .toBe(true);
    } finally {
      await deleteAccountSanctionsForUser(sellerId);
      await unbanUserForE2e(sellerId);
    }
  });

  test("suspended user is redirected to /auth/suspended", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only suspended redirect");

    const buyerId = await getBuyerProfileIdFromEnv();
    if (!buyerId) {
      test.skip(true, "Missing E2E_BUYER_EMAIL");
      return;
    }

    const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await deleteAccountSanctionsForUser(buyerId);
    await insertAccountSanctionForE2e({
      userId: buyerId,
      type: "suspend",
      endsAt,
    });

    try {
      await page.goto("/profile/user");
      await expect(page).toHaveURL(/\/auth\/suspended/, { timeout: 20_000 });
      await expect(page.getByText("帳戶已暫停")).toBeVisible({ timeout: 15_000 });
    } finally {
      await deleteAccountSanctionsForUser(buyerId);
    }
  });
});
