import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

function loadEnvFile(fileName: string): void {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) {
    return;
  }

  for (const rawLine of readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const productionGate = process.env.PRODUCTION_GATE === "1";
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries:
    process.env.CI || process.env.REWARDS_GATE || process.env.MODERATION_GATE
      ? 1
      : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    timezoneId: "Asia/Hong_Kong",
    trace: "on-first-retry",
    actionTimeout: 30_000,
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: productionGate ? "bun run start" : "bun run dev",
        url: baseURL,
        reuseExistingServer: productionGate || !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      timeout: 60_000,
    },
    {
      name: "guest",
      testIgnore: [
        /auth\.setup\.ts/,
        /global-chat-realtime\.spec\.ts/,
        /member-trading-p2p\.spec\.ts/,
        /member-trading-smoke\.spec\.ts/,
        /member-offer-negotiation\.spec\.ts/,
        /member-auth-escrow\.spec\.ts/,
        /member-auth-inbound\.spec\.ts/,
        /member-order-detail-auth\.spec\.ts/,
        /e2e\/partner\/(?!system\/(p-ui-routes|p-m0-staging-smoke)\.spec\.ts)(?!member\/p-e04-marketplace-search\.spec\.ts)(?!member\/p-e05-merchant-buy-now\.spec\.ts)(?!member\/p-e12-order-detail-profile\.spec\.ts)/,
      ],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "buyer",
      testIgnore: [
        /auth\.setup\.ts/,
        /global-chat-realtime\.spec\.ts/,
        /member-trading-p2p\.spec\.ts/,
        /member-offer-negotiation\.spec\.ts/,
        /member-inventory\.spec\.ts/,
        /member-auth-escrow\.spec\.ts/,
        /member-auth-inbound\.spec\.ts/,
        /member-order-detail-auth\.spec\.ts/,
      ],
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/buyer.json",
      },
    },
    {
      name: "seller",
      testIgnore: [
        /auth\.setup\.ts/,
        /global-chat-realtime\.spec\.ts/,
        /member-trading-p2p\.spec\.ts/,
        /member-offer-negotiation\.spec\.ts/,
        /member-auth-escrow\.spec\.ts/,
        /member-auth-inbound\.spec\.ts/,
        /member-order-detail-auth\.spec\.ts/,
      ],
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/seller.json",
      },
    },
    {
      name: "chat-realtime",
      testMatch: /global-chat-realtime\.spec\.ts/,
      dependencies: ["setup"],
      timeout: 180_000,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "member-trading",
      testMatch: [
        /member-trading-p2p\.spec\.ts/,
        /member-trading-filters\.spec\.ts/,
        /member-trading-smoke\.spec\.ts/,
        /member-offer-negotiation\.spec\.ts/,
        /member-order-detail-p2p\.spec\.ts/,
        /member-order-detail-auth\.spec\.ts/,
        /member-auth-escrow\.spec\.ts/,
        /member-auth-inbound\.spec\.ts/,
      ],
      dependencies: ["setup"],
      timeout: 480_000,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
