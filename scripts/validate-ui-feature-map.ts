#!/usr/bin/env bun
import {
  loadUiFeatureMap,
  validateUiFeatureMap,
} from "../lib/dev/ui-feature-map";

const result = validateUiFeatureMap();
if (!result.ok) {
  console.error("UI feature map validation failed:");
  for (const error of result.errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

const map = loadUiFeatureMap();
const l2Count = map.features.reduce(
  (count, feature) =>
    count + (feature.surfaces?.filter((surface) => surface.l2 !== false).length ?? 0),
  0,
);

console.log(
  `UI feature map: OK · features=${map.features.length} · L2 surfaces=${l2Count}`,
);
