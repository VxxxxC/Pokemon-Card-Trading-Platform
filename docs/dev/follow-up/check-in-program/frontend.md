# Check-in Program — frontend

## Files

| File | Role |
|------|------|
| `app/admin/campaigns/page.tsx` | Campaigns server page (loads check-in program data) |
| `app/admin/campaigns/CampaignsPageShell.tsx` | Tab shell: 獎勵活動 / **簽到計劃** / ROI |
| `app/admin/campaigns/AdminCheckInProgramClient.tsx` | Ladder + completion form |
| `app/admin/check-in-program/page.tsx` | Redirect → `/admin/campaigns?tab=check-in` |
| `app/actions/admin-check-in-program.ts` | Admin actions |
| `app/components/rewards/CheckInCard.tsx` | DB ladder, paused banner, completion toast |
| `lib/admin-check-in-program/*` | Types + parsers |

## Admin entry

- **Primary:** `/admin/campaigns?tab=check-in` (簽到計劃 tab)
- **Legacy URL:** `/admin/check-in-program` redirects to the tab above

## Acceptance

- [x] `/admin/campaigns?tab=check-in` — edit daily PTS, completion (points / coupon / free shipping) — Partner #10 2026-07-29
- [x] Member grid reflects saved ladder — Partner #10 2026-07-29
- [ ] Program paused → banner + disabled button; existing wallet coupons still work
- [ ] Day 7 toast shows combined PTS when completion is points
- [ ] Reward activity form has no `check_in_streak` / `check_in_cycle_day` triggers
- [ ] Legacy check-in templates (STREAK_30, CHECK_IN_DAY7_BONUS) **not** listed under 獎勵活動 → 已封存
