import { NextResponse } from "next/server";
import { handleCronRoute } from "@/lib/cron/request";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH_LIMIT = 50;

type StaleReserveCandidate = {
  user_reward_id: string;
  order_kind: string;
  order_id: string;
};

type StaleReserveRpcClient = {
  rpc(
    fn: "rpc_list_stale_coupon_reserve_candidates",
    args: { p_limit: number },
  ): Promise<{
    data: StaleReserveCandidate[] | null;
    error: { message: string } | null;
  }>;
  rpc(
    fn: "rpc_finalize_stale_coupon_reserve",
    args: { p_user_reward_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronRoute(
    request,
    async () => {
      const admin = createAdminClient() as unknown as StaleReserveRpcClient;

      const { data: candidates, error: listError } = await admin.rpc(
        "rpc_list_stale_coupon_reserve_candidates",
        { p_limit: BATCH_LIMIT },
      );

      if (listError) {
        return NextResponse.json(
          { success: false, error: listError.message },
          { status: 500 },
        );
      }

      const rows = candidates ?? [];
      let released = 0;
      const errors: string[] = [];

      for (const row of rows) {
        const { error: finalizeError } = await admin.rpc(
          "rpc_finalize_stale_coupon_reserve",
          { p_user_reward_id: row.user_reward_id },
        );

        if (finalizeError) {
          errors.push(`${row.user_reward_id}: ${finalizeError.message}`);
          continue;
        }

        released += 1;
      }

      return NextResponse.json({
        success: true,
        scanned: rows.length,
        released,
        errors,
      });
    },
    "[cron/release-stale-coupon-reserves]",
    "Stale coupon reserve release failed",
  );
}
