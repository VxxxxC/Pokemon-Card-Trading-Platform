#!/usr/bin/env bun
/**
 * Staging helper — run email cron producers and assert notification_email_outbox rows.
 *
 * Prereq: seed business rows first (see scripts/dev/email-trigger-seeds.sql).
 *
 *   bun scripts/dev/verify-email-triggers.ts --run-crons batch-a-cron
 *   bun scripts/dev/verify-email-triggers.ts --assert E-ORD-07,E-MCH-04 --since-minutes 120
 *   bun scripts/dev/verify-email-triggers.ts --list
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "../../lib/supabase/admin";
import {
  cronPathsForBatch,
  PENDING_EMAIL_TRIGGER_EVENT_IDS,
  PENDING_EMAIL_TRIGGER_SPECS,
  type EmailTriggerBatch,
} from "../../lib/notifications/email-trigger-catalog";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
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
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

type CliOptions = {
  list: boolean;
  runCrons: EmailTriggerBatch | null;
  assertEvents: string[];
  sinceMinutes: number;
  baseUrl: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    list: false,
    runCrons: null,
    assertEvents: [],
    sinceMinutes: 180,
    baseUrl: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://127.0.0.1:3000",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list") {
      options.list = true;
    } else if (arg === "--run-crons") {
      options.runCrons = (argv[i + 1] ?? "") as EmailTriggerBatch;
      i += 1;
    } else if (arg === "--assert") {
      options.assertEvents = (argv[i + 1] ?? "")
        .split(",")
        .map((eventId) => eventId.trim())
        .filter(Boolean);
      i += 1;
    } else if (arg === "--since-minutes") {
      options.sinceMinutes = Number(argv[i + 1] ?? "180");
      i += 1;
    } else if (arg === "--base-url") {
      options.baseUrl = argv[i + 1] ?? options.baseUrl;
      i += 1;
    }
  }

  return options;
}

async function runCron(path: string, cronSecret: string, baseUrl: string) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

async function fetchOutboxSince(sinceIso: string, eventIds: string[]) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_email_outbox")
    .select("event_id, to_email, status, idempotency_key, created_at")
    .in("event_id", eventIds)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

function printCatalog() {
  console.log("Pending manual-test email triggers (producer → outbox):\n");
  for (const spec of PENDING_EMAIL_TRIGGER_SPECS) {
    const cron = spec.cronPath ? `cron ${spec.cronPath}` : "action/manual";
    console.log(`- ${spec.eventId}  ${spec.label}`);
    console.log(`    ${cron}`);
    console.log(`    ${spec.manualHint}\n`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.list) {
    printCatalog();
    return;
  }

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (options.runCrons && !cronSecret) {
    console.error("Missing CRON_SECRET for --run-crons");
    process.exit(1);
  }

  const sinceIso = new Date(
    Date.now() - options.sinceMinutes * 60 * 1000,
  ).toISOString();

  if (options.runCrons) {
    const paths = cronPathsForBatch(options.runCrons);
    if (paths.length === 0) {
      console.error(`No cron paths for batch: ${options.runCrons}`);
      process.exit(1);
    }

    console.log(`Running ${options.runCrons} (${paths.length} cron routes)…\n`);
    for (const path of paths) {
      const result = await runCron(path, cronSecret!, options.baseUrl);
      console.log(`${path} → HTTP ${result.status}`);
      console.log(JSON.stringify(result.body, null, 2));
      console.log("");
    }
  }

  const eventIds =
    options.assertEvents.length > 0
      ? options.assertEvents
      : PENDING_EMAIL_TRIGGER_EVENT_IDS;

  const rows = await fetchOutboxSince(sinceIso, eventIds);
  const found = new Set(rows.map((row) => row.event_id));

  console.log(`Outbox since ${sinceIso} (last ${options.sinceMinutes}m):\n`);

  let allPass = true;
  for (const eventId of eventIds) {
    const matches = rows.filter((row) => row.event_id === eventId);
    const pass = matches.length > 0;
    if (!pass) allPass = false;
    console.log(
      `${pass ? "✅" : "❌"} ${eventId}  rows=${matches.length}${
        matches[0]
          ? `  status=${matches[0].status}  to=${matches[0].to_email}`
          : ""
      }`,
    );
  }

  if (!allPass) {
    console.log(
      "\nMissing events — seed DB (scripts/dev/email-trigger-seeds.sql) then re-run crons or actions.",
    );
    process.exit(1);
  }

  console.log("\nAll requested event_ids found in notification_email_outbox.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
