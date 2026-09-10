# Admin Payouts — Frontend

> **Status:** Phase A ✅ Merchant live · Phase C ✅ FPS ledger + finalize  
> **Partner QA:** [PARTNER_QA.md](../../PARTNER_QA.md) M6 + M7 · **Gate:** `test:integration:fps-payout` + `test:integration:merchant-connect-payout`  
> **M7 checklist:** [e2e-checklist.md](./e2e-checklist.md)
> **Route:** `/admin/payouts`

## File layout

```
app/admin/payouts/
  page.tsx                          # SSR + admin guard
  AdminPayoutsClient.tsx            # tabs shell
  components/
    PlatformBalanceSection.tsx      # Stripe balance + refresh
    MerchantConnectLedgerTab.tsx    # Merchant main table (server pagination)
    FpsLedgerTab.tsx                # FPS payout_requests table (server pagination)
    BlockingLoadingOverlay.tsx      # Full-screen blocking spinner for CSV export
    payouts-shared.tsx              # SortSelect, FilterChips
```

## Props (`AdminPayoutsClient`)

| Prop | Source |
|------|--------|
| `data` | `getAdminPayoutsPageData()` (Stripe balance only) |
| `loadError` | balance action error |
| `fpsBatchSchedule` | `getAdminFpsBatchSchedule()` |
| `initialMerchantPage` | `listAdminMerchantTransfers({ page: 1, pageSize: 10 })` |
| `merchantLoadError` | merchant list action error |
| `initialFpsPage` | `listAdminPayoutRequests({ page: 1, pageSize: 10, statusFilter: 'incomplete' })` |
| `fpsLoadError` | FPS list action error |

## Tab behaviour

### FPS 批次處理 — live ledger

- Main table: `FpsLedgerTab` → `listAdminPayoutRequests` (SSR + client refetch)
- **10 rows/page** server pagination; default filter **未完成** (`pending` + `ready` + `processing`)
- Status chips: 全部 / 未完成 / 已完成 / 已駁回 — `statusCounts[key]`
- Search: 提現單號（UUID / `#` 前綴）、訂單號、用戶名稱、FPS ID、管理員 FPS 參考
- Sort: submitted time, seller name
- Row actions: 銷帳（dialog + required `adminFpsReference`）/ 駁回 (`updateAdminPayoutRequestStatus`); batch 銷帳 (`batchCompleteAdminPayoutRequests` + confirm)
- Pending / `PENDING_FPS*` rows: checkbox disabled, 銷帳 hidden, hint「待賣家補 FPS」
- Column: FPS 參考 (`admin_fps_reference`)
- CSV: `listAdminPayoutRequestsForExport` + `BlockingLoadingOverlay`
- Links (new tab): 訂單號 / 查看訂單 → `/profile/user/orderDetail/{orderNumber}`; 用戶名稱 → `/profile/{sellerId}`
- Banner: next Wednesday batch + cutoff from `fpsBatchSchedule`
- **No Stripe Log** on FPS tab (member FPS is manual bank transfer, not Stripe)

### 商戶流水 (Stripe) — live

- Component: `MerchantConnectLedgerTab`
- Data: `listAdminMerchantTransfers` (SSR initial + client refetch on filter/page)
- **10 rows/page** server pagination
- Status filter chips: 全部 / 已成功 / 保留中（T+7） / 處理中 / 待撥款 / 已失敗 / 已凍結 — each shows `statusCounts[key]` for current search/date scope
- Row selection / CSV export selected rows use **`orderId`** (not `stripeTransferId`; held rows show `—` for transfer id)
- Failed rows: **重試撥款** button → `retryAdminMerchantConnectPayout` (toast on error; refresh on success)
- Date range on `transferred_at`
- Columns include 訂單類型、卡價小計、佣金率、鑑定費、商戶實收 (Transfer)、撥款狀態（failed → tooltip `payout_error`）、對賬 ⚠、買家確認時間、PaymentIntent、撥款時間（held → `保留至 {payoutHoldUntil}`）
- **Removed:** 帳戶餘額 column; Merchant tab Stripe Log panel
- CSV export: `listAdminMerchantTransfersForExport` with current filters (cap 2000); **blocking overlay** during export (`BlockingLoadingOverlay`)
- **Clickable cells** (all open in **new tab**):
  - 訂單號 → `/profile/merchant/orderDetail/{orderId}`
  - 商戶名稱 → `/marketplace/{merchantId}` (public storefront)
  - Stripe 流水號 (`tr_*`) → Stripe Connect Transfer Dashboard (new tab, `lib/stripe/dashboard-urls.ts`)
  - Stripe 帳戶 ID (`acct_*`) → Stripe Connect account Dashboard (new tab)
- 「查看訂單」 button retained (new tab)

### FPS 批次處理 — CSV export

- `FpsLedgerTab` export uses `BlockingLoadingOverlay` during server fetch + download

## Acceptance checklist

- [x] Page SSR with `isSupabaseConfigured()` guard
- [x] Stripe Available / Pending / Today In display HK$ amounts
- [x] Refresh shows toast「已重新整理 Stripe 帳戶餘額」
- [x] Merchant tab count badge uses server `total`
- [x] Merchant table server pagination 10/page
- [x] FPS tab live `payout_requests` table with server pagination 10/page
- [x] FPS status chips + 銷帳/駁回/batch complete wired to server actions
- [x] Single 銷帳 requires FPS reference dialog; pending rows blocked from complete/batch
- [x] Batch 銷帳 confirm when no per-row reference
- [x] FPS batch banner shows Wednesday schedule
- [x] Merchant table shows T+7 held rows (no `stripe_transfer_id` yet) with hold-until date
- [x] Merchant row checkbox / export selection uses `orderId` (unique for held rows)
- [x] Failed merchant payout rows show 重試撥款 → `retryAdminMerchantConnectPayout`
- [x] Partner M7 smoke: [e2e-checklist.md](./e2e-checklist.md)（seed + held/failed chips）
- [x] Phase C pipeline: auto-insert `payout_requests` on buyer confirm + cron

## E2E

- `e2e/admin-stripe-finance.spec.ts` Route 2 — FPS ledger structural asserts, FPS 參考 column, optional 銷帳 dialog flow; no Stripe Log on FPS tab
