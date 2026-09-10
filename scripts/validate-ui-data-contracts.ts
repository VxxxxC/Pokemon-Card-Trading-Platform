#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  validateUiDataContracts,
  loadUiDataContracts,
} from "../lib/dev/ui-data-contracts";

const result = validateUiDataContracts();
const errors = result.ok ? [] : [...result.errors];

const packageJson = JSON.parse(
  readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
) as { scripts?: Record<string, string> };
const script = packageJson.scripts?.["test:e2e:partner-data-contract"] ?? "";
const contracts = loadUiDataContracts();

for (const contract of contracts.contracts) {
  if (contract.partnerSpec && !script.includes(contract.partnerSpec)) {
    errors.push(
      `test:e2e:partner-data-contract missing partnerSpec ${contract.partnerSpec}`,
    );
  }
}

if (!script.includes("--grep")) {
  errors.push("test:e2e:partner-data-contract must use --grep to scope data-contract tests only");
}

if (errors.length > 0) {
  console.error("UI data contracts validation failed:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

const critical = contracts.contracts.filter((contract) => contract.critical).length;
console.log(
  `UI data contracts: OK · contracts=${contracts.contracts.length} · critical=${critical}`,
);
