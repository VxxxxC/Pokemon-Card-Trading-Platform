# Platform Rewards v2 — backend

> **Phase 1:** ✅ Partner verified · **Phase 2:** ✅ Partner verified (merchant_direct) · **Phase 2b:** ✅ Partner verified · **Phase 4:** ✅ Partner verified

## Admin activity workflow (2026-08 refactor)

Migration: `supabase/migrations/20260819120000_admin_reward_activity_workflow.sql`

| RPC | Purpose |
|-----|---------|
| `rpc_admin_list_reward_activities` | Join `reward_templates` + optional `reward_campaigns` (1:1) |
| `rpc_admin_get_reward_activity` | Single activity for edit page |
| `rpc_admin_upsert_reward_activity` | Atomic template + campaign upsert |
| `rpc_admin_set_reward_activity_status` | Publish / pause / archive (sync template + campaign) |

**Also in migration:**

- `fn_validate_reward_template` — `flash_only` allows `trigger_conditions.kind = 'none'`
- `UNIQUE (template_id)` on `reward_campaigns`
- `get_reward_coupon_center` — exclude `kind = 'none'` from locked catalog

| Path | Purpose |
|------|---------|
| `app/actions/admin-reward-activities.ts` | Server actions for unified admin UI |
| `lib/admin-rewards/parse-admin-reward-activity.ts` | List/detail parsers |

Legacy `app/actions/admin-rewards.ts` / `admin-reward-campaigns.ts` remain for E2E/RPC compatibility; Admin UI uses activity actions only.

## Trigger expansion (2026-08)

Migration: `supabase/migrations/20260820120000_reward_trigger_events_expansion.sql`  
Cleanup: `supabase/migrations/20260821120000_remove_first_review_event.sql`

| Change | Notes |
|--------|-------|
| `event_once.account_registered` | Signup / profile created (`handle_new_user`); **not** first login. `profiles.created_at >= campaign.starts_at` when window set; else `>= template.created_at` |
| `handle_new_user` | Calls `fn_try_auto_grant_rewards` after signup |
| `fn_reward_auto_grant_in_window` | Optional `reward_campaigns` window for `auto_grant`; no row = perpetual |
| `rpc_admin_upsert_reward_activity` | `auto_grant` may upsert campaign (dates only); flash unchanged |
| `get_reward_coupon_center` | Locked catalog excludes templates past `campaign.ends_at` |

**Removed:** `event_once.first_review` — review RPC no longer triggers auto-grant. Use `trade_count` (buyer, `count: 1`) for 首筆交易.

### Coupon scope

- Members may receive `discount_coupon` / `free_shipping` in wallet from any auto-grant trigger.
- **Redemption:** merchant checkout only (`fn_compute_platform_subsidy`, default `order_kinds: ["merchant"]`). P2P `member_orders` have no coupon checkout path.
- **首筆交易 (Admin):** `trade_count` → role `buyer`, count `1`.

**Admin UI:** [`RewardActivityForm.tsx`](../../../app/admin/campaigns/RewardActivityForm.tsx) — trigger params (`trade_count`, check-in) + optional 活動期限 for `auto_grant`; signup event label「註冊完成」.

## Phase 1 — Admin templates

Migration: `supabase/migrations/20260813120000_platform_rewards_admin_templates.sql`

| Path | Purpose |
|------|---------|
| `app/actions/admin-rewards.ts` | Admin guard + list / upsert / set status |
| `lib/admin-rewards/*` | Types + RPC parsers |
| `app/admin/campaigns/wizard/*` | 3-step wizard (Step 3 campaign placeholder) |

## Phase 2 — merchant_direct checkout coupons

Migrations: `20260815120000_merchant_checkout_coupon.sql`, `20260815130000_fix_fn_compute_platform_subsidy_stable.sql`

### Schema

| Column / object | Notes |
|-----------------|-------|
| `merchant_orders.coupon_user_reward_id` | Selected wallet coupon |
| `merchant_orders.coupon_type` | Snapshot `discount_coupon` / `free_shipping` |
| `merchant_orders.platform_subsidy_amount` | Platform subsidy (default 0) |
| `merchant_orders.buyer_total_amount` | Buyer pays = gross − subsidy |
| `user_rewards.reserved_merchant_order_id` | Reserve at prepare only; `is_used` set on paid webhook |

### SQL functions / RPCs

| Name | Purpose |
|------|---------|
| `fn_compute_platform_subsidy` | Eligibility + subsidy amount (STABLE, no FOR UPDATE) |
| `fn_release_merchant_order_coupon` | Clear order coupon + release reserve |
| `rpc_list_checkout_eligible_coupons` | Checkout picker list + preview |
| `rpc_prepare_merchant_order_payment` | + `p_user_reward_id`; non-auth path |
| `rpc_mark_merchant_order_paid` | Ledger uses `buyer_total_amount`; marks coupon used |
| `rpc_finalize_merchant_pending_payment_expiry` | Releases coupon on expiry |
| `rpc_confirm_merchant_buyer_receipt` / `rpc_prepare_merchant_order_payout` | Payout on gross; allows payout > buyer_total |

### Hard gates (Phase 2 direct)

- `meetup` + `free_shipping` → ineligible
- `requires_authentication: false` coupons blocked on auth orders (Phase 2b opens auth path)
- One coupon per order; prepare reserves only (not `is_used`)

## Phase 2b — merchant_auth checkout coupons

Migrations: `20260816120000_merchant_auth_checkout_coupon.sql` (initial) · **`20260910100000_auth_escrow_phase_d_coupons.sql`** (v2 amount contract)

### Amount semantics (auth + coupon — Phase D / Auth Escrow v2)

| Field | Formula |
|-------|---------|
| `shipping_fee` | **0**（運費在 inbound/outbound legs） |
| `inbound_shipping_fee` / `outbound_shipping_fee` | `fn_compute_auth_escrow_amounts` |
| `total_amount` (gross) | `item_subtotal + auth_fee + inbound + outbound` |
| `platform_subsidy_amount` | Discount on item, or `min(outbound_shipping_fee, max_subsidy_hkd)` for free-shipping |
| `buyer_total_amount` | `total_amount − platform_subsidy_amount` (PI single authorize) |
| `escrow_capture_model` | `'single'` when `p_use_auth=true` (with or without coupon) |

### New / patched RPCs

| Name | Change |
|------|--------|
| `fn_compute_platform_subsidy` | Auth free-shipping uses outbound leg (`fn_platform_auth_sf_leg_fee`) |
| `rpc_list_checkout_eligible_coupons` | Auth preview uses outbound leg |
| `rpc_prepare_merchant_order_payment` | Auth always v2 amounts + single capture with coupon |
| `fn_restore_merchant_order_coupon_on_void` | Grading fail void restores `is_used` |
| `rpc_finalize_auth_grading_fail` | Calls restore on merchant branch |

### Server actions

| Action | Notes |
|--------|-------|
| `listCheckoutEligibleCoupons(orderId, { shippingMethod?, useAuth? })` | Pass `useAuth` for auth toggle preview |
| `createMerchantOrderPaymentIntent(..., { userRewardId?, useAuth })` | Pass coupon id when `useAuth=true` |

## Phase 3 — Flash campaigns

Migration: `supabase/migrations/20260817120000_reward_flash_campaigns.sql`

### Schema

| Table / object | Notes |
|----------------|-------|
| `reward_campaigns` | Schedule window, `max_claims`, `claimed_count`, `max_claims_per_user` |
| `reward_campaign_claims` | Per-user daily audit (`claim_day` HKT) |
| `reward_campaign_status` | `draft` / `active` / `paused` / `ended` |

### SQL functions / RPCs

| Name | Purpose |
|------|---------|
| `rpc_admin_list_reward_campaigns` | Admin paginated list + stock % |
| `rpc_admin_upsert_reward_campaign` | Create/update; validates `flash_only` active template |
| `rpc_admin_set_reward_campaign_status` | Pause / resume / end |
| `rpc_list_active_flash_campaigns` | Member list with countdown fields + `can_claim` |
| `rpc_claim_flash_reward` | Atomic stock increment + issue coupon + claim row |
| `get_reward_coupon_center` (patch) | Excludes `flash_only` from locked catalog |

### Server actions

| Action | Notes |
|--------|-------|
| `listAdminRewardCampaigns`, `upsertAdminRewardCampaign`, `setAdminRewardCampaignStatus` | `app/actions/admin-reward-campaigns.ts` |
| `listActiveFlashCampaigns`, `claimFlashReward` | `app/actions/reward-flash.ts` |

## Migrations / env

```bash
bunx supabase db push
bun run supabase:types
```

## Verify

Partner QA: **[QA_CHECKLIST.md](./QA_CHECKLIST.md)** — Parts A–B verified; Part D (2b) ✅; **Part E (Phase 3) ✅ 2026-07-29**; **Part G (Phase 4) ✅ 2026-08-09**

## Phase 4 — Points redemption catalog

Migrations: `20260910130000`–`20260910130300`

| Table / RPC | Notes |
|-------------|-------|
| `reward_redemption_catalog` | `points_cost`, `stock`, `is_active`; 1:1 with `reward_templates` |
| `rpc_list_points_redemption_catalog` | Member list; `can_redeem` + stock |
| `rpc_redeem_points_catalog_item` | Atomic: deduct PTS + issue coupon + decrement stock |
| `rpc_admin_upsert_reward_activity` (patch) | Catalog sync; `trigger_conditions: none` when catalog enabled |
| `rpc_admin_set_reward_template_status` (patch) | Publish validation includes catalog context |

### Server actions

| Action | Notes |
|--------|-------|
| `listPointsRedemptionCatalog`, `redeemPointsCatalogItem` | `app/actions/rewards.ts` — member persona guard |
| `upsertAdminRewardActivity` (patch) | Strips catalog for non-coupon types; forces trigger `none` |

**Verify:** `bun run test:integration:rewards` → `points-redemption-catalog.integration.test.ts` (I-G1–I-G10)
