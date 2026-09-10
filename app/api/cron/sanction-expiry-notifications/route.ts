import { NextResponse } from "next/server";
import { handleCronRoute } from "@/lib/cron/request";
import { processSanctionExpiryNotifications } from "@/lib/notifications/process-sanction-expiry-notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronRoute(
    request,
    async () => {
      const result = await processSanctionExpiryNotifications();
      return NextResponse.json({
        success: true,
        notifications: result.notifications,
        errors: result.errors,
      });
    },
    "[cron/sanction-expiry-notifications]",
    "Sanction expiry notification cron failed",
  );
}
