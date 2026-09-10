import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  computeFpsGrossPayoutHkd,
  computeFpsNetPayoutAmount,
} from "@/lib/platform/fps-payout-config";
import { seedMerchantPendingPaymentOrder } from "./merchant-orders";

export type MemberOrderFinancialSnapshot = {
  orderId: string;
  finalPrice: number;
  authFee: number;
  platformSubsidyAmount: number;
  buyerTotalAmount: number;
  orderGrossTotal: number;
  sellerReceivableAmount: number;
  inboundShippingFee: number;
  outboundShippingFee: number;
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

function parseHkdAmount(text: string | null | undefined): number {
  if (!text) {
    return 0;
  }

  const normalized = text.replace(/,/g, "");
  const match = normalized.match(/-?\s*HK\$\s*([\d.]+)/);
  return match ? Number(match[1]) : 0;
}

function memberAuthOrderInvoice(page: Page) {
  return page
    .getByText("帳單明細", { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
}

async function readMemberAuthInvoiceRowAmount(
  page: Page,
  label: string | RegExp,
): Promise<number> {
  const invoice = memberAuthOrderInvoice(page);
  const labelEl =
    typeof label === "string"
      ? invoice.getByText(label, {
          exact: !/(最終實收總額|最終扣款總額)/.test(label),
        })
      : invoice.getByText(label);
  const row = labelEl.locator(
    "xpath=ancestor::*[contains(@class,'justify-between')][1]",
  );
  const valueText = await row.locator("span").last().textContent();
  return parseHkdAmount(valueText);
}

export async function getMemberOrderFinancialSnapshot(
  orderId: string,
): Promise<MemberOrderFinancialSnapshot> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("member_orders")
    .select(
      "id, final_price, auth_fee, platform_subsidy_amount, buyer_total_amount, inbound_shipping_fee, outbound_shipping_fee, item_subtotal",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `[getMemberOrderFinancialSnapshot] ${error?.message ?? "order not found"}`,
    );
  }

  const finalPrice = Number(data.final_price ?? data.item_subtotal ?? 0);
  const authFee = Number(data.auth_fee ?? 0);
  const platformSubsidyAmount = Number(data.platform_subsidy_amount ?? 0);
  const inboundShippingFee = Number(data.inbound_shipping_fee ?? 0);
  const outboundShippingFee = Number(data.outbound_shipping_fee ?? 0);
  const orderGrossTotal =
    finalPrice + authFee + inboundShippingFee + outboundShippingFee;
  const buyerTotalAmount = Number(
    data.buyer_total_amount ?? orderGrossTotal - platformSubsidyAmount,
  );
  const sellerReceivableAmount = computeFpsNetPayoutAmount(
    computeFpsGrossPayoutHkd(finalPrice, inboundShippingFee),
  );

  return {
    orderId: data.id,
    finalPrice,
    authFee,
    platformSubsidyAmount,
    buyerTotalAmount,
    orderGrossTotal,
    sellerReceivableAmount,
    inboundShippingFee,
    outboundShippingFee,
  };
}

export async function finalizeMemberAuthInvoiceFinancialSeed(
  orderId: string,
): Promise<MemberOrderFinancialSnapshot> {
  const admin = createE2eAdminClient();
  const finalPrice = 100;
  const authFee = 150;
  const inboundShippingFee = 30;
  const outboundShippingFee = 30;
  const platformSubsidyAmount = 30;
  const buyerTotalAmount =
    finalPrice + authFee + inboundShippingFee + outboundShippingFee -
    platformSubsidyAmount;

  const { error } = await admin
    .from("member_orders")
    .update({
      status: "completed",
      escrow_status: "released",
      seller_payout_status: "held",
      item_subtotal: finalPrice,
      final_price: finalPrice,
      auth_fee: authFee,
      inbound_shipping_fee: inboundShippingFee,
      outbound_shipping_fee: outboundShippingFee,
      platform_subsidy_amount: platformSubsidyAmount,
      buyer_total_amount: buyerTotalAmount,
      total_amount:
        finalPrice + authFee + inboundShippingFee + outboundShippingFee,
    })
    .eq("id", orderId);

  if (error) {
    throw new Error(`[finalizeMemberAuthInvoiceFinancialSeed] ${error.message}`);
  }

  return getMemberOrderFinancialSnapshot(orderId);
}

export async function assertMemberAuthInvoiceMatchesSnapshot(
  page: Page,
  snapshot: MemberOrderFinancialSnapshot,
  persona: "buyer" | "seller",
): Promise<void> {
  await expect(page.getByText("帳單明細", { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  expect(await readMemberAuthInvoiceRowAmount(page, "商品最終成交價")).toBe(
    snapshot.finalPrice,
  );

  if (persona === "seller") {
    expect(
      await readMemberAuthInvoiceRowAmount(page, "運費（賣家寄送平台）(B)"),
    ).toBe(snapshot.inboundShippingFee);
    expect(
      await readMemberAuthInvoiceRowAmount(page, "運費（平台寄送買家）"),
    ).toBe(snapshot.outboundShippingFee);
    expect(await readMemberAuthInvoiceRowAmount(page, "鑑定服務費 (C)")).toBe(
      snapshot.authFee,
    );
    if (snapshot.platformSubsidyAmount > 0) {
      expect(await readMemberAuthInvoiceRowAmount(page, "平台優惠 (D)")).toBe(
        snapshot.platformSubsidyAmount,
      );
    }
    expect(await readMemberAuthInvoiceRowAmount(page, "總金額 (A)")).toBe(
      snapshot.orderGrossTotal,
    );
    expect(await readMemberAuthInvoiceRowAmount(page, "最終實收總額")).toBe(
      snapshot.sellerReceivableAmount,
    );
    return;
  }

  expect(
    await readMemberAuthInvoiceRowAmount(page, "運費（賣家寄送平台）(B)"),
  ).toBe(snapshot.inboundShippingFee);
  expect(
    await readMemberAuthInvoiceRowAmount(page, "運費（平台寄送買家）"),
  ).toBe(snapshot.outboundShippingFee);
  if (snapshot.platformSubsidyAmount > 0) {
    expect(await readMemberAuthInvoiceRowAmount(page, "平台優惠 (D)")).toBe(
      snapshot.platformSubsidyAmount,
    );
  }
  expect(await readMemberAuthInvoiceRowAmount(page, "鑑定服務費 (C)")).toBe(
    snapshot.authFee,
  );
  expect(await readMemberAuthInvoiceRowAmount(page, "總金額 (A)")).toBe(
    snapshot.orderGrossTotal,
  );
  expect(await readMemberAuthInvoiceRowAmount(page, "最終扣款總額")).toBe(
    snapshot.buyerTotalAmount,
  );
}

export async function getMemberOrderNumber(orderId: string): Promise<string> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("member_orders")
    .select("order_number")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data?.order_number) {
    throw new Error(
      `[getMemberOrderNumber] ${error?.message ?? "missing order_number"}`,
    );
  }

  return data.order_number;
}

export async function readTradingListAmountForOrderNumber(
  page: Page,
  orderNumber: string,
): Promise<number> {
  const normalized = orderNumber.replace(/^#/, "");
  const orderLabel = new RegExp(
    `訂單號碼\\s*#?${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
  );
  const row = page
    .locator("#orders-list")
    .getByText(orderLabel)
    .locator("xpath=ancestor::div[contains(@class,'cursor-pointer')][1]");
  await expect(row).toBeVisible({ timeout: 30_000 });
  const amountText = await row
    .locator("span.font-mono.font-bold.text-brand")
    .first()
    .textContent();
  return parseHkdAmount(amountText);
}

export type MerchantFinanceSettlementSnapshot = {
  orderId: string;
  orderNumber: string | null;
  amount: number;
};

export async function ensureMerchantFinanceSettlementRow(params: {
  merchantId: string;
}): Promise<MerchantFinanceSettlementSnapshot> {
  const admin = createE2eAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("merchant_orders")
    .select("id, order_number, merchant_payout_amount")
    .eq("merchant_id", params.merchantId)
    .in("payout_status", ["paid", "held", "processing", "failed"])
    .not("merchant_payout_amount", "is", null)
    .order("transferred_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`[ensureMerchantFinanceSettlementRow] ${existingError.message}`);
  }

  if (existing?.merchant_payout_amount != null) {
    return {
      orderId: existing.id,
      orderNumber: existing.order_number,
      amount: Number(existing.merchant_payout_amount),
    };
  }

  const seeded = await seedMerchantPendingPaymentOrder();
  if (seeded.merchantId !== params.merchantId) {
    throw new Error(
      `[ensureMerchantFinanceSettlementRow] seeded merchant ${seeded.merchantId} != seller ${params.merchantId}`,
    );
  }

  const holdUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: orderRow, error: orderError } = await admin
    .from("merchant_orders")
    .select("order_number, item_subtotal, shipping_fee")
    .eq("id", seeded.orderId)
    .maybeSingle();

  if (orderError || !orderRow) {
    throw new Error(
      `[ensureMerchantFinanceSettlementRow] ${orderError?.message ?? "seed order missing"}`,
    );
  }

  const payoutAmount = Math.max(
    Number(orderRow.item_subtotal ?? 0) + Number(orderRow.shipping_fee ?? 0) - 15,
    1,
  );

  const { error: updateError } = await admin
    .from("merchant_orders")
    .update({
      payout_status: "held",
      merchant_payout_amount: payoutAmount,
      payout_hold_until: holdUntil,
      commission_amount: 15,
    })
    .eq("id", seeded.orderId);

  if (updateError) {
    throw new Error(`[ensureMerchantFinanceSettlementRow] ${updateError.message}`);
  }

  return {
    orderId: seeded.orderId,
    orderNumber: orderRow.order_number,
    amount: payoutAmount,
  };
}

export async function assertMerchantFinanceSettlementAmountOnPage(
  page: Page,
  snapshot: MerchantFinanceSettlementSnapshot,
): Promise<void> {
  await expect(page.getByRole("heading", { name: /撥款記錄/ })).toBeVisible({
    timeout: 20_000,
  });

  if (snapshot.orderNumber) {
    const search = page.getByRole("searchbox", {
      name: "訂單編號 / Transfer ID",
    });
    await search.fill("");
    await search.fill(snapshot.orderNumber.replace(/^#/, ""));
    await page.getByRole("button", { name: "套用篩選" }).click();
  }

  const orderLabel = snapshot.orderNumber
    ? `#${snapshot.orderNumber.replace(/^#/, "")}`
    : "商戶訂單撥款";
  const row = page
    .getByRole("link", { name: new RegExp(orderLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
    .locator("xpath=ancestor::div[contains(@class,'hover:bg-bg-elevated')][1]");
  await expect(row).toBeVisible({ timeout: 30_000 });

  const grossText = await row
    .locator("p.shrink-0")
    .filter({ hasText: /^\+HK\$/ })
    .textContent();
  expect(parseHkdAmount(grossText)).toBe(snapshot.amount);

  const netLine = await row.getByText(/實收 HK\$/).textContent();
  const netMatch = netLine?.replace(/,/g, "").match(/實收 HK\$\s*([\d.]+)/);
  expect(netMatch ? Number(netMatch[1]) : 0).toBe(snapshot.amount);
}

export type MerchantOrderFinancialSnapshot = {
  orderId: string;
  itemSubtotal: number;
  shippingFee: number;
  totalAmount: number;
  authFee: number;
  shippingMethod: string | null;
};

export async function getMerchantOrderFinancialSnapshot(
  orderId: string,
): Promise<MerchantOrderFinancialSnapshot> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("merchant_orders")
    .select(
      "id, item_subtotal, shipping_fee, total_amount, buyer_total_amount, auth_fee, shipping_method",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `[getMerchantOrderFinancialSnapshot] ${error?.message ?? "order not found"}`,
    );
  }

  return {
    orderId: data.id,
    itemSubtotal: Number(data.item_subtotal ?? 0),
    shippingFee: Number(data.shipping_fee ?? 0),
    totalAmount: Number(data.buyer_total_amount ?? data.total_amount ?? 0),
    authFee: Number(data.auth_fee ?? 0),
    shippingMethod: data.shipping_method,
  };
}

function merchantB2cInvoice(page: Page) {
  return page.getByRole("region", { name: "帳單明細" });
}

async function readMerchantInvoiceRowAmount(
  page: Page,
  label: string | RegExp,
): Promise<number> {
  const invoice = merchantB2cInvoice(page);
  const labelEl =
    typeof label === "string"
      ? invoice.getByText(label, { exact: true })
      : invoice.getByText(label);
  const row = labelEl.locator(
    "xpath=ancestor::*[contains(@class,'justify-between')][1]",
  );
  const valueText = await row.locator("span").last().textContent();
  return parseHkdAmount(valueText);
}

export async function assertMerchantB2cInvoiceMatchesSnapshot(
  page: Page,
  snapshot: MerchantOrderFinancialSnapshot,
): Promise<void> {
  await expect(page.getByRole("region", { name: "帳單明細" })).toBeVisible({
    timeout: 20_000,
  });

  expect(await readMerchantInvoiceRowAmount(page, "商品成交價")).toBe(
    snapshot.itemSubtotal,
  );
  expect(await readMerchantInvoiceRowAmount(page, /運費（/)).toBe(
    snapshot.shippingFee,
  );
  if (snapshot.authFee > 0) {
    expect(await readMerchantInvoiceRowAmount(page, "官方第三方鑑定費")).toBe(
      snapshot.authFee,
    );
  }

  const total = await page.getByTestId("order-payment-amount").textContent();
  expect(parseHkdAmount(total)).toBe(snapshot.totalAmount);
}
