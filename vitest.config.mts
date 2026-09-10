import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv(process.env.MODE ?? "test", rootDir, "");
Object.assign(process.env, env);

export default defineConfig({
    resolve: {
      alias: {
        "@": rootDir,
      },
    },
    test: {
      environment: "node",
      setupFiles: ["tests/integration/shared/vitest.setup.ts"],
      include: [
        "tests/integration/**/*.integration.test.ts",
        "tests/unit/**/*.test.ts",
      ],
      fileParallelism: false,
      testTimeout: 120_000,
      hookTimeout: 120_000,
    },
});
