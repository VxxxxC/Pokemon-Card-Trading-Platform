import { mkdirSync } from "node:fs";
import path from "node:path";
import { test as setup, type Page } from "@playwright/test";
import {
  getChatRealtimeFixtures,
  hasSellerAuthFixtures,
} from "./chat-test-data";
import {
  getMerchantProductDetailFixtures,
  hasBuyerAuthFixtures,
} from "./test-data";
import {
  acknowledgeAllReportOutcomesForReporter,
  getBuyerProfileIdFromEnv,
} from "./supabase-admin";

const authDir = path.join(__dirname, "..", ".auth");
const buyerAuthFile = path.join(authDir, "buyer.json");
const sellerAuthFile = path.join(authDir, "seller.json");

async function authenticateAndSaveStorageState(
  page: Page,
  email: string,
  password: string,
  authFile: string,
  roleLabel: "Buyer" | "Seller",
): Promise<"ok" | "bad_credentials" | "timeout"> {
  mkdirSync(authDir, { recursive: true });

  await page.goto("/auth");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();

  const outcome = await Promise.race([
    page
      .waitForURL((url) => !url.pathname.startsWith("/auth"), {
        timeout: 45_000,
      })
      .then(() => "ok" as const),
    page
      .getByText("電子郵件或密碼不正確")
      .waitFor({ state: "visible", timeout: 45_000 })
      .then(() => "bad_credentials" as const),
  ]).catch(() => "timeout" as const);

  if (outcome === "bad_credentials") {
    await page.context().storageState({ path: authFile });
    return "bad_credentials";
  }

  if (outcome !== "ok") {
    throw new Error(
      `${roleLabel} login did not succeed (outcome=${outcome}). Check credentials in .env`,
    );
  }

  await page.context().storageState({ path: authFile });
  return "ok";
}

setup("authenticate buyer", async ({ page }) => {
  if (!hasBuyerAuthFixtures()) {
    setup.skip(
      true,
      "Missing E2E_BUYER_EMAIL or E2E_BUYER_PASSWORD — buyer project tests will be skipped",
    );
  }

  const { buyerEmail, buyerPassword } = getMerchantProductDetailFixtures();

  const outcome = await authenticateAndSaveStorageState(
    page,
    buyerEmail!,
    buyerPassword!,
    buyerAuthFile,
    "Buyer",
  );

  if (outcome === "bad_credentials") {
    setup.skip(
      true,
      "E2E_BUYER_EMAIL or E2E_BUYER_PASSWORD rejected — update credentials in .env",
    );
  }

  const buyerId = await getBuyerProfileIdFromEnv();
  if (buyerId) {
    await acknowledgeAllReportOutcomesForReporter(buyerId);
  }
});

setup("authenticate seller", async ({ page }) => {
  if (!hasSellerAuthFixtures()) {
    setup.skip(
      true,
      "Missing E2E_SELLER_EMAIL or E2E_SELLER_PASSWORD — chat-realtime tests will be skipped",
    );
  }

  const { sellerEmail, sellerPassword } = getChatRealtimeFixtures();

  const outcome = await authenticateAndSaveStorageState(
    page,
    sellerEmail!,
    sellerPassword!,
    sellerAuthFile,
    "Seller",
  );

  if (outcome === "bad_credentials") {
    setup.skip(
      true,
      "E2E_SELLER_EMAIL or E2E_SELLER_PASSWORD rejected — update credentials in .env",
    );
  }
});
