# PR2 — S1 buyer fault grading fail (retain D)

**SSOT:** `docs/dev/refund-policy.md` §7.2 · **Rollout:** `docs/dev/follow-up/refund-policy-rollout-plan.md`

## Execution checklist (review must-fix 1–5)

- [x] **1. parsePreparePayload** — three-value `void_mode` (`cancel` | `capture_zero` | `capture_auth_fee_only`); no silent `capture_zero` for buyer fault
- [x] **2. Admin queue `escrow_capture_model`** — `search_admin_grading_orders` + `AdminGradingQueueRow` (+ inbound/outbound shipping, `buyer_total_amount`)
- [x] **3. formatRefundPreview** — member v2: `buyer_total - auth_fee` for single capture refund preview
- [x] **4. finalize `payment_capture_status`** — buyer fault → `auth_fee_captured`; other single faults → `voided`
- [x] **5. Seller settlement** — restore Phase C receivable/ledger in `rpc_finalize_auth_grading_fail` (coupon restore)

## Follow-up (integration blocker)

- [x] **6. Member trigger bypass** — `20260912130000` restores admin grading-fail whitelist lost in `20260911140000`

## Deliverables

| Area | Path | Status |
|------|------|--------|
| Migration | `supabase/migrations/20260912120000_grading_fail_buyer_fault_single.sql` | ✅ pushed |
| Trigger fix | `supabase/migrations/20260912130000_grading_fail_member_trigger_bypass.sql` | ✅ pushed |
| Saga | `lib/payments/auth-grading-fail-void-saga.ts` | ✅ |
| Admin UI | `app/admin/grading/AdminGradingClient.tsx` | ✅ |
| Unit tests | `tests/unit/payments/auth-grading-fail-void-saga.test.ts` | ✅ 3/3 |
| Integration | `tests/integration/grading/auth-grading-fail-single.integration.test.ts` | ✅ G-BF1–4 |
| Docs | refund-policy §12, backend, playbook, 6phase, rollout | ✅ |

## Verification

- [x] `bun run test:integration:grading` — 7/7 pass
- [x] `bun run test:integration:grading:stripe-smoke` — G-BF-S1/S2 real Stripe (requires `STRIPE_SECRET_KEY`)
- [x] `bunx tsc --noEmit`
- [x] Staging smoke: automated via G-BF-S (manual dashboard optional)
