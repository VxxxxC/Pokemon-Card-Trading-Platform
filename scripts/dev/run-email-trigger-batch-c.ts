#!/usr/bin/env bun
/**
 * Batch C email trigger verify — Connect payout producers.
 * Usage: bun scripts/dev/run-email-trigger-batch-c.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  enqueueConnectPayoutCompletedEmail,
  enqueueConnectPayoutProcessingEmail,
} from "../../lib/notifications/payout-emails";
import { enqueueB2cGradingPayoutCompletedEmail } from "../../lib/notifications/grading-emails";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

/** Non-grading merchant order (requires_authentication = false). */
const REGULAR_ORDER_ID = "0fe9c49d-edd8-4829-82ab-fb3ad6cbab62";
/** B2C grading merchant order (requires_authentication = true). */
const GRADING_ORDER_ID = "db008bf5-3e17-49e3-8201-fd138f100b66";
const PAYOUT_AMOUNT_HKD = 128;

async function main() {
  const results: Record<string, string> = {};

  await enqueueConnectPayoutProcessingEmail(REGULAR_ORDER_ID);
  results["E-PAY-01"] =
    "enqueued via enqueueConnectPayoutProcessingEmail (regular order)";

  await enqueueConnectPayoutCompletedEmail({
    orderId: REGULAR_ORDER_ID,
    merchantPayoutAmount: PAYOUT_AMOUNT_HKD,
  });
  results["E-PAY-02"] =
    "enqueued via enqueueConnectPayoutCompletedEmail (regular order)";

  await enqueueB2cGradingPayoutCompletedEmail({
    orderId: GRADING_ORDER_ID,
    merchantPayoutAmount: PAYOUT_AMOUNT_HKD,
  });
  results["E-GRD-B2C-09"] =
    "enqueued via enqueueB2cGradingPayoutCompletedEmail (grading order)";

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
