import { getProfileIdByEmail } from "../fixtures/supabase-admin";
import { getChatRealtimeFixtures } from "../fixtures/chat-test-data";
import { hasMemberTradingFixtures } from "../fixtures/test-data";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { hasMerchantOrderE2eEnv } from "./merchant-orders";

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

export function hasSupabaseAdminE2eEnv(): boolean {
  return hasMerchantOrderE2eEnv();
}

export async function resolveE2eSellerProfileId(): Promise<string | null> {
  const sellerEmail = getChatRealtimeFixtures().sellerEmail?.trim();
  if (!sellerEmail) {
    return null;
  }
  return getProfileIdByEmail(sellerEmail);
}

export async function hasMerchantFinanceE2eEnv(): Promise<boolean> {
  if (!hasMemberTradingFixtures() || !hasSupabaseAdminE2eEnv()) {
    return false;
  }

  const sellerId = await resolveE2eSellerProfileId();
  if (!sellerId) {
    return false;
  }

  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", sellerId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return data?.role === "merchant";
}
