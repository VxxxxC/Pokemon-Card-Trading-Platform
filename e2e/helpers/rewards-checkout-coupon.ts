import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { dismissBlockingOverlays } from "./overlays";
import {
  findActiveDiscountCouponTemplateId,
  findActiveFreeShippingTemplateId,
} from "./platform-rewards";

export type CheckoutSummaryAmounts = {
  itemSubtotal: number;
  shippingFee: number;
  platformSubsidy: number;
  totalAmount: number;
};

type RewardTemplateAuditSnapshot = {
  type?: string;
  status?: string;
  reward_value?: {
    min_spend_hkd?: number;
    amount_hkd?: number;
    max_subsidy_hkd?: number;
  };
};

function createE2eAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function listRecentTemplateAudits(limit = 200) {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("reward_template_audits")
    .select("template_id, snapshot")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`[listRecentTemplateAudits] ${error.message}`);
  }

  return data ?? [];
}

export async function findActiveDiscountTemplateByMinSpend(
  minSpend: number,
): Promise<string | null> {
  const latestByTemplate = new Map<string, RewardTemplateAuditSnapshot>();

  for (const row of await listRecentTemplateAudits()) {
    if (!latestByTemplate.has(row.template_id)) {
      latestByTemplate.set(
        row.template_id,
        row.snapshot as RewardTemplateAuditSnapshot,
      );
    }
  }

  for (const [templateId, snapshot] of latestByTemplate) {
    if (
      snapshot?.type !== "discount_coupon" ||
      snapshot?.status !== "active"
    ) {
      continue;
    }

    const templateMinSpend = Number(snapshot.reward_value?.min_spend_hkd ?? 0);
    if (templateMinSpend === minSpend) {
      return templateId;
    }
  }

  return null;
}

export async function findActiveFreeShippingTemplateFromAudits(): Promise<string | null> {
  const latestByTemplate = new Map<string, RewardTemplateAuditSnapshot>();

  for (const row of await listRecentTemplateAudits()) {
    if (!latestByTemplate.has(row.template_id)) {
      latestByTemplate.set(
        row.template_id,
        row.snapshot as RewardTemplateAuditSnapshot,
      );
    }
  }

  for (const [templateId, snapshot] of latestByTemplate) {
    if (
      snapshot?.type === "free_shipping" &&
      snapshot?.status === "active"
    ) {
      return templateId;
    }
  }

  return null;
}

export async function resolveCheckoutCouponTemplateIds(): Promise<{
  highMinSpendTemplateId: string;
  lowMinSpendTemplateId: string;
  freeShippingTemplateId: string | null;
}> {
  const highMinSpendTemplateId =
    (await findActiveDiscountTemplateByMinSpend(500)) ??
    (await findActiveDiscountTemplateByMinSpend(5000));
  const lowMinSpendTemplateId =
    (await findActiveDiscountTemplateByMinSpend(50)) ??
    (await findActiveDiscountTemplateByMinSpend(0)) ??
    (await findActiveDiscountCouponTemplateId());
  const freeShippingTemplateId =
    (await findActiveFreeShippingTemplateFromAudits()) ??
    (await findActiveFreeShippingTemplateId());

  if (!highMinSpendTemplateId || !lowMinSpendTemplateId) {
    throw new Error(
      `Missing discount coupon templates (high=${highMinSpendTemplateId ?? "none"}, low=${lowMinSpendTemplateId ?? "none"}). Run platform-rewards-phase2 E2E once or publish templates via admin.`,
    );
  }

  return {
    highMinSpendTemplateId,
    lowMinSpendTemplateId,
    freeShippingTemplateId,
  };
}

function parseHkdAmount(text: string | null | undefined): number {
  if (!text) {
    return 0;
  }

  const normalized = text.replace(/,/g, "");
  const match = normalized.match(/-?\s*HK\$\s*([\d.]+)/);
  return match ? Number(match[1]) : 0;
}

function checkoutOrderSummary(page: Page) {
  return page
    .getByText("帳單明細", { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
}

async function readSummaryRowAmount(
  page: Page,
  label: string | RegExp,
): Promise<number> {
  const summary = checkoutOrderSummary(page);
  const labelEl =
    typeof label === "string"
      ? summary.getByText(label, { exact: true })
      : summary.getByText(label);
  const row = labelEl.locator(
    "xpath=ancestor::*[contains(@class,'justify-between')][1]",
  );
  const valueText = await row.locator("span").last().textContent();
  return parseHkdAmount(valueText);
}

export async function readCheckoutSummaryAmounts(
  page: Page,
): Promise<CheckoutSummaryAmounts> {
  const itemSubtotal = await readSummaryRowAmount(page, "卡牌商品總額");
  const shippingFee = await readMerchantDirectShippingFee(page);
  const totalAmount = await readSummaryRowAmount(page, "付款總額");

  const subsidyVisible = await checkoutOrderSummary(page)
    .getByText("平台優惠", { exact: true })
    .isVisible()
    .catch(() => false);
  const platformSubsidy = subsidyVisible
    ? await readSummaryRowAmount(page, "平台優惠")
    : 0;

  return {
    itemSubtotal,
    shippingFee,
    platformSubsidy,
    totalAmount,
  };
}

async function readMerchantDirectShippingFee(page: Page): Promise<number> {
  const summary = checkoutOrderSummary(page);
  const courierLabel = summary.getByText("運費（快遞寄貨）", { exact: true });
  if (await courierLabel.isVisible().catch(() => false)) {
    return readSummaryRowAmount(page, "運費（快遞寄貨）");
  }

  const genericShipping = summary.getByText(/^運費$/, { exact: true });
  if (await genericShipping.isVisible().catch(() => false)) {
    return readSummaryRowAmount(page, "運費");
  }

  return 0;
}

export async function readAuthEscrowCheckoutShippingLegs(page: Page): Promise<{
  inboundShippingFee: number;
  outboundShippingFee: number;
}> {
  return {
    inboundShippingFee: await readSummaryRowAmount(page, "運費（賣家寄送平台）"),
    outboundShippingFee: await readSummaryRowAmount(page, "運費（平台寄送買家）"),
  };
}

export async function expireUserRewardForE2e(userRewardId: string): Promise<void> {
  const admin = createE2eAdminClient();
  const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("user_rewards")
    .update({
      calculated_expiry: expiredAt,
    })
    .eq("id", userRewardId)
    .select("id");

  if (error) {
    throw new Error(`[expireUserRewardForE2e] ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error(
      `[expireUserRewardForE2e] no user_rewards row for ${userRewardId}`,
    );
  }
}

export async function fillMerchantDirectFulfillmentForm(
  page: Page,
): Promise<void> {
  await page.locator("#p-tel").fill("91234567");
  await page.locator("#p-addr").fill("E2E 九龍塘順豐智能櫃");
}

export async function ensureCourierShippingSelected(page: Page): Promise<void> {
  await page.getByRole("button", { name: "快遞寄貨" }).click();
  await page.waitForTimeout(1500);
}

export async function waitForMerchantDirectCheckoutReady(
  page: Page,
): Promise<void> {
  const summaryHeading = page.getByText("帳單明細", { exact: true });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!page.url().includes("/checkout/")) {
      await page.waitForURL(/\/checkout\//, { timeout: 15_000 }).catch(() => {});
    }

    try {
      await expect
        .poll(
          async () => {
            const hasHeading = await summaryHeading.isVisible().catch(() => false);
            if (!hasHeading) {
              return "pending";
            }
            const hasSubtotal = await checkoutOrderSummary(page)
              .getByText("卡牌商品總額", { exact: true })
              .isVisible()
              .catch(() => false);
            return hasSubtotal ? "ready" : "pending";
          },
          { timeout: 45_000 },
        )
        .toBe("ready");
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1_000);
    }
  }
}

export async function waitForMerchantAuthCheckoutReady(
  page: Page,
): Promise<void> {
  const authFlowHeading = page.getByRole("heading", { name: "鑑定託管流程" });
  const orderConfirmHeading = page.getByRole("heading", { name: "訂單確認" });
  const summaryHeading = page.getByText("帳單明細", { exact: true });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!page.url().includes("/checkout/")) {
      await page.waitForURL(/\/checkout\//, { timeout: 15_000 }).catch(() => {});
    }

    try {
      await expect
        .poll(
          async () => {
            const hasAuthFlow = await authFlowHeading
              .isVisible()
              .catch(() => false);
            const hasOrderConfirm = await orderConfirmHeading
              .isVisible()
              .catch(() => false);
            if (!hasAuthFlow && !hasOrderConfirm) {
              return "pending";
            }
            const hasSummary = await summaryHeading.isVisible().catch(() => false);
            if (!hasSummary) {
              return "pending";
            }
            const hasSubtotal = await checkoutOrderSummary(page)
              .getByText("卡牌商品總額", { exact: true })
              .isVisible()
              .catch(() => false);
            return hasSubtotal ? "ready" : "pending";
          },
          { timeout: 45_000 },
        )
        .toBe("ready");
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1_000);
    }
  }
}

type CheckoutCouponPickerPollState =
  | "ready"
  | "loading"
  | "empty"
  | "error"
  | "pending";

async function pollCheckoutCouponPickerState(
  page: Page,
): Promise<CheckoutCouponPickerPollState> {
  if (await page.locator("#checkout-coupon").isVisible().catch(() => false)) {
    return "ready";
  }

  const emptyVisible = await page
    .getByText("暫無可用優惠券")
    .isVisible()
    .catch(() => false);
  if (emptyVisible) {
    return "empty";
  }

  const loadErrorVisible = await page
    .getByText("無法載入優惠券")
    .isVisible()
    .catch(() => false);
  if (loadErrorVisible) {
    return "error";
  }

  const loadingVisible = await page
    .getByText("載入優惠券中…")
    .isVisible()
    .catch(() => false);
  if (loadingVisible) {
    return "loading";
  }

  return "pending";
}

export async function waitForCheckoutReviewReady(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await dismissBlockingOverlays(page);

    try {
      await expect
        .poll(
          async () => {
            if (
              await page
                .getByText("找不到此結帳訂單")
                .isVisible()
                .catch(() => false)
            ) {
              throw new Error("Checkout session failed to load");
            }

            const authReview = await page
              .getByRole("heading", { name: "鑑定託管流程" })
              .isVisible()
              .catch(() => false);
            const merchantSummary = await page
              .getByText("帳單明細", { exact: true })
              .isVisible()
              .catch(() => false);
            const continuePay = await page
              .getByRole("button", { name: /繼續付款/ })
              .isVisible()
              .catch(() => false);

            return authReview || merchantSummary || continuePay;
          },
          { timeout: 45_000 },
        )
        .toBe(true);
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1_000);
    }
  }
}

export async function waitForCheckoutCouponPicker(
  page: Page,
  options?: { rewardId?: string; timeout?: number },
): Promise<void> {
  await waitForCheckoutReviewReady(page);
  const timeout = options?.timeout ?? 45_000;

  await expect
    .poll(
      async () => {
        const outcome = await pollCheckoutCouponPickerState(page);
        if (outcome === "empty") {
          throw new Error("Checkout coupon picker is empty (暫無可用優惠券)");
        }
        if (outcome === "error") {
          const message =
            (await page
              .getByText(/無法載入優惠券/)
              .first()
              .textContent()) ?? "無法載入優惠券";
          throw new Error(
            `Checkout coupon picker failed to load: ${message.trim()}`,
          );
        }
        return outcome;
      },
      { timeout },
    )
    .toBe("ready");

  if (options?.rewardId) {
    await waitForCheckoutCouponOptionEnabled(page, options.rewardId);
  }
}

export async function waitForCheckoutCouponClearedAfterAuthToggle(
  page: Page,
): Promise<void> {
  await expect(page.getByText("載入優惠券中…")).toBeHidden({
    timeout: 30_000,
  });
  await waitForCheckoutCouponPicker(page, { timeout: 30_000 });
  await expect
    .poll(
      async () => page.locator("#checkout-coupon").inputValue(),
      { timeout: 30_000 },
    )
    .toBe("");
}

export async function waitForCheckoutCouponOptionEnabled(
  page: Page,
  rewardId: string,
): Promise<void> {
  const option = page.locator(`#checkout-coupon option[value="${rewardId}"]`);
  await expect(option).toBeEnabled({ timeout: 30_000 });
}

export async function expectPlatformSubsidyVisible(
  page: Page,
  visible: boolean,
  options?: { timeout?: number },
): Promise<void> {
  const timeout = options?.timeout ?? 30_000;
  const subsidy = checkoutOrderSummary(page).getByText("平台優惠", {
    exact: true,
  });

  if (visible) {
    // Subsidy row renders after selectOption + async listCheckoutEligibleCoupons preview.
    await expect
      .poll(
        async () => (await readCheckoutSummaryAmounts(page)).platformSubsidy,
        { timeout },
      )
      .toBeGreaterThan(0);
    await expect(subsidy).toBeVisible({ timeout: 5_000 });
  } else {
    await expect
      .poll(
        async () => (await readCheckoutSummaryAmounts(page)).platformSubsidy,
        { timeout },
      )
      .toBe(0);
    await expect(subsidy).toBeHidden({ timeout: 5_000 });
  }
}

export async function selectCheckoutCoupon(
  page: Page,
  rewardId: string,
): Promise<void> {
  await page.locator("#checkout-coupon").selectOption(rewardId);
  await expect(page.locator("#checkout-coupon")).toHaveValue(rewardId, {
    timeout: 10_000,
  });
  await expectPlatformSubsidyVisible(page, true);
}

export async function clearCheckoutCoupon(page: Page): Promise<void> {
  await page.locator("#checkout-coupon").selectOption("");
  await expect(page.locator("#checkout-coupon")).toHaveValue("", {
    timeout: 10_000,
  });
  await expectPlatformSubsidyVisible(page, false);
}
