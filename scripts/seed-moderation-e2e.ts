/**
 * Seed moderation cases for admin-moderation E2E (guest project).
 * Run: bun run seed:moderation-e2e
 *
 * Creates:
 * - 1 open fraud case with chat_room context (chat thread + dismiss + orders panel)
 * - 1 prior dismissed case (E2E-G5 subject history)
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";
import {
  countResolvedModerationCasesForSubject,
  deletePendingReports,
  ensureDbChatRoom,
  getBuyerProfileIdFromEnv,
  getLatestModerationCaseWithChatRoom,
  getLatestOpenModerationCaseForSubject,
  getProfileIdByEmail,
} from "../e2e/fixtures/supabase-admin";
import { getMerchantProductDetailFixtures } from "../e2e/fixtures/test-data";

function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function createServiceClient() {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createBuyerClient() {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const email = readEnv("E2E_BUYER_EMAIL");
  const password = readEnv("E2E_BUYER_PASSWORD");
  if (!url || !anonKey || !email || !password) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, E2E_BUYER_EMAIL, or E2E_BUYER_PASSWORD",
    );
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`[seed-moderation-e2e] buyer sign-in failed: ${error.message}`);
  }
  return client;
}

async function insertResolvedCase(params: {
  buyerId: string;
  sellerId: string;
  adminId: string;
  runId: string;
}): Promise<string> {
  const admin = createServiceClient();
  const caseNumber = `E2E-SEED-RESOLVED-${params.runId}`;
  const resolvedAt = new Date(Date.now() - 86_400_000).toISOString();

  const { data: moderationCase, error: caseError } = await admin
    .from("moderation_cases")
    .insert({
      case_number: caseNumber,
      subject_user_id: params.sellerId,
      status: "dismissed",
      resolution: "dismissed",
      resolved_at: resolvedAt,
      resolved_by: params.adminId,
      primary_category: "other",
      auto_score: 10,
      admin_adjustment: 0,
    })
    .select("id, case_number")
    .single();

  if (caseError) {
    throw new Error(`[seed-moderation-e2e:resolved-case] ${caseError.message}`);
  }

  const { error: reportError } = await admin.from("reports").insert({
    reporter_id: params.buyerId,
    target_id: params.sellerId,
    target_type: "user",
    reason: `E2E seed resolved case ${params.runId}`,
    status: "dismissed",
    category: "other",
    case_id: moderationCase.id,
    outcome_acknowledged_at: resolvedAt,
    contribution_score: 10,
  });

  if (reportError) {
    await admin.from("moderation_cases").delete().eq("id", moderationCase.id);
    throw new Error(`[seed-moderation-e2e:resolved-report] ${reportError.message}`);
  }

  return moderationCase.case_number;
}

async function main(): Promise<void> {
  const adminEmail = readEnv("E2E_ADMIN_EMAIL");
  if (!adminEmail) {
    throw new Error("Missing E2E_ADMIN_EMAIL");
  }

  const buyerId = await getBuyerProfileIdFromEnv();
  const { sellerId } = getMerchantProductDetailFixtures();
  if (!buyerId || !sellerId) {
    throw new Error("Missing E2E_BUYER_EMAIL or E2E_SELLER_ID");
  }

  const adminId = await getProfileIdByEmail(adminEmail);
  if (!adminId) {
    throw new Error(`Admin profile not found for ${adminEmail}`);
  }

  const runId = String(Date.now());

  await deletePendingReports({ reporterId: buyerId, targetId: sellerId });

  const chatRoomId = await ensureDbChatRoom(buyerId, sellerId);

  const resolvedCaseNumber = await insertResolvedCase({
    buyerId,
    sellerId,
    adminId,
    runId,
  });

  const buyerClient = await createBuyerClient();

  const { data, error } = await buyerClient.rpc("rpc_submit_user_report_v2", {
    p_target_id: sellerId,
    p_category: "fraud",
    p_details: `E2E moderation seed open case ${runId}`,
    p_chat_room_id: chatRoomId,
  });

  if (error) {
    throw new Error(`[seed-moderation-e2e:submit] ${error.message}`);
  }

  const payload = data as {
    case_id?: string;
    case_number?: string;
    report_id?: string;
  } | null;

  if (!payload?.case_id || !payload.case_number) {
    throw new Error("[seed-moderation-e2e:submit] unexpected RPC payload");
  }

  const openCase = await getLatestOpenModerationCaseForSubject(sellerId);
  const chatCase = await getLatestModerationCaseWithChatRoom(sellerId);
  const resolvedCount = await countResolvedModerationCasesForSubject(sellerId);

  console.log("✅ Moderation E2E seed complete");
  console.log(`   open case: ${openCase?.case_number ?? payload.case_number}`);
  console.log(`   resolved case: ${resolvedCaseNumber}`);
  console.log(`   chat room: ${chatCase?.chatRoomId ?? chatRoomId}`);
  console.log(`   resolved count: ${resolvedCount}`);
}

main().catch((error: unknown) => {
  console.error("❌", error instanceof Error ? error.message : error);
  process.exit(1);
});
