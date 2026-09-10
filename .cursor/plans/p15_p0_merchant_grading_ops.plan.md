# P1.5 + P0 Ops Scripts

## Part A — P1.5 commission-rate soft gate

- `tests/integration/merchant/commission-rate.integration.test.ts`
  - Import `hasMerchantGradingEnvVars`, `warmMerchantGradingEnv`, `merchantIt`
  - `beforeAll`: call `warmMerchantGradingEnv()` when `hasMerchantGradingEnvVars()`
  - Replace 3 `it(...)` with `merchantIt(...)`
  - Keep `describe.skipIf(!hasBaseIntegrationEnv())` (platform_settings tests independent of listing)

## Part B — P0 discover / preflight

### B1 discover enhancements (`scripts/discover-merchant-grading-e2e-listing.ts`)

- When `E2E_LISTING_ID` set: direct lookup → `envListing` detail (persona, sellerId, status, useAuthentication)
- `envAligned`: persona=merchant, seller_id=E2E_SELLER_ID, use_authentication=true, status=active
- `kycBlockers`: human-readable list when KYC not ready
- `nextSteps`: actionable ops steps (KYC, listing, secrets, db push, session)
- **`ok`**: `kycReady && recommendedListingId && (!envListingId || envAligned)` — aligned with verify
- Exit 1 when `!ok`

### B2 preflight script

- `scripts/merchant-grading-e2e-preflight.sh`: discover (|| true) → verify
- `package.json`: `preflight:merchant-grading-e2e`

### B3 prelaunch hook

- `prelaunch-check-env.sh`: on verify failure, auto-run discover before exit 1

### B4 docs

- `prelaunch-gate.md`, `e2e.md`, `backend.md`: preflight vs verify vs skip behavior

## Verification

- `bunx tsc --noEmit`
- `bun run lint`
- `bun run test:integration:merchant-connect-payout` → exit 0 (misaligned env: skips)
- `bun run preflight:merchant-grading-e2e` → discover JSON + verify fail with nextSteps
