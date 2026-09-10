# P2P meetup AML limits — plan

## SSOT

| Layer | Location |
|-------|----------|
| TypeScript | `lib/platform/p2p-aml-config.ts` |
| SQL mirror | `fn_p2p_aml_new_account_grace_days()`, `fn_p2p_aml_meetup_max_new_account_hkd()`, `fn_p2p_aml_meetup_max_no_market_hkd()` |
| Enforcement | `fn_assert_p2p_offer_aml_limits` (make / modify / accept offer, buy now) |

| Constant | Default |
|----------|---------|
| `P2P_NEW_ACCOUNT_GRACE_DAYS` | 14 |
| `P2P_MEETUP_MAX_NEW_ACCOUNT_HKD` | 300 |
| `P2P_MEETUP_MAX_NO_MARKET_PRICE_HKD` | 800 |

Not editable in admin UI. Applies only when `p_use_authentication = false` (面交路徑).

## Legacy error copy (do not change wording)

1. `新註冊帳號（14 天內）面交單筆上限為 HK$300，請降低出價或選用平台鑑定託管。`
2. `此卡牌無市場參考價，超過 HK$800 的面交出價必須啟用平台鑑定託管服務。`

## Change checklist

1. Update constants in `lib/platform/p2p-aml-config.ts`
2. Update literals in SQL mirror functions + `fn_assert_p2p_offer_aml_limits` migration
3. Update unit test message equality + integration parity test
4. `bunx supabase db push` + `bun run supabase:types`

## Verify

```bash
bunx vitest run tests/unit/platform/p2p-aml-config.test.ts
bunx vitest run tests/integration/platform/p2p-aml-limits.integration.test.ts
```

E2E: `e2e/member-offer-negotiation.spec.ts` (HK$300 cap).
