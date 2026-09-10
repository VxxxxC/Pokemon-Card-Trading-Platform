# Auth Escrow v2 — Backend

> **Status:** 🟢 Phase B + single capture (v2.1) · **Phase C:** ✅ implemented · **Phase D:** ✅ implemented  
> **Migration:** `20260901120000`–`20260901170000`, `20260902100000`, **`20260910100000_auth_escrow_phase_d_coupons.sql`**  
> **Plan:** [plan.md](./plan.md) · **Blocks:** [Platform Rewards v2 Phase 2b](../platform-rewards-v2/plan.md)  
> **Policy SSOT (pending v0.2):** [escrow-payment-policy.md](../../escrow-payment-policy.md)

## Overview

鑑定託管金流 v2：Member 鑑定 + Merchant 鑑定兩類；全程順豐；平台固定單程運費；兩段運費 snapshot；**pass 單次 full capture**；賣方責任鑑定失敗時買家全退 + 賣方追償。

**Phase B** 已 patch prepare / payout（無券）。**v2.1（`20260901140000`）** 新單 `escrow_capture_model = 'single'`；在途 NULL 仍 staged multicapture。**Phase D（`20260910100000`）** 鑑定用券亦寫入 v2 四行金額 + `escrow_capture_model = 'single'`（有冇券一致）。

---

## Phase A — Migration

### Enums

| Enum | Values |
|------|--------|
| `seller_settlement_status` | `none`, `pending`, `cleared`, `waived` |
| `seller_receivable_status` | `pending`, `paid`, `waived`, `cancelled` |
| `transaction_type` | + `grading_fail_recovery`（Phase C merchant ledger） |

### `member_orders` / `merchant_orders` (new columns)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `inbound_shipping_fee` | `NUMERIC NOT NULL` | `0` | 賣家 → 平台（順豐單程） |
| `outbound_shipping_fee` | `NUMERIC NOT NULL` | `0` | 平台 → 買家（順豐單程） |
| `seller_settlement_status` | `seller_settlement_status` | `none` | 鑑定失敗追償 gate（Phase C） |

**`member_orders` only:**

| Column | Type | Default |
|--------|------|---------|
| `buyer_total_amount` | `NUMERIC` | `NULL` | Phase B：`total_amount − subsidy`；NULL 時視同 `total_amount` |

**保留：** `merchant_orders.shipping_fee` 不刪除 — 非鑑定直發與舊版 auth 用券路徑仍使用；Phase B 鑑定單以 `inbound_*` / `outbound_*` 為準。

### `platform_settings`

| Key | JSON | Purpose |
|-----|------|---------|
| `auth_escrow_config` | `{ "sf_leg_fee_hkd": 30, "auth_fee_hkd": 150 }` | 鑑定單順豐單程運費 + 鑑定費（與 `fps_payout_config` 分開） |

### SQL helpers (read-only)

| Function | Returns | Fallback |
|----------|---------|----------|
| `fn_platform_auth_escrow_config()` | `JSONB` | `{}` |
| `fn_platform_auth_sf_leg_fee()` | `NUMERIC` | `30` |
| `fn_platform_auth_fee_hkd()` | `NUMERIC` | `150` |

Grant: `authenticated`, `service_role`.

### `seller_receivables`

Member 賣家鑑定失敗追償（Merchant 主要用 `merchant_ledgers` Phase C）。

| Column | Notes |
|--------|-------|
| `order_kind` | `'member'` \| `'merchant'` |
| `order_id` | UUID |
| `seller_id` | FK `profiles` |
| `amount_hkd` | `> 0` |
| `status` | `seller_receivable_status` |
| `fps_reference`, `stripe_fee_hkd`, `notes` | Admin 人手 FPS |
| `paid_at`, `paid_by` | 結清記錄 |

**Constraints:** `UNIQUE (order_kind, order_id)`

**RLS:**

- Seller: `SELECT` own rows
- Admin: `is_admin()` ALL
- Writes: Phase C via `service_role` / admin RPC（無 client INSERT）

---

## Amount formulas (Phase B — implemented)

```text
inbound_shipping_fee  = fn_platform_auth_sf_leg_fee()
outbound_shipping_fee = fn_platform_auth_sf_leg_fee()
auth_fee              = fn_platform_auth_fee_hkd()

total_amount     = item_subtotal + auth_fee + inbound_shipping_fee + outbound_shipping_fee
buyer_total_amount = total_amount - platform_subsidy_amount   -- Phase D 用券
```

Checkout breakdown 四行：卡價、鑑定費、運費（入庫段）、運費（出庫段）。

---

## Capture model (v2.1 — single capture for new orders)

| Column | Values |
|--------|--------|
| `member_orders.escrow_capture_model` | `'single'` = 新單；`NULL` = legacy staged |
| `merchant_orders.escrow_capture_model` | 同上（v2 鑑定 checkout 寫入 `single`，**有冇券**一致 — Phase D） |

### Single capture (`escrow_capture_model = 'single'`)

| Step | Stripe | `payment_capture_status` |
|------|--------|--------------------------|
| Checkout | authorize `buyer_total` | `authorized` |
| 入庫 | **no capture**；可 `re-auth` PI | `authorized`（`platform_received_at` 有值） |
| 鑑定通過 | `capture(buyer_total, final_capture: true)` | `fully_captured` |
| 鑑定失敗（入庫後） | `cancel` PI | `voided` |

**RPCs:** `rpc_prepare_auth_intake_confirm` / `rpc_finalize_auth_intake_confirm`；`rpc_refresh_auth_escrow_payment_intent`（re-auth 換掛）。

**Sagas:** `lib/payments/auth-intake-confirm-saga.ts`，`lib/payments/auth-authorization-refresh.ts`；`adminConfirmGradingIntake` 依 `escrow_capture_model` 分流。

### Legacy staged multicapture (`escrow_capture_model IS NULL`)

| Step | Capture | `payment_capture_status` |
|------|---------|--------------------------|
| 入庫 | `auth_fee + inbound_shipping_fee` | `auth_fee_captured` |
| 鑑定通過 | `buyer_total - auth_fee - inbound` | `fully_captured` |

**RPCs:** `rpc_prepare_auth_fee_capture` / `rpc_finalize_auth_fee_capture`（unchanged for legacy).

---

## Fail & settlement (Phase C ✅)

**賣方責任（`fault_party = seller`）MVP：**

| Model | Stripe saga | Seller liability |
|-------|-------------|------------------|
| **single** | PI `cancel` | `buyer_total_amount` |
| **legacy** | `refund(auth_fee + inbound)` then `capture(0)` | refunded buyer amount |

1. `rpc_finalize_auth_grading_fail` → Member `seller_receivables` / Merchant `merchant_ledgers` `grading_fail_recovery`
2. `seller_settlement_status = pending` → Admin **待追償** → `rpc_admin_clear_seller_settlement` → `cleared`
3. `rpc_admin_submit_seller_return_tracking` → sets `outbound_tracking_no` (seller return)

**Migration:** `20260902100000_auth_escrow_phase_c_settlement.sql`  
**Saga:** `lib/payments/auth-grading-fail-void-saga.ts` (legacy refund before capture zero)  
**Admin:** `adminClearSellerSettlement`, `adminSubmitSellerReturnTracking`, tab `awaiting_settlement`

---

## Merchant Connect recovery deduction (post-Phase C ✅)

**Migration:** `20260909100000_merchant_payout_recovery_enum.sql` + `20260909110000_merchant_payout_recovery_deduction.sql`

At T+7 `rpc_prepare_merchant_order_payout`, FIFO deduct unsettled `grading_fail_recovery` debt (merchant-level). Stripe transfers **net**; debt > gross → **$0 transfer**, order still completes, remainder carries to next payout.

| Column / enum | Purpose |
|---------------|---------|
| `merchant_payout_gross` | Snapshot at buyer confirm (pre-deduction) |
| `merchant_payout_amount` | Net transfer amount (forced at prepare) |
| `grading_fail_recovery_applied` | Cumulative positive ledger on recovery order (UPSERT per `order_id`) |

| RPC / helper | Notes |
|--------------|-------|
| `fn_merchant_unsettled_grading_recovery(merchant_id)` | FIFO open debts (`cleared` + failed seller fault) |
| `rpc_confirm_merchant_buyer_receipt` | Auth gross uses `inbound_shipping_fee`; writes `merchant_payout_gross` |
| `rpc_prepare_merchant_order_payout` | Returns `recovery_applications[]`, `recovery_deduction_total` |
| `rpc_finalize_merchant_order_payout(..., p_recovery_applications)` | UPSERT applied rows; allows null `p_transfer_id` when net = 0 |

**Saga:** `lib/merchant-order/execute-connect-payout.ts` — skip Stripe when net = 0, pass `p_recovery_applications` to finalize.

### Partner QA (2-order scenario)

1. Merchant M: auth fail order A → `grading_fail_recovery = -289`, admin `cleared` + return tracking.
2. Success order B: buyer confirm → `merchant_payout_gross` = gross, `held`.
3. T+7 cron: prepare B → `merchant_payout_amount = 0`, `recovery_applications = [{A, 72}]` (example).
4. Saga: no Stripe transfer; finalize writes `grading_fail_recovery_applied +72` on A.
5. Remaining debt on A = 289 − 72 = **217**; next order C clears remainder when gross ≥ 217.

```sql
SELECT order_id, transaction_type, amount
FROM merchant_ledgers
WHERE merchant_id = '<merchant_id>'
  AND transaction_type IN ('grading_fail_recovery', 'grading_fail_recovery_applied')
ORDER BY created_at;
```

---

## Files (Phase B)

| Area | Paths |
|------|-------|
| Migration | `20260901130000_auth_escrow_v2_phase_b.sql` — `fn_compute_auth_escrow_amounts`, prepare/capture/payout RPCs |
| Actions | `app/actions/member-auth-checkout.ts`, `app/actions/merchant-checkout.ts` |
| Checkout UI | `lib/checkout/*`, `app/checkout/[id]/*` |
| Defaults | `lib/auth-escrow/defaults.ts` |

## Files (future phases)

| Phase | Paths |
|-------|-------|
| C | `20260902100000_auth_escrow_phase_c_settlement.sql`, `lib/payments/auth-grading-fail-void-saga.ts`, `app/actions/admin-grading.ts`, `AdminGradingClient.tsx` |
| D | `fn_compute_platform_subsidy`（免運只減 outbound）、Rewards Phase 2b 解鎖 |

---

## Verify (Phase B)

```bash
bunx supabase db push
bun run supabase:types
```

SQL smoke (new member auth order, item $100):

```sql
SELECT public.rpc_prepare_member_auth_order_payment('<order_id>');
-- total_amount=310, inbound=outbound=30, buyer_total=310
SELECT public.fn_compute_auth_escrow_amounts(100);
```

```bash
bunx tsc --noEmit
bun run build:ci
bun run test:auth-escrow:gate
```

**Partner QA:** [PARTNER_QA.md](./PARTNER_QA.md) · [frontend.md](./frontend.md) · multicapture amounts in [PARTNER_HANDOFF](../admin-grading/PARTNER_HANDOFF.md)

## Verify (Phase A)

```bash
bunx supabase db push          # local
bun run supabase:types
```

SQL smoke:

```sql
SELECT public.fn_platform_auth_sf_leg_fee();   -- expect 30
SELECT public.fn_platform_auth_fee_hkd();      -- expect 150
SELECT key, value FROM platform_settings WHERE key = 'auth_escrow_config';
```

```bash
bunx tsc --noEmit
bun run build:ci
bun run test:auth-escrow:gate
```

**Partner QA:** Phase A 無人手驗收項。

---

## Changelog

| Date | Change |
|------|--------|
| 2026-09-18 | **`20260918120000`** — `fn_release_member_order_coupon` skips no-op `member_orders` UPDATE when coupon state already cleared; fixes buyer **no-coupon** `rpc_prepare_member_auth_order_payment` (`保安攔截：買家操作不合法`). Tests: `member-auth-coupon` I-F0/I-F0b, `auth-fee` Case G. |
| 2026-08-08 | Phase B — checkout amounts, multicapture split, payout inbound, checkout UI |
| 2026-08-08 | Phase A — migration + backend handoff |
