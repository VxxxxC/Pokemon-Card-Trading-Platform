import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_MUTATE_TARGETS = [
  "lib/rewards/checkout-subsidy-math.ts",
  "lib/rewards/coupon-expiry.ts",
] as const;

export type RewardsMutationContractResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export function verifyRewardsMutationContract(
  rootDir = process.cwd(),
): RewardsMutationContractResult {
  const errors: string[] = [];

  const strykerPath = path.join(rootDir, "stryker.config.json");
  if (!existsSync(strykerPath)) {
    errors.push("missing stryker.config.json");
  } else {
    try {
      const config = JSON.parse(readFileSync(strykerPath, "utf8")) as {
        mutate?: string[];
      };
      for (const target of REQUIRED_MUTATE_TARGETS) {
        const fullPath = path.join(rootDir, target);
        if (!existsSync(fullPath)) {
          errors.push(`missing mutate target file: ${target}`);
        }
        if (!config.mutate?.includes(target)) {
          errors.push(`stryker.config.json mutate[] must include ${target}`);
        }
      }
    } catch {
      errors.push("stryker.config.json is not valid JSON");
    }
  }

  const vitestMutationPath = path.join(rootDir, "vitest.mutation.config.mts");
  if (!existsSync(vitestMutationPath)) {
    errors.push("missing vitest.mutation.config.mts");
  }

  const packagePath = path.join(rootDir, "package.json");
  if (!existsSync(packagePath)) {
    errors.push("missing package.json");
  } else {
    try {
      const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
        scripts?: Record<string, string>;
      };
      if (!pkg.scripts?.["test:rewards:mutation"]) {
        errors.push("package.json must define test:rewards:mutation");
      }
    } catch {
      errors.push("package.json is not valid JSON");
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}
