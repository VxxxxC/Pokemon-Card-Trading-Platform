#!/usr/bin/env bun
import { loadUiFeatureMap } from "../lib/dev/ui-feature-map";
import {
  getCriticalDataContracts,
  loadUiDataContracts,
} from "../lib/dev/ui-data-contracts";

const map = loadUiFeatureMap();
const contracts = loadUiDataContracts();
const coveredFeatures = new Set(
  contracts.contracts.flatMap((contract) => contract.featureIds),
);

const gaps: string[] = [];
const warnings: string[] = [];

const requiredCoverage: Record<string, string> = {
  "F-M-19": "checkout pricing",
  "F-M-20": "checkout coupon subsidy",
  "F-S-08": "auth escrow checkout",
  "F-M-16": "order detail / invoice",
  "F-M-17": "order detail invoice buyer/seller",
  "F-M-18": "trading list amount",
  "F-C-06": "merchant finance settlement",
};

for (const feature of map.features) {
  const hasPartnerSpecs = (feature.partnerSpecs?.length ?? 0) > 0;
  const hasDataContract = coveredFeatures.has(feature.id);
  const l2Surfaces =
    feature.surfaces?.filter((surface) => surface.l2 !== false) ?? [];
  const executableElements =
    feature.surfaces?.flatMap(
      (surface) =>
        surface.requiredElements?.filter((element) => !element.optional) ?? [],
    ) ?? [];

  if (
    l2Surfaces.length > 0 &&
    executableElements.length === 0 &&
    !hasPartnerSpecs
  ) {
    warnings.push(
      `${feature.id} ${feature.name}: L2 surfaces but no requiredElements or partnerSpecs`,
    );
  }

  const requiredLabel = requiredCoverage[feature.id];
  if (requiredLabel && !hasDataContract) {
    gaps.push(`${feature.id} (${requiredLabel}) missing ui-data-contract`);
  }
}

console.log("=== UI Journey Readiness Audit ===");
console.log(`features=${map.features.length}`);
console.log(`dataContracts=${contracts.contracts.length}`);
console.log(`criticalContracts=${getCriticalDataContracts().length}`);

if (warnings.length > 0) {
  console.log("\nWarnings:");
  for (const warning of warnings.slice(0, 10)) {
    console.log(`  - ${warning}`);
  }
  if (warnings.length > 10) {
    console.log(`  ... +${warnings.length - 10} more`);
  }
}

if (gaps.length > 0) {
  console.error("\nCritical gaps:");
  for (const gap of gaps) {
    console.error(`  - ${gap}`);
  }
  process.exit(1);
}

console.log("\nCritical checkout/order/finance data-contract coverage: OK");
