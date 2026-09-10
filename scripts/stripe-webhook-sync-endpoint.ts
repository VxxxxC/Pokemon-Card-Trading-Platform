/**
 * Sync Stripe Dashboard webhook endpoint enabled_events with app handler SSOT.
 *
 * Usage:
 *   bun run stripe:webhook:sync
 *   bun run stripe:webhook:sync -- --url https://your-domain.com/api/stripe/webhook
 *
 * Requires STRIPE_SECRET_KEY in env (.env loaded automatically by Bun).
 */
import Stripe from "stripe";
import {
  STRIPE_WEBHOOK_EVENTS,
  STRIPE_WEBHOOK_PATH,
} from "../lib/stripe/webhook-events";

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) {
    return undefined;
  }
  return process.argv[idx + 1]?.trim() || undefined;
}

async function main(): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    console.error("❌ Missing STRIPE_SECRET_KEY in environment");
    process.exit(1);
  }

  const createUrl = readArg("--url");
  const stripe = new Stripe(secretKey, {
    apiVersion: "2023-10-16" as Stripe.LatestApiVersion,
  });

  const enabledEvents = [...STRIPE_WEBHOOK_EVENTS];

  const listed = await stripe.webhookEndpoints.list({ limit: 100 });
  const endpoints = listed.data;

  if (endpoints.length === 0) {
    if (!createUrl) {
      console.log("ℹ️  No Stripe webhook endpoints on this account (test mode).");
      console.log("");
      console.log("Local dev — forward events to Next.js:");
      console.log("  bun run stripe:webhook:listen");
      console.log("");
      console.log("Remote / staging — create endpoint with full event list:");
      console.log(
        `  bun run stripe:webhook:sync -- --url https://YOUR_DOMAIN${STRIPE_WEBHOOK_PATH}`,
      );
      process.exit(0);
    }

    const created = await stripe.webhookEndpoints.create({
      url: createUrl,
      enabled_events: enabledEvents,
      description: "HKCardVault — synced via scripts/stripe-webhook-sync-endpoint.ts",
    });

    console.log("✅ Created webhook endpoint");
    console.log(`   id:     ${created.id}`);
    console.log(`   url:    ${created.url}`);
    console.log(`   events: ${created.enabled_events.join(", ")}`);
    console.log("");
    console.log("⚠️  Set STRIPE_WEBHOOK_SECRET in .env to the signing secret below:");
    console.log(`   ${created.secret}`);
    return;
  }

  for (const endpoint of endpoints) {
    const updated = await stripe.webhookEndpoints.update(endpoint.id, {
      enabled_events: enabledEvents,
      disabled: false,
    });

    const missing = enabledEvents.filter(
      (event) => !updated.enabled_events.includes(event),
    );

    console.log(`✅ Updated ${updated.id}`);
    console.log(`   url:    ${updated.url}`);
    console.log(`   events: ${updated.enabled_events.join(", ")}`);
    if (missing.length > 0) {
      console.warn(`   ⚠️  Still missing after update: ${missing.join(", ")}`);
    }
    console.log("");
  }

  console.log(
    "ℹ️  If STRIPE_WEBHOOK_SECRET changed, update .env with the endpoint signing secret from Stripe Dashboard → Webhooks → endpoint → Signing secret.",
  );
}

main().catch((error) => {
  console.error("❌ stripe webhook sync failed", error);
  process.exit(1);
});
