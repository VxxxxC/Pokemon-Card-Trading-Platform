# Variable commission — backend

## Files

| Path | Purpose |
|------|---------|
| `supabase/migrations/20260916120000_platform_financial_commission_config.sql` | Seed `platform_financial_config`, `fn_platform_financial_config()`, `fn_platform_commission_rate()`, RPC wiring |
| `supabase/migrations/20260916130000_platform_settings_service_role_grants.sql` | `GRANT` on `platform_settings` for service-role server actions |
| `app/actions/admin-settings.ts` | Admin read/write + public display helper |
| `lib/platform/financial-config.ts` | Parse/validate/default constants |
| `app/actions/admin-dashboard.ts` | Commission label prefers settings, then 90d weighted avg |

## Migration

1. **Seed** `platform_settings` key `platform_financial_config` → `{ "commissionRate": 0.08 }` (`ON CONFLICT DO NOTHING`).
2. **`fn_platform_commission_rate()`** — reads `value.commissionRate`, validates 1%–20%, fallback `0.08`.
3. **`rpc_confirm_merchant_buyer_receipt`** — `v_commission_rate := fn_platform_commission_rate()` (first snapshot).
4. **`rpc_prepare_merchant_order_payout`** — `v_commission_rate := COALESCE(v_existing_rate, fn_platform_commission_rate())` (honours confirm snapshot through T+7).

## Action contract

```typescript
getPlatformFinancialConfig(): Promise<
  { success: true; data: { commissionRatePercent: number } } | { success: false; error: string }
>

getPlatformCommissionRateForDisplay(): Promise<number>

updatePlatformFinancialConfig(input: { commissionRatePercent: number }): Promise<
  { success: true } | { success: false; error: string }
>
```

- Admin mutations: `requireAdmin` + `isSupabaseConfigured()` guard.
- Store percent as decimal `commissionRate` in JSON; validate 1–20%.

## Verify SQL

```sql
-- After admin sets 10% and buyer confirms:
SELECT commission_rate_applied, commission_amount, item_subtotal
FROM merchant_orders WHERE id = '<order_id>';

-- Rate changed after confirm — prepare must not raise 快照不一致:
SELECT rpc_prepare_merchant_order_payout('<held_order_id>');
SELECT commission_rate_applied FROM merchant_orders WHERE id = '<held_order_id>';
```

## Tests

`tests/integration/merchant/commission-rate.integration.test.ts` — Cases A/B/C (snapshot on confirm, prepare honours snapshot, historical rows unchanged).
