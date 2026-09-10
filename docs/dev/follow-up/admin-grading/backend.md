# Admin grading workbench — backend

> **Status:** ✅ P1 Ready · 🟡 Partner QA  
> **Refund policy:** [refund-policy §7](../../refund-policy.md#7-s1--鑑定失敗grading-fail) · **Admin 速查:** [REFUND_ADMIN_PLAYBOOK.md](../admin-moderation/REFUND_ADMIN_PLAYBOOK.md)  
> **Partner handoff:** [PARTNER_HANDOFF.md](./PARTNER_HANDOFF.md)

## Files

| Path | Purpose |
|------|---------|
| `supabase/migrations/20260729190000_admin_grading_workbench.sql` | Schema, audit logs, admin RPCs, legacy refund saga, payout/receipt guards |
| `supabase/migrations/20260730100000_escrow_p0_manual_capture.sql` | P0 manual capture: `payment_capture_status`, authorize/auth-fee capture RPCs, grading cancel lock |
| `supabase/migrations/20260731100000_escrow_p1_goods_capture_fail_void.sql` | P1: `grading_fault_party`, goods capture + fail void RPCs, `fully_captured` guards |
| `supabase/migrations/20260811120000_member_order_admin_grading_fail_trigger.sql` | Member auth trigger: admin grading fail prepare/finalize whitelist |
| `lib/payments/stripe-capture-policy.ts` | SSOT for pass/fail Stripe `paymentIntents.capture` params + idempotency keys |
| `lib/payments/auth-capture-saga.ts` | Admin intake auth-fee capture saga |
| `lib/payments/goods-capture-saga.ts` | Admin pass goods capture saga |
| `lib/payments/auth-grading-fail-void-saga.ts` | Admin fail void uncaptured balance saga |
| `app/actions/admin-grading.ts` | Production admin guard + queue search + mutations |
| `app/api/stripe/webhook/route.ts` | `payment_intent.succeeded` partial capture finalize; `payment_intent.canceled` void sync |
| `supabase/migrations/20260901140000_auth_escrow_single_capture.sql` | Single-capture auth escrow: intake no capture, pass full capture |
| `supabase/migrations/20260901160000_admin_auth_pass_grading.sql` | `auth_grading_company` / `auth_grading_score`; grading required on pass RPCs |
| `supabase/migrations/20260901170000_admin_grading_fail_single_capture_fix.sql` | Restore admin grading-fail trigger whitelist; single-capture `rpc_finalize_auth_grading_fail` |
| `supabase/migrations/20260912120000_grading_fail_buyer_fault_single.sql` | PR2: buyer fault `capture_auth_fee_only`; seller settlement restore; `search_admin_grading_orders` preview fields |
| `supabase/migrations/20260912130000_grading_fail_member_trigger_bypass.sql` | Re-restore admin grading-fail trigger whitelist after moderation migration regression |

| `supabase/migrations/20260925120000_admin_grading_outbound_trigger_bypass.sql` | `grading.admin_outbound` GUC + restore shipped `outbound_tracking_no IS DISTINCT FROM` |
| `supabase/migrations/20260926120000_grading_fail_hardening.sql` | `grading.order_fail` GUC；cancel webhook race guard；buyer-fault coupon policy；fail webhook finalize |
| `supabase/migrations/20260926130000_grading_fail_coupon_restore_guc.sql` | Coupon restore under `grading.order_fail` GUC (admin finalize path) |
| `supabase/migrations/20260926140000_restore_confirm_fully_captured_guard.sql` | `rpc_confirm_buyer_received` requires `fully_captured` + FPS hold fields |
| `supabase/migrations/20260926150000_grading_fail_carrier_liability.sql` | `p_carrier_liability_party` on prepare; carrier(seller) receivable via `fn_compute…applies`; legacy carrier settlement |

## Migrations / env

- Push: `bunx supabase db push`
- Regenerate types: `bun run supabase:types`
- Stripe webhook: `bun run stripe:webhook:sync`（Dashboard）或 `bun run stripe:webhook:listen`（本機）；事件清單見 `lib/stripe/webhook-events.ts`
- Uses existing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

## Admin action contract

All exports return `{ success: true, data } | { success: false, error }`.

| Action | RPC / Stripe | Notes |
|--------|--------------|-------|
| `searchAdminGradingOrders` | `search_admin_grading_orders` | Tabs: `awaiting_intake \| grading \| awaiting_outbound \| closed` |
| `adminConfirmGradingIntake` | **single:** `rpc_prepare_auth_intake_confirm` → optional re-auth (`auth-authorization-refresh`) → `rpc_finalize_auth_intake_confirm`（**no Stripe capture**） · **legacy:** `rpc_prepare_auth_fee_capture` → partial capture → `rpc_finalize_auth_fee_capture` | 分流：`rpc_get_auth_escrow_capture_model`（admin SECURITY DEFINER，唔經 participant RLS）；single: `authorized` + `platform_received_at`；legacy: `auth_fee_captured` |
| `adminPassGrading` | `rpc_prepare_goods_capture(p_auth_grading_*)` → `stripe.paymentIntents.capture` → `rpc_finalize_goods_capture` | **Required** `gradingOptionId` (non-RAW `GRADING_OPTIONS`); persists `auth_grading_*`. **single:** full `buyer_total`, **omit** `final_capture`; **legacy:** goods leg + `final_capture: true` |
| `adminSubmitGradingOutbound` | `rpc_admin_submit_grading_outbound` | Requires `auth_result=passed` |
| `adminFailGradingAndRefund` | `rpc_prepare_auth_grading_fail` → single buyer: `capture(auth_fee)` · single other: `PI.cancel` · legacy: `capture(0)` → `rpc_finalize_auth_grading_fail` | single buyer: retain D; single seller: void + receivable |
| `getAdminGradingAuditHistory` | `get_admin_grading_audit_history` | Admin read via session client |

Admin-triggered sagas (`run*Saga`) use session `createClient()` for prepare/finalize RPCs (`_grading_require_admin()` needs `auth.uid()`). Webhook `finalize*FromWebhook` and `rpc_mark_auth_grading_fail_failed` use service-role `createAdminClient()`.

**Capture model:** 新單 `escrow_capture_model = 'single'`（migration `20260901140000`）— 入庫不 capture；pass 一次扣全額。Legacy `NULL` 仍 multicapture；見 [PARTNER_HANDOFF](./PARTNER_HANDOFF.md)。

### Stripe capture policy (`lib/payments/stripe-capture-policy.ts`)

| Helper | Path | `final_capture` |
|--------|------|-----------------|
| `buildAuthFeeOnlyCaptureParams` | Buyer-fault fail | `single` → omit；legacy → `true` |
| `buildGoodsCaptureParams` | Pass grading | `single` → omit；legacy → `true` |
| `buildCaptureZeroParams` | Legacy fail void | always `true` + `amount_to_capture: 0` |
| `buildAuthGradingFailIdempotencyKey` | Fail saga | single buyer fault → `...:single:...` |

Legacy intake (`auth-capture-saga.ts`) stays out of this SSOT (`final_capture: false`).

### Trigger change checklist

When editing `fn_enforce_member_order_transitions`, verify:

| Path | Actor | GUC / bypass |
|------|-------|----------------|
| Checkout prepare | Buyer | Column whitelist in trigger |
| Grading fail prepare/finalize | Admin RPC | **`grading.order_fail` GUC** (primary, `20260926120000`) + `is_admin()` blocks (secondary) |
| **Outbound tracking** | Admin RPC | `grading.admin_outbound` (migration `20260925120000`) |
| Shipped outbound update | Any allowed actor | `NEW.outbound_tracking_no IS DISTINCT FROM OLD.outbound_tracking_no` |

Merchant outbound uses `merchant_orders` — not subject to member trigger.

## Fail / void policy (P1)

> **Target breakdown:** [refund-policy §7](../../refund-policy.md#7-s1--鑑定失敗grading-fail) · **現況 vs target:** [§12](../../refund-policy.md#12-實作對照與缺口)

| 路徑 | 現行 code | Target |
|------|-----------|--------|
| **single + buyer fault** | `capture(D)` omit `final_capture` | Capture D only，釋放 A+B+C | ✅ PR2 |
| **single + seller fault** | `PI.cancel` 全釋 → 追賣家 | ✅ 一致 |
| **legacy + seller fault** | `refund(D+B)` + `capture(0)` | ✅ 大致一致 |
| **legacy + other fault** | `capture(0)` only | 見 refund-policy §7.3 |

- `fault_party` enum: `buyer | seller | platform | carrier | inconclusive` (required on fail)
- Idempotency keys:
  - single buyer fault capture: `auth-grading-fail:capture_auth_fee_only:single:{orderKind}:{orderId}`（bump 避免舊 `final_capture` 失敗請求 cache 衝突）
  - legacy `capture_zero`: `auth-grading-fail:capture_zero:{orderKind}:{orderId}`
  - cancel: `auth-grading-fail:cancel:{orderKind}:{orderId}`
- Legacy `rpc_finalize_auth_refund` + `refund.created` webhook kept for manual recovery only
- **Coupon on fail:** `rpc_finalize_auth_grading_fail` restores coupon only when `fault_party != buyer`；buyer fault 保留 `is_used`
- **Carrier fail:** `fault_party=carrier` 必填 `carrier_liability_party`（`seller` | `platform`）；`fn_compute_seller_grading_fail_liability.applies` 決定 receivable（seller 或 carrier+seller logistics）
- **Platform fail:** `fault_party=platform` 時 Admin action 必填 `reason`（對齊 S3 `platformFaultReason`）
- **Buyer-fault fail refresh:** `runAuthGradingFailVoidSaga` calls `ensureAuthEscrowAuthorizationFresh` after prepare when single + `capture_auth_fee_only`
- **`payment_intent.succeeded`** with `capture_stage=auth_grading_fail` → `finalizeAuthGradingFailFromWebhook`（metadata `order_kind=auth_grading_member|merchant`）

## Recovery（single buyer fault Stripe 失敗後）

若 Admin fail 報 `doesn't support multi-capture` / `final_capture`，訂單可能 `refund_status = failed` 而 PI 仍 `authorized`：

1. **SQL 確認** 可 retry：`escrow_status = grading`、`payment_capture_status = authorized`、`refund_status IN ('none','failed')`、`auth_result IS NULL`
2. **`processing` 卡住**：service_role 調 `rpc_mark_auth_grading_fail_failed(orderKind, orderId, 'manual reset')`
3. 部署 fix 後 Admin **重試**買家責任 fail（新 idempotency key 含 `:single:`）
4. **Fallback**：Stripe Dashboard 手動 capture 鑑定費 D → `rpc_finalize_auth_grading_fail`；或 replay `payment_intent.succeeded` webhook（`auth_grading_fail`）

**Seller-fault cancel 競態（webhook 先到）：**

1. `rpc_mark_auth_order_payment_voided` **skip** when `refund_status=processing`（`20260926120000`）
2. `rpc_finalize_auth_grading_fail` accepts `payment_capture_status IN (authorized, voided)` during processing
3. Retry finalize RPC if saga failed after `PI.cancel`

**Outbound retry（保安攔截後）：**

1. 確認 migration `20260925120000` 已 push
2. 訂單須 `escrow_status = shipped`、`auth_result = passed`
3. Admin 重試 `rpc_admin_submit_grading_outbound`（GUC bypass 僅 transaction-local）

## Guards added

- `fn_enforce_member_order_transitions`: admin (`is_admin()`) may update member auth orders during grading fail prepare (`pending/grading` metadata only) and finalize (`pending+grading` → `cancelled`, `auth_result=failed`); `rpc_admin_submit_grading_outbound` sets `grading.admin_outbound` GUC for outbound tracking updates
- `rpc_confirm_buyer_received`: `auth_result=passed` + `outbound_tracking_no` + `payment_capture_status=fully_captured`
- `rpc_prepare_merchant_order_payout`: auth orders require `fully_captured` + `authenticated` + outbound tracking
- `rpc_mark_auth_order_payment_voided`: skips when `refund_status=processing` (grading fail in flight); otherwise sets `voided` when `authorized`

## Verify (backend)

1. Non-admin session → all admin RPCs reject
2. Member: custody → intake → pass (`fully_captured`) → outbound → buyer confirm
3. Merchant auth: intake → pass → outbound → buyer confirm → payout (`G-W2M`)
4. Fail on 100+30+150: captured 150 only; listing `active`; `fault_party` stored; no「保安攔截」on member orders
5. `bun run test:integration:grading` — case matrix:

| Case | Coverage |
|------|----------|
| G-W1 / G-W2 | Member outbound + full happy path |
| G-W2M | Merchant auth happy path（**merge 前**：`E2E_SELLER_EMAIL` user === `E2E_SELLER_ID` === `E2E_LISTING_ID.seller_id`；KYC payout-ready） |
| G-BF4M | Merchant seller-fault fail → `voided` + `merchant_ledgers.grading_fail_recovery` |
| G-BF1M / G-BF3M | Merchant buyer-fault fail → `capture_auth_fee_only` / `auth_fee_captured`（無 ledger） |
| G-BF6M–8M | Merchant carrier liability → `merchant_ledgers`（非 `seller_receivables`） |
| G-C1M / G-C2M | Merchant grading fail coupon restore / keep-used |
| G-CONF1M | Merchant `rpc_confirm_merchant_buyer_receipt` 需 `fully_captured` |
| G-BF1–5 / G-C1–2 | Member fail + coupon |
| G-BF6–8 | Carrier liability |
| M1–M4 | Connect payout pipeline（gate: `test:integration:merchant-connect-payout`）；M4 = seller-fault recovery 抵扣，需 `rpc_admin_clear_seller_settlement` |
| I-H15M / I-H15bM / I-H16M | Merchant auth moderation carrier / inconclusive → `merchant_ledgers` |
| G-CONF1 | Member confirm requires `fully_captured` |
| G-LF1 / G-LF2 | Legacy multicapture seller-fault fail |
| G-CAN1–3 | Pre-intake / grading / post-intake cancel guards |
| Unit | stripe-capture-policy, fail saga, webhook, goods-capture-saga |

**Note:** G-BF6M carrier `grading_fail_recovery` ledger does **not** enter connect payout deduction (`fn_merchant_unsettled_grading_recovery` only includes `fault_party=seller` + `seller_settlement_status=cleared`). Env misaligned 時 merchant cases **skip**（`warmMerchantGradingEnv` / `merchantIt`，含 commission-rate）；`discover`（`ok` + `envAligned` + `nextSteps`）、`preflight:merchant-grading-e2e`、`verify:merchant-grading-e2e` / prelaunch 仍严格 fail。

6. Dev sign-off: `bash scripts/grading-release-gate.sh`（有 env 時含 stripe smoke）
7. **Moderation migration PRs:** `bash scripts/moderation-release-gate.sh`（含 `test:integration:grading`）；CI: `.github/workflows/moderation-integration.yml`
8. Webhook replay `payment_intent.succeeded` (goods / auth_grading_fail) idempotent
9. `bunx tsc --noEmit`, `bun run lint`, `bun run build:ci`
