# Platform legal documents (terms + privacy) — DB SSOT

## Keys

| Key | Shape | Public read | Admin write |
|-----|-------|-------------|-------------|
| `platform_terms` | `{ title, body }` | `getPlatformTermsForDisplay()` | `updatePlatformLegal()` |
| `platform_privacy` | `{ title, body }` | `getPlatformPrivacyForDisplay()` | `updatePlatformLegal()` |

TS contract: `lib/platform/platform-legal-config.ts`  
Registry: `lib/platform/platform-settings-registry.ts`  
Migration: `supabase/migrations/20260921120000_platform_legal_documents_ssot.sql`  
Public SELECT grant: `20260921120100_platform_settings_public_grants.sql`

## Edit flow

1. Admin `/admin/settings` →「平台聲明與交易條款編輯器」
2. Edit 服務條款 + 私隱政策 textareas →「發佈最新條款聲明」
3. Public `/terms` and `/privacy` render DB body with `whitespace-pre-wrap`

MVP: admin edits **body only**; title from seed/DB passed through on save.

## Hygiene (same PR)

- `DELETE` orphan `fps_payout_config` — batch schedule is code SSOT in `lib/admin-payouts/fps-batch-config.ts`

## Verify

```bash
bunx supabase db push
bun run supabase:types
bunx vitest run tests/unit/platform/platform-legal-config.test.ts
bunx vitest run tests/integration/platform/platform-legal.integration.test.ts
bunx tsc --noEmit
bun run build:ci
```

Manual:

1. Admin save → reload → text persists
2. `/terms` + `/privacy` match saved content
3. Footer `/terms#escrow` scrolls to article top (MVP)
4. `SELECT key FROM platform_settings` — no `fps_payout_config`
