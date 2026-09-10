import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type RewardsMatrixBootstrap = {
  stamp: number;
  tradeDiscountTitle: string;
  tradeFreeShipTitle: string;
  tradePointsTitle: string;
  lockedProgressTitle: string;
  flashFreeShipTitle: string;
  tradeDiscountTemplateId: string;
  tradeFreeShipTemplateId: string;
  tradePointsTemplateId: string;
  lockedProgressTemplateId: string;
  flashFreeShipTemplateId: string;
  autoGrantUserId: string;
};

const CACHE_PATH = path.resolve(
  process.cwd(),
  "e2e/.cache/rewards-matrix-bootstrap.json",
);

const BOOTSTRAP_MAX_AGE_MS = 46 * 60 * 60 * 1000;

export function isRewardsMatrixBootstrapFresh(
  bootstrap: RewardsMatrixBootstrap,
): boolean {
  return Date.now() - bootstrap.stamp < BOOTSTRAP_MAX_AGE_MS;
}

export function readRewardsMatrixBootstrap(): RewardsMatrixBootstrap | null {
  if (!existsSync(CACHE_PATH)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      readFileSync(CACHE_PATH, "utf8"),
    ) as RewardsMatrixBootstrap;
    return isRewardsMatrixBootstrapFresh(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeRewardsMatrixBootstrap(
  state: RewardsMatrixBootstrap,
): void {
  mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(state, null, 2), "utf8");
}
