import { NextResponse } from "next/server";
import { handleCronRoute } from "@/lib/cron/request";
import { processWishlistPriceAlerts } from "@/lib/notifications/process-wishlist-price-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request): Promise<NextResponse> {
  return handleCronRoute(
    request,
    async () => {
      const result = await processWishlistPriceAlerts();
      return NextResponse.json({
        success: true,
        scanned: result.scanned,
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors,
        deliveries: result.deliveries,
      });
    },
    "[cron/wishlist-price-alerts]",
    "Wishlist price alert cron failed",
  );
}
