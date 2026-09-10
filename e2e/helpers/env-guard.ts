const TC_E13_ENV_KEYS = [
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_PASSWORD",
  "E2E_BUYER_EMAIL",
  "E2E_BUYER_PASSWORD",
  "E2E_LISTING_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

export function isFailIfEnvMissingMode(): boolean {
  return (
    process.env.E2E_FAIL_IF_ENV_MISSING === "1" ||
    process.env.PRODUCTION_GATE === "1" ||
    process.env.REWARDS_GATE === "1"
  );
}

export function getMissingEnvKeys(
  keys: readonly string[] = TC_E13_ENV_KEYS,
): string[] {
  return keys.filter((key) => !readEnv(key));
}

export function assertTcE13EnvOrThrow(label = "TC-E13"): void {
  const missing = getMissingEnvKeys();
  if (missing.length === 0) {
    return;
  }

  throw new Error(`[SEC-06] ${label} requires env: ${missing.join(", ")}`);
}

export function guardTcE13EnvInGateMode(): void {
  if (!isFailIfEnvMissingMode()) {
    return;
  }
  assertTcE13EnvOrThrow();
}

export function hasTcE13Env(): boolean {
  return getMissingEnvKeys().length === 0;
}
