import { NextResponse } from "next/server";
import { handleCronRoute } from "@/lib/cron/request";
import { processConnectOnboardingReminders } from "@/lib/notifications/process-connect-onboarding-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronRoute(
    request,
    async () => {
      const result = await processConnectOnboardingReminders();
      return NextResponse.json({
        success: true,
        reminders: result.reminders,
        errors: result.errors,
      });
    },
    "[cron/merchant-connect-onboarding-reminder]",
    "Connect onboarding reminder cron failed",
  );
}
