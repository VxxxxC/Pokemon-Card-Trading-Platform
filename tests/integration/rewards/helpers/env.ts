import {
  getIntegrationEnv,
  hasBaseIntegrationEnv,
} from "../../shared/env";

export function hasRewardsIntegrationEnv(): boolean {
  return hasBaseIntegrationEnv();
}

export function getRewardsIntegrationEnv() {
  return getIntegrationEnv();
}
