import { NextResponse } from "next/server";
import { handleCronRoute } from "@/lib/cron/request";
import { processChatUnreadDigest } from "@/lib/notifications/process-chat-unread-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronRoute(
    request,
    async () => {
      const result = await processChatUnreadDigest();
      return NextResponse.json({
        success: true,
        scanned: result.scanned,
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors,
        deliveries: result.deliveries,
      });
    },
    "[cron/chat-unread-digest]",
    "Chat unread digest cron failed",
  );
}
