# Admin Payouts — Backend

> **Status:** Phase A ✅ · Phase B ✅ · Merchant ledger ✅ · Phase C ✅ (FPS finalize RPC + order sync) · Pipeline ✅ (1A–1C)  
> **Capture / FPS SSOT:** [capture-policy.md](../../capture-policy.md) · **Gate:** `bun run test:integration:fps-payout`  
> **Route:** `/admin/payouts`

## Phase A — Server actions

### `getAdminPayoutsPageData()`

```ts
{ success: true, data: {
  stripeBalance: { available, pending, todayIn, currency, lastSyncedAt } | null,
  stripeBalanceError?: string,
}}
```

- Auth: `requireAdmin()` + `createAdminClient()`
- Stripe: `getPlatformStripeBalance()` + `getPlatformStripeTodayInflow()` (HKT start-of-day, positive HKD net)

### `listAdminMerchantTransfers(input)`

```ts
type ListAdminMerchantTransfersInput = {
  page?: number;           // default 1
  pageSize?: number;       // default 10, max 50
  search?: string;
  statusFilter?: "all" | "paid" | "failed" | "processing" | "pending" | "held" | "frozen";
  sort?: "transferred_at-desc" | "transferred_at-asc" | "merchantName-asc" | "merchantName-desc";
  dateFrom?: string;       // ISO, transferred_at >=
  dateTo?: string;
};

{ success: true, data: {
  rows: MerchantTransferRow[],  // includes merchantId
  total: number,
  page: number,
  pageSize: number,
  totalPages: number,
  statusCounts: { all, paid, processing, pending, failed, held, frozen },
}}
```

- Base query: `merchant_orders` where `stripe_transfer_id IS NOT NULL` **OR** `buyer_confirmed_at IS NOT NULL` (includes T+7 `held` before Connect transfer)
- Server pagination: `.select(..., { count: "exact" }).range(offset, offset + pageSize - 1)`
- **`statusCounts`**: 7 parallel head-count queries with same search/date filters (ignores active `statusFilter`)
- Extended fields: `item_subtotal`, `commission_rate_applied`, `auth_fee`, `buyer_confirmed_at`, `payout_hold_until`, `stripe_payment_intent_id`, `requires_authentication`
- Join enrichment: `merchant_shops`, `kyc_records`, `profiles`, `merchant_ledgers` reconciliation
- `merchantName` sort: in-memory sort up to `MERCHANT_NAME_SORT_FETCH_CAP` (5000), then slice

### `listAdminMerchantTransfersForExport(input)`

- Same filters as list; fetches up to `MERCHANT_TRANSFERS_EXPORT_CAP` (2000) rows for CSV

### `refreshAdminStripeBalance()`

- `revalidatePath('/admin/payouts')`

### `retryAdminMerchantConnectPayout(orderId)`

```ts
{ success: true, data: { transferId?: string, alreadyApplied?: boolean } }
| { success: false, error: string }
```

1. `requireAdmin()` → `p_admin_id`
2. `rpc_admin_reset_merchant_connect_payout_retry` — mirrors `rpc_list_merchant_connect_payout_candidates` guards (incl. moderation refund window)
3. `executeMerchantConnectPayout(orderId)` — prepare → Stripe transfer → finalize
4. `revalidatePath('/admin/payouts')`

**P2.5:** `executeMerchantConnectPayout` marks `failed` on `finalize_failed` so admin retry button can recover stuck `processing` rows.

Migration: `20260924120000_admin_merchant_connect_payout_retry.sql`

**Verify:** `bun run test:integration:merchant-connect-payout` (unit P2.5 finalize_failed mocks + integration M2b)

### `getAdminFpsBatchSchedule()`

- Returns next Wednesday batch date + cutoff from `lib/admin-payouts/fps-batch-config.ts`

## Phase B — Migration `20260801120000_member_fps_payout.sql`

### Enums

- `member_seller_payout_status`: `none | held | ready | processing | paid | frozen | failed`
- `payout_request_status`: `pending | ready | processing | completed | failed`
- `payout_batch_status`: `draft | processing | completed`

### Tables

| Table | Purpose |
|-------|---------|
| `member_orders` + `buyer_confirmed_at`, `payout_hold_until`, `seller_payout_status` | T+3 hold state |
| `payout_requests` | 1:1 `member_orders`, FPS snapshot |
| `payout_batches` | Weekly batch audit |
| `profiles.fps_id` | Seller FPS ID |
| `platform_settings` | Seed `fps_payout_config` |

### RLS

- `payout_requests`: seller read own; admin all
- `payout_batches`: admin only

## Phase C — FPS ledger MVP ✅ (partial)

### `listAdminPayoutRequests(input)`

```ts
type ListAdminPayoutRequestsInput = {
  page?: number;           // default 1
  pageSize?: number;       // default 10, max 50
  search?: string;         // request id, order_number, seller name, fps_id, admin_fps_reference
  statusFilter?: "all" | "incomplete" | "completed" | "failed";
  sort?: "submittedAt-desc" | "submittedAt-asc" | "userName-asc" | "userName-desc";
  dateFrom?: string;       // ISO, created_at >=
  dateTo?: string;
};

{ success: true, data: {
  rows: FpsPayoutRow[],
  total, page, pageSize, totalPages,
  statusCounts: { all, incomplete, completed, failed },
}}
```

- Base query: `payout_requests` with server pagination
- **`incomplete`** = `pending` + `ready` + `processing`
- Join enrichment: `member_orders.order_number`, `profiles.display_name` / `username`
- `submittedAt` = `formatAdminDateTime(ready_at ?? created_at)`
- `statusCounts`: 4 parallel head-count queries (same search/date scope, ignores active status filter)

### `listAdminPayoutRequestsForExport(input)`

- Same filters; cap `FPS_EXPORT_CAP` (2000)

### `updateAdminPayoutRequestStatus(input)`

```ts
{ requestId, status: "completed" | "failed", adminFpsReference?: string }
```

- `completed`: requires `adminFpsReference`; calls `rpc_admin_set_fps_payout_request_status`
- `failed`: calls same RPC without reference
- Revalidates `/admin/payouts` + order detail path

### `batchCompleteAdminPayoutRequests({ requestIds })`

- TS pre-check via `isFpsPayoutBlockedForComplete`
- Calls `rpc_admin_batch_complete_fps_payout_requests` (single DB transaction)
- Bulk `completed` without per-row `admin_fps_reference`
- Revalidates `/admin/payouts` + each affected order detail path

### Admin finalize RPCs — migration `20260923120000_admin_fps_payout_finalize.sql`

#### `rpc_admin_set_fps_payout_request_status`

```ts
{ p_request_id, p_status: 'completed' | 'failed', p_admin_id, p_admin_fps_reference? }
// returns { request_id, order_id, order_number, status }
```

| `p_status` | Source `payout_requests.status` | Guards |
|------------|----------------------------------|--------|
| `completed` | `ready` \| `processing` only | Reject `pending` / `PENDING_FPS*` snapshots; require non-empty `p_admin_fps_reference`; reject `member_orders.seller_payout_status = frozen` |
| `failed` | `pending` \| `ready` \| `processing` | Reject frozen; allow pending reject |

Side effects:

- `completed` → `payout_requests.status=completed`, `paid_at`, `paid_by`, `admin_fps_reference`; `member_orders.seller_payout_status=paid`
- `failed` → `payout_requests.status=failed`; `member_orders.seller_payout_status=failed`

#### `rpc_admin_batch_complete_fps_payout_requests`

```ts
{ p_request_ids: uuid[], p_admin_id }
// returns { completed_count, order_numbers }
```

- Pre-validates all rows; any guard failure → entire batch rolls back
- No per-row `admin_fps_reference`

#### `fn_fps_payout_blocked_for_complete(status, fps_id_snapshot, fps_name_snapshot)`

- SQL mirror of `lib/admin-payouts/fps-payout-guards.ts`

### Still deferred

1. `seller_payable` ledger / fee deduction from payout amount
2. Dispute → auto-block **existing** `payout_requests` rows on freeze
3. `payout_batches` weekly audit workflow

## Phase C — Pipeline ✅ (1A / 1B / 1C)

Migration **`20260802120000_member_fps_payout_pipeline.sql`**:

| Piece | Status |
|-------|--------|
| **1A** `rpc_confirm_buyer_received` | Sets `buyer_confirmed_at`, `payout_hold_until = now() + 3 days`, `seller_payout_status = 'held'` (auth orders only) |
| **1B** Cron + RPCs | `rpc_list_member_fps_payout_ready_candidates`, `rpc_finalize_member_fps_payout_ready` → insert `payout_requests` |
| **1C** `profiles.fps_id` + `fps_name` | `updateUserFpsId`; seller dialog + banner on auth order detail |

### Cron route

`GET /api/cron/member-fps-payout-ready` — hourly (`vercel.json`). See [server.md](../../server.md) §9.

### Merchant T+7 held ledger ✅

- `listAdminMerchantTransfers` includes buyer-confirmed orders before `stripe_transfer_id` exists
- Date filter falls back to `buyer_confirmed_at` when `transferred_at` is null
- `MerchantConnectLedgerTab` shows `payout_hold_until` for `held` rows

## Migration verify (ops)

```bash
bunx supabase db push   # or apply 20260801120000 in SQL editor
```

Sanity SQL:

```sql
SELECT COUNT(*) FROM payout_requests;
SELECT key FROM platform_settings WHERE key = 'fps_payout_config';
```

## Dev seed (FPS ledger)

```bash
# In Supabase SQL editor, run:
# scripts/dev/seed-fps-payout-requests.sql
```

- Idempotent: picks auth `member_orders` without existing `payout_requests`
- Mixed statuses: `pending`, `ready`, `processing`, `completed`, `failed`
- `fps_id_snapshot` from `profiles.fps_id` or `9999999`

## Verify (Phase C MVP)

```bash
bunx supabase db push          # if not applied
# Run scripts/dev/seed-fps-payout-requests.sql on dev
bunx tsc --noEmit
bun run lint
bun run build:ci
# As admin: /admin/payouts → FPS tab chips, pagination, 銷帳/駁回, CSV overlay
```

## Verify (Phase A + Merchant ledger)

```bash
bunx tsc --noEmit
bun run build:ci
# As admin: /admin/payouts → Stripe balance HK$ numeric; Merchant tab server pagination 10/page
```

## Verify (Phase B)

```bash
bunx supabase db push   # or apply migration in SQL editor
# Confirm types: payout_requests, payout_batches, platform_settings in types/supabase.ts
```
