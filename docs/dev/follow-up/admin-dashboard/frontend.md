# Admin dashboard — frontend

## UI touchpoint

| File | Role |
|------|------|
| `app/admin/dashboard/page.tsx` | SSR admin guard + `getAdminDashboardMetrics()` |
| `app/admin/dashboard/DashboardClient.tsx` | Renders metrics props |

## Props

```typescript
type AdminDashboardClientProps = {
  metrics: AdminDashboardMetrics | null;
  loadError: string | null;
  initialServices: AdminDashboardSystemService[];
  healthLoadError: string | null;
};
```

Import types from `@/lib/admin-dashboard/types`.

## Wired

### Phase 1

- `userEcology` pie + center total + KYC queue footer
- `marketVolume` GMV / settled count / active listings + MoM badge
- `revenues` commission + appraisal totals + weighted rate display
- Header 「最後同步」from `metrics.syncedAt`
- Header 「重新整理數據」→ `router.refresh()` via `useTransition`

### Phase 2

- `stripeBalance` — live Stripe platform account (available hero + Available / Pending / HKD sub-lines)
- `alerts.unprocessedReports` — pending + reviewing `reports` count
- Alert banner **hidden when count === 0**
- `alerts.pendingKyc` — pending `kyc_applications` count; amber KYC banner **hidden when count === 0**; CTA → `/admin/merchants`
- `alerts.pendingGrading` — sum of `search_admin_grading_orders` totals for tabs `awaiting_intake` + `grading` + `awaiting_outbound` (same as grading workbench queue); sky banner title **待處理鑑定訂單**, **hidden when count === 0**; CTA → `/admin/grading`
- Stripe unavailable: amounts `"—"`, subtitle shows `unavailableReason`

### Phase 3

- `initialServices` — SSR health probe results (Supabase / Stripe / crawler)
- 「實時檢測」→ `getAdminSystemHealthStatus()` via `useTransition` (real latency, no mock)
- Toast reflects online / degraded / offline per service
- `healthLoadError` plain text when probe action fails on SSR

## Deferred

| UI | Notes |
|----|-------|
| 活躍用戶比率 (`—`) | Needs activity window / `last_seen` schema |

## Acceptance checklist

- [ ] `/admin/dashboard` shows live DB numbers.
- [ ] Stripe available/pending match Stripe Dashboard (test mode) when key set.
- [ ] Stripe row shows unavailable message when key missing (DB metrics still load).
- [ ] Refresh button re-fetches SSR without full page navigation.
- [ ] `loadError` renders plain error text; KPI / pie hidden (no mock zeros).
- [ ] Ecology pie excludes pending KYC from member slice; **已封鎖帳戶** when `bannedUsers > 0`.
- [ ] `initialServices` syncs after `router.refresh()`.
- [ ] Growth badges show `N/A` when prior month has no data.
- [ ] Alert banner appears only when `unprocessedReports > 0`.
- [ ] KYC banner appears only when `pendingKyc > 0`; CTA links to `/admin/merchants`.
- [ ] Grading banner appears only when `pendingGrading > 0`; title shows **待處理鑑定訂單**; count matches sum of grading workbench tabs (待入庫 + 鑑定中 + 待出庫); CTA links to `/admin/grading`.
- [ ] 「前往審核商戶」still links to `/admin/user_control` (E2E).
- [ ] No hydration mismatch on date formatting.
- [ ] `bun run build:ci` passes.
