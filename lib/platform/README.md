# Platform policy SSOT registry

Single reference for **where each platform policy lives**. New code must import keys from config/registry modules — never query `platform_settings` with raw string literals.

## Table 1 — `platform_settings` (DB SSOT)

| Key | Readers | Writers |
|-----|---------|---------|
| `platform_financial_config` | `fn_platform_commission_rate()`, `financial-config.ts` | Admin `/admin/settings` |
| `auth_escrow_config` | `fn_platform_auth_fee_hkd()`, `auth-escrow-config.ts` | Admin `/admin/settings` |
| `platform_terms` | `getPlatformTermsForDisplay()`, `platform-legal-config.ts` | Admin legal editor |
| `platform_privacy` | `getPlatformPrivacyForDisplay()`, `platform-legal-config.ts` | Admin legal editor |

Machine-readable: `lib/platform/platform-settings-registry.ts` → `PLATFORM_SETTINGS_KEY_REGISTRY`.

**Removed orphan:** `fps_payout_config` was seeded but never read — deleted by migration `20260921120000`.

## Table 2 — Code SSOT (not in `platform_settings`)

| Policy | TS module | SQL (if any) |
|--------|-----------|--------------|
| FPS manual transfer fee | `fps-payout-config.ts` | `fn_platform_fps_manual_transfer_fee_hkd()` |
| P2P meetup AML limits | `p2p-aml-config.ts` | `fn_assert_p2p_offer_aml_limits()` |
| FPS batch weekday / cutoff | `lib/admin-payouts/fps-batch-config.ts` | *(none)* |

Machine-readable: `CODE_SSOT_POLICIES` in `platform-settings-registry.ts`.

## Legal pages UX notes

- `/terms#escrow` (Footer link) scrolls to **top of article** in MVP plain-text mode, not the「鑑定託管流程」section.
- Privacy body uses plain-text cross-links e.g.「服務條款（/terms）」— not clickable `<Link>` in textarea SSOT.
