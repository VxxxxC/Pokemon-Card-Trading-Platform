# Variable appraisal fee — backend

## Files

| Path | Purpose |
|------|---------|
| `supabase/migrations/20260917120000_platform_auth_fee_ssot.sql` | `fn_platform_auth_fee_hkd` validation; `fn_merchant_checkout_auth_fee` delegates to settings |
| `lib/platform/auth-escrow-config.ts` | Parse/validate/default/format |
| `lib/platform/resolve-display-auth-fee.ts` | `fetchPlatformAuthFeeHkd`, `resolveAuthFeeFromRow` |
| `app/actions/admin-settings.ts` | Read/write `appraisalFeeHkd` via `auth_escrow_config` merge/insert |

## Action contract

```typescript
getPlatformFinancialConfig(): {
  commissionRatePercent: number;
  appraisalFeeHkd: number;
}

updatePlatformFinancialConfig({
  commissionRatePercent: number;
  appraisalFeeHkd: number;
})

getPlatformAuthFeeForDisplay(): Promise<{ authFeeHkd: number }>
```

## Verify SQL

```sql
UPDATE platform_settings
SET value = jsonb_set(value, '{auth_fee_hkd}', to_jsonb(200::numeric))
WHERE key = 'auth_escrow_config';

SELECT fn_platform_auth_fee_hkd();
SELECT fn_merchant_checkout_auth_fee(true);
```

## Tests

`tests/integration/platform/auth-fee.integration.test.ts`
