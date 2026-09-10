import { NextResponse } from "next/server";
import { handleCronRoute } from "@/lib/cron/request";
import { processCouponExpiringReminders } from "@/lib/notifications/process-coupon-expiring-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronRoute(
    request,
    async () => {
      const result = await processCouponExpiringReminders();
      return NextResponse.json({
        success: true,
        reminders: result.reminders,
        errors: result.errors,
      });
    },
    "[cron/reward-coupon-expiring-reminder]",
    "Coupon expiring reminder cron failed",
  );
}
