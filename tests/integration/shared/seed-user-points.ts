import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createServiceRoleClient } from "./supabase-admin";

/**
 * Test/E2E helper — seeds points via service-role RPC (never fn_claim_mission_points).
 */
export async function seedUserPoints(
  userId: string,
  targetPoints: number,
  buyerClient?: SupabaseClient<Database>,
): Promise<void> {
  const admin = createServiceRoleClient();

  let current = 0;
  if (buyerClient) {
    const { data, error } = await buyerClient.rpc("get_gamification_stats_for_me");
    if (error) {
      throw new Error(`[seedUserPoints] stats: ${error.message}`);
    }
    current = Number((data as { points_balance?: number } | null)?.points_balance ?? 0);
  }

  if (targetPoints > current) {
    const { error } = await admin.rpc("rpc_service_seed_user_points", {
      p_user_id: userId,
      p_points: targetPoints - current,
      p_description: "integration test seed",
    });
    if (error) {
      throw new Error(`[seedUserPoints] seed: ${error.message}`);
    }
    return;
  }

  if (targetPoints < current) {
    const { error } = await admin.rpc("fn_apply_point_transaction", {
      p_user_id: userId,
      p_amount: targetPoints - current,
      p_source_type: "admin_adjust",
      p_source_ref: undefined,
      p_description: "integration test adjust down",
    });
    if (error) {
      throw new Error(`[seedUserPoints] adjust: ${error.message}`);
    }
  }
}
