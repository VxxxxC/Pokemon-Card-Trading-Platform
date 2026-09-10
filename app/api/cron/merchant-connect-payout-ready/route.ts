import { NextResponse } from "next/server";
import { handleCronRoute } from "@/lib/cron/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeMerchantConnectPayout } from "@/lib/merchant-order/execute-connect-payout";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH_LIMIT = 50;

type ConnectPayoutCandidate = {
  order_id: string;
};

type ConnectPayoutCronClient = {
  rpc(
    fn: "rpc_list_merchant_connect_payout_candidates",
    args: { p_limit: number },
  ): Promise<{
    data: ConnectPayoutCandidate[] | null;
    error: { message: string } | null;
  }>;
};

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronRoute(
    request,
    async () => {
      const admin = createAdminClient() as unknown as ConnectPayoutCronClient;

      const { data: candidates, error: listError } = await admin.rpc(
        "rpc_list_merchant_connect_payout_candidates",
        { p_limit: BATCH_LIMIT },
      );

      if (listError) {
        return NextResponse.json(
          { success: false, error: listError.message },
          { status: 500 },
        );
      }

      const rows = candidates ?? [];
      let transferred = 0;
      const errors: string[] = [];

      for (const row of rows) {
        const result = await executeMerchantConnectPayout(row.order_id);

        if (!result.success) {
          errors.push(`${row.order_id}: ${result.error}`);
          continue;
        }

        transferred += 1;
      }

      return NextResponse.json({
        success: true,
        scanned: rows.length,
        transferred,
        errors,
      });
    },
    "[cron/merchant-connect-payout-ready]",
    "Merchant Connect payout ready cron failed",
  );
}
