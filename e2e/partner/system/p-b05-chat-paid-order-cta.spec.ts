// @partner-id P-B05
// @features F-M-13
// @path Partner

import { test, expect } from "@playwright/test";
import { getChatRealtimeFixtures, hasChatRealtimeFixtures } from "../../fixtures/chat-test-data";
import {
  ensureDbChatRoom,
  getProfileDisplayName,
  getProfileIdByEmail,
} from "../../fixtures/supabase-admin";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { chatConsoleRoot, openChatRoom } from "../../helpers/member-trading";
import {
  hasMerchantOrderE2eEnv,
  seedMerchantAuthAwaitingBuyerConfirm,
} from "../../helpers/merchant-orders";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

test.describe("P-B05 chat paid order CTA", () => {
  test("accepted paid merchant order chat has no 前往付款", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only pay CTA");
    test.skip(
      !hasMemberTradingFixtures() ||
        !hasMerchantOrderE2eEnv() ||
        !hasChatRealtimeFixtures(),
      "Missing buyer/chat/merchant seed env",
    );

    await seedMerchantAuthAwaitingBuyerConfirm();

    const fixtures = getChatRealtimeFixtures();
    const sellerId = fixtures.sellerId!;
    const buyerEmail = fixtures.buyerEmail!;
    const buyerId = await getProfileIdByEmail(buyerEmail);
    if (!buyerId) {
      test.skip(true, `Could not resolve buyer profile for ${buyerEmail}`);
      return;
    }
    const sellerName = await getProfileDisplayName(sellerId);
    const roomId = await ensureDbChatRoom(buyerId, sellerId);

    await openChatRoom(page, roomId, sellerName, sellerId);

    const consoleRoot = chatConsoleRoot(page);
    await expect(
      consoleRoot.getByRole("button", { name: /前往付款|前往結帳/ }),
    ).toHaveCount(0);
  });
});
