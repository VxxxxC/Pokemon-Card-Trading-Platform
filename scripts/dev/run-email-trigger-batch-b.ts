#!/usr/bin/env bun
/**
 * Batch B email trigger verify — calls producer functions after minimal DB seed.
 * Usage: bun scripts/dev/run-email-trigger-batch-b.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "../../lib/supabase/admin";
import { enqueueModerationResolveFollowUpEmails } from "../../lib/notifications/moderation-emails";
import { enqueuePointsRedemptionGrantedEmail } from "../../lib/notifications/rewards-emails";
import { enqueueRefundFailedEmail } from "../../lib/notifications/refund-emails";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const CASE_ID = "a074789f-dde6-42c4-a6bf-c0362bc4812d";
const SUBJECT_ID = "1de549e4-be20-401a-95c9-71272c9771e8";
const BUYER_ID = "c1351670-5340-42e9-a36f-d6875c5305ba";
const MERCHANT_ORDER_ID = "1752e850-6de9-43c5-9f0f-4d393871826b";
const TEMPLATE_ID = "01f6e7fc-55d2-449e-9363-c5cd613992d3";

async function ensureCatalogItem(admin: ReturnType<typeof createAdminClient>) {
  const { data: existing } = await admin
    .from("reward_redemption_catalog")
    .select("id")
    .eq("template_id", TEMPLATE_ID)
    .eq("is_active", true)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from("reward_redemption_catalog")
    .insert({
      template_id: TEMPLATE_ID,
      points_cost: 50,
      stock: 10,
      initial_stock: 10,
      is_active: true,
      display_order: 0,
    })
    .select("id")
    .single();

  if (error) throw new Error(`catalog insert: ${error.message}`);
  return data.id;
}

async function main() {
  const admin = createAdminClient();
  const results: Record<string, string> = {};

  // E-MOD-05: active freeze_payout + dismissed resolve follow-up
  await admin.from("account_sanctions").insert({
    user_id: SUBJECT_ID,
    scope: "account",
    type: "freeze_payout",
    source: "admin",
    case_id: CASE_ID,
    reason: "batch-b email trigger verify",
  });

  await enqueueModerationResolveFollowUpEmails({
    caseId: CASE_ID,
    resolution: "dismissed",
    sanction: null,
  });
  results["E-MOD-05"] = "enqueued via enqueueModerationResolveFollowUpEmails(dismissed)";

  // E-ACC-09: upheld + restrict_listing
  await enqueueModerationResolveFollowUpEmails({
    caseId: CASE_ID,
    resolution: "upheld",
    sanction: {
      type: "restrict_listing",
      scope: "account",
      reason: "batch-b email trigger verify",
      endsAt: null,
    },
  });
  results["E-ACC-09"] =
    "enqueued via enqueueModerationResolveFollowUpEmails(upheld+restrict_listing)";

  // E-RWD-01: catalog + grant email (RPC needs auth session; producer called post-redeem)
  const catalogId = await ensureCatalogItem(admin);
  const userRewardId = crypto.randomUUID();
  await enqueuePointsRedemptionGrantedEmail({
    userId: BUYER_ID,
    catalogId,
    userRewardId,
    pointsRedeemed: 50,
  });
  results["E-RWD-01"] = `enqueued via enqueuePointsRedemptionGrantedEmail (${userRewardId})`;

  // E-REF-03: refund saga failure path
  await enqueueRefundFailedEmail({
    orderKind: "merchant",
    orderId: MERCHANT_ORDER_ID,
    caseId: CASE_ID,
    errorMessage: "batch-b email trigger verify",
  });
  results["E-REF-03"] = "enqueued via enqueueRefundFailedEmail";

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
