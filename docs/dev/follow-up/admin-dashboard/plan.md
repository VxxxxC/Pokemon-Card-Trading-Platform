# Admin Dashboard — Data Wiring Plan (Phase 1–3)

> **Status:** 🟡 Planned  
> **Route:** `/admin/dashboard`  
> **UI:** `app/admin/dashboard/DashboardClient.tsx` (currently 100% mock)  
> **Reference:** `BACKEND_WIRING_MANIFEST.md` § Dashboard & Metrics  
> **Blocked by:** Nothing (independent of Stripe multicapture)

## 1. Goals

1. Replace mock metrics with **real Supabase aggregates** (Phase 1).
2. Add **Stripe platform balance** + **actionable admin alerts** (Phase 2).
3. Harden with **health probes**, optional RPCs, and E2E assertions (Phase 3).

### Design principles

| Principle | Decision |
|-----------|----------|
| **Variable fees** | Revenue totals use **per-order snapshots** (`commission_rate_applied`, `commission_amount`, `auth_fee`), not a single global rate. UI 「現行費率」 reads `platform_settings` when available; until then show weighted average or 「預設 8% / HK$150」. |
| **Growth (MoM)** | Phase 1: **本月 vs 上月** only; formula in §4. Show `N/A` when prior month = 0. |
| **Truth source** | DB snapshots > ledger > Stripe balance (cash view). |
| **Security** | All reads via `requireAdmin()` + `createAdminClient()` (same as `admin-kyc.ts`). |
| **CI** | `page.tsx` must guard `isSupabaseConfigured()` before Supabase. |

---

## 2. Current state

| Asset | Status |
|-------|--------|
| `DashboardClient.tsx` | Mock `userEcology`, `marketVolume`, `revenues`, `stripePlatformBalance`, `initialServices`; `unprocessedDisputes = 5` hardcoded |
| `page.tsx` | No SSR — only renders client |
| `getDashboardMetrics()` | Manifest only — **not implemented** |
| `platform_settings` | Manifest schema — **not migrated**; checkout uses hardcoded `fn_merchant_checkout_auth_fee` (150) + payout RPC `0.08` commission |
| `/admin/merchants` | ✅ Real KYC data — reuse pending count |
| `/admin/grading` | ✅ Real — optional cross-link |

---

## 3. Metric definitions

### 3.1 User ecology (`userEcology`)

| Field | Source | Notes |
|-------|--------|-------|
| `totalUsers` | `COUNT(*)` from `profiles` | Exclude `role = 'admin'` optional |
| `bannedUsers` | **Defer** | No `banned` column on `profiles` — Phase 3 or hide |
| `activeRatio` | **Defer Phase 1** | Needs `last_seen` or activity window — show `—` until defined |
| Pie: 一般會員 | `profiles.role = 'member'` | |
| Pie: 認證商戶 | `profiles.role = 'merchant'` | |
| Pie: 待審核商戶 | `kyc_applications.status = 'pending'` | Same query as merchants page |

### 3.2 Market volume (`marketVolume`)

| Field | Source | Notes |
|-------|--------|-------|
| `totalGmv` | `SUM(item_subtotal)` on `merchant_orders` where `escrow_status = 'completed_and_transferred'` | Card subtotal only (excludes shipping/auth) — document in UI tooltip |
| `settledCount` | `COUNT(*)` same filter | Label: 「已結算訂單」 |
| `listingCount` | `COUNT(*)` from `listings` where `status = 'active'` | Confirm enum in types |
| `growthRate` | MoM on **GMV** (see §4) | Display e.g. `+12.3%` / `−5.1%` / `N/A` |

**Phase 1 scope:** Merchant B2C only. Member P2P / member auth orders — **out of scope** unless trivial join exists.

### 3.3 Platform revenue (`revenues`)

#### Commission (浮動)

- **Recognized revenue:** `SUM(commission_amount)` where `escrow_status = 'completed_and_transferred'` and `commission_amount IS NOT NULL`.
- **Per-order rate:** `commission_rate_applied` (snapshot at buyer confirm via `rpc_confirm_merchant_buyer_receipt`; rate from `fn_platform_commission_rate()`).
- **Dashboard display rate:**
  - **Preferred:** `platform_settings.key = 'platform_financial_config'` → `value.commissionRate` (wired via `/admin/settings`).
  - **Fallback:** weighted avg `SUM(commission_amount) / SUM(item_subtotal)` over last 90d completed orders, or static copy 「現行預設 8%」.
- Settings page commission field reads/writes `platform_settings` (no mock `5.0%` local state).

#### Appraisal / auth fee (浮動)

- **Recognized revenue:** `SUM(auth_fee)` where `auth_fee_captured_at IS NOT NULL` (or `payment_capture_status` ∈ `auth_fee_captured`, `fully_captured`).
- **Per-order snapshot:** `merchant_orders.auth_fee` (set by `fn_merchant_checkout_auth_fee(p_use_auth)` — today 150 or 0).
- **Display 「per card」:** weighted avg `SUM(auth_fee) / COUNT(*)` over captured auth orders, or current default from `fn_merchant_checkout_auth_fee(true)`.
- Failed grading: auth fee **retained** — still counts as platform revenue once captured.

| Field | Aggregation |
|-------|-------------|
| `totalCommission` | All-time sum `commission_amount` (completed) |
| `monthlyCommission` | Current calendar month (HK timezone) |
| `commissionGrowth` | MoM on monthly commission (§4) |
| `appraisalTotal` | All-time sum captured `auth_fee` |
| `totalAppraisals` | Count orders with `auth_fee_captured_at IS NOT NULL` |
| `appraisalFeePerCard` | Weighted avg or settings default |

### 3.4 Stripe platform balance (Phase 2)

| Field | Source |
|-------|--------|
| `available` / `pending` | `stripe.balance.retrieve()` — platform account, HKD |
| `lastSyncedAt` | Server timestamp at fetch |

Fallback: `{ available: 0, pending: 0, unavailable: true }` + UI badge 「Stripe 未設定」.

### 3.5 Alerts & services

| Field | Phase | Source |
|-------|-------|--------|
| `unprocessedDisputes` | 2 | `user_reports` / dispute RPC — **table not in types yet** → Phase 2 = 0 + hidden or disabled CTA |
| `initialServices` | 3 | Real probes (§5.3) |

---

## 4. Month-over-month growth (`growthRate`)

**Timezone:** `Asia/Hong_Kong`.

**Recognition timestamp (pick one, document in action):**

| Metric | Recommended `recognized_at` |
|--------|----------------------------|
| GMV / settled count | `merchant_orders.buyer_confirmed_at` or row `updated_at` when `escrow_status` became `completed_and_transferred` |
| Commission | Same as GMV (commission finalized at payout prep on confirm) |
| Auth fee | `auth_fee_captured_at` |

**Formula:**

```text
currentMonth  = SUM(metric) WHERE recognized_at >= start_of_this_month_hkt
previousMonth = SUM(metric) WHERE recognized_at >= start_of_last_month_hkt AND < start_of_this_month_hkt

if previousMonth = 0:
  growthRate = null  → UI "N/A" or "—"
else:
  growthRate = ((currentMonth - previousMonth) / previousMonth) * 100
  format: "+X.X%" / "−X.X%"
```

**Recommendation:**

- `marketVolume.growthRate` → GMV MoM
- `revenues.commissionGrowth` → commission recognized MoM (current calendar month vs previous calendar month)

---

## 5. Phase breakdown

### Phase 1 — DB metrics MVP (ship first)

**Deliverables**

| File | Action |
|------|--------|
| `app/actions/admin-dashboard.ts` | `getAdminDashboardMetrics()` |
| `app/admin/dashboard/page.tsx` | SSR fetch + pass props; `isSupabaseConfigured()` guard |
| `app/admin/dashboard/DashboardClient.tsx` | Accept props; replace module-level mocks (**addition-only** per `.cursorrules`) |
| `docs/dev/follow-up/admin-dashboard/backend.md` | Action contract + verify steps |
| `docs/dev/follow-up/admin-dashboard/frontend.md` | Props checklist |
| `docs/dev/INTEGRATION_QUEUE.md` | Row status 🟡 Partial |

**Action signature**

```typescript
export type AdminDashboardMetrics = {
  userEcology: {
    totalUsers: number;
    totalUsersFormatted: string;
    bannedUsers: number | null;        // null = not tracked
    activeRatio: string | null;        // null = "—"
    activeCount: string | null;
    distribution: Array<{
      key: "user" | "merchant" | "pending";
      role: string;
      count: number;
      formattedCount: string;
      pct: number;
      pctStr: string;
      color: string;
      description: string;
    }>;
  };
  marketVolume: {
    totalGmv: string;       // formatted HK$
    settledCount: string;
    listingCount: string;
    growthRate: string | null;  // MoM or null
  };
  revenues: {
    totalCommission: string;
    monthlyCommission: string;
    commissionRate: string;       // "8.0%" or weighted / settings
    commissionGrowth: string | null;
    appraisalTotal: string;
    appraisalFeePerCard: string;
    totalAppraisals: string;
  };
  syncedAt: string;           // ISO
};

export async function getAdminDashboardMetrics(): Promise<
  { success: true; data: AdminDashboardMetrics } | { success: false; error: string }
>;
```

**Implementation notes**

- Use **one** admin client session; run parallel counts via `Promise.all` or single SQL RPC later.
- Phase 1: **no new migration required** — queries in TypeScript against existing tables.
- Optional: `lib/admin-dashboard/format.ts` for HK$ / pct formatters (reuse merchant-dashboard patterns if any).
- Header 「重新整理數據」→ `router.refresh()` (revalidate SSR), not random latency.

**Verify**

1. Admin login → dashboard shows real counts matching Supabase SQL spot checks.
2. Complete one merchant order → GMV + commission increment after `completed_and_transferred`.
3. Auth order intake capture → appraisal total increments.
4. `bun run build:ci` passes without `.env`.
5. Non-admin → redirect or error from layout (existing admin guard).

---

### Phase 2 — Stripe balance + alerts

**Deliverables**

| Item | Detail |
|------|--------|
| `getAdminDashboardStripeBalance()` | Or extend metrics action with optional Stripe leg |
| Stripe row in UI | Replace `stripePlatformBalance` mock |
| `unprocessedDisputes` | Wire when `user_reports` + `list_dispute_cases` exist; else `0` and disable alert banner |
| KYC alert | Optional: reuse `listKycApplications({ status: 'pending' }).length` for badge on pie segment click |

**Stripe**

- Reuse `STRIPE_SECRET_KEY` from env (same as webhook / KYC).
- Cache: none in Phase 2, or 60s in-memory per server instance — document choice.
- Errors: return `success: true` with `stripeBalance: null` + `stripeError` for soft degrade.

**Verify**

1. Dashboard shows Stripe available/pending matching Dashboard (test mode).
2. Missing `STRIPE_SECRET_KEY` → graceful empty state, no throw at build.

---

### Phase 3 — Health probes, RPC hardening, E2E

**Deliverables**

| Item | Detail |
|------|--------|
| `getSystemHealthStatus()` | Replace random latency refresh |
| Probes | Supabase `SELECT 1`; Stripe lightweight API; crawler TBD (static `degraded` if no endpoint) |
| `platform_settings` migration | When admin settings wired — dashboard reads live `commissionRate` / `appraisalFee` for **display labels** only; revenue still from order snapshots |
| Optional RPCs | `get_admin_dashboard_snapshot()` — move aggregates to DB if page slow |
| `bannedUsers` / `activeRatio` | Requires schema + product definition |
| E2E | Extend `e2e/admin-stripe-finance.spec.ts` — assert non-mock formatted values or `data-testid` hooks |
| Member / P2P GMV | Include `member_orders` if product wants full platform GMV |

**Health probe contract**

```typescript
type SystemService = {
  id: "supabase" | "stripe" | "crawler";
  name: string;
  subName: string;
  status: "online" | "degraded" | "offline";
  latency: number;  // ms round-trip
};
```

**Verify**

1. Refresh button updates real latencies (not `Math.random`).
2. Load test: dashboard SSR < 2s with 10k orders (or RPC if needed).

---

## 6. Future: `platform_settings` + floating fees (cross-cutting)

When `/admin/settings` is wired (`getPlatformSettings` / `updatePlatformSettings`):

1. Store `platform_financial_config` JSON, e.g.  
   `{ "commissionRate": 0.08, "appraisalFee": 150, "effectiveFrom": "ISO" }`
2. Update `fn_merchant_checkout_auth_fee` / payout RPC to read settings (or versioned fee table).
3. **Dashboard never recalculates historical revenue** — always `SUM(snapshot columns)`.
4. Settings change affects **new orders only**; dashboard 「現行費率」 reflects settings; 「本月營收」 reflects snapshots.

Until then, document in UI: 「營收按訂單快照計算；現行預設佣金 8%、鑑定費 HK$150」.

---

## 7. Files touched (summary)

| Phase | Create | Modify |
|-------|--------|--------|
| 1 | `app/actions/admin-dashboard.ts`, `docs/dev/follow-up/admin-dashboard/*` | `page.tsx`, `DashboardClient.tsx`, `INTEGRATION_QUEUE.md` |
| 2 | — | `admin-dashboard.ts`, `DashboardClient.tsx` |
| 3 | optional migration RPC | `admin-dashboard.ts`, E2E spec, settings migration (shared) |

**Do not modify** in Phase 1: payouts, disputes, catalog, grading (unless adding nav badge).

---

## 8. Acceptance checklist (all phases)

- [ ] Phase 1: All mock constants removed from dashboard data path
- [ ] Phase 1: MoM growth shows correct sign for seeded backdated orders
- [ ] Phase 1: Variable fee story documented — totals from snapshots, not single rate
- [ ] Phase 2: Stripe balance live or graceful fallback
- [ ] Phase 2: Dispute alert honest (0 or real count)
- [ ] Phase 3: Service refresh uses real probes
- [ ] CI: `bunx tsc --noEmit`, `bun run lint`, `bun run build:ci`
- [ ] Partner handoff: `backend.md` + `frontend.md` marked ✅ in queue when wired

---

## 9. Suggested implementation order

```text
Week A: Phase 1 backend action + SQL spot checks
Week A: Phase 1 page SSR + client props (frontend)
Week B: Phase 2 Stripe balance
Week B+: Phase 3 health + E2E (parallel with platform_settings work)
```

---

## 10. Related docs

- `BACKEND_WIRING_MANIFEST.md` — original matrix
- `docs/dev/follow-up/merchant-checkout/backend.md` — commission 8%, auth_fee snapshot
- `docs/dev/escrow-payment-policy.md` — auth fee non-refundable policy
- `app/actions/admin-kyc.ts` — `requireAdmin` pattern
- `e2e/admin-stripe-finance.spec.ts` — dashboard smoke
