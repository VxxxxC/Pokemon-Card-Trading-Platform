import { getSiteUrl } from "@/lib/auth/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildAbsoluteUrl,
  buildMemberTradingUrl,
} from "@/lib/notifications/email-urls";
import { enqueueTransactionalEmail } from "@/lib/notifications/enqueue-email";
import { resolveAuthUserEmails } from "@/lib/notifications/resolve-auth-user-email";
import { resolveEmailLogoUrl } from "@/lib/email/layout";

async function enqueueRewardsEmailSafely(
  input: Parameters<typeof enqueueTransactionalEmail>[0],
): Promise<void> {
  try {
    await enqueueTransactionalEmail(input);
  } catch (error) {
    console.warn("[rewards-emails] enqueue failed", input.eventId, error);
  }
}

export async function enqueuePointsRedemptionGrantedEmail(args: {
  userId: string;
  catalogId: string;
  userRewardId: string;
  pointsRedeemed: number;
}): Promise<void> {
  const userEmail = await resolveAuthUserEmails([args.userId]).then(
    (map) => map.get(args.userId),
  );
  if (!userEmail) return;

  const admin = createAdminClient();
  const { data: catalog } = await admin
    .from("reward_redemption_catalog")
    .select("template_id, reward_templates ( title )")
    .eq("id", args.catalogId)
    .maybeSingle<{
      template_id: string;
      reward_templates: { title: string } | null;
    }>();

  const itemName = catalog?.reward_templates?.title?.trim() || "獎勵";

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildAbsoluteUrl(siteUrl, "/profile/user/rewards");

  await enqueueRewardsEmailSafely({
    eventId: "E-RWD-01",
    templateKey: "rewards.grant",
    toEmail: userEmail,
    recipientUserId: args.userId,
    idempotencyKey: `E-RWD-01:${args.userRewardId}:grant`,
    payload: {
      itemName,
      pointsLabel: `-${args.pointsRedeemed}`,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueCouponExpiringReminderEmail(args: {
  userId: string;
  userRewardId: string;
  expiryLabel: string;
  idempotencyDateSuffix: string;
}): Promise<void> {
  const userEmail = await resolveAuthUserEmails([args.userId]).then(
    (map) => map.get(args.userId),
  );
  if (!userEmail) return;

  const siteUrl = await getSiteUrl();
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const actionUrl = buildMemberTradingUrl(siteUrl);

  await enqueueRewardsEmailSafely({
    eventId: "E-RWD-02",
    templateKey: "rewards.coupon_expiring",
    toEmail: userEmail,
    recipientUserId: args.userId,
    idempotencyKey: `E-RWD-02:${args.userRewardId}:expiring:${args.idempotencyDateSuffix}`,
    payload: {
      expiryLabel: args.expiryLabel,
      actionUrl,
      logoUrl,
    },
  });
}
