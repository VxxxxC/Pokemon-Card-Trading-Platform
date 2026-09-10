# Admin Payouts — Data Wiring Plan

> **Status:** Phase A ✅ · Phase B (schema) ✅ · Phase C ⏳  
> **Route:** `/admin/payouts`  
> **Policy:** [escrow-payment-policy.md](../../escrow-payment-policy.md) §8.1

## Parameters

| Item | Value |
|------|-------|
| FPS weekly batch day | **Wednesday** (`batchWeekday = 3`, ISO Mon=1) |
| Cutoff | `ready_at < Tuesday 23:59 HKT` before batch Wednesday |
| Config source | `platform_settings.fps_payout_config` → env `FPS_BATCH_WEEKDAY` → code default |

## Phases

| Phase | Scope | Status |
|-------|--------|--------|
| **A** | Split UI, SSR, Stripe balance + today inflow, Merchant tab (DB) | ✅ |
| **B** | `payout_requests`, `payout_batches`, `member_orders` payout cols, `profiles.fps_id`, `platform_settings` seed | ✅ |
| **C** | T+3 cron, admin batch actions, wire FPS tab, member order detail FPS status, persist `fpsId` on profile | ⏳ |

## Architecture

- **Member FPS:** platform pool → manual bank FPS (weekly batch)
- **Merchant Connect:** T+7 hourly cron auto `transfers.create` — admin tab is reconciliation/monitoring (+ manual retry for `failed`)

## Files

- SSR: `app/admin/payouts/page.tsx`
- Client: `app/admin/payouts/AdminPayoutsClient.tsx`
- Actions: `app/actions/admin-payouts.ts`
- Lib: `lib/admin-payouts/*`, `lib/stripe/platform-today-inflow.ts`
- Migration: `supabase/migrations/20260801120000_member_fps_payout.sql`
