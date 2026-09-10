# FPS manual transfer fee — plan

## SSOT

| Layer | Location |
|-------|----------|
| TypeScript | `lib/platform/fps-payout-config.ts` → `DEFAULT_FPS_MANUAL_TRANSFER_FEE_HKD` |
| SQL mirror | `fn_platform_fps_manual_transfer_fee_hkd()` (same numeric value) |
| Snapshot | `payout_requests.gross_payout_hkd`, `fps_transfer_fee_hkd`, `amount` (net) at `rpc_finalize_member_fps_payout_ready` |

Default: **HK$0** (waived). Not editable in `/admin/settings`.

## Change fee checklist

1. Update `DEFAULT_FPS_MANUAL_TRANSFER_FEE_HKD` in TS
2. Update literal in `fn_platform_fps_manual_transfer_fee_hkd()` migration/SQL
3. Update integration test expectations + TOS copy helpers
4. `bunx supabase db push` + `bun run supabase:types`

## Verify

```bash
bunx vitest run tests/unit/platform/fps-payout-config.test.ts
bunx vitest run tests/integration/platform/fps-payout-fee.integration.test.ts
```
