# PR3A — Member moderation refund finalize trigger bypass

**SSOT:** [refund-policy.md](../../docs/dev/refund-policy.md) §12 · [refund-policy-rollout-plan.md](../../docs/dev/follow-up/refund-policy-rollout-plan.md) PR3 §3A

**範圍：** 僅 PR3A（3B carrier/inconclusive、3C preview 留後續 PR）

---

## 問題根因

`fn_enforce_member_order_transitions` 在 `moderation.order_refund=on` 時放行，但僅 [`rpc_prepare_moderation_order_refund`](../../supabase/migrations/20260911140000_moderation_member_refund_trigger_bypass.sql) 的 `member_auth` 分支有 `set_config`。

生產路徑 [`runModerationOrderRefundSaga`](../../lib/payments/moderation-order-refund-saga.ts) 用 **admin session**（`createClient()`）調 `rpc_finalize_moderation_order_refund` → 會被 trigger 擋。

**注意：** `service_role` 在 trigger 開頭直接 `RETURN NEW`（L6–8），故 **I-H9 用 service_role finalize 驗唔到 PR3**。

---

## 實作

### 1. Migration `20260913140000_moderation_member_refund_finalize_bypass.sql`

`CREATE OR REPLACE` 完整函數（來源勿 regress）：

| RPC | 來源 migration |
|-----|----------------|
| `rpc_finalize_moderation_order_refund` | `20260910210000` |
| `rpc_mark_moderation_order_refund_failed` | `20260910210000` |
| `rpc_retry_moderation_order_refund_prepare` | `20260910180000` |

`member_auth` 的 `UPDATE member_orders` 前後：

```sql
PERFORM set_config('moderation.order_refund', 'on', true);
UPDATE public.member_orders SET ...;
PERFORM set_config('moderation.order_refund', 'off', true);
```

| RPC | 必要性 |
|-----|--------|
| finalize | **必須**（saga admin session） |
| retry prepare | **必須**（`runModerationOrderRefundRetry` admin session） |
| mark_failed | defense-in-depth（saga 用 service_role，但 authenticated 調用仍可能） |

### 2. Integration — I-H10 only（PR3A）

[`phase-h-refund.integration.test.ts`](../../tests/integration/moderation/phase-h-refund.integration.test.ts)：

- Seed：`seedMemberAuthRefundEligibleOrder` + case
- `runAsAdmin` → `rpc_prepare_moderation_order_refund`（seller fault）
- **`runAsAdmin` → `rpc_finalize_moderation_order_refund`**（唔用 service_role）
- PI id：從 DB read `stripe_payment_intent_id`（`pi_phase_h_*`）
- Assert：`refund_status=refunded`, `escrow_status=cancelled`, `status=cancelled`, seller `seller_receivables`

**唔做 I-H11**（mark_failed 生產用 service_role；optional 留 PR3 follow-up）。

### 3. Docs

- `refund-policy.md` §12 member finalize → ✅
- `REFUND_ADMIN_PLAYBOOK.md`, `6phase-test-plan.md`, `rollout-plan.md`, `admin-moderation/backend.md`

---

## 驗收

```bash
bunx supabase db push
bun run test:integration:moderation
bunx tsc --noEmit
```

---

## Checklist

- [x] Migration `20260913140000` pushed
- [x] I-H10 green（admin session finalize）
- [x] Docs §12 updated
- [x] `test:integration:moderation` green（41/41）
