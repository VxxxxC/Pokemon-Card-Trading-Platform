// @partner-id P-C02
// @features F-M-13
// @path Partner

import { test, expect, type Page } from "@playwright/test";
import { getChatRealtimeFixtures, hasChatRealtimeFixtures } from "../../fixtures/chat-test-data";
import {
  ensureDbChatRoom,
  getProfileDisplayName,
  getProfileIdByEmail,
} from "../../fixtures/supabase-admin";
import { chatConsoleRoot, openChatRoom } from "../../helpers/member-trading";
import {
  dismissBlockingOverlays,
  suppressTransientHomeOverlays,
} from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 45_000,
  });
}

async function uiLogout(page: Page): Promise<void> {
  await page.goto("/profile/user/settings", { waitUntil: "domcontentloaded" });
  await dismissBlockingOverlays(page);
  await page.getByRole("button", { name: "登出" }).click();
  await expect(page.getByRole("heading", { name: "確認登出" })).toBeVisible();
  await page.getByRole("button", { name: "確認登出" }).click();
  await page.waitForURL(/\/auth/, { timeout: 30_000 });
}

async function sendChatMessage(page: Page, text: string): Promise<void> {
  const composer = chatConsoleRoot(page)
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "發送 ⚡" }) });
  await composer.locator('input[type="text"]').fill(text);
  await composer.getByRole("button", { name: "發送 ⚡" }).click();
}

test.describe("P-C02 chat session isolation after logout", () => {
  test("buyer login after seller logout does not keep seller chat text", async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "seller",
      "Same-tab logout isolation uses seller project runner",
    );
    if (!hasChatRealtimeFixtures()) {
      test.skip(true, "Missing chat realtime fixtures");
    }

    const fixtures = getChatRealtimeFixtures();
    const sellerId = fixtures.sellerId!;
    const sellerEmail = fixtures.sellerEmail!;
    const sellerPassword = fixtures.sellerPassword!;
    const buyerEmail = fixtures.buyerEmail!;
    const buyerPassword = fixtures.buyerPassword!;
    const buyerId = await getProfileIdByEmail(buyerEmail);
    if (!buyerId || !sellerPassword || !buyerPassword) {
      test.skip(true, "Missing buyer/seller login env");
      return;
    }

    const buyerName = await getProfileDisplayName(buyerId);
    const roomId = await ensureDbChatRoom(buyerId, sellerId);
    const leakToken = `P-C02-SESSION-A-${Date.now()}`;

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    try {
      await suppressTransientHomeOverlays(page);
      await uiLogin(page, sellerEmail, sellerPassword);
      await openChatRoom(page, roomId, buyerName, buyerId);
      await sendChatMessage(page, leakToken);
      await expect(page.getByText(leakToken).first()).toBeVisible({
        timeout: 15_000,
      });

      await uiLogout(page);
      await uiLogin(page, buyerEmail, buyerPassword);
      await dismissBlockingOverlays(page);

      await page.goto("/", { waitUntil: "domcontentloaded" });
      await dismissBlockingOverlays(page);
      await expect(page.getByText(leakToken)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
