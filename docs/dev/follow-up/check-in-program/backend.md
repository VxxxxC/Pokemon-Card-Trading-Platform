# Check-in Program — backend

## Status

- **Backend:** ✅ Ready
- **Frontend:** ✅ Wired (`CheckInCard`, `/admin/campaigns?tab=check-in`)

## Migrations

| File | Purpose |
|------|---------|
| `20260822120000_check_in_program.sql` | Singleton config, completion template, `execute_daily_check_in` patches |
| `20260822130000_deprecate_check_in_reward_triggers.sql` | Archive STREAK_30; remove check-in triggers from reward-activities admin surface |

| Object | Purpose |
|--------|---------|
| `check_in_program` | Singleton config: daily ladder + completion bonus |
| `CHECK_IN_PROGRAM_COMPLETION` template | `b1000001-0001-4001-8001-000000000020`, `check_in_program_internal` |
| `fn_get_check_in_daily_points` | Read ladder from DB |
| `fn_build_grant_json` | `newly_granted` shape for modal |
| `get_check_in_program_for_member` | Member UI ladder + preview |
| `rpc_admin_get/upsert_check_in_program` | Admin CRUD |
| Patches | `execute_daily_check_in`, `fn_try_auto_grant_rewards`, `get_reward_coupon_center`, admin activity list/get, `fn_validate_reward_template` |

## Deprecated

- `SEED_REWARD_TEMPLATE_IDS.CHECK_IN_DAY7_BONUS` (`...000001`) — archived; replaced by check-in program completion
- `SEED_REWARD_TEMPLATE_IDS.STREAK_30_LUCKY_DRAW` (`...000003`) — archived; 30-day milestone deferred to future check-in program phase
- `check_in_streak` / `check_in_cycle_day` reward-activity triggers — use 簽到計劃 tab only; hidden from admin activity list (including archived filter)

## Issuance vs redemption

- **Pause / completion toggle:** blocks issuance in `execute_daily_check_in` only
- **System template** stays `is_active=true` so issued coupons remain checkout-eligible

## Verify

```bash
bunx supabase db push
bun run supabase:types
```

- Day 7: daily PTS from `daily_rewards` + completion (50 PTS default)
- Internal + legacy check-in templates excluded from locked catalog and admin activities list
- `fn_validate_reward_template` rejects new `check_in_streak` / `check_in_cycle_day` upserts
