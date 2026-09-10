# Admin dashboard — backend

## Files

| Path | Purpose |
|------|---------|
| `app/actions/admin-dashboard.ts` | `getAdminDashboardMetrics()` — admin guard + Supabase aggregates + Stripe balance |
| `lib/admin-dashboard/types.ts` | `AdminDashboardMetrics` contract |
| `lib/admin-dashboard/format.ts` | HK$ / growth / range sum helpers |
| `lib/admin-dashboard/hkt-month-bounds.ts` | HKT calendar month boundaries |
| `lib/admin-dashboard/health-probes.ts` | Supabase / Stripe / crawler health probes |
| `lib/stripe/platform-balance.ts` | `getPlatformStripeBalance()` — `stripe.balance.retrieve()` (platform account, HKD) |
| `supabase/migrations/20260731130000_merchant_orders_service_role_select.sql` | `GRANT SELECT ON merchant_orders TO service_role` |

## Action contract

```typescript
getAdminDashboardMetrics(): Promise<
  { success: true; data: AdminDashboardMetrics } | { success: false; error: string }
>

getAdminSystemHealthStatus(): Promise<
  { success: true; data: { services: AdminDashboardSystemService[] } }
  | { success: false; error: string }
>
```

- Guard: cookie session + `isCurrentUserAdmin` (fail-closed).
- Reads: `createAdminClient()` service role + Stripe API (server-only).
- Requires migration **`20260731130000`** (`GRANT SELECT ON merchant_orders TO service_role`).
- Env: `STRIPE_SECRET_KEY` (optional for dashboard — soft-degrades Stripe row).

## Migrations / env

- Push: `bunx supabase db push`
- Stripe: `STRIPE_SECRET_KEY` in `.env.local` for live balance row.

## Data sources

| UI block | Source |
|----------|--------|
| User ecology pie | `profiles.role`; pending KYC subtracted from member slice; `account_sanctions` active `ban` count |
| GMV | `merchant_orders` + `member_orders` completed rows; sum `item_subtotal` (fallback `final_price`) |
| Commission | `merchant_orders.commission_amount` where `escrow_status = completed_and_transferred` |
| Appraisal | `merchant_orders` + `member_orders` where completed and `auth_fee_captured_at IS NOT NULL` |
| Listings | `listings` where `status = active` |
| Stripe balance | `stripe.balance.retrieve()` — HKD `available` / `pending` (major units) |
| Alert count | `reports` where `status IN ('pending', 'reviewing')` |
| Pending grading | `search_admin_grading_orders` totals for `awaiting_intake` + `grading` + `awaiting_outbound` |

## Stripe balance (Phase 2)

- Helper: `getPlatformStripeBalance()` in `lib/stripe/platform-balance.ts`.
- Picks `currency === 'hkd'` from balance arrays; converts minor units `/ 100`.
- **Soft degrade:** if Stripe unset or API fails, `getAdminDashboardMetrics()` still returns `success: true`; `stripeBalance.unavailable = true`, amounts `"—"`, `unavailableReason` set.
- **No cache** in Phase 2 (refresh on each SSR / `router.refresh()`).

## MoM growth (Asia/Hong_Kong)

- **GMV:** sum `item_subtotal` by `buyer_confirmed_at` (fallback `updated_at`).
- **Commission:** sum `commission_amount` by same recognition timestamp.
- Formula: `(currentMonth - previousMonth) / previousMonth`; prior month `0` → `null` (UI `N/A`).

## Floating fees

- Revenue totals always from order snapshots, not global settings.
- Display `commissionRate`: weighted ratio over last 90d completed orders; fallback `"8.0%"`.
- Display `appraisalFeePerCard`: avg captured `auth_fee`; fallback `"HK$ 150"`.

## Verify (backend)

### Phase 1 (DB metrics)

1. Migration `20260731130000` applied.
2. Admin session → no `permission denied for table merchant_orders`.
3. GMV / commission / appraisal match SQL spot checks on `merchant_orders`.

### Phase 2 (Stripe + alerts)

4. With `STRIPE_SECRET_KEY`: dashboard `available` / `pending` match [Stripe Dashboard → Balance](https://dashboard.stripe.com/test/balance) (HKD).
5. Without `STRIPE_SECRET_KEY`: page loads; `stripeBalance.unavailable === true`; DB metrics still work; `bun run build:ci` passes.
6. Reports alert:

```sql
SELECT count(*) FROM reports WHERE status IN ('pending', 'reviewing');
```

7. Count `> 0` → alert banner visible; count `0` → banner hidden.
8. Non-admin → `{ success: false, error: '無管理員權限' }`.
9. `bunx tsc --noEmit`, `bun run lint`, `bun run build:ci`.
10. Optional: `bunx playwright test e2e/admin-stripe-finance.spec.ts` (dashboard Stripe labels).

## Phase 3 (health probes) ✅

- `getAdminSystemHealthStatus()` — Supabase head count, Stripe balance probe, crawler `product_grading_market_prices.updated_at` freshness (48h)
- `lib/admin-dashboard/health-probes.ts` — round-trip latency (ms) per service
- SSR: `page.tsx` passes `initialServices`; client refresh calls server action (no `Math.random`)

## Deferred

- Optional RPC `get_admin_dashboard_snapshot()` if row volume grows
- `activeRatio` / DAU (needs product definition + activity window)
