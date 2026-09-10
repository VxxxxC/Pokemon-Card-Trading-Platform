import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  ensureListingAcceptsAuthentication,
  getProfileIdByEmail,
  resolveE2eMarketplaceFixture,
} from "../fixtures/supabase-admin";
import { hasStripeReconcileEnv } from "./stripe-reconcile";
import { loginAsAdmin } from "./admin-auth";

const SMOKE_PREFIX = "P-E17";

function createE2eAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env for moderation auth refund E2E");
  }
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createE2eAdminAuthedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = readEnv("E2E_ADMIN_EMAIL");
  const password = readEnv("E2E_ADMIN_PASSWORD");
  if (!url || !anonKey || !email || !password) {
    throw new Error("Missing Supabase public env or E2E admin credentials");
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    throw new Error(`[createE2eAdminAuthedClient] ${signInError.message}`);
  }
  return client;
}

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

export function hasModerationAuthRefundE2eEnv(): boolean {
  return Boolean(
    hasStripeReconcileEnv() &&
      readEnv("E2E_ADMIN_EMAIL") &&
      readEnv("E2E_ADMIN_PASSWORD") &&
      readEnv("E2E_BUYER_EMAIL") &&
      readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}

type RefundEligibilityPayload = {
  eligible?: boolean;
  ineligibleReason?: string;
  orderKind?: string;
};

function parseRefundEligibility(data: unknown): RefundEligibilityPayload | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const row = data as Record<string, unknown>;
  return {
    eligible: row.eligible === true,
    ineligibleReason:
      typeof row.ineligibleReason === "string"
        ? row.ineligibleReason
        : typeof row.ineligible_reason === "string"
          ? row.ineligible_reason
          : undefined,
    orderKind:
      typeof row.orderKind === "string"
        ? row.orderKind
        : typeof row.order_kind === "string"
          ? row.order_kind
          : undefined,
  };
}

export async function assertModerationAuthOrderRefundEligible(
  orderId: string,
  expectedKind: "merchant_auth" | "member_auth",
): Promise<void> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin.rpc("fn_moderation_order_refund_eligible", {
    p_order_id: orderId,
  });

  if (error) {
    throw new Error(`[assertModerationAuthOrderRefundEligible] ${error.message}`);
  }

  const payload = parseRefundEligibility(data);
  expect(payload?.eligible, payload?.ineligibleReason ?? "not eligible").toBe(true);
  expect(payload?.orderKind).toBe(expectedKind);
}

export async function seedMerchantAuthRefundOrderForE2e(params: {
  runId: string;
  suffix: string;
}): Promise<{ orderId: string; merchantId: string; buyerId: string }> {
  const buyerEmail = readEnv("E2E_BUYER_EMAIL");
  if (!buyerEmail) {
    throw new Error("Missing E2E_BUYER_EMAIL");
  }

  const buyerId = await getProfileIdByEmail(buyerEmail);
  if (!buyerId) {
    throw new Error(`Buyer profile not found for ${buyerEmail}`);
  }

  const admin = createE2eAdminClient();
  const { data: listingRow, error: listingError } = await admin
    .from("listings")
    .select("id, seller_id")
    .eq("seller_persona", "merchant")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (listingError || !listingRow?.id || !listingRow.seller_id) {
    throw new Error(
      `[seedMerchantAuthRefundOrderForE2e] listing: ${listingError?.message ?? "missing"}`,
    );
  }

  const { data: orderId, error: seedError } = await admin.rpc(
    "rpc_e2e_seed_merchant_auth_refund_eligible_order",
    {
      p_listing_id: listingRow.id,
      p_buyer_id: buyerId,
      p_payment_intent_suffix: `${params.runId}-${params.suffix}`,
    },
  );

  if (seedError || !orderId) {
    throw new Error(
      `[seedMerchantAuthRefundOrderForE2e] ${seedError?.message ?? "missing order id"}`,
    );
  }

  return {
    orderId,
    merchantId: listingRow.seller_id,
    buyerId,
  };
}

export async function seedMemberAuthRefundOrderForE2e(params: {
  runId: string;
  suffix: string;
}): Promise<{ orderId: string; sellerId: string; buyerId: string }> {
  const buyerEmail = readEnv("E2E_BUYER_EMAIL");
  if (!buyerEmail) {
    throw new Error("Missing E2E_BUYER_EMAIL");
  }

  const buyerId = await getProfileIdByEmail(buyerEmail);
  if (!buyerId) {
    throw new Error(`Buyer profile not found for ${buyerEmail}`);
  }

  const fixtureResult = await resolveE2eMarketplaceFixture({
    requiredSellerPersona: "member",
  });
  if (!fixtureResult.ok) {
    throw new Error(fixtureResult.skipReason);
  }

  const { listingId, sellerId } = fixtureResult.fixture;
  await ensureListingAcceptsAuthentication(listingId);

  const admin = createE2eAdminClient();
  const { data: orderId, error: seedError } = await admin.rpc(
    "rpc_e2e_seed_member_auth_refund_eligible_order",
    {
      p_listing_id: listingId,
      p_buyer_id: buyerId,
      p_payment_intent_suffix: `${params.runId}-${params.suffix}`,
    },
  );

  if (seedError || !orderId) {
    throw new Error(
      `[seedMemberAuthRefundOrderForE2e] ${seedError?.message ?? "missing order id"}`,
    );
  }

  return { orderId, sellerId, buyerId };
}

export async function getMerchantOrderNumber(orderId: string): Promise<string> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("merchant_orders")
    .select("order_number")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getMerchantOrderNumber] ${error.message}`);
  }

  const orderNumber = data?.order_number?.trim();
  expect(orderNumber, `missing order_number for ${orderId}`).toBeTruthy();
  return orderNumber!;
}

export async function getMemberOrderNumber(orderId: string): Promise<string> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("member_orders")
    .select("order_number")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getMemberOrderNumber] ${error.message}`);
  }

  const orderNumber = data?.order_number?.trim();
  expect(orderNumber, `missing order_number for ${orderId}`).toBeTruthy();
  return orderNumber!;
}

export async function wipeModerationCasesForSubject(
  subjectId: string,
): Promise<void> {
  const admin = createE2eAdminClient();
  const { data: cases, error: caseSelectError } = await admin
    .from("moderation_cases")
    .select("id")
    .eq("subject_user_id", subjectId);

  if (caseSelectError) {
    throw new Error(`[wipeModerationCasesForSubject:cases] ${caseSelectError.message}`);
  }

  const caseIds = (cases ?? []).map((row) => row.id).filter(Boolean);
  if (caseIds.length > 0) {
    const { error: reportError } = await admin
      .from("reports")
      .delete()
      .in("case_id", caseIds);
    if (reportError) {
      throw new Error(`[wipeModerationCasesForSubject:reports] ${reportError.message}`);
    }
  }

  const { error: caseDeleteError } = await admin
    .from("moderation_cases")
    .delete()
    .eq("subject_user_id", subjectId);

  if (caseDeleteError) {
    throw new Error(`[wipeModerationCasesForSubject] ${caseDeleteError.message}`);
  }
}

export async function seedModerationCaseForAuthRefund(params: {
  orderId: string;
  subjectId: string;
  buyerId: string;
  runId: string;
  suffix: string;
  contextType: "merchant_order" | "member_order";
}): Promise<{ caseId: string }> {
  await wipeModerationCasesForSubject(params.subjectId);

  const admin = createE2eAdminClient();
  const caseNumber = `${SMOKE_PREFIX}-${params.runId}-${params.suffix}`;

  const { data: moderationCase, error: caseError } = await admin
    .from("moderation_cases")
    .insert({
      case_number: caseNumber,
      subject_user_id: params.subjectId,
      status: "open",
      primary_category: "fraud",
      auto_score: 20,
      admin_adjustment: 0,
    })
    .select("id")
    .single();

  if (caseError) {
    throw new Error(`[seedModerationCaseForAuthRefund:case] ${caseError.message}`);
  }

  const { error: reportError } = await admin.from("reports").insert({
    reporter_id: params.buyerId,
    target_id: params.subjectId,
    target_type: "user",
    category: "fraud",
    source: "profile",
    status: "pending",
    reason: `${SMOKE_PREFIX} auth refund ${params.suffix}`,
    details: "Partner moderation auth refund E2E",
    context_type: params.contextType,
    context_id: params.orderId,
    case_id: moderationCase.id,
    contribution_score: 20,
  });

  if (reportError) {
    throw new Error(`[seedModerationCaseForAuthRefund:report] ${reportError.message}`);
  }

  return { caseId: moderationCase.id };
}

async function selectModerationResolutionUpheldWarn(page: Page): Promise<void> {
  const resolutionSection = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "仲裁判定動作", exact: true }) })
    .last();
  const trigger = resolutionSection.getByRole("combobox").first();
  await expect(trigger).toBeVisible({ timeout: 20_000 });

  const optionName = "裁定成立（僅警告／可選退款）";
  for (let attempt = 0; attempt < 3; attempt++) {
    await trigger.click();
    const option = page.getByRole("option", { name: optionName });
    if (await option.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await option.click();
      return;
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  await trigger.click();
  await page.getByRole("option", { name: optionName }).click({ timeout: 20_000 });
}

export async function fillAdminDisputeRefundFields(
  page: Page,
  params: { orderNumber: string },
): Promise<void> {
  await page.getByRole("checkbox", { name: "執行售後退款" }).check();

  const refundOrderCombobox = page
    .getByRole("combobox")
    .filter({ hasText: "選擇訂單" });
  if (await refundOrderCombobox.isVisible().catch(() => false)) {
    await refundOrderCombobox.click();
    await page.getByRole("option", { name: params.orderNumber }).click();
  } else {
    await expect(page.getByText(params.orderNumber).first()).toBeVisible({
      timeout: 20_000,
    });
  }

  const arbitrationSection = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "仲裁判定動作", exact: true }) })
    .last();

  await arbitrationSection.getByRole("combobox").last().click();
  await page.getByRole("option", { name: "賣家責任" }).click();
}

export async function resolveAdminDisputeWithSellerFaultRefund(
  page: Page,
  params: { caseId: string; orderNumber: string; violationPersona: "Member" | "Merchant" },
): Promise<void> {
  await loginAsAdmin(page);
  await page.goto(`/admin/disputes/${params.caseId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", { name: "仲裁判定動作" }),
  ).toBeVisible({ timeout: 20_000 });

  await expect(
    page.getByRole("heading", { name: "關聯訂單" }),
  ).toBeVisible({ timeout: 20_000 });

  await selectModerationResolutionUpheldWarn(page);

  const violationSection = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "仲裁判定動作", exact: true }) })
    .last();
  await violationSection
    .getByRole("combobox")
    .filter({ hasText: /請選擇違規身分|Member|Merchant/ })
    .click();
  await page.getByRole("option", { name: params.violationPersona }).click();

  await fillAdminDisputeRefundFields(page, {
    orderNumber: params.orderNumber,
  });
  await page.getByRole("button", { name: "執行最終仲裁裁決" }).click();

  await expect(page).toHaveURL(/\/admin\/disputes\?status=completed/, {
    timeout: 60_000,
  });
}

export async function assertMerchantOrderRefundSagaStarted(
  orderId: string,
): Promise<void> {
  const admin = createE2eAdminClient();
  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from("merchant_orders")
          .select("refund_status")
          .eq("id", orderId)
          .maybeSingle();
        if (error) {
          throw new Error(error.message);
        }
        return data?.refund_status ?? "none";
      },
      { timeout: 30_000 },
    )
    .toMatch(/processing|failed|refunded/);
}

export async function assertMemberOrderRefundSagaStarted(
  orderId: string,
): Promise<void> {
  const admin = createE2eAdminClient();
  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from("member_orders")
          .select("refund_status")
          .eq("id", orderId)
          .maybeSingle();
        if (error) {
          throw new Error(error.message);
        }
        return data?.refund_status ?? "none";
      },
      { timeout: 30_000 },
    )
    .toMatch(/processing|failed|refunded/);
}

async function readAuthRefundRow(
  orderId: string,
  kind: "merchant_auth" | "member_auth",
): Promise<{ refund_status: string | null; stripe_payment_intent_id: string | null }> {
  const admin = createE2eAdminClient();
  const table = kind === "merchant_auth" ? "merchant_orders" : "member_orders";
  const { data, error } = await admin
    .from(table)
    .select("refund_status, stripe_payment_intent_id")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `[readAuthRefundRow] ${error?.message ?? `missing ${kind} order ${orderId}`}`,
    );
  }

  return {
    refund_status: data.refund_status,
    stripe_payment_intent_id: data.stripe_payment_intent_id,
  };
}

export async function finalizeModerationAuthRefundTerminal(params: {
  caseId: string;
  orderId: string;
  orderKind: "merchant_auth" | "member_auth";
  runId: string;
  suffix: string;
}): Promise<string> {
  const admin = createE2eAdminClient();
  const adminSession = await createE2eAdminAuthedClient();
  const refundId = `re_pe18_${params.suffix}_${params.runId}`;

  let row = await readAuthRefundRow(params.orderId, params.orderKind);
  let status = row.refund_status ?? "none";

  if (status === "failed") {
    const { error: retryError } = await adminSession.rpc(
      "rpc_retry_moderation_order_refund_prepare",
      {
        p_case_id: params.caseId,
        p_order_id: params.orderId,
      },
    );
    if (retryError) {
      const { error: prepareError } = await adminSession.rpc(
        "rpc_prepare_moderation_order_refund",
        {
          p_case_id: params.caseId,
          p_order_id: params.orderId,
          p_fault_party: "seller",
        },
      );
      if (prepareError) {
        throw new Error(
          `[finalize:failed-recover] retry=${retryError.message}; prepare=${prepareError.message}`,
        );
      }
    }
    row = await readAuthRefundRow(params.orderId, params.orderKind);
    status = row.refund_status ?? "none";
  }

  if (status === "none") {
    const { error } = await adminSession.rpc("rpc_prepare_moderation_order_refund", {
      p_case_id: params.caseId,
      p_order_id: params.orderId,
      p_fault_party: "seller",
    });
    if (error) {
      throw new Error(`[finalize:prepare] ${error.message}`);
    }
    row = await readAuthRefundRow(params.orderId, params.orderKind);
  }

  const paymentIntentId = row.stripe_payment_intent_id?.trim();
  expect(paymentIntentId, "missing stripe_payment_intent_id for finalize").toBeTruthy();

  const { error: finalizeError } = await adminSession.rpc(
    "rpc_finalize_moderation_order_refund",
    {
      p_order_id: params.orderId,
      p_payment_intent_id: paymentIntentId!,
      p_refund_id: refundId,
      p_refund_cents: 10_000,
      p_stripe_fee_hkd: 3.5,
      p_case_id: params.caseId,
    },
  );

  if (finalizeError) {
    throw new Error(`[finalize:terminal] ${finalizeError.message}`);
  }

  return refundId;
}

export async function assertMerchantAuthRefundTerminal(
  orderId: string,
  refundId: string,
): Promise<void> {
  const admin = createE2eAdminClient();
  const { data: order, error } = await admin
    .from("merchant_orders")
    .select("refund_status, escrow_status, fault_party, stripe_refund_id")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[assertMerchantAuthRefundTerminal] ${error.message}`);
  }

  expect(order?.refund_status).toBe("refunded");
  expect(order?.escrow_status).toBe("refunded");
  expect(order?.fault_party).toBe("seller");
  expect(order?.stripe_refund_id).toBe(refundId);

  const { data: ledger } = await admin
    .from("merchant_ledgers")
    .select("order_id, amount, transaction_type")
    .eq("order_id", orderId)
    .eq("transaction_type", "grading_fail_recovery")
    .maybeSingle();

  expect(ledger).not.toBeNull();
  expect(Number(ledger?.amount ?? 0)).toBeLessThan(0);
}

export async function assertMemberAuthRefundTerminal(
  orderId: string,
  refundId: string,
): Promise<void> {
  const admin = createE2eAdminClient();
  const { data: order, error } = await admin
    .from("member_orders")
    .select("refund_status, escrow_status, status, fault_party, stripe_refund_id")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[assertMemberAuthRefundTerminal] ${error.message}`);
  }

  expect(order?.refund_status).toBe("refunded");
  expect(order?.escrow_status).toBe("cancelled");
  expect(order?.status).toBe("cancelled");
  expect(order?.fault_party).toBe("seller");
  expect(order?.stripe_refund_id).toBe(refundId);

  const { data: receivable } = await admin
    .from("seller_receivables")
    .select("order_id, amount_hkd, status")
    .eq("order_kind", "member")
    .eq("order_id", orderId)
    .maybeSingle();

  expect(receivable).not.toBeNull();
  expect(Number(receivable?.amount_hkd ?? 0)).toBeGreaterThan(0);
}
