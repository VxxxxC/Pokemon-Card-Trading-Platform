// @partner-id P-C03
// @features F-M-13
// @path Partner

import { test, expect, type Page } from "@playwright/test";
import { getChatRealtimeFixtures, hasChatRealtimeFixtures } from "../../fixtures/chat-test-data";
import {
  ensureDbChatRoom,
  getProfileDisplayName,
  getProfileIdByEmail,
  insertChatMessageForE2e,
} from "../../fixtures/supabase-admin";
import { chatConsoleRoot, openChatRoom } from "../../helpers/member-trading";
import {
  dismissBlockingOverlays,
  suppressTransientHomeOverlays,
  waitUntilNoBlockingOverlay,
} from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

const HISTORY_COUNT = 55;
const SELLER_AUTH_FILE = "e2e/.auth/seller.json";

async function ensureSellerSession(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const loginLink = page.getByRole("link", { name: /登入/ });
  if (!(await loginLink.isVisible().catch(() => false))) {
    return;
  }

  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 45_000,
  });
  await page.context().storageState({ path: SELLER_AUTH_FILE });
}

test.describe("P-C03 chat history hydrate", () => {
  test("opening a long thread loads latest then older messages on scroll", async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "seller",
      "Chat history uses seller project",
    );
    if (!hasChatRealtimeFixtures()) {
      test.skip(true, "Missing chat realtime fixtures");
    }

    const fixtures = getChatRealtimeFixtures();
    const sellerId = fixtures.sellerId!;
    const sellerEmail = fixtures.sellerEmail!;
    const sellerPassword = fixtures.sellerPassword!;
    const buyerEmail = fixtures.buyerEmail!;
    const buyerId = await getProfileIdByEmail(buyerEmail);
    if (!buyerId || !sellerPassword) {
      test.skip(true, `Could not resolve buyer profile for ${buyerEmail}`);
      return;
    }

    const buyerName = await getProfileDisplayName(buyerId);
    const roomId = await ensureDbChatRoom(buyerId, sellerId);
    const stamp = Date.now();
    const oldest = `P-C03-MSG-0001-${stamp}`;
    const newest = `P-C03-MSG-${String(HISTORY_COUNT).padStart(4, "0")}-${stamp}`;

    for (let i = 1; i <= HISTORY_COUNT; i += 1) {
      await insertChatMessageForE2e({
        roomId,
        senderId: i % 2 === 0 ? sellerId : buyerId,
        content: `P-C03-MSG-${String(i).padStart(4, "0")}-${stamp}`,
        createdAt: new Date(stamp - (HISTORY_COUNT - i) * 1000).toISOString(),
      });
    }

    const context = await browser.newContext({
      storageState: SELLER_AUTH_FILE,
    });
    const page = await context.newPage();

    try {
      await suppressTransientHomeOverlays(page);
      await ensureSellerSession(page, sellerEmail, sellerPassword);
      await waitUntilNoBlockingOverlay(page);
      await dismissBlockingOverlays(page);
      await openChatRoom(page, roomId, buyerName, buyerId);

      const consoleRoot = chatConsoleRoot(page);
      await expect(consoleRoot.getByText("載入對話內容…")).toHaveCount(0, {
        timeout: 20_000,
      });
      const thread = consoleRoot.locator(".overflow-y-auto").last();
      await expect
        .poll(
          async () => {
            await thread.evaluate((el) => {
              el.scrollTop = el.scrollHeight;
            });
            return consoleRoot.getByText(newest).first().isVisible();
          },
          { timeout: 45_000 },
        )
        .toBe(true);

      await thread.evaluate((el) => {
        el.scrollTop = 0;
      });

      await expect(consoleRoot.getByText(oldest).first()).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await context.close();
    }
  });
});
