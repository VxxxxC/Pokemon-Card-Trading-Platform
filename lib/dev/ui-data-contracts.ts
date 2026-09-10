import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadUiFeatureMap } from "./ui-feature-map";

const UiDataContractSchema = z.object({
  id: z.string().regex(/^DC-/),
  featureIds: z.array(z.string().regex(/^F-(M|C|A|S)-/)).min(1),
  partnerSpec: z.string().optional(),
  unitSpec: z.string().optional(),
  testPattern: z.string().optional(),
  kind: z.enum(["auth_escrow_breakdown", "pricing_logic", "order_financial"]),
  critical: z.boolean().default(false),
  expected: z
    .object({
      inboundShippingFeeHkd: z.number().optional(),
      outboundShippingFeeHkd: z.number().optional(),
      authFeeHkd: z.number().optional(),
    })
    .optional(),
});

const UiDataContractsFileSchema = z.object({
  version: z.number(),
  contracts: z.array(UiDataContractSchema).min(1),
});

export type UiDataContract = z.infer<typeof UiDataContractSchema>;
export type UiDataContractsFile = z.infer<typeof UiDataContractsFileSchema>;

const CONTRACTS_RELATIVE_PATH = "docs/dev/ui-data-contracts.json";

export function loadUiDataContracts(
  rootDir: string = process.cwd(),
): UiDataContractsFile {
  const filePath = path.join(rootDir, CONTRACTS_RELATIVE_PATH);
  const raw = readFileSync(filePath, "utf8");
  return UiDataContractsFileSchema.parse(JSON.parse(raw));
}

export function validateUiDataContracts(
  rootDir: string = process.cwd(),
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!existsSync(path.join(rootDir, CONTRACTS_RELATIVE_PATH))) {
    return { ok: false, errors: [`Missing ${CONTRACTS_RELATIVE_PATH}`] };
  }

  let contractsFile: UiDataContractsFile;
  try {
    contractsFile = loadUiDataContracts(rootDir);
  } catch (error) {
    return {
      ok: false,
      errors: [
        `Invalid ui-data-contracts.json: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  const map = loadUiFeatureMap();
  const featureIds = new Set(map.features.map((feature) => feature.id));
  const contractIds = new Set<string>();

  for (const contract of contractsFile.contracts) {
    if (contractIds.has(contract.id)) {
      errors.push(`Duplicate data contract id ${contract.id}`);
    }
    contractIds.add(contract.id);

    if (!contract.partnerSpec && !contract.unitSpec) {
      errors.push(`${contract.id}: must declare partnerSpec and/or unitSpec`);
    }

    for (const featureId of contract.featureIds) {
      if (!featureIds.has(featureId)) {
        errors.push(`${contract.id}: unknown featureId ${featureId}`);
      }
    }

    if (contract.partnerSpec) {
      const specPath = path.join(rootDir, contract.partnerSpec);
      if (!existsSync(specPath)) {
        errors.push(`${contract.id}: missing partnerSpec ${contract.partnerSpec}`);
        continue;
      }

      const content = readFileSync(specPath, "utf8");
      if (contract.testPattern && !content.includes(contract.testPattern)) {
        errors.push(
          `${contract.id}: partnerSpec missing testPattern "${contract.testPattern}"`,
        );
      }

      for (const featureId of contract.featureIds) {
        if (!content.includes(featureId)) {
          errors.push(
            `${contract.id}: partnerSpec ${contract.partnerSpec} missing @features ${featureId}`,
          );
        }
      }
    }

    if (contract.unitSpec) {
      const unitPath = path.join(rootDir, contract.unitSpec);
      if (!existsSync(unitPath)) {
        errors.push(`${contract.id}: missing unitSpec ${contract.unitSpec}`);
      }
    }
  }

  const criticalCheckoutFeatures = [
    "F-M-19",
    "F-M-20",
    "F-S-08",
    "F-M-16",
    "F-M-17",
    "F-M-18",
    "F-C-06",
  ];
  for (const featureId of criticalCheckoutFeatures) {
    const covered = contractsFile.contracts.some((contract) =>
      contract.featureIds.includes(featureId),
    );
    if (!covered) {
      errors.push(`Critical feature ${featureId} has no ui-data-contract`);
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

export function getCriticalDataContracts(
  rootDir: string = process.cwd(),
): UiDataContract[] {
  return loadUiDataContracts(rootDir).contracts.filter(
    (contract) => contract.critical,
  );
}
