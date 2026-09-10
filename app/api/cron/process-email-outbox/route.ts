import { NextResponse } from "next/server";
import { assertEmailWorkerEnvironment } from "@/lib/email/env";
import { handleCronRoute } from "@/lib/cron/request";
import { processEmailOutboxBatch } from "@/lib/notifications/process-email-outbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronRoute(
    request,
    async () => {
      const env = assertEmailWorkerEnvironment();
      if (!env.ok) {
        return NextResponse.json(
          { success: false, error: env.error },
          { status: 500 },
        );
      }

      const result = await processEmailOutboxBatch();

      return NextResponse.json({
        success: true,
        ...result,
      });
    },
    "[cron/process-email-outbox]",
    "Email outbox processing failed",
  );
}
