import { expect, type Page } from "@playwright/test";
import { BUYER_AUTH_DISABLED_COPY } from "@/lib/listings/auth-service-copy";
import { dismissBlockingOverlays } from "../helpers/overlays";

export { BUYER_AUTH_DISABLED_COPY };

export function parseHkdAmount(text: string): number {
  const match = text.replace(/,/g, "").match(/HK\$\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!match) {
    throw new Error(`Could not parse HKD amount from: ${text}`);
  }
  return Number(match[1]);
}

export async function openBuyNowDialog(page: Page): Promise<void> {
  await dismissBlockingOverlays(page);
  const buyButton = page.getByRole("button", { name: /立即購買/ });
  await expect(buyButton).toBeEnabled({ timeout: 20_000 });
  await buyButton.click();
  await expect(
    page.getByRole("heading", { name: "確認立即購買" }),
  ).toBeVisible({ timeout: 15_000 });
}
