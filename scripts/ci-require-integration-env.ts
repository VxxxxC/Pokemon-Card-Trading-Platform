import { hasBaseIntegrationEnv } from "../tests/integration/shared/env";

if (process.env.CI_INTEGRATION_REQUIRED !== "1") {
  console.log(
    "CI integration env guard: skipped (set CI_INTEGRATION_REQUIRED=1 to enforce)",
  );
  process.exit(0);
}

if (!hasBaseIntegrationEnv()) {
  console.error(
    "Integration env incomplete — Vitest suites would skip (false-green).",
  );
  console.error(
    "Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_BUYER_EMAIL, E2E_BUYER_PASSWORD",
  );
  process.exit(1);
}

console.log("CI integration env guard: OK");
