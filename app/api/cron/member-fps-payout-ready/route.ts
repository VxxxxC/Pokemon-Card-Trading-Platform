import { NextResponse } from "next/server";
import { handleCronRoute } from "@/lib/cron/request";
import { enqueueMemberFpsPayoutCompletedEmail } from "@/lib/notifications/payout-emails";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH_LIMIT = 50;

type FpsPayoutCandidate = {
  order_id: string;
};

type FpsPayoutCronClient = {
  rpc(
    fn: "rpc_list_member_fps_payout_ready_candidates",
    args: { p_limit: number },
  ): Promise<{
    data: FpsPayoutCandidate[] | null;
    error: { message: string } | null;
  }>;
  rpc(
    fn: "rpc_finalize_member_fps_payout_ready",
    args: { p_order_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronRoute(
    request,
    async () => {
      const admin = createAdminClient() as unknown as FpsPayoutCronClient;

      const { data: candidates, error: listError } = await admin.rpc(
        "rpc_list_member_fps_payout_ready_candidates",
        { p_limit: BATCH_LIMIT },
      );

      if (listError) {
        return NextResponse.json(
          { success: false, error: listError.message },
          { status: 500 },
        );
      }

      const rows = candidates ?? [];
      let inserted = 0;
      const errors: string[] = [];

      for (const row of rows) {
        const { error: finalizeError } = await admin.rpc(
          "rpc_finalize_member_fps_payout_ready",
          { p_order_id: row.order_id },
        );

        if (finalizeError) {
          errors.push(`${row.order_id}: ${finalizeError.message}`);
          continue;
        }

        await enqueueMemberFpsPayoutCompletedEmail(row.order_id);
        inserted += 1;
      }

      return NextResponse.json({
        success: true,
        scanned: rows.length,
        inserted,
        errors,
      });
    },
    "[cron/member-fps-payout-ready]",
    "Member FPS payout ready cron failed",
  );
}
