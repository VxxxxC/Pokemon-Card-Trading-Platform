/**
 * Service-role Supabase client — integration test cleanup and DB assertions ONLY.
 * Do not import from Server Action code paths under test.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getIntegrationEnv } from "./env";

export function createServiceRoleClient() {
  const { url, serviceRoleKey } = getIntegrationEnv();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
