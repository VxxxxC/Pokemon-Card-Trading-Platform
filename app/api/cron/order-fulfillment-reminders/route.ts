import { NextResponse } from "next/server";
import { handleCronRoute } from "@/lib/cron/request";
import { processOrderFulfillmentReminders } from "@/lib/notifications/process-order-fulfillment-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronRoute(
    request,
    async () => {
      const result = await processOrderFulfillmentReminders();
      return NextResponse.json({
        success: true,
        confirmReminders: result.confirmReminders,
        shipReminders: result.shipReminders,
        errors: result.errors,
      });
    },
    "[cron/order-fulfillment-reminders]",
    "Order fulfillment reminder cron failed",
  );
}
