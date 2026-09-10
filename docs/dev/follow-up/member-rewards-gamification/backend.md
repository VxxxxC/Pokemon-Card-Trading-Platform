# Member Rewards & Gamification — Backend Handoff

## Status

- **Backend:** ✅ Ready (check-in, points ledger, auto-grant templates, coupon inventory RPCs)
- **Frontend:** 🟡 Partial — check-in, 4-tab coupon center (wallet + locked catalog), reward modal wired; missions + checkout redemption pending
- **Partner:** Missions UI, checkout coupon apply, lucky draw v2 (HK licensing) — see [frontend.md](./frontend.md)

## Changelog

### 2026-08-22 — Check-in rewards consolidation

| Change | Detail |
|--------|--------|
| **`20260822130000`** | Archive `STREAK_30`; exclude `check_in_streak` / `check_in_cycle_day` from admin activity list (incl. archived), auto-grant, locked catalog; reject new upserts via `fn_validate_reward_template` |
| **Admin** | 簽到計劃 tab at `/admin/campaigns?tab=check-in`; reward activity form no longer offers check-in triggers |
| **Note** | 稱號「簽到達人」仍由 `gamification_stats` streak 驅動，與 STREAK_30 template 無關 |

### 2026-08-22 — Check-in program MVP (DB-backed ladder + completion)

| Change | Detail |
|--------|--------|
| **`20260822120000`** | `check_in_program` singleton; `execute_daily_check_in` reads ladder from DB; cycle-7 completion via `CHECK_IN_PROGRAM_COMPLETION` internal template; archive `CHECK_IN_DAY7_BONUS` |
| **Admin** | `/admin/campaigns?tab=check-in`, `rpc_admin_upsert_check_in_program` |
| **Member** | `get_check_in_program_for_member`, `CheckInCard` dynamic ladder + paused UI |

### 2026-07-19 — `check_in_cycle_day` progress projected streak (CheckInCard parity)

| Change | Detail |
|--------|--------|
| **`20260719170000`** | When last check-in was yesterday and not yet today, cycle-day progress uses `streak + 1` for cycle position (matches `CheckInCard` `consecutiveDays + 1`) |
| **Bug fixed** | Streak=7, not checked in today → locked tab shows **1/7** not **7/7** at new-cycle boundary |

### 2026-07-19 — `check_in_cycle_day` progress formula

| Change | Detail |
|--------|--------|
| **`20260719160000`** | `fn_reward_template_progress_detail` — `check_in_cycle_day` progress uses `((streak-1)%7)+1` (aligned with `execute_daily_check_in` / `getCheckInCycleDayFromStreak`) |
| **Bug fixed** | Streak=8 (new cycle day 1) no longer shows **7/7** for day-7 locked rewards; shows **1/7** |

### 2026-07-19 — Effective check-in streak (broken-streak UI + admin rewards)

| Change | Detail |
|--------|--------|
| **`20260719150000`** | `fn_effective_check_in_streak`, `fn_sync_broken_check_in_streak`; stats RPC lazy-resets broken streak |
| **TS helper** | `lib/rewards/check-in-streak.ts` — HK timezone effective streak (mirrors DB) |
| **`getGamificationStats`** | Returns effective `currentStreak` for `CheckInCard` 7-day grid |
| **`fn_template_is_eligible` / `fn_reward_template_progress_detail`** | Use effective streak — admin `check_in_streak` + `min_streak: 7` shows `0/7` after gap |
| **Admin template** | `{ "kind": "check_in_streak", "min_streak": 7, "once_per_user": true }` — no new trigger kind needed |

### 2026-07-05 (locked coupon catalog — `get_reward_coupon_center`)

| Change | Detail |
|--------|--------|
| **`20260705188000`** | **`get_reward_coupon_center()`** — returns `{ wallet, locked }`; auto-grant on load |
| **`fn_reward_template_progress_detail`** | Computes `requirement_label`, `progress_label`, `cta_href`, `stock_remaining` per template (ZH copy in DB) |
| **Locked rows** | Active `discount_coupon` / `free_shipping` templates where `fn_template_is_eligible` = false and user has not lifetime-claimed |
| **`get_user_reward_coupons()`** | Now delegates to center — returns `wallet` slice only (backward compat) |
| **`getUserRewardCoupons` action** | Returns `RewardCouponCenterView` — `{ wallet, locked }` via `parseRewardCouponCenter()` |

### 2026-07-05 (coupon inventory + gamification read RPCs)

| Change | Detail |
|--------|--------|
| **`20260705186000`** | `get_user_reward_coupons()` — SECURITY DEFINER join `user_rewards` + `reward_templates`; auto-runs `fn_try_auto_grant_rewards` first |
| **`20260705187000`** | `get_gamification_stats_for_me()` — cold-start stats row + bypass RLS read |
| **`run_auto_grant_rewards_for_me`** | Thin RPC wrapper for `fn_try_auto_grant_rewards(auth.uid())` |
| **`20260705184000`** | Archive all `lucky_draw_ticket` templates; seed **HK$2 profile coupon**; skip lucky draw in auto-grant |

### 2026-07-05 (auto-grant engine)

| Change | Detail |
|--------|--------|
| **`20260705182000`** | `fn_try_auto_grant_rewards`, `fn_issue_reward_from_template`, `user_rewards.acknowledged_at`, `get_unacknowledged_reward_grants`, `acknowledge_reward_grants`; hooks on check-in + order complete |
| **`20260705183000`** | `reward_templates.max_claims` / `claimed_count`; stock checks; seed HK$10 limited coupon |

### 2026-07-05 (points + check-in)

| Change | Detail |
|--------|--------|
| **`20260705180000`** | `reward_type` enum adds `'points'` (separate migration — required before use) |
| **`20260705181000`** | `gamification_stats.points_balance`, `point_ledger`, `fn_apply_point_transaction`, `execute_daily_check_in`, points seed templates |

## Files created / modified (backend track)

| File | Purpose |
|------|---------|
| `supabase/migrations/20260705180000_reward_type_points_enum.sql` | Enum value `points` |
| `supabase/migrations/20260705181000_points_ledger_and_check_in.sql` | Points balance, ledger, check-in RPC |
| `supabase/migrations/20260705182000_auto_grant_rewards.sql` | Auto-grant + notification queue |
| `supabase/migrations/20260705183000_reward_template_claim_limits.sql` | Template stock + eligibility helpers |
| `supabase/migrations/20260705184000_archive_lucky_draw_add_hk2_coupon.sql` | Lucky draw archive + HK$2 coupon seed |
| `supabase/migrations/20260705186000_rpc_get_user_reward_coupons.sql` | Initial coupon inventory RPC (superseded by center) |
| `supabase/migrations/20260705187000_rpc_get_gamification_stats.sql` | Gamification stats read RPC |
| `supabase/migrations/20260705188000_rpc_get_reward_coupon_center.sql` | Wallet + locked catalog + progress detail |
| `app/actions/rewards.ts` | Server action contract (see below) |
| `app/actions/profile.ts` | After profile save → `syncAutoGrantRewards()` + revalidate `/profile/user/rewards` |
| `lib/constants/rewards.ts` | Check-in ladder, template IDs, grant parsers |
| `lib/rewards/mapUserRewardCoupon.ts` | Maps wallet + locked templates → UI shapes (`parseRewardCouponCenter`) |

## DB schema (rewards domain)

### `gamification_stats`

| Column | Notes |
|--------|-------|
| `points_balance` | Running PTS total (updated via `fn_apply_point_transaction`) |
| `current_streak` | Consecutive check-in days (HK timezone) |
| `longest_streak` | All-time max streak |
| `last_check_in` | `timestamptz` — used for “checked in today” |

Row created on first check-in or `get_gamification_stats_for_me()`.

### `point_ledger`

Audit trail for every point change. `source_type`: `daily_check_in`, `reward_template`, `mission_claim`, `admin_adjust`, `redemption`.

RLS: owner `SELECT` only.

### `reward_templates`

Platform-defined grants (points, coupons, free shipping). **Not** 福袋 — see [lucky-bag-listings-v2](../lucky-bag-listings-v2/).

| Column | Notes |
|--------|-------|
| `type` | `reward_type` enum: `points`, `discount_coupon`, `free_shipping`, `lucky_draw_ticket` |
| `reward_value` | JSONB — shape per type (see `lib/constants/rewards.ts`) |
| `trigger_conditions` | JSONB — `kind`: `event_once`, `trade_count`, `check_in_streak`, etc. |
| `max_claims` / `claimed_count` | Limited-stock templates |
| `valid_duration_days` | Expiry offset when issuing `user_rewards` |

### `user_rewards`

Issued grant instances per user.

| Column | Notes |
|--------|-------|
| `grant_dedup_key` | Dedup scope (`lifetime`, cycle key, etc.) |
| `calculated_expiry` | Set from template `valid_duration_days` or `fixed_expiry_date` |
| `is_used` / `used_at` | Coupon redemption (checkout **not wired yet**) |
| `acknowledged_at` | `NULL` = show in `RewardUnlockedModal` queue |

RLS: owner `SELECT` + `UPDATE` (ack only).

**Important:** `reward_templates` has **no** authenticated `SELECT` policy — client must use SECURITY DEFINER RPCs for joins.

## Seed templates (fixed UUIDs)

| ID constant | Title | Trigger |
|-------------|-------|---------|
| `SEED_REWARD_TEMPLATE_IDS.HK2_PROFILE_COUPON` | 平台 HK$2 現金折價券 | `profile_complete` (username + avatar) |
| `SEED_REWARD_TEMPLATE_IDS.LIMITED_HK10_COUPON` | 限量 HK$10 現金券 | `profile_complete` (username + avatar); max 500 |
| `SEED_REWARD_TEMPLATE_IDS.ONBOARD_FIRST_TRADE` | 首筆成交獎勵積分 | `trade_count` buyer ≥ 1 |
| `SEED_REWARD_TEMPLATE_IDS.LIMITED_SPRING_LUCKY_DRAW` | *(archived)* | `is_active = false` |

See `lib/constants/rewards.ts` → `SEED_REWARD_TEMPLATE_IDS`. `LUCKY_DRAW_ARCHIVED = true`.

### 2026-07-06 (points SSOT — mission claim + redemption RPCs)

| Change | Detail |
|--------|--------|
| **`20260706170000`** | `fn_claim_mission_points`, `fn_redeem_member_points` — both delegate to `fn_apply_point_transaction` only |

## Points balance SSOT

| Rule | Detail |
|------|--------|
| **Canonical balance** | `gamification_stats.points_balance` |
| **Audit** | `point_ledger` (`balance_after` per row) |
| **Not balance** | `user_rewards` — grant receipts / coupon instances only |
| **Not on profiles** | Do not add `profiles.points_balance` (dual-write drift) |

All earn/spend paths must call `fn_apply_point_transaction` (directly or via SECURITY DEFINER RPC):

| Path | RPC / function |
|------|----------------|
| Daily check-in | `execute_daily_check_in` |
| Template auto-grant (type=points) | `fn_issue_reward_from_template` |
| Manual template claim | `fn_grant_points_from_template` |
| Mission claim (future UI) | `fn_claim_mission_points` |
| Points spend / redemption (future) | `fn_redeem_member_points` (negative amount internally) |
| Admin adjust (future) | service_role → `fn_apply_point_transaction` with `admin_adjust` |

`fn_apply_point_transaction` is **service_role only** for direct calls; app code uses the RPCs above.


| RPC | Caller | Returns |
|-----|--------|---------|
| `execute_daily_check_in()` | authenticated | `{ success, points_earned, points_balance, current_streak, longest_streak, cycle_day, checked_in_today, newly_granted }` |
| `get_gamification_stats_for_me()` | authenticated | `{ points_balance, current_streak, longest_streak, last_check_in }` |
| `get_user_reward_coupons()` | authenticated | JSON array — **legacy**; wallet slice of center |
| `get_reward_coupon_center()` | authenticated | `{ wallet: [...], locked: [...] }` — **primary** coupon center API |
| `fn_reward_template_progress_detail(user, template)` | service_role | Progress labels for locked catalog rows |
| `get_unacknowledged_reward_grants()` | authenticated | JSON array — `acknowledged_at IS NULL` |
| `acknowledge_reward_grants(p_user_reward_ids uuid[])` | authenticated | `{ success, updated }` |
| `run_auto_grant_rewards_for_me()` | authenticated | JSON array of newly issued grants |
| `fn_grant_points_from_template(p_user_id, p_template_id)` | authenticated | Manual points claim from template |
| `fn_claim_mission_points(p_mission_id, p_points, p_description?)` | authenticated | Mission reward — `mission_claim` ledger row |
| `fn_redeem_member_points(p_amount, p_description?, p_source_ref?)` | authenticated | Spend PTS — `redemption` ledger row (negative amount) |

Check-in ladder (HK timezone, 7-day cycle) must match `CHECK_IN_POINT_LADDER` in `lib/constants/rewards.ts`:

```
Day 1→10, 2→15, 3→20, 4→25, 5→30, 6→40, 7→100 PTS
```

## Server actions (`app/actions/rewards.ts`)

> **Next.js rule:** this file is `"use server"` — export **async functions only** (no `export type`). Import types from `@/lib/constants/rewards` or `@/lib/rewards/mapUserRewardCoupon`.

| Action | RPC / table | Success payload |
|--------|-------------|-----------------|
| `getGamificationStats()` | `get_gamification_stats_for_me` | `{ pointsBalance, currentStreak, longestStreak, lastCheckIn, checkedInToday }` |
| `executeDailyCheckIn()` | `execute_daily_check_in` | `{ pointsEarned, pointsBalance, currentStreak, longestStreak, cycleDay, newlyGranted }` |
| `getUserRewardCoupons()` | `get_reward_coupon_center` | `{ wallet: { redeemable, redeemed, expired }, locked: LockedRewardView[] }` |
| `getUnacknowledgedRewardGrants()` | `get_unacknowledged_reward_grants` | `UnacknowledgedRewardGrant[]` |
| `acknowledgeRewardGrants(ids)` | `acknowledge_reward_grants` | `{ updated }` |
| `syncAutoGrantRewards()` | `run_auto_grant_rewards_for_me` | void (fire-and-forget) |
| `grantPointsFromTemplate(templateId)` | `fn_grant_points_from_template` | `{ pointsGranted, pointsBalance, templateId }` |

All actions return `{ success: false, error: string }` on failure.

### Profile integration

`updateUserProfile` in `app/actions/profile.ts` calls `syncAutoGrantRewards()` after successful save so **HK$2 coupon** can issue when `username` + `avatar_path` are set.

## Auto-grant triggers (current)

| Event | Mechanism |
|-------|-----------|
| Daily check-in | `execute_daily_check_in` → `fn_try_auto_grant_rewards` |
| Order complete | `trg_member_order_complete` → reputation + auto-grant |
| Rewards page load | `get_reward_coupon_center` → auto-grant first |
| Profile settings save | `syncAutoGrantRewards()` server-side |

`profile_complete` eligibility: `profiles.username` non-empty AND `profiles.avatar_path IS NOT NULL`.

## Env / migrations

```bash
bunx supabase db push
bun run supabase:types
```

Required migrations (in order):

- `20260705180000_reward_type_points_enum.sql`
- `20260705181000_points_ledger_and_check_in.sql`
- `20260705182000_auto_grant_rewards.sql`
- `20260705183000_reward_template_claim_limits.sql`
- `20260705184000_archive_lucky_draw_add_hk2_coupon.sql`
- `20260705186000_rpc_get_user_reward_coupons.sql`
- `20260705187000_rpc_get_gamification_stats.sql`
- `20260705188000_rpc_get_reward_coupon_center.sql` — **`get_reward_coupon_center()`** wallet + locked catalog

## How to verify (backend)

### Check-in

```sql
-- As authenticated user in SQL editor (with auth context) or via app
SELECT public.execute_daily_check_in();
SELECT public.get_gamification_stats_for_me();
```

Expect `point_ledger` row with `source_type = 'daily_check_in'`. Second call same day → exception `今日已簽到`.

### Locked catalog row shape (`locked[]`)

Each item includes template metadata plus nested `progress`:

| Field | Example |
|-------|---------|
| `progress.requirement_label` | `完善個人資料（用戶名稱 + 頭像）` |
| `progress.progress_label` | `0 / 1` |
| `progress.cta_href` | `/profile/user/settings` |
| `progress.stock_remaining` | `423` (limited templates) or `null` |

### HK$2 coupon auto-grant

1. Ensure profile has `username` + `avatar_path`.
2. `SELECT public.run_auto_grant_rewards_for_me();`
3. Verify `user_rewards` row for template `a1000001-0001-4001-8001-000000000012`.

### Coupon inventory + locked catalog

```sql
SELECT public.get_reward_coupon_center();
```

Returns `wallet` (issued coupons) and `locked` (active templates user has not yet qualified for, with `progress.requirement_label` + `cta_href`).

Legacy:

```sql
SELECT public.get_user_reward_coupons();
```

Returns only `discount_coupon` and `free_shipping` types.

### Unacknowledged grants

```sql
SELECT public.get_unacknowledged_reward_grants();
```

After `acknowledge_reward_grants(ARRAY['<user_reward_id>'::uuid])`, row should have `acknowledged_at` set.

## Known limitations / v2

| Item | Status |
|------|--------|
| **Lucky draw** | Archived (`lucky_draw_ticket` templates inactive) — HK licensing |
| **Checkout coupon redemption** | `user_rewards.is_used` not enforced in order flow |
| **Missions** | No DB tables — UI mock only |
| **Direct PostgREST join** | Do not query `user_rewards` + embed `reward_templates` from client — use RPCs |

## Related (separate flows)

- **Reputation / titles:** migrations `20260705150000`–`20260705170000`, `lib/constants/titles.ts` — triggered on order complete, reviews, etc.
- **Order complete:** `rpc_complete_member_order` + `trg_member_order_complete` — feeds auto-grant + buyer trade count
