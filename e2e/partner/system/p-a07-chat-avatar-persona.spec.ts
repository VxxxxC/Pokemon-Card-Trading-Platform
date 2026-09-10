// @partner-id P-A07
// @features F-M-13
// @path Partner

import { test, expect } from "@playwright/test";
import { getChatRealtimeFixtures, hasChatRealtimeFixtures } from "../../fixtures/chat-test-data";
import {
  ensureDbChatRoom,
  getProfileDisplayName,
  getProfileIdByEmail,
} from "../../fixtures/supabase-admin";
import { chatConsoleRoot, chatReplyInput, openChatRoom } from "../../helpers/member-trading";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

test.describe("P-A07 chat member avatar persona", () => {
  test("clicking member avatar opens member public profile", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "seller",
      "Chat persona uses seller project",
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

    const buyerName = await getProfileDisplayName(buyerId);
    const roomId = await ensureDbChatRoom(buyerId, sellerId);

    await openChatRoom(page, roomId, buyerName, buyerId);
    await expect(chatReplyInput(page)).toBeVisible({ timeout: 20_000 });

    const avatarLink = chatConsoleRoot(page).getByTestId(
      "chat-partner-profile-link",
    );
    await expect(avatarLink).toBeVisible({ timeout: 20_000 });
    await expect(avatarLink).toHaveAttribute(
      "href",
      new RegExp(`/profile/${buyerId}\\?persona=member$`),
    );
    await avatarLink.click();

    await expect(page).toHaveURL(new RegExp(`/profile/${buyerId}/?$`), {
      timeout: 15_000,
    });
    await expect(page.getByText("認證商戶")).toHaveCount(0);
  });
});
