#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  getL2Surfaces,
  loadUiFeatureMap,
  validateUiFeatureMap,
} from "../lib/dev/ui-feature-map";

const ROOT = process.cwd();
const errors: string[] = [];

function collectPartnerSpecs(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const absolute = path.join(dir, entry);
    if (statSync(absolute).isDirectory()) {
      collectPartnerSpecs(absolute, files);
      continue;
    }
    if (entry.endsWith(".spec.ts")) {
      files.push(path.relative(ROOT, absolute).split(path.sep).join("/"));
    }
  }
  return files;
}

function extractFeatureIdsFromSpec(content: string): string[] {
  const match = content.match(/@features\s+([^\n]+)/);
  if (!match?.[1]) {
    return [];
  }
  return [...match[1].matchAll(/F-(?:M|C|A|S)-[\w-]+/g)].map((item) => item[0]!);
}

function extractPartnerId(content: string): string | null {
  const match = content.match(/@partner-id\s+([^\n]+)/);
  return match?.[1]?.trim() ?? null;
}

const mapValidation = validateUiFeatureMap(ROOT);
if (!mapValidation.ok) {
  errors.push(...mapValidation.errors);
}

const map = loadUiFeatureMap();
const mapFeatureIds = new Set(map.features.map((feature) => feature.id));
const l2Surfaces = getL2Surfaces(map.features);
const l2SurfaceKeys = new Set(
  l2Surfaces.map((surface) => `${surface.role}::${surface.path}::${surface.id}`),
);

const partnerDir = path.join(ROOT, "e2e/partner");
if (!existsSync(partnerDir)) {
  errors.push("Missing e2e/partner directory");
} else {
  const partnerSpecsOnDisk = new Set(collectPartnerSpecs(partnerDir));
  const referencedPartnerSpecs = new Set<string>();

  for (const feature of map.features) {
    for (const specPath of feature.partnerSpecs ?? []) {
      referencedPartnerSpecs.add(specPath);
      if (!existsSync(path.join(ROOT, specPath))) {
        errors.push(`${feature.id}: missing partnerSpec file ${specPath}`);
      }
    }
  }

  for (const specPath of referencedPartnerSpecs) {
    if (!partnerSpecsOnDisk.has(specPath)) {
      errors.push(`ui-feature-map references missing partner spec ${specPath}`);
    }
  }

  const pUiRoutes = "e2e/partner/system/p-ui-routes.spec.ts";
  if (!partnerSpecsOnDisk.has(pUiRoutes)) {
    errors.push("Missing L2 inventory spec e2e/partner/system/p-ui-routes.spec.ts");
  } else {
    const content = readFileSync(path.join(ROOT, pUiRoutes), "utf8");
    if (!content.includes("loadUiFeatureMap") || !content.includes("getL2Surfaces")) {
      errors.push("p-ui-routes.spec.ts must scan docs/dev/ui-feature-map.json via getL2Surfaces");
    }
  }

  for (const feature of map.features) {
    if (feature.kind === "headless") {
      continue;
    }
    for (const surface of feature.surfaces ?? []) {
      if (surface.l2 === false) {
        continue;
      }
      const key = `${surface.role}::${surface.path}::${surface.id}`;
      if (!l2SurfaceKeys.has(key)) {
        errors.push(`${feature.id} surface ${surface.id} missing from L2 inventory`);
      }
      if (!surface.requiredElements?.length) {
        errors.push(
          `${feature.id} surface ${surface.id}: L2 surfaces require requiredElements (no shallow smoke)`,
        );
      }
    }
  }

  for (const specPath of partnerSpecsOnDisk) {
    const content = readFileSync(path.join(ROOT, specPath), "utf8");
    const featureIds = extractFeatureIdsFromSpec(content);
    const partnerId = extractPartnerId(content);

    if (specPath.startsWith("e2e/partner/") && !partnerId && specPath !== pUiRoutes) {
      errors.push(`${specPath}: missing @partner-id metadata`);
    }

    for (const featureId of featureIds) {
      if (!mapFeatureIds.has(featureId)) {
        errors.push(`${specPath}: unknown @features id ${featureId}`);
      }
    }
  }
}

const partnerRegressionPath = path.join(ROOT, "docs/dev/partner-regression.md");
if (existsSync(partnerRegressionPath)) {
  const markdown = readFileSync(partnerRegressionPath, "utf8");
  if (!markdown.includes("p-ui-routes")) {
    errors.push("partner-regression.md must document L2 coverage via p-ui-routes");
  }
  if (!markdown.includes("test:ui:check-map")) {
    errors.push("partner-regression.md must document test:ui:check-map gate");
  }
}

if (errors.length > 0) {
  console.error("Partner UI coverage validation failed:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log(
  `Partner UI coverage: OK · features=${map.features.length} · L2 surfaces=${l2Surfaces.length}`,
);
