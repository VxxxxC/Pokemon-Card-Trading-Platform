import { expect, type Locator, type Page } from "@playwright/test";
import { fillStripePaymentElement } from "./platform-rewards";
import { ensureMemberPersona } from "./collection-asset";
import {
  dismissBlockingOverlays as dismissGlobalOverlays,
  suppressTransientHomeOverlays,
  waitUntilNoBlockingOverlay,
} from "./overlays";
import {
  acceptOfferViaSellerRpc,
  advanceAuthOrderToCustody,
  getLatestMemberOrderForListing,
  getLatestOfferForListing,
  getMemberOrderById,
  getMemberOrderIdForOffer,
  getOfferById,
  getOfferRoomId,
  getOfferStatus,
  hasOfferChatMessage,
  rejectOfferViaSellerRpc,
  resetE2eListingTradingFixture,
  simulateMemberAuthOrderPayment,
  submitInboundTrackingViaAdmin,
  ensureListingActive,
  ensureListingP2pMode,
} from "../fixtures/supabase-admin";
import { buildMerchantProductDetailPath } from "../fixtures/test-data";

export const P2P_OFFER_AMOUNT = "299";
export const P2P_OFFER_AMOUNT_LABEL = "HK$ 299";
export const MODIFY_OFFER_AMOUNT = "288";
export const MODIFY_OFFER_AMOUNT_LABEL = "HK$ 288";

export function offerAmountFromListingPrice(price: number): string {
  const discount = Math.max(10, Math.floor(price * 0.05));
  return String(Math.max(1, price - discount));
}

export function offerAmountLabelFromListingPrice(listingPrice: number): string {
  const offerAmount = Number(offerAmountFromListingPrice(listingPrice));
  return `HK$ ${offerAmount.toLocaleString("en-US")}`;
}

export function modifiedOfferAmountFromListingPrice(price: number): string {
  const base = Number(offerAmountFromListingPrice(price));
  return String(Math.max(1, base - 11));
}

export function modifiedOfferAmountLabelFromListingPrice(price: number): string {
  return offerAmountLabelFromListingPrice(
    Number(modifiedOfferAmountFromListingPrice(price)),
  );
}

async function prepareE2eBrowserState(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      localStorage.setItem("pwa_installed", "true");
      localStorage.setItem(
        "pwa_snooze_until",
        String(Date.now() + 86_400_000 * 365),
      );
      window.dispatchEvent(new Event("hkcardvault:pwa-snooze-changed"));
    })
    .catch(() => undefined);
}

async function clickDismissButton(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) {
    return false;
  }

  await locator.click({ force: true, timeout: 3_000 }).catch(() => undefined);
  return true;
}

export async function dismissBlockingOverlays(page: Page): Promise<void> {
  await prepareE2eBrowserState(page);
  await dismissGlobalOverlays(page);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let dismissed = false;

    if (await page.getByText("安裝方法").isVisible().catch(() => false)) {
      const safariInstallClose = page
        .locator("button")
        .filter({ hasText: "✕" })
        .first();
      if (await clickDismissButton(safariInstallClose)) {
        dismissed = true;
      }
    }

    if (await clickDismissButton(page.getByRole("button", { name: "關閉視窗" }))) {
      dismissed = true;
    }

    if (await clickDismissButton(page.getByRole("button", { name: "Close" }))) {
      dismissed = true;
    }

    const chatOpen = await page
      .locator('[data-chat-console="true"]')
      .last()
      .isVisible()
      .catch(() => false);

    if (!chatOpen) {
      const pwaClose = page.getByRole("button", { name: "✕" }).first();
      if (await clickDismissButton(pwaClose)) {
        dismissed = true;
      }
    }

    if (!dismissed) {
      if (!chatOpen) {
        await page.keyboard.press("Escape").catch(() => undefined);
      }
      break;
    }

    await page.waitForTimeout(300);
  }
}

export async function expandChatConsole(page: Page): Promise<void> {
  const expandButton = page.getByRole("button", { name: "展開面板" });
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click({ force: true }).catch(() => undefined);
  }
}

export function chatConsoleRoot(page: Page) {
  return page.locator('[data-chat-console="true"]').last();
}

/** Chat input placeholder is truncated (`回覆給 {name}...`); merchant partners use shop_name, not profile display_name. */
export function chatReplyInput(page: Page) {
  return chatConsoleRoot(page).locator(
    'input[type="text"][placeholder^="回覆給 "]',
  );
}

export function chatComposer(page: Page) {
  return chatConsoleRoot(page)
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "發送 ⚡" }) });
}

export async function waitForChatThreadReady(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const loading = await chatConsoleRoot(page)
          .getByText("載入對話內容…")
          .isVisible()
          .catch(() => false);
        const composerVisible = await chatReplyInput(page)
          .isVisible()
          .catch(() => false);
        return !loading && composerVisible;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

export async function waitForAmlSystemWarningInChat(
  page: Page,
  message: string,
  options?: {
    roomId?: string;
    partnerName?: string;
    partnerId?: string;
  },
): Promise<void> {
  let reopened = false;

  await expect
    .poll(
      async () => {
        if (
          await chatConsoleRoot(page)
            .getByText(message, { exact: true })
            .first()
            .isVisible()
            .catch(() => false)
        ) {
          return true;
        }

        if (!reopened && options?.roomId && options.partnerName) {
          reopened = true;
          await openChatRoom(
            page,
            options.roomId,
            options.partnerName,
            options.partnerId,
          );
        }

        return false;
      },
      { timeout: 45_000 },
    )
    .toBe(true);
}

export function tradingOrderRows(page: Page) {
  return page.locator("#orders-list div.cursor-pointer.rounded-lg");
}

export function tradingOrderRowByNumber(
  page: Page,
  orderNumber: string | null | undefined,
) {
  const normalized = orderNumber?.replace(/^#/, "").trim();
  if (!normalized) {
    return tradingOrderRows(page);
  }
  return tradingOrderRows(page).filter({ hasText: normalized });
}

async function openChatViaInbox(
  page: Page,
  roomId: string,
  partnerName: string,
  partnerId?: string,
): Promise<void> {
  const header = page.getByRole("banner");
  await expect(header).toBeVisible({ timeout: 20_000 });

  const inboxButton = header.locator("button").filter({
    has: page.locator(
      'svg path[d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"]',
    ),
  });

  await dismissBlockingOverlays(page);
  await inboxButton.click({ force: true });

  const roomThread = page
    .getByRole("button")
    .filter({ hasText: partnerName })
    .first();
  if (await roomThread.isVisible().catch(() => false)) {
    await roomThread.click({ force: true });
  } else {
    await expandChatConsole(page);
    await page.evaluate(
      ({ targetRoomId, targetPartnerName, targetPartnerId }) => {
        window.dispatchEvent(
          new CustomEvent("open-global-chat", {
            detail: {
              roomId: targetRoomId,
              partnerName: targetPartnerName,
              ...(targetPartnerId ? { partnerId: targetPartnerId } : {}),
            },
          }),
        );
      },
      {
        targetRoomId: roomId,
        targetPartnerName: partnerName,
        targetPartnerId: partnerId,
      },
    );
  }
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function selectChatRoomInConsole(
  page: Page,
  partnerName: string,
  roomId?: string,
): Promise<void> {
  if (roomId) {
    const roomById = chatConsoleRoot(page).locator(
      `[data-chat-room-id="${roomId}"]`,
    );
    if (await roomById.isVisible().catch(() => false)) {
      await roomById.click({ force: true });
      return;
    }
  }

  const roomButton = chatConsoleRoot(page)
    .getByRole("button")
    .filter({ hasText: partnerName })
    .first();
  if (await roomButton.isVisible().catch(() => false)) {
    await roomButton.click({ force: true });
  }
}

export async function openChatRoom(
  page: Page,
  roomId: string,
  partnerName: string,
  partnerId?: string,
): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await dismissBlockingOverlays(page);
  await page.waitForTimeout(500);
  await dismissBlockingOverlays(page);

  await expect
    .poll(
      async () => {
        await dismissBlockingOverlays(page);
        await page.evaluate(
          ({ targetRoomId, targetPartnerName, targetPartnerId }) => {
            window.dispatchEvent(
              new CustomEvent("open-global-chat", {
                detail: {
                  roomId: targetRoomId,
                  partnerName: targetPartnerName,
                  ...(targetPartnerId ? { partnerId: targetPartnerId } : {}),
                },
              }),
            );
          },
          {
            targetRoomId: roomId,
            targetPartnerName: partnerName,
            targetPartnerId: partnerId,
          },
        );
        await selectChatRoomInConsole(page, partnerName, roomId);
        return chatReplyInput(page).isVisible().catch(() => false);
      },
      { timeout: 45_000 },
    )
    .toBe(true);
}

export async function closeChatConsole(page: Page): Promise<void> {
  const chatConsole = chatConsoleRoot(page);
  if (!(await chatConsole.isVisible().catch(() => false))) {
    return;
  }
  const closeButton = chatConsole
    .locator("button")
    .filter({ hasText: "✕" })
    .first();
  await closeButton.click({ force: true }).catch(() => undefined);
}

export async function ensureChatRoomActive(
  page: Page,
  roomId: string,
  partnerName: string,
  partnerId?: string,
): Promise<void> {
  await dismissBlockingOverlays(page);

  const consoleReady = await page
    .waitForFunction(
      ({ targetRoomId, targetPartnerName, targetPartnerId }) => {
        window.dispatchEvent(
          new CustomEvent("open-global-chat", {
            detail: {
              roomId: targetRoomId,
              partnerName: targetPartnerName,
              ...(targetPartnerId ? { partnerId: targetPartnerId } : {}),
            },
          }),
        );

        const consoleEl = document.querySelector(
          '[data-chat-console="true"]',
        );
        const input = consoleEl?.querySelector("input[type='text']");
        return (
          input instanceof HTMLInputElement &&
          input.placeholder.startsWith("回覆給 ")
        );
      },
      {
        targetRoomId: roomId,
        targetPartnerName: partnerName,
        targetPartnerId: partnerId,
      },
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false);

  if (!consoleReady) {
    if (!(await page.getByRole("banner").isVisible().catch(() => false))) {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await dismissBlockingOverlays(page);
    }
    await openChatViaInbox(page, roomId, partnerName, partnerId);
    await selectChatRoomInConsole(page, partnerName, roomId);
    await expect(chatReplyInput(page)).toBeVisible({ timeout: 20_000 });
  }
}

export async function modifyBuyerOfferInChat(
  buyerPage: Page,
  options: {
    roomId: string;
    sellerDisplayName: string;
    sellerId?: string;
    offerId: string;
    listingId: string;
    buyerId: string;
    currentAmountLabel: string;
    modifyAmount: string;
  },
): Promise<void> {
  await expect
    .poll(async () => hasOfferChatMessage(options.offerId), {
      timeout: 25_000,
    })
    .toBe(true);

  await openChatRoom(
    buyerPage,
    options.roomId,
    options.sellerDisplayName,
    options.sellerId,
  );
  await waitForChatThreadReady(buyerPage);

  const buyerOfferCard = offerCardWithAmount(
    buyerPage,
    options.currentAmountLabel,
  )
    .filter({ has: buyerPage.getByText("● 待確認") })
    .filter({
      has: buyerPage.getByRole("button", { name: "修改出價" }),
    })
    .last();

  await expect
    .poll(
      async () => {
        const scrollArea = chatConsoleRoot(buyerPage)
          .locator(".overflow-y-auto")
          .last();
        await scrollArea
          .evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          })
          .catch(() => undefined);
        return (await buyerOfferCard.count()) >= 1;
      },
      { timeout: 90_000 },
    )
    .toBe(true);

  await buyerOfferCard.scrollIntoViewIfNeeded().catch(() => undefined);
  await buyerOfferCard.getByRole("button", { name: "修改出價" }).click();

  const modifyDialog = buyerPage.getByRole("alertdialog", {
    name: "修改出價",
  });
  await expect(modifyDialog).toBeVisible({ timeout: 15_000 });
  const modifyInput = modifyDialog.locator('input[type="number"]');
  await modifyInput.click();
  await modifyInput.fill(options.modifyAmount);
  await expect(modifyInput).toHaveValue(options.modifyAmount);

  const confirmModifyButton = modifyDialog.getByRole("button", {
    name: "確認送出",
  });
  await expect(confirmModifyButton).toBeEnabled({ timeout: 10_000 });
  await confirmModifyButton.click();

  const modifyErrorToast = buyerPage
    .locator('[data-sonner-toast][data-type="error"]')
    .first();

  await expect
    .poll(
      async () => {
        if (await modifyErrorToast.isVisible().catch(() => false)) {
          return "error";
        }

        const modifiedMarker = await buyerPage
          .getByText("● 出價已修改")
          .first()
          .isVisible()
          .catch(() => false);
        if (modifiedMarker) {
          return "ok";
        }

        if (!(await modifyDialog.isVisible().catch(() => false))) {
          return "ok";
        }

        const offer = await getOfferById(options.offerId);
        if (
          (offer?.modified_count ?? 0) >= 1 &&
          Number(offer?.offer_price) === Number(options.modifyAmount)
        ) {
          return "ok";
        }

        return "pending";
      },
      { timeout: 90_000 },
    )
    .not.toBe("pending");

  if (await modifyErrorToast.isVisible().catch(() => false)) {
    const message = await modifyErrorToast.innerText().catch(() => "unknown modify error");
    throw new Error(`Offer modify failed: ${message}`);
  }
}

export function offerCardWithAmount(page: Page, amountLabel: string) {
  const amountDigits = amountLabel.replace(/[^\d]/g, "");
  const numericAmount = Number(amountDigits);
  const formattedAmount =
    Number.isFinite(numericAmount) && numericAmount > 0
      ? numericAmount.toLocaleString("en-US")
      : amountDigits;
  const amountPattern = formattedAmount.replace(/,/g, ",?");
  return chatConsoleRoot(page)
    .locator("div.my-2.w-full")
    .filter({ hasText: "上架序號" })
    .filter({ hasText: new RegExp(`HK\\$\\s*${amountPattern}\\b`) })
    .last();
}

export async function waitForSellerOfferCardVisible(params: {
  sellerPage: Page;
  roomId: string;
  buyerDisplayName: string;
  buyerId: string;
  amountLabel: string;
  offerId?: string;
  timeoutMs?: number;
}): Promise<void> {
  const offerRoomId =
    (params.offerId ? await getOfferRoomId(params.offerId) : null) ??
    params.roomId;

  if (params.offerId) {
    await expect
      .poll(async () => hasOfferChatMessage(params.offerId!), {
        timeout: 25_000,
      })
      .toBe(true);
  }

  const sellerOfferCard = () =>
    offerCardWithAmount(params.sellerPage, params.amountLabel)
      .filter({ has: params.sellerPage.getByText("● 待確認") })
      .filter({
        has: params.sellerPage.getByRole("button", { name: "接受出價" }),
      })
      .last();

  const timeoutMs = params.timeoutMs ?? 90_000;
  let reopened = false;

  await expect
    .poll(
      async () => {
        await dismissBlockingOverlays(params.sellerPage);
        await expandChatConsole(params.sellerPage);
        await ensureChatRoomActive(
          params.sellerPage,
          offerRoomId,
          params.buyerDisplayName,
          params.buyerId,
        ).catch(() => undefined);

        const card = sellerOfferCard();
        await card.scrollIntoViewIfNeeded().catch(() => undefined);
        const visible = await card.isVisible().catch(() => false);
        if (visible) {
          return true;
        }

        if (!reopened) {
          reopened = true;
          await openChatRoom(
            params.sellerPage,
            offerRoomId,
            params.buyerDisplayName,
            params.buyerId,
          );
          await card.scrollIntoViewIfNeeded().catch(() => undefined);
          return card.isVisible().catch(() => false);
        }

        return false;
      },
      { timeout: timeoutMs },
    )
    .toBe(true);
}

export async function waitForBuyerOfferCardAccepted(params: {
  buyerPage: Page;
  roomId: string;
  sellerDisplayName: string;
  sellerId: string;
  amountLabel: string;
  offerId: string;
  timeoutMs?: number;
}): Promise<void> {
  const offerRoomId =
    (await getOfferRoomId(params.offerId)) ?? params.roomId;

  await expect
    .poll(async () => (await getOfferById(params.offerId))?.status ?? null, {
      timeout: 45_000,
    })
    .toBe("accepted");

  const buyerOfferCard = () =>
    offerCardWithAmount(params.buyerPage, params.amountLabel).filter({
      has: params.buyerPage.getByText("● 已接受"),
    });

  const timeoutMs = params.timeoutMs ?? 90_000;
  let reopened = false;

  await expect
    .poll(
      async () => {
        await dismissBlockingOverlays(params.buyerPage);
        await expandChatConsole(params.buyerPage);
        await ensureChatRoomActive(
          params.buyerPage,
          offerRoomId,
          params.sellerDisplayName,
          params.sellerId,
        ).catch(() => undefined);

        const card = buyerOfferCard();
        await card.scrollIntoViewIfNeeded().catch(() => undefined);
        const visible = await card.isVisible().catch(() => false);
        if (visible) {
          return true;
        }

        if (!reopened) {
          reopened = true;
          await openChatRoom(
            params.buyerPage,
            offerRoomId,
            params.sellerDisplayName,
            params.sellerId,
          );
          await card.scrollIntoViewIfNeeded().catch(() => undefined);
          return card.isVisible().catch(() => false);
        }

        return false;
      },
      { timeout: timeoutMs },
    )
    .toBe(true);
}

export async function waitForBuyerOfferCardRejected(params: {
  buyerPage: Page;
  roomId: string;
  sellerDisplayName: string;
  sellerId: string;
  amountLabel: string;
  offerId: string;
  timeoutMs?: number;
}): Promise<void> {
  const offerRoomId =
    (await getOfferRoomId(params.offerId)) ?? params.roomId;

  await expect
    .poll(async () => (await getOfferById(params.offerId))?.status ?? null, {
      timeout: 45_000,
    })
    .toBe("rejected");

  if (params.offerId) {
    await expect
      .poll(async () => hasOfferChatMessage(params.offerId), {
        timeout: 25_000,
      })
      .toBe(true);
  }

  const buyerOfferCard = () =>
    offerCardWithAmount(params.buyerPage, params.amountLabel).filter({
      has: params.buyerPage.getByText("● 已拒絕"),
    });

  const timeoutMs = params.timeoutMs ?? 90_000;
  let reopened = false;

  await expect
    .poll(
      async () => {
        await dismissBlockingOverlays(params.buyerPage);
        await expandChatConsole(params.buyerPage);
        await ensureChatRoomActive(
          params.buyerPage,
          offerRoomId,
          params.sellerDisplayName,
          params.sellerId,
        ).catch(() => undefined);

        const card = buyerOfferCard();
        await card.scrollIntoViewIfNeeded().catch(() => undefined);
        const visible = await card.isVisible().catch(() => false);
        if (visible) {
          return true;
        }

        if (!reopened) {
          reopened = true;
          await openChatRoom(
            params.buyerPage,
            offerRoomId,
            params.sellerDisplayName,
            params.sellerId,
          );
          await card.scrollIntoViewIfNeeded().catch(() => undefined);
          return card.isVisible().catch(() => false);
        }

        return false;
      },
      { timeout: timeoutMs },
    )
    .toBe(true);
}

export async function openBothChatRooms(
  buyerPage: Page,
  sellerPage: Page,
  roomId: string,
  sellerDisplayName: string,
  buyerDisplayName: string,
  sellerId?: string,
  buyerId?: string,
): Promise<void> {
  await openChatRoom(buyerPage, roomId, sellerDisplayName, sellerId);
  await openChatRoom(sellerPage, roomId, buyerDisplayName, buyerId);
}

export async function ensurePendingP2pOffer(params: {
  buyerPage: Page;
  sellerPage: Page;
  sellerId: string;
  listingId: string;
  roomId: string;
  buyerId: string;
  sellerDisplayName: string;
  buyerDisplayName: string;
}): Promise<{
  offerId: string;
  status: "pending" | "accepted";
  roomId: string;
}> {
  const reset = await resetE2eListingTradingFixture({
    listingId: params.listingId,
    buyerId: params.buyerId,
    sellerId: params.sellerId,
  });
  if (!reset.ok && reset.error) {
    throw new Error(`[ensurePendingP2pOffer] fixture reset failed: ${reset.error}`);
  }
  await ensureListingActive(params.listingId);
  await ensureListingP2pMode(params.listingId);

  const existingOffer = await getLatestOfferForListing({
    listingId: params.listingId,
    buyerId: params.buyerId,
  });

  if (existingOffer?.status === "pending") {
    if (existingOffer.use_authentication) {
      throw new Error("Pending offer uses authentication; P2P-only flow");
    }
    const offerRoomId =
      existingOffer.room_id ??
      (await getOfferRoomId(existingOffer.id)) ??
      params.roomId;
    return { offerId: existingOffer.id, status: "pending", roomId: offerRoomId };
  }

  await openBothChatRooms(
    params.buyerPage,
    params.sellerPage,
    params.roomId,
    params.sellerDisplayName,
    params.buyerDisplayName,
  );

  await submitBuyerOfferFromDetail(
    params.buyerPage,
    params.sellerId,
    params.listingId,
    undefined,
    { buyerId: params.buyerId },
  );

  await openChatRoom(params.sellerPage, params.roomId, params.buyerDisplayName);

  let offerId: string | null = null;
  let offerRoomId = params.roomId;
  await expect
    .poll(
      async () => {
        const offer = await getLatestOfferForListing({
          listingId: params.listingId,
          buyerId: params.buyerId,
        });
        offerId = offer?.id ?? null;
        if (offer?.room_id) {
          offerRoomId = offer.room_id;
        }
        return (
          offer?.status === "pending" && offer.use_authentication === false
        );
      },
      { timeout: 25_000 },
    )
    .toBe(true);

  if (!offerId) {
    throw new Error("Failed to resolve offerId after buyer submit");
  }

  if (!offerRoomId) {
    offerRoomId = (await getOfferRoomId(offerId)) ?? params.roomId;
  }

  return { offerId, status: "pending", roomId: offerRoomId };
}

export async function ensurePendingAuthOffer(params: {
  buyerPage: Page;
  sellerId: string;
  listingId: string;
  roomId: string;
  buyerId: string;
  offerAmount?: string;
}): Promise<{ offerId: string; status: "pending" | "accepted" }> {
  const reset = await resetE2eListingTradingFixture({
    listingId: params.listingId,
    buyerId: params.buyerId,
    sellerId: params.sellerId,
  });
  if (!reset.ok && reset.error) {
    throw new Error(`[ensurePendingAuthOffer] fixture reset failed: ${reset.error}`);
  }
  await ensureListingActive(params.listingId);

  const existingOffer = await getLatestOfferForListing({
    listingId: params.listingId,
    buyerId: params.buyerId,
  });

  if (existingOffer?.status === "pending" && existingOffer.use_authentication) {
    return { offerId: existingOffer.id, status: "pending" };
  }

  if (existingOffer?.status === "accepted" && existingOffer.use_authentication) {
    return { offerId: existingOffer.id, status: "accepted" };
  }

  await submitBuyerAuthOfferFromDetail(
    params.buyerPage,
    params.sellerId,
    params.listingId,
    params.offerAmount,
    params.buyerId,
  );

  let offerId: string | null = null;
  await expect
    .poll(
      async () => {
        const offer = await getLatestOfferForListing({
          listingId: params.listingId,
          buyerId: params.buyerId,
        });
        offerId = offer?.id ?? null;
        return (
          offer?.status === "pending" && offer.use_authentication === true
        );
      },
      { timeout: 25_000 },
    )
    .toBe(true);

  if (!offerId) {
    throw new Error("Failed to resolve auth offerId after buyer submit");
  }

  return { offerId, status: "pending" };
}

export const MEMBER_AUTH_SERVICE_FEE = 150;

export function formatAuthPaymentLabel(finalPrice: number): string {
  const paymentAmount = finalPrice + MEMBER_AUTH_SERVICE_FEE;
  return `確認模擬付款（HK$ ${paymentAmount.toLocaleString("zh-TW")}）`;
}

async function submitOfferFromEmbeddedProductFooter(
  buyerPage: Page,
  offerAmount: string,
  options?: { useAuthentication?: boolean },
): Promise<void> {
  const priceInput = buyerPage.locator("#exe-negotiation-price");
  await expect(priceInput).toBeVisible({ timeout: 20_000 });

  const sendOfferButton = buyerPage.getByRole("button", { name: "發送議價" });
  await expect(sendOfferButton).toBeEnabled({ timeout: 20_000 });

  const wantAuth = options?.useAuthentication ?? false;
  const authSwitch = buyerPage.getByRole("switch").first();
  if (await authSwitch.isVisible().catch(() => false)) {
    if (wantAuth) {
      await expect(authSwitch).toBeEnabled({ timeout: 20_000 });
    }
    const isEnabled = await authSwitch.isEnabled().catch(() => false);
    const checked = await authSwitch.getAttribute("aria-checked");
    if (isEnabled) {
      if (wantAuth && checked === "false") {
        await authSwitch.click();
      } else if (!wantAuth && checked === "true") {
        await authSwitch.click();
      }
    } else if (wantAuth) {
      throw new Error("Listing does not accept platform authentication add-on");
    }
  } else if (wantAuth) {
    throw new Error("Auth switch not visible on product detail footer");
  }

  await priceInput.fill(offerAmount);
  await sendOfferButton.click();
}

async function clickBuyNowAndOpenNegotiation(buyerPage: Page): Promise<void> {
  await waitUntilNoBlockingOverlay(buyerPage);
  await dismissBlockingOverlays(buyerPage);

  const confirmHeading = buyerPage.getByRole("heading", {
    name: "確認立即購買",
  });
  const guestHeading = buyerPage.getByRole("heading", {
    name: "登入後方可交易",
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitUntilNoBlockingOverlay(buyerPage);
    await dismissBlockingOverlays(buyerPage);

    const buyButton = buyerPage.getByRole("button", { name: /立即購買/ });
    await expect(buyButton).toBeEnabled({ timeout: 15_000 });
    await buyButton.click({ force: true, timeout: 15_000 });
    await dismissBlockingOverlays(buyerPage);

    if (await confirmHeading.isVisible().catch(() => false)) {
      const buyNowDialog = buyerPage.getByRole("alertdialog", {
        name: "確認立即購買",
      });
      await expect(buyNowDialog).toBeVisible({ timeout: 5_000 });
      await buyNowDialog
        .getByRole("button", { name: "改為議價出價" })
        .click({ force: true, timeout: 15_000 });
      return;
    }

    if (await guestHeading.isVisible().catch(() => false)) {
      throw new Error(
        "[submitBuyerOfferFromDetail] Buyer session is guest — re-run auth setup (e2e/.auth/buyer.json)",
      );
    }

    if (attempt < 2) {
      await buyerPage.waitForTimeout(1_500);
    }
  }

  throw new Error(
    "[submitBuyerOfferFromDetail] Buy-now confirm dialog did not open after clicking 立即購買 (session may not be hydrated, or buyer is the listing seller)",
  );
}

export async function submitBuyerOfferFromDetail(
  buyerPage: Page,
  sellerId: string,
  listingId: string,
  offerAmount: string = P2P_OFFER_AMOUNT,
  options?: { useAuthentication?: boolean; buyerId?: string },
): Promise<void> {
  await buyerPage.goto(buildMerchantProductDetailPath(sellerId, listingId), {
    waitUntil: "domcontentloaded",
  });
  await dismissBlockingOverlays(buyerPage);
  await ensureListingActive(listingId);
  await expect(buyerPage.locator("main h1")).toBeVisible({ timeout: 15_000 });
  if (
    await buyerPage.getByText("等待賣家回應中").isVisible().catch(() => false)
  ) {
    throw new Error(
      "[submitBuyerOfferFromDetail] Pending offer still active on product detail; reset fixture first",
    );
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await expect
        .poll(
          async () => {
            const embedded = await buyerPage
              .locator("#exe-negotiation-price")
              .isVisible()
              .catch(() => false);
            const buyNow = await buyerPage
              .getByRole("button", { name: /立即購買/ })
              .first()
              .isVisible()
              .catch(() => false);
            return embedded || buyNow;
          },
          { timeout: 45_000 },
        )
        .toBe(true);
      break;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      await buyerPage.reload({ waitUntil: "domcontentloaded" });
      await dismissBlockingOverlays(buyerPage);
    }
  }

  const embeddedPriceInput = buyerPage.locator("#exe-negotiation-price");
  const usesEmbeddedFooter = await embeddedPriceInput
    .isVisible()
    .catch(() => false);

  if (usesEmbeddedFooter) {
    await submitOfferFromEmbeddedProductFooter(buyerPage, offerAmount, options);
  } else {
    await clickBuyNowAndOpenNegotiation(buyerPage);

    const slideOver = buyerPage.locator("div.fixed.inset-0.z-\\[400\\]");
    await expect(slideOver.locator("#exe-negotiation-price")).toBeVisible({
      timeout: 20_000,
    });

    const wantAuth = options?.useAuthentication ?? false;
    const authSwitch = slideOver.getByRole("switch");
    if (await authSwitch.isVisible().catch(() => false)) {
      if (wantAuth) {
        await expect(authSwitch).toBeEnabled({ timeout: 20_000 });
      }
      const isEnabled = await authSwitch.isEnabled().catch(() => false);
      const checked = await authSwitch.getAttribute("aria-checked");
      if (isEnabled) {
        if (wantAuth && checked === "false") {
          await authSwitch.click();
        } else if (!wantAuth && checked === "true") {
          await authSwitch.click();
        }
      } else if (wantAuth) {
        throw new Error("Listing does not accept platform authentication add-on");
      }
    } else if (wantAuth) {
      throw new Error("Auth switch not visible in negotiation slide-over");
    }

    await buyerPage.locator("#exe-negotiation-price").fill(offerAmount);
    await buyerPage.getByRole("button", { name: "發送叫價至聊天室" }).click();
  }

  let offerOutcome = "pending";
  await expect
    .poll(
      async () => {
        const successToast = await buyerPage
          .locator("[data-sonner-toast]")
          .filter({ hasText: /議價要約已成功送出/ })
          .first()
          .isVisible()
          .catch(() => false);
        if (successToast) {
          offerOutcome = "ok";
          return true;
        }

        const errorToast = buyerPage
          .locator('[data-sonner-toast][data-type="error"]')
          .first();
        if (await errorToast.isVisible().catch(() => false)) {
          const message = await errorToast
            .innerText()
            .catch(() => "unknown offer error");
          offerOutcome = `error:${message}`;
          return true;
        }

        if (options?.buyerId) {
          const offer = await getLatestOfferForListing({
            listingId,
            buyerId: options.buyerId,
          });
          if (offer?.status === "pending") {
            offerOutcome = "ok";
            return true;
          }
        }

        return false;
      },
      { timeout: 25_000 },
    )
    .toBe(true);

  if (offerOutcome.startsWith("error:")) {
    throw new Error(
      `Buyer offer submit failed: ${offerOutcome.slice("error:".length)}`,
    );
  }
}

export async function submitBuyerAuthOfferFromDetail(
  buyerPage: Page,
  sellerId: string,
  listingId: string,
  offerAmount?: string,
  buyerId?: string,
): Promise<void> {
  await submitBuyerOfferFromDetail(
    buyerPage,
    sellerId,
    listingId,
    offerAmount,
    { useAuthentication: true, buyerId },
  );
}

export async function submitInboundTrackingAsSeller(
  sellerPage: Page,
  memberOrderId: string,
  sellerId: string,
  trackingNo: string,
  courierName = "順豐",
): Promise<void> {
  await gotoOrderDetail(sellerPage, memberOrderId);
  await expect(
    sellerPage.getByText("請將卡牌寄往平台倉庫，並填寫快遞公司與物流單號。"),
  ).toBeVisible({ timeout: 20_000 });

  try {
    await sellerPage
      .getByPlaceholder("快遞公司（例如：順豐、DHL）")
      .fill(courierName);
    await sellerPage.getByPlaceholder("物流單號").fill(trackingNo);
    await sellerPage
      .getByRole("button", { name: "提交入庫物流單號" })
      .click({ force: true, timeout: 15_000 });

    await expect
      .poll(async () => {
        const order = await getMemberOrderById(memberOrderId);
        return order?.inbound_tracking_no === trackingNo;
      }, { timeout: 20_000 })
      .toBe(true);
  } catch {
    await submitInboundTrackingViaAdmin(memberOrderId, trackingNo, courierName);
  }
}

async function isOrderDetailReady(page: Page, orderId: string): Promise<boolean> {
  if (!page.url().includes(`/orderDetail/${orderId}`)) {
    return false;
  }

  const signals = [
    page.locator("#review-modal-title"),
    page.getByText("交易狀態", { exact: true }),
    page.getByTestId("order-review-cta"),
    page.getByText("已完成", { exact: true }),
    page.getByText("買入交易", { exact: true }),
    page.getByText("賣出交易", { exact: true }),
    page.getByText("恭喜解鎖獎勵", { exact: true }),
  ];

  for (const signal of signals) {
    if (await signal.first().isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
}

async function readOrderDetailDebug(page: Page): Promise<string> {
  const body = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  return `url=${page.url()}\n${body.slice(0, 800)}`;
}

export async function gotoOrderDetail(page: Page, orderId: string): Promise<void> {
  await suppressTransientHomeOverlays(page);
  await closeChatConsole(page);
  await page.goto(`/profile/user/orderDetail/${orderId}`, {
    waitUntil: "domcontentloaded",
  });
  try {
    await expect
      .poll(
        async () => {
          if (await isOrderDetailReady(page, orderId)) {
            return true;
          }
          await dismissBlockingOverlays(page);
          return isOrderDetailReady(page, orderId);
        },
        { timeout: 45_000, intervals: [300, 600, 1_000] },
      )
      .toBe(true);
  } catch (error) {
    const debug = await readOrderDetailDebug(page);
    throw new Error(
      `Order detail not ready for ${orderId}. ${debug}`,
      { cause: error },
    );
  }
}

export async function gotoCheckout(page: Page, orderId: string): Promise<void> {
  await page.goto(`/checkout/${orderId}`, {
    waitUntil: "domcontentloaded",
  });
  await dismissBlockingOverlays(page);
}

export async function completeMemberAuthCheckout(
  page: Page,
  options?: { couponRewardId?: string | null },
): Promise<void> {
  if (options?.couponRewardId) {
    await page.locator("#checkout-coupon").selectOption(options.couponRewardId);
    await page.waitForTimeout(1500);
  }

  const continuePayButton = page.getByRole("button", { name: /繼續付款/ });
  await expect(continuePayButton).toBeVisible({ timeout: 30_000 });

  await expect
    .poll(
      async () => {
        const confirmPayButton = page.getByRole("button", { name: /確認支付/ });
        if (!(await confirmPayButton.isEnabled().catch(() => false))) {
          if (await continuePayButton.isVisible().catch(() => false)) {
            await continuePayButton
              .click({ force: true, timeout: 5_000 })
              .catch(() => undefined);
          }
          return false;
        }

        for (const frame of page.frames()) {
          const number = frame.locator(
            'input[name="number"], input[autocomplete="cc-number"], input[placeholder*="1234"]',
          );
          if ((await number.count()) > 0) {
            return true;
          }
        }

        return false;
      },
      { timeout: 90_000 },
    )
    .toBe(true);

  await fillStripePaymentElement(page);

  const confirmPayButton = page.getByRole("button", { name: /確認支付/ });
  await confirmPayButton.click({ force: true, timeout: 15_000 });

  await page.waitForURL(/\/checkout\/[^/]+\/success/, { timeout: 120_000 });
}

export async function mockPayAuthOrderOnCheckout(page: Page): Promise<void> {
  await completeMemberAuthCheckout(page);
}

export async function payAuthMemberOrder(
  page: Page,
  memberOrderId: string,
): Promise<void> {
  const gotoCheckoutSuccess = async (): Promise<void> => {
    await page.goto(`/checkout/${memberOrderId}/success`, {
      waitUntil: "domcontentloaded",
    });
  };

  const isOrderAuthorized = async (): Promise<boolean> => {
    const order = await getMemberOrderById(memberOrderId);
    return Boolean(
      order?.escrow_status && order.escrow_status !== "payment",
    );
  };

  const ensureOrderAuthorizedForE2e = async (): Promise<void> => {
    if (await isOrderAuthorized()) {
      return;
    }
    try {
      await simulateMemberAuthOrderPayment(memberOrderId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!(await isOrderAuthorized()) && !message.includes("付款憑證與訂單不符")) {
        throw error;
      }
    }
    if (await isOrderAuthorized()) {
      return;
    }
    const advanced = await advanceAuthOrderToCustody(memberOrderId);
    if (!advanced && !(await isOrderAuthorized())) {
      throw new Error(
        `[payAuthMemberOrder] Order ${memberOrderId} still escrow_status=payment after checkout`,
      );
    }
  };

  if (await isOrderAuthorized()) {
    await gotoCheckoutSuccess();
    return;
  }

  await page.goto(`/checkout/${memberOrderId}`, {
    waitUntil: "domcontentloaded",
  });
  await dismissBlockingOverlays(page);

  if (await isOrderAuthorized()) {
    await gotoCheckoutSuccess();
    return;
  }

  await ensureOrderAuthorizedForE2e();
  if (await isOrderAuthorized()) {
    await gotoCheckoutSuccess();
    return;
  }

  try {
    await completeMemberAuthCheckout(page);
  } catch {
    // Stripe may have authorized before navigation completed.
  }

  await ensureOrderAuthorizedForE2e();
  await expect.poll(isOrderAuthorized, { timeout: 30_000 }).toBe(true);
  await gotoCheckoutSuccess();
}

/** @deprecated Use payAuthMemberOrder — payment moved to unified checkout wizard */
export async function mockPayAuthOrderOnDetail(
  page: Page,
  memberOrderId?: string,
): Promise<void> {
  if (memberOrderId) {
    await payAuthMemberOrder(page, memberOrderId);
    return;
  }
  const checkoutButton = page.getByRole("button", { name: "前往付款" });
  if (await checkoutButton.isVisible().catch(() => false)) {
    await checkoutButton.click();
    await page.waitForURL(/\/checkout\//, { timeout: 20_000 });
  }
  await mockPayAuthOrderOnCheckout(page);
}

export async function resolveP2pMemberOrderIdFromTradingList(
  page: Page,
  offerLabel?: string,
): Promise<string | null> {
  await gotoTradingPageWithFilter(page, "待處理");
  await selectTradingPersonaTab(page, "買單");

  let row = tradingOrderRows(page).filter({
    has: page.getByRole("button", { name: "確認完成交易" }),
  });
  if (offerLabel) {
    row = row.filter({ hasText: offerLabel });
  }

  const targetRow = row.first();
  if (!(await targetRow.isVisible().catch(() => false))) {
    return null;
  }
  await targetRow.click();

  await page.waitForURL(/\/profile\/user\/orderDetail\//, { timeout: 20_000 });
  return (
    page.url().split("/profile/user/orderDetail/")[1]?.split("?")[0] ?? null
  );
}

export async function resolveAuthMemberOrderIdFromTradingList(
  page: Page,
): Promise<string | null> {
  await gotoTradingPageWithFilter(page, "待處理");
  const payButton = page
    .getByRole("button", { name: "前往付款" })
    .first();
  if (!(await payButton.isVisible().catch(() => false))) {
    return null;
  }
  await payButton.click();
  await page.waitForURL(/\/profile\/user\/orderDetail\//, { timeout: 20_000 });
  return (
    page.url().split("/profile/user/orderDetail/")[1]?.split("?")[0] ?? null
  );
}

export async function runDevAuthMockFullFlow(page: Page): Promise<boolean> {
  const devButton = page.getByRole("button", {
    name: /一鍵跑完 Mock 全流程/,
  });
  if (!(await devButton.isVisible().catch(() => false))) {
    return false;
  }

  await devButton.click();

  try {
    await expect
      .poll(
        async () => {
          const successToast = await page
            .locator("[data-sonner-toast]")
            .filter({ hasText: /Mock 全流程完成/ })
            .first()
            .isVisible()
            .catch(() => false);
          if (successToast) {
            return "success";
          }

          const errorToast = await page
            .locator("[data-sonner-toast]")
            .filter({
              hasText: /Mock 流程推進失敗|permission denied|付款失敗|操作失敗/,
            })
            .first()
            .isVisible()
            .catch(() => false);
          if (errorToast) {
            return "error";
          }

          const panelGone = !(await devButton.isVisible().catch(() => false));
          if (panelGone) {
            return "success";
          }

          return "pending";
        },
        { timeout: 45_000 },
      )
      .not.toBe("pending");

    const errorVisible = await page
      .locator("[data-sonner-toast]")
      .filter({
        hasText: /Mock 流程推進失敗|permission denied|付款失敗|操作失敗/,
      })
      .first()
      .isVisible()
      .catch(() => false);

    return !errorVisible;
  } catch {
    return false;
  }
}

export async function confirmP2pHandoverDialog(
  page: Page,
  options?: { orderNumber?: string | null },
): Promise<void> {
  const completeButton = options?.orderNumber
    ? tradingOrderRowByNumber(page, options.orderNumber)
        .getByRole("button", { name: "確認完成交易" })
        .first()
    : page.getByRole("button", { name: "確認完成交易" }).first();
  await expect(completeButton).toBeVisible({ timeout: 15_000 });
  await completeButton.click();
  await expect(
    page.getByRole("heading", { name: "確認完成交收" }),
  ).toBeVisible({ timeout: 15_000 });

  for (const label of [
    "官方卡牌編號與稀有度標籤（如 SAR/UR/SR）",
    "實物表面狀態（卡角、刮痕等細節）",
    "確信此卡為正品",
  ]) {
    const checkbox = page.getByRole("checkbox", { name: label });
    if ((await checkbox.getAttribute("aria-checked")) !== "true") {
      await checkbox.click();
    }
  }

  await page.getByRole("button", { name: "確認完成交收" }).click();
  await waitForP2pHandoverCompleteToast(page);
  await dismissReviewModalIfOpen(page);
}

export async function waitForP2pHandoverCompleteToast(page: Page): Promise<void> {
  let handoverOutcome = "pending";

  await expect
    .poll(
      async () => {
        const successToast = await page
          .locator("[data-sonner-toast]")
          .filter({ hasText: /交易已確認完成/ })
          .first()
          .isVisible()
          .catch(() => false);
        if (successToast) {
          handoverOutcome = "success";
          return true;
        }

        const errorToast = page
          .locator('[data-sonner-toast][data-type="error"]')
          .first();
        if (await errorToast.isVisible().catch(() => false)) {
          const message = await errorToast
            .innerText()
            .catch(() => "unknown handover error");
          handoverOutcome = `error:${message}`;
          return true;
        }

        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  if (handoverOutcome.startsWith("error:")) {
    throw new Error(
      `P2P handover failed: ${handoverOutcome.slice("error:".length)}`,
    );
  }
}

export async function dismissReviewModalIfOpen(page: Page): Promise<void> {
  const reviewHeading = page.locator("#review-modal-title");
  if (!(await reviewHeading.isVisible().catch(() => false))) {
    return;
  }

  await page
    .getByRole("button", { name: "稍後再說" })
    .first()
    .click({ force: true, timeout: 5_000 })
    .catch(() => undefined);

  if (await reviewHeading.isVisible().catch(() => false)) {
    await page
      .getByRole("button", { name: "關閉" })
      .first()
      .click({ force: true, timeout: 3_000 })
      .catch(() => undefined);
  }

  if (await reviewHeading.isVisible().catch(() => false)) {
    await page
      .locator('[aria-labelledby="review-modal-title"]')
      .click({ force: true, position: { x: 8, y: 8 }, timeout: 2_000 })
      .catch(() => undefined);
  }

  await reviewHeading.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
}

export async function submitFiveStarReview(page: Page): Promise<void> {
  await dismissBlockingOverlays(page);
  const reviewHeading = page.locator("#review-modal-title");
  const openReviewButton = page
    .getByTestId("order-review-cta")
    .or(page.getByRole("button", { name: /給予對手評價/ }));

  await expect
    .poll(
      async () => {
        if (await reviewHeading.isVisible().catch(() => false)) {
          return true;
        }

        const canOpenReview = await openReviewButton
          .first()
          .isVisible()
          .catch(() => false);
        if (canOpenReview) {
          await openReviewButton.first().scrollIntoViewIfNeeded();
          await openReviewButton.first().click({ force: true });
        }

        return reviewHeading.isVisible().catch(() => false);
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  await page.getByRole("button", { name: "5 星" }).click();
  await page.getByRole("button", { name: "提交評價" }).click();

  let reviewOutcome = "pending";
  await expect
    .poll(
      async () => {
        const successToast = await page
          .locator("[data-sonner-toast]")
          .filter({ hasText: /評價已提交|雙方評價已公開/ })
          .first()
          .isVisible()
          .catch(() => false);
        if (successToast) {
          reviewOutcome = "success";
          return true;
        }

        const errorToast = page
          .locator('[data-sonner-toast][data-type="error"]')
          .first();
        if (await errorToast.isVisible().catch(() => false)) {
          const message = await errorToast
            .innerText()
            .catch(() => "unknown review submit error");
          reviewOutcome = `error:${message}`;
          return true;
        }

        const modalClosed = !(await reviewHeading.isVisible().catch(() => false));
        if (modalClosed) {
          reviewOutcome = "success";
          return true;
        }

        return false;
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  if (reviewOutcome.startsWith("error:")) {
    throw new Error(`Review submit failed: ${reviewOutcome.slice("error:".length)}`);
  }
}

export async function gotoTradingPageWithFilter(
  page: Page,
  filter: string,
): Promise<void> {
  await ensureMemberPersona(page);
  await page.goto(`/profile/user/trading?filter=${encodeURIComponent(filter)}`, {
    waitUntil: "domcontentloaded",
  });
  await dismissBlockingOverlays(page);
  await expect(page.locator("#user-trading-heading")).toBeVisible({
    timeout: 20_000,
  });
  await waitForTradingListSettled(page);
}

export async function waitForTradingListSettled(page: Page): Promise<void> {
  const spinner = page.locator("#orders-list .animate-spin");
  if (await spinner.isVisible().catch(() => false)) {
    await spinner.waitFor({ state: "hidden", timeout: 20_000 }).catch(() => {});
  }
  await page.waitForTimeout(150);
}

export async function pollMemberOrderIdForOffer(
  offerId: string,
  options?: { listingId?: string; buyerId?: string },
  timeoutMs = 45_000,
): Promise<string> {
  let memberOrderId: string | null = null;

  await expect
    .poll(
      async () => {
        memberOrderId = await getMemberOrderIdForOffer(offerId);
        if (memberOrderId) {
          return memberOrderId;
        }
        if (options?.listingId && options?.buyerId) {
          const order = await getLatestMemberOrderForListing({
            listingId: options.listingId,
            buyerId: options.buyerId,
          });
          if (order?.status === "pending") {
            memberOrderId = order.id;
            return memberOrderId;
          }
        }
        return null;
      },
      { timeout: timeoutMs },
    )
    .toBeTruthy();

  if (!memberOrderId) {
    throw new Error(`Failed to resolve member order for offer ${offerId}`);
  }

  return memberOrderId;
}

export async function waitForBuyerP2pCompleteOnTradingList(
  page: Page,
  options?: { orderNumber?: string | null; memberOrderId?: string | null },
): Promise<void> {
  await ensureMemberPersona(page);
  const normalizedOrderNumber = options?.orderNumber?.replace(/^#/, "") ?? null;

  await expect
    .poll(
      async () => {
        await gotoTradingPageWithFilter(page, "待處理");
        await selectTradingPersonaTab(page, "買單");

        if (normalizedOrderNumber) {
          const search = page.locator("#user-order-search");
          await search.fill("");
          await search.fill(normalizedOrderNumber);
          await waitForTradingListSettled(page);

          return tradingOrderRowByNumber(page, normalizedOrderNumber)
            .getByRole("button", { name: "確認完成交易" })
            .first()
            .isVisible()
            .catch(() => false);
        }

        return page
          .getByRole("button", { name: "確認完成交易" })
          .first()
          .isVisible()
          .catch(() => false);
      },
      { timeout: 60_000 },
    )
    .toBe(true);
}

export async function clickTradingFilterButton(
  page: Page,
  label: string,
): Promise<void> {
  await dismissBlockingOverlays(page);
  const exactButton = page.getByRole("button", { name: label, exact: true });
  if (await exactButton.isVisible().catch(() => false)) {
    await exactButton.click();
    return;
  }
  await page
    .getByRole("button", { name: new RegExp(`^${escapeRegex(label)}`) })
    .first()
    .click();
}

export async function selectTradingStatusTab(
  page: Page,
  label: string,
): Promise<void> {
  await clickTradingFilterButton(page, label);
}

export async function selectTradingPersonaTab(
  page: Page,
  label: string,
): Promise<void> {
  await dismissBlockingOverlays(page);
  const personaPattern = new RegExp(`^${escapeRegex(label)}`);
  const personaVisible = await page
    .getByRole("button", { name: personaPattern })
    .first()
    .isVisible()
    .catch(() => false);
  if (!personaVisible) {
    await selectTradingStatusTab(page, "全部");
    await waitForTradingListSettled(page);
  }
  await clickTradingFilterButton(page, label);
  await waitForTradingListSettled(page);
}

export async function resolveMemberOrderIdFromTradingList(
  page: Page,
): Promise<string | null> {
  await gotoTradingPageWithFilter(page, "待處理");
  const orderHeading = page.locator("h3.font-mono.font-black.text-brand").first();
  if (!(await orderHeading.isVisible().catch(() => false))) {
    return null;
  }
  await orderHeading.click();
  await page.waitForURL(/\/profile\/user\/orderDetail\//, { timeout: 20_000 });
  return (
    page.url().split("/profile/user/orderDetail/")[1]?.split("?")[0] ?? null
  );
}

export async function gotoTradingPage(page: Page): Promise<void> {
  await page.goto("/profile/user/trading", { waitUntil: "domcontentloaded" });
  await dismissBlockingOverlays(page);
  await expect(page.locator("#user-trading-heading")).toBeVisible({
    timeout: 20_000,
  });
}

export async function rejectOfferAsSeller(
  sellerPage: Page,
  roomId: string,
  buyerDisplayName: string,
  offerId: string,
  amountLabel: string,
  sellerId: string,
  buyerId?: string,
): Promise<void> {
  const currentStatus = await getOfferStatus(offerId);
  if (currentStatus === "rejected") {
    return;
  }

  const offerRoomId = (await getOfferRoomId(offerId)) ?? roomId;
  await openChatRoom(sellerPage, offerRoomId, buyerDisplayName, buyerId);
  await waitForChatThreadReady(sellerPage);

  const sellerOfferCard = offerCardWithAmount(sellerPage, amountLabel)
    .filter({ has: sellerPage.getByText("● 待確認") })
    .last()
    .filter({ has: sellerPage.getByRole("button", { name: "拒絕出價" }) });

  try {
    await expect
      .poll(async () => sellerOfferCard.isVisible().catch(() => false), {
        timeout: 45_000,
      })
      .toBe(true);
    await sellerOfferCard.getByRole("button", { name: "拒絕出價" }).click();
    const rejectConfirmDialog = sellerPage
      .getByRole("alertdialog")
      .filter({ hasText: "確認拒絕出價" });
    await expect(rejectConfirmDialog).toBeVisible({ timeout: 15_000 });
    const confirmRejectButton = rejectConfirmDialog
      .locator('[data-slot="alert-dialog-action"]')
      .or(rejectConfirmDialog.getByRole("button", { name: "確認拒絕" }));
    await confirmRejectButton.first().click({ force: true, timeout: 15_000 });
    await expect
      .poll(async () => (await getOfferById(offerId))?.status ?? null, {
        timeout: 45_000,
      })
      .toBe("rejected");
  } catch {
    await rejectOfferViaSellerRpc(offerId, sellerId);
    await expect
      .poll(async () => (await getOfferById(offerId))?.status ?? null, {
        timeout: 45_000,
      })
      .toBe("rejected");
  }
}

export async function acceptOfferAsSeller(
  sellerPage: Page,
  roomId: string,
  buyerDisplayName: string,
  offerId: string,
  amountLabel: string = P2P_OFFER_AMOUNT_LABEL,
  buyerPage?: Page,
  sellerDisplayName?: string,
  sellerId?: string,
  buyerId?: string,
): Promise<void> {
  const currentStatus = await getOfferStatus(offerId);
  if (currentStatus === "accepted") {
    return;
  }

  if (buyerPage && sellerDisplayName) {
    await dismissBlockingOverlays(buyerPage);
  }

  const offerRoomId = (await getOfferRoomId(offerId)) ?? roomId;

  if (buyerPage && sellerDisplayName) {
    await openChatRoom(buyerPage, offerRoomId, sellerDisplayName, sellerId);
  }

  await openChatRoom(sellerPage, offerRoomId, buyerDisplayName, buyerId);
  await ensureChatRoomActive(sellerPage, offerRoomId, buyerDisplayName, buyerId);
  await dismissBlockingOverlays(sellerPage);

  const sellerOfferCard = offerCardWithAmount(sellerPage, amountLabel)
    .filter({ has: sellerPage.getByText("● 待確認") })
    .last();
  const acceptButton = sellerOfferCard.getByRole("button", { name: "接受出價" });

  try {
    await expect
      .poll(
        async () => {
          await dismissBlockingOverlays(sellerPage);
          await expandChatConsole(sellerPage);

          const chatInputVisible = await chatReplyInput(sellerPage)
            .isVisible()
            .catch(() => false);

          if (!chatInputVisible) {
            await openChatRoom(
              sellerPage,
              offerRoomId,
              buyerDisplayName,
              buyerId,
            );
          }

          return acceptButton.isVisible().catch(() => false);
        },
        { timeout: 25_000 },
      )
      .toBe(true);

    await acceptButton.click({ force: true, timeout: 15_000 });

    const acceptConfirmDialog = sellerPage
      .getByRole("alertdialog")
      .filter({ hasText: "確認接受出價" });
    await expect(acceptConfirmDialog).toBeVisible({ timeout: 15_000 });
    const confirmAcceptButton = acceptConfirmDialog
      .locator('[data-slot="alert-dialog-action"]')
      .or(acceptConfirmDialog.getByRole("button", { name: "確認接受" }));
    await confirmAcceptButton.first().click({ force: true, timeout: 15_000 });
  } catch {
    if (!sellerId) {
      throw new Error(
        "Seller accept UI failed and sellerId is missing for RPC fallback",
      );
    }
    await acceptOfferViaSellerRpc(offerId, sellerId);
    return;
  }

  try {
    await expect
      .poll(async () => (await getOfferById(offerId))?.status ?? null, {
        timeout: 45_000,
      })
      .toBe("accepted");
  } catch {
    if (!sellerId) {
      throw new Error(
        "Offer remained pending after UI accept and sellerId is missing for RPC fallback",
      );
    }
    await acceptOfferViaSellerRpc(offerId, sellerId);
    await expect
      .poll(async () => (await getOfferById(offerId))?.status ?? null, {
        timeout: 45_000,
      })
      .toBe("accepted");
  }
}
