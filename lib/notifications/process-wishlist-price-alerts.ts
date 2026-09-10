import { sendOneSignalPush } from "@/lib/notifications/onesignal/send";
import { isPushEnabledForUser } from "@/lib/notifications/notification-prefs";
import {
  PUSH_CRON_BATCH_LIMIT,
  WISHLIST_PRICE_ALERT_COOLDOWN_HOURS,
} from "@/lib/notifications/push-config";
import {
  lowestListingForGrade,
  type ListingPriceRow,
} from "@/lib/marketplace/portfolio-pricing";
import { normalizeWishlistGrading } from "@/lib/wishlist/grading";
import {
  buildWishlistPriceAlertCopy,
  isWishlistAlertCooldownActive,
  resolveWishlistProductName,
  shouldSendWishlistPriceAlert,
} from "@/lib/notifications/wishlist-push";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/supabase";

type WatchlistAlertRow = Pick<
  Tables<"product_watchlists">,
  | "user_id"
  | "product_id"
  | "grading_company"
  | "grading_score"
  | "target_price"
  | "last_alerted_at"
>;

type CatalogRow = Pick<
  Tables<"product_catalog">,
  "id" | "name_zh" | "name_en" | "name_ja"
>;

type PushSubscriptionRow = Pick<
  Tables<"user_push_subscriptions">,
  "user_id" | "onesignal_subscription_id"
>;

export async function processWishlistPriceAlerts(): Promise<{
  scanned: number;
  sent: number;
  skipped: number;
  errors: string[];
  deliveries: Array<{
    userId: string;
    productId: string;
    notificationId: string;
    targeting: "subscription_ids" | "external_id";
  }>;
}> {
  const admin = createAdminClient();
  const now = new Date();
  const cooldownCutoff = new Date(
    now.getTime() - WISHLIST_PRICE_ALERT_COOLDOWN_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: watchRows, error: watchError } = await admin
    .from("product_watchlists")
    .select(
      "user_id, product_id, grading_company, grading_score, target_price, last_alerted_at",
    )
    .eq("alert_enabled", true)
    .not("target_price", "is", null)
    .or(`last_alerted_at.is.null,last_alerted_at.lt.${cooldownCutoff}`)
    .limit(PUSH_CRON_BATCH_LIMIT);

  if (watchError) {
    return {
      scanned: 0,
      sent: 0,
      skipped: 0,
      errors: [watchError.message],
      deliveries: [],
    };
  }

  const rows = (watchRows ?? []) as WatchlistAlertRow[];
  if (rows.length === 0) {
    return { scanned: 0, sent: 0, skipped: 0, errors: [], deliveries: [] };
  }

  const productIds = [...new Set(rows.map((row) => row.product_id))];
  const userIds = [...new Set(rows.map((row) => row.user_id))];

  const [catalogResult, listingsResult, subscriptionsResult] = await Promise.all([
    admin.from("product_catalog").select("id, name_zh, name_en, name_ja").in("id", productIds),
    admin
      .from("listings")
      .select("product_id, grading_company, grading_score, price")
      .in("product_id", productIds)
      .eq("status", "active"),
    admin
      .from("user_push_subscriptions")
      .select("user_id, onesignal_subscription_id")
      .in("user_id", userIds)
      .eq("opted_in", true),
  ]);

  const errors: string[] = [];
  if (catalogResult.error) {
    errors.push(catalogResult.error.message);
  }
  if (listingsResult.error) {
    errors.push(listingsResult.error.message);
  }
  if (subscriptionsResult.error) {
    errors.push(subscriptionsResult.error.message);
  }

  if (errors.length > 0) {
    return {
      scanned: rows.length,
      sent: 0,
      skipped: 0,
      errors,
      deliveries: [],
    };
  }

  const catalogById = new Map(
    ((catalogResult.data ?? []) as CatalogRow[]).map((row) => [row.id, row]),
  );
  const listingRows = (listingsResult.data ?? []) as ListingPriceRow[];
  const subscriptionsByUser = new Map<string, string[]>();

  for (const row of (subscriptionsResult.data ?? []) as PushSubscriptionRow[]) {
    const existing = subscriptionsByUser.get(row.user_id) ?? [];
    existing.push(row.onesignal_subscription_id);
    subscriptionsByUser.set(row.user_id, existing);
  }

  let sent = 0;
  let skipped = 0;
  const deliveries: Array<{
    userId: string;
    productId: string;
    notificationId: string;
    targeting: "subscription_ids" | "external_id";
  }> = [];

  for (const row of rows) {
    const targetPrice = Number(row.target_price);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      skipped += 1;
      continue;
    }

    if (
      isWishlistAlertCooldownActive(
        row.last_alerted_at,
        now,
        WISHLIST_PRICE_ALERT_COOLDOWN_HOURS,
      )
    ) {
      skipped += 1;
      continue;
    }

    const grading = normalizeWishlistGrading(
      row.grading_company,
      row.grading_score,
    );
    const lowestPrice = lowestListingForGrade(
      listingRows,
      row.product_id,
      grading.gradingCompany,
      grading.gradingScore,
    );

    if (!shouldSendWishlistPriceAlert(lowestPrice, targetPrice)) {
      skipped += 1;
      continue;
    }

    const subscriptionIds = subscriptionsByUser.get(row.user_id) ?? [];

    if (!(await isPushEnabledForUser(row.user_id, "P-WIS-01"))) {
      skipped += 1;
      continue;
    }

    const catalog = catalogById.get(row.product_id);
    const copy = buildWishlistPriceAlertCopy({
      productName: resolveWishlistProductName(catalog),
      gradeLabel: grading.gradeLabel,
      lowestPrice: lowestPrice!,
      targetPrice,
    });

    const sendResult = await sendOneSignalPush({
      eventId: "P-WIS-01",
      subscriptionIds,
      externalUserIds: [row.user_id],
      heading: copy.heading,
      body: copy.body,
      path: `/marketplace/product/${row.product_id}`,
    });

    if (!sendResult.success) {
      errors.push(sendResult.error);
      continue;
    }

    if (sendResult.skipped) {
      skipped += 1;
      continue;
    }

    const { error: updateError } = await admin
      .from("product_watchlists")
      .update({ last_alerted_at: now.toISOString() })
      .eq("user_id", row.user_id)
      .eq("product_id", row.product_id)
      .eq("grading_company", row.grading_company)
      .eq("grading_score", row.grading_score);

    if (updateError) {
      errors.push(updateError.message);
      continue;
    }

    sent += 1;
    deliveries.push({
      userId: row.user_id,
      productId: row.product_id,
      notificationId: sendResult.notificationId,
      targeting: sendResult.targeting,
    });
  }

  return { scanned: rows.length, sent, skipped, errors, deliveries };
}
