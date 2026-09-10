# Variable appraisal fee — plan

## Goal

Wire admin-configured appraisal fee (`auth_fee_hkd`) as SSOT for all checkout paths and user-facing copy. Snapshot on checkout prepare (`orders.auth_fee`).

## Storage

`platform_settings` key `auth_escrow_config` → `{ sf_leg_fee_hkd, auth_fee_hkd }`

## Locked decisions

| Item | Choice |
|------|--------|
| Default fee | HK$150 |
| Valid range | HK$50–HK$1000 |
| Snapshot timing | Checkout prepare RPC |
| SF leg fee admin UI | Out of scope (seed/default 30) |

## Verify

```bash
bunx supabase db push
bunx vitest run --config vitest.config.mts tests/integration/platform/auth-fee.integration.test.ts
bunx tsc --noEmit
bun run lint
```
