import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  Object.assign(process.env, env);

  return {
    resolve: {
      alias: {
        "@": rootDir,
      },
    },
    test: {
      environment: "node",
      setupFiles: ["tests/integration/shared/vitest.setup.ts"],
      include: ["tests/unit/moderation/**/*.test.ts"],
      fileParallelism: false,
      testTimeout: 120_000,
      hookTimeout: 120_000,
      env: {
        MODERATION_PBT_NUM_RUNS: "25",
      },
    },
  };
});
