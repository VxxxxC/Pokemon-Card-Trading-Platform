// @partner-id P-A08
// @features F-M-13
// @path Partner

import { test, expect, type Page } from "@playwright/test";
import { getChatRealtimeFixtures, hasChatRealtimeFixtures } from "../../fixtures/chat-test-data";
import {
  ensureDbChatRoom,
  getChatRoomSellerPersona,
  getProfileDisplayName,
  getProfileIdByEmail,
} from "../../fixtures/supabase-admin";
import {
  ensureMemberPersona,
  ensureMerchantPersona,
} from "../../helpers/collection-asset";
import {
  chatConsoleRoot,
  closeChatConsole,
  openChatRoom,
} from "../../helpers/member-trading";
import {
  dismissBlockingOverlays,
  suppressTransientHomeOverlays,
  waitUntilNoBlockingOverlay,
} from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

async function sendChatMessage(page: Page, text: string): Promise<void> {
  const composer = chatConsoleRoot(page)
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "發送 ⚡" }) });
  await composer.locator('input[type="text"]').fill(text);
  await composer.getByRole("button", { name: "發送 ⚡" }).click();
}

async function openInboxOnce(page: Page) {
  const inboxButton = page
    .getByRole("banner")
    .getByRole("button", { name: "收件匣" });
  await expect(inboxButton).toBeVisible({ timeout: 20_000 });
  const header = page.getByText("即時交易通知");
  if (!(await header.isVisible().catch(() => false))) {
    await inboxButton.click({ force: true });
  }
  await expect(header).toBeVisible({ timeout: 15_000 });
  return inboxButton;
}

test.describe("P-A08 inbox unread badge", () => {
  test("new inbound message shows green unread dot on inbox", async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "seller",
      "Inbox unread uses seller project",
    );
    if (!hasChatRealtimeFixtures()) {
      test.skip(true, "Missing chat realtime fixtures");
    }

    const fixtures = getChatRealtimeFixtures();
    const sellerId = fixtures.sellerId!;
    const buyerEmail = fixtures.buyerEmail!;
    const buyerId = await getProfileIdByEmail(buyerEmail);
    if (!buyerId) {
      test.skip(true, `Could not resolve buyer profile for ${buyerEmail}`);
      return;
    }

    const [buyerName, sellerName] = await Promise.all([
      getProfileDisplayName(buyerId),
      getProfileDisplayName(sellerId),
    ]);
    const roomId = await ensureDbChatRoom(buyerId, sellerId);
    const sellerPersona = await getChatRoomSellerPersona(roomId);
    const message = `P-A08 unread ${Date.now()}`;

    const buyerContext = await browser.newContext({
      storageState: "e2e/.auth/buyer.json",
    });
    const sellerContext = await browser.newContext({
      storageState: "e2e/.auth/seller.json",
    });
    const buyerPage = await buyerContext.newPage();
    const sellerPage = await sellerContext.newPage();

    try {
      if (sellerPersona === "merchant") {
        await ensureMerchantPersona(sellerPage);
      } else {
        await ensureMemberPersona(sellerPage);
      }
      await suppressTransientHomeOverlays(sellerPage);
      await sellerPage.goto("/", { waitUntil: "domcontentloaded" });
      await waitUntilNoBlockingOverlay(sellerPage);
      await dismissBlockingOverlays(sellerPage);
      await closeChatConsole(sellerPage);

      await openChatRoom(buyerPage, roomId, sellerName, sellerId);
      await sendChatMessage(buyerPage, message);
      await expect(buyerPage.getByText(message).first()).toBeVisible({
        timeout: 15_000,
      });

      await sellerPage.reload({ waitUntil: "domcontentloaded" });
      await waitUntilNoBlockingOverlay(sellerPage);
      await dismissBlockingOverlays(sellerPage);
      await closeChatConsole(sellerPage);

      const inboxButton = await openInboxOnce(sellerPage);

      const inboxRow = sellerPage
        .locator("button")
        .filter({ hasText: buyerName })
        .or(sellerPage.locator("button").filter({ hasText: message }))
        .first();

      await expect
        .poll(
          async () => {
            const headerVisible = await sellerPage
              .getByText("即時交易通知")
              .isVisible()
              .catch(() => false);
            if (!headerVisible) {
              await inboxButton.click({ force: true }).catch(() => undefined);
            }
            return inboxRow.isVisible().catch(() => false);
          },
          { timeout: 30_000 },
        )
        .toBe(true);

      await expect(inboxButton.getByTestId("chat-unread-dot")).toBeVisible({
        timeout: 15_000,
      });
      await expect(inboxRow.getByTestId("chat-unread-dot")).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await buyerContext.close();
      await sellerContext.close();
    }
  });
});
