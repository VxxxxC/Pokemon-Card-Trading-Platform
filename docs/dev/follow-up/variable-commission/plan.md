# Variable Commission — Admin Settings SSOT

## Goal

Replace hardcoded 8% merchant B2C commission with `platform_settings.platform_financial_config` (Admin Settings SSOT). Snapshot rate + amount on **buyer confirm** (`rpc_confirm_merchant_buyer_receipt`). Historical orders are not backfilled.

## Locked decisions

| Item | Choice |
|------|--------|
| Default rate | 8% (`0.08` decimal) |
| Snapshot timing | Buyer confirm — not checkout |
| Scope | Merchant B2C commission only |
| Out of scope | Appraisal fee, auth fee, member FPS, `/terms` copy |

## Acceptance checklist

- [ ] Admin changes rate in `/admin/settings` → persisted in `platform_settings`
- [ ] New buyer-confirmed orders snapshot new rate + `commission_amount`
- [ ] Orders confirmed before a rate change still prepare at snapshot rate (T+7 `rpc_prepare_merchant_order_payout`)
- [ ] Transferred orders unchanged after settings update
- [ ] No `COMMISSION_RATE = 0.08` in payout path; RPC reads `fn_platform_commission_rate()`
- [ ] Dashboard revenue totals still from `SUM(commission_amount)` snapshots
- [ ] Seed default 8% when settings row missing

## Verify

```bash
bunx supabase db push
bunx vitest run --config vitest.config.mts tests/integration/merchant/commission-rate.integration.test.ts
bunx tsc --noEmit
bun run lint
bun run build:ci
```

```sql
SELECT value FROM platform_settings WHERE key = 'platform_financial_config';
SELECT public.fn_platform_commission_rate();
```

See [backend.md](./backend.md) · [frontend.md](./frontend.md).
