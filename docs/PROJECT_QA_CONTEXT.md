# Project QA Context Discovery

> **Generated:** 2026-09-08  
> **Purpose:** Read-only repository analysis to support future `AUTONOMOUS_QA_PROTOCOL.md`  
> **Scope:** Next.js App Router trading platform (Supabase + Stripe + Tailwind)  
> **Method:** Source code, migrations, configs, tests, CI workflows, SSOT docs — no application code modified

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Package Scripts](#2-package-scripts)
3. [Supabase / Database Architecture](#3-supabase--database-architecture)
4. [Server Actions](#4-server-actions)
5. [API Routes](#5-api-routes)
6. [Testing Infrastructure](#6-testing-infrastructure)
7. [SSOT / Documentation](#7-ssot--documentation)
8. [CI / Environment](#8-ci--environment)
9. [Critical User Journeys](#9-critical-user-journeys)
10. [High-Risk State Transitions](#10-high-risk-state-transitions)
11. [Known QA Gaps](#11-known-qa-gaps)
12. [Unknown Workflows Worth Testing](#12-unknown-workflows-worth-testing)
13. [Security-Sensitive Components](#13-security-sensitive-components)
14. [Financial-Sensitive Components](#14-financial-sensitive-components)
15. [Recommended QA Priorities](#15-recommended-qa-priorities)

---

## 1. Project Structure

### 1.1 Top-Level Layout

| Directory / File | Purpose | Key Files | Relationships |
|------------------|---------|-----------|---------------|
| `app/` | Next.js App Router — routes, server actions, API, feature UI | `page.tsx`, `layout.tsx`, `actions/`, `api/`, `components/` | Consumes `lib/`, `types/supabase.ts`; exposes UI + server contracts |
| `components/` | Shared shadcn/ui primitives (38 files) | `components/ui/*`, `components/reui/*` | Used by `app/components/` and route pages |
| `lib/` | Backend/domain logic (auth, payments, marketplace, admin, etc.) | `lib/auth/`, `lib/stripe/`, `lib/payments/`, `lib/member-order/` | Called by `app/actions/`, `app/api/`, server pages |
| `supabase/` | Database migrations + config | `migrations/*.sql` (284 files) | SSOT for schema; types generated to `types/supabase.ts` |
| `tests/` | Vitest unit + integration (141 files) | `tests/unit/`, `tests/integration/` | Uses real Supabase when env present |
| `e2e/` | Playwright E2E (~107 specs) | `e2e/partner/`, `e2e/auth.setup.ts` | Real browser; role-based storageState |
| `scripts/` | Dev/CI gates, seeds, validation | `production-gate.sh`, `prelaunch-check-env.sh` | Orchestrates test commands from `package.json` |
| `docs/` | SSOT docs, follow-up packets, policies | `docs/dev/system-feature-registry.md` | Defines feature IDs, test requirements |
| `.github/workflows/` | CI automation (5 workflows) | `ci.yml`, `rewards.yml`, `nightly-test-coverage.yml` | Runs subset of `package.json` scripts |
| `types/` | Generated Supabase types | `supabase.ts`, `supabase.md` | Single source of truth for DB row types |
| `public/` | Static assets, PWA, OneSignal | `public/assets/badges/`, service worker | Served by Next.js |
| `hooks/` | Shared React hooks | — | Frontend only |
| `backups/`, `reports/`, `test-results/` | Generated/runtime artifacts | — | Not source |

**Ignored for analysis:** `node_modules/`, `.next/`, `.git/`, build/cache dirs.

**Package manager:** Bun exclusively (`packageManager: bun@1.3.14` in `package.json`).

**Deployment:** `vercel.json` defines 13 cron routes hitting `/api/cron/*`.

---

### 1.2 `app/` — Routes & Subsystems

**Route segments (no route-group prefix):**

| Path | Responsibility |
|------|----------------|
| `app/page.tsx` | Home |
| `app/auth/` | Login, register, forgot/reset password, confirm email, suspended |
| `app/marketplace/` | Browse, product detail, seller storefront |
| `app/checkout/[id]/` | Unified checkout (member auth + merchant) |
| `app/profile/user/(dashboard)/` | Member: collection, inventory, trading, rewards, settings, order detail |
| `app/profile/merchant/(dashboard)/` | Merchant: finance, analytics, performance, inventory, trading, settings |
| `app/profile/[id]/` | Public profile + rating page |
| `app/admin/` | Admin console: dashboard, announcements, campaigns, catalog, check-in, disputes, grading, merchants, payouts, settings, user control |
| `app/announcements/`, `app/search/`, `app/settings/`, `app/terms`, `app/privacy` | Supporting pages |
| `app/~offline/` | PWA offline fallback |
| `app/serwist/[path]/` | Service worker route |

**Non-route subsystems inside `app/`:**

| Path | Files | Responsibility |
|------|-------|----------------|
| `app/actions/` | 47 `*.ts` files | Server Actions — mutations + data fetching contracts |
| `app/api/` | 24 route handlers | REST: cron, Stripe, uploads, KYC |
| `app/components/` | ~189 files | Feature UI (admin, chat, marketplace, profile, rewards, trading) |
| `app/lib/` | Route-local helpers | Chat merge, marketplace parsers, inventory hooks |

**Relationship:** Server pages call `app/actions/`; actions delegate to `lib/`; DB access via Supabase client; types from `types/supabase.ts`.

---

### 1.3 `components/`

Root `components/` is **presentation-only** shadcn/ui layer. Most feature UI lives in `app/components/`.

| Subdir | Purpose |
|--------|---------|
| `components/ui/` | shadcn primitives (button, dialog, card, tabs, chart, sidebar) |
| `components/reui/` | Extended UI (stepper, badge) |
| `components/auth/`, `errors/`, `listings/`, `shared/` | Small cross-route widgets |

---

### 1.4 `lib/` — Domain Modules

| Module | Path | Primary Responsibility |
|--------|------|------------------------|
| Auth | `lib/auth/` | Session, roles, `requireAdminPageAccess`, `requireActiveAuthUser`, `requireActiveApiUser` |
| Supabase | `lib/supabase/` | Client factories, `isSupabaseConfigured()`, env helpers |
| Stripe | `lib/stripe/` | Connect, webhooks, payment intents, dashboard URLs |
| Payments | `lib/payments/` | Capture/void/refund sagas (auth grading, goods capture) |
| Checkout | `lib/checkout/`, `lib/merchant-checkout/` | Pricing, checkout session loading |
| Marketplace | `lib/marketplace/`, `lib/listings/`, `lib/catalog/`, `lib/search/` | Search, listings, seller profiles |
| Orders | `lib/member-order/`, `lib/merchant-order/` | Order lifecycle, cancel, complete, payout |
| Auth Escrow | `lib/auth-escrow/` | Member auth escrow flow |
| Rewards | `lib/rewards/`, `lib/admin-rewards/` | Points, coupons, campaigns, check-in |
| Admin | `lib/admin-*` | Dashboard, payouts, grading, user control, check-in program |
| Moderation | `lib/moderation/` | Disputes, sanctions, refund preview |
| Notifications | `lib/notifications/`, `lib/email/` | Push (OneSignal), email outbox |
| Cron | `lib/cron/` | Cron route handlers logic |
| KYC | `lib/kyc/` | Document upload, application flow |
| Grading | `lib/grading/` | Card grading order ops |
| Storage | `lib/storage/` | Bunny CDN uploads |

---

### 1.5 `supabase/`

| Path | Purpose |
|------|---------|
| `supabase/migrations/` | 284 SQL migrations — tables, RPCs, RLS, triggers, grants |
| `supabase/config.toml` | Local Supabase project config |

Types regenerated via: `bun run supabase:types` → `types/supabase.ts` + `types/supabase.md`.

---

### 1.6 `tests/`

| Path | Framework | Count | Purpose |
|------|-----------|-------|---------|
| `tests/unit/` | Vitest | ~78 files | Pure logic, config contracts, notification gates |
| `tests/integration/` | Vitest | ~63 files | Real Supabase (env-gated), Stripe smoke, financial FSM |
| `tests/integration/shared/` | — | Setup helpers | `vitest.setup.ts`, `auth-context.ts`, `seed-user-points.ts` |

Config: `vitest.config.mts` (main), `vitest.mutation.config.mts`, `vitest.moderation-mutation.config.mts`.

---

### 1.7 `e2e/` & Playwright

| Path | Purpose |
|------|---------|
| `e2e/*.spec.ts` | Core E2E journeys (member, merchant, admin, rewards) |
| `e2e/partner/` | Partner regression specs (P-A/B/C/D/E/F series) |
| `e2e/helpers/` | Platform rewards, UI feature map, collection assets |
| `e2e/fixtures/` | Test data, chat fixtures |
| `e2e/auth.setup.ts` | Auth storageState generation for projects |

Config: `playwright.config.ts` — `testDir: ./e2e`, serial workers, HK timezone, role projects (setup/guest/buyer/seller/member-trading/chat-realtime).

**No separate `playwright/` directory** — config lives at repo root.

---

### 1.8 `scripts/`

| Category | Examples | Purpose |
|----------|----------|---------|
| Release gates | `production-gate.sh`, `prelaunch-gate.sh`, `rewards-release-gate.sh`, `moderation-release-gate.sh` | Multi-phase QA orchestration |
| Env validation | `prelaunch-check-env.sh`, `check-nightly-env.sh` | Required env vars before tests |
| E2E seeds | `seed-moderation-e2e.ts`, `seed-fps-payout-e2e.ts`, `seed-e2e-marketplace-listing.ts` | Fixture data for E2E |
| SSOT validation | `check-ui-feature-map.sh`, `check-ui-data-contracts.sh`, `validate-partner-ui-coverage.ts` | Contract parity checks |
| Codegen | `generate-supabase-md.ts`, `generate-supabase-auth-email-templates.ts` | Type/doc generation |
| Stripe dev | `stripe-webhook-listen.sh`, `stripe-webhook-sync-endpoint.ts` | Local webhook testing |

---

### 1.9 `docs/`

| Path | Purpose |
|------|---------|
| `docs/dev/` | Developer SSOT: API, DB, testing, gates, policies |
| `docs/dev/follow-up/<flow>/` | Per-feature backend.md + frontend.md handoff packets (~45 flows) |
| `docs/dev/system-feature-registry.md` | Feature checklist F-M/C/A/S (67 features) |
| `docs/dev/test-coverage-ssot.md` | Journey/technical test SSOT (J-*, TC-*, CC-*) |
| `docs/project-structure.md`, `docs/requirement.md` | High-level project docs |
| `docs/Role-Based-Access-Control.md` | RBAC reference |

---

### 1.10 CI / Configuration Files

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Push to main/Production: tsc, lint, UI map, build |
| `.github/workflows/rewards.yml` | Scheduled rewards integration + E2E |
| `.github/workflows/nightly-test-coverage.yml` | Nightly L2–L6 coverage |
| `.github/workflows/moderation-integration.yml` | Moderation gate |
| `.github/workflows/fps-payout-integration.yml` | FPS payout integration |
| `next.config.ts` | Next.js config |
| `vercel.json` | Cron schedules (13 jobs) |
| `eslint.config.mjs` | Lint rules |
| `tsconfig.json` | TypeScript |
| `components.json` | shadcn config |
| `proxy.ts` | Request proxy (auth routing) |

**No `.env.example`** — env documented in `docs/dev/e2e.md`, `scripts/prelaunch-check-env.sh`, `docs/dev/prelaunch-gate.md`.

---

## 2. Package Scripts

### 2.1 Development

| Command | Purpose | Env Required | Real DB | Skip Risk | Autonomous QA |
|---------|---------|--------------|---------|-----------|---------------|
| `bun run dev` | Next.js dev server (`0.0.0.0`) | Supabase URL/anon key for full features | Yes (if configured) | N/A | Smoke only |
| `bun run start` | Production server | Same | Yes | N/A | Post-build smoke |
| `bun run supabase:types` | Regenerate `types/supabase.ts` | Linked Supabase project | Yes | N/A | No (codegen) |
| `bun run email:generate-auth-templates` | Auth email templates | — | No | N/A | No |

### 2.2 Build & Typecheck

| Command | Purpose | Env Required | Real DB | Skip Risk | Autonomous QA |
|---------|---------|--------------|---------|-----------|---------------|
| `bunx tsc --noEmit` | TypeScript check | No | No | No | **Yes — CI Gate 1** |
| `bun run lint` | ESLint | No | No | No | **Yes — CI Gate 2** |
| `bun run build` | Next.js production build | Supabase env may be needed for prerender | Maybe | Throws if unguarded pages | **Yes — CI Gate 3** |
| `bun run build:ci` | Build with empty Supabase env | No (explicitly blank) | No | No | **Yes — prerender guard** |

### 2.3 Unit Tests (Vitest)

| Command | Purpose | Env | Real DB | Skip | Autonomous QA |
|---------|---------|-----|---------|------|---------------|
| `vitest run --config vitest.config.mts tests/unit/**` | Unit tests (~78 files) | Minimal | No (mocked) | No hard skip | Partial |
| `test:email:phase1`–`phase6` | Email notification gates | Mock | No | No | Phase-specific |
| `test:push:phase1`–`phase9a` | Push notification gates | Mock | No | No | Phase-specific |
| `test:rewards:mutation` | Stryker mutation (rewards) | — | — | — | Signoff only |
| `test:moderation:mutation` | Stryker mutation (moderation) | — | — | — | Signoff only |

### 2.4 Integration Tests (Vitest + Real Supabase)

| Command | Purpose | Env | Real DB | Skip | Autonomous QA |
|---------|---------|-----|---------|------|---------------|
| `test:integration:rewards` | Rewards domain (15 files) | `hasRewardsIntegrationEnv()` | **Yes** | `describe.skipIf` | High value |
| `test:integration:moderation` | Moderation matrix/refund | Full moderation env | **Yes** | `describe.skipIf` | High value |
| `test:integration:grading` | Auth grading FSM (18 files) | Base + Stripe smoke env | **Yes** | `describe.skipIf` | High value |
| `test:integration:platform` | Legal, auth fee, AML, admin settings | Base env | **Yes** | `describe.skipIf` | Medium |
| `test:integration:security` | `production-security.integration.test.ts` | Base env | **Yes** | Conditional skip | **High — not in CI** |
| `test:integration:trading-a2` | P2P, reviews, buy-now, order mutations | Base env | **Yes** | `describe.skipIf` | High |
| `test:integration:appendix-a` | Uploads, connect, KYC, chat, trading, admin | Base env | **Yes** | `describe.skipIf` | High |
| `test:integration:fps-payout` | FPS payout pipeline | FPS env | **Yes** | `describe.skipIf` | High |
| `test:integration:merchant-connect-payout` | Connect payout | Stripe env | **Yes** | `describe.skipIf` | High |
| `test:integration:stripe:webhook-route` | Webhook route handler | Stripe webhook env | **Yes** | `describe.skipIf` | High |
| `test:integration:cron-routes` | Cron HTTP routes | Cron env | **Yes** | `describe.skipIf` | Medium |
| `test:gate:partial` | Subset gate (webhook, coupon, connect, moderation) | Mixed | **Yes** | Env-gated | Gate subset |

**⚠️ FALSE-PASS RISK:** ~52 integration files use `describe.skipIf(!has*Env())` — entire suite silently skipped when env missing, exit code 0.

### 2.5 E2E (Playwright)

| Command | Purpose | Env | Real DB/Browser | Skip | Autonomous QA |
|---------|---------|-----|-----------------|------|---------------|
| `test:e2e` | All E2E | Full E2E env + webServer | **Yes** | Runtime `test.skip()` | Full journey |
| `test:e2e:rewards-gate` | Rewards phase 2–4 + matrix + coupon | E2E + Stripe | **Yes** | Heavy skip | Gate |
| `test:e2e:moderation-gate` | Report + admin moderation + notification | E2E + seed | **Yes** | Skip | Gate |
| `test:e2e:member-auth-escrow` | C2C auth escrow chain | member-trading project | **Yes** | Skip | High |
| `test:e2e:partner` | Full partner regression (~107 specs) | Full env | **Yes** | Skip | Partner QA |
| `test:e2e:smoke-partial` | Home, legal, password, announcements | Minimal | Browser | Skip | CI-adjacent |
| `test:e2e:nightly:*` | Member/merchant/admin/matrix nightly | Nightly env | **Yes** | Skip | Scheduled only |

**⚠️ FALSE-PASS RISK:** ~400+ runtime `test.skip()` calls across E2E — missing fixtures/env yields 0 executed tests with green exit.

### 2.6 Release Gates (Local / Scheduled)

| Command | Purpose | Duration | In CI |
|---------|---------|----------|-------|
| `test:production:gate` | Full production sign-off (~120–150 min) | Long | **No** |
| `test:production:gate:signoff` | Strict signoff (mutation required) | Long | **No** |
| `test:staging:certify` | Staging certification | Long | **No** |
| `test:rewards:gate` | Rewards release gate | Medium | Scheduled (rewards.yml) |
| `test:moderation:gate` | Moderation release gate | Medium | Scheduled |
| `test:auth-escrow:gate` | Auth escrow gate | Medium | **No** |
| `test:fps-payout:gate` | FPS payout gate | Medium | Scheduled |
| `test:prelaunch:gate` | Prelaunch 1a + 1b | Long | **No** |
| `test:partner:regression` | Partner regression shell | Long | **No** |

### 2.7 Supabase / DB Utilities

| Command | Purpose | Real DB |
|---------|---------|---------|
| `backup:db`, `backup:db:schema`, `backup:db:data` | DB backup scripts | **Yes** |
| `wipe:staging` | Wipe staging transactional data | **Yes** |
| `seed:*` | E2E seed scripts | **Yes (service role)** |

### 2.8 SSOT / Contract Validation

| Command | Purpose | Autonomous QA |
|---------|---------|---------------|
| `test:ui:check-map` | UI feature map contract | **Yes — CI Gate 2b** |
| `test:ui:check-data-contracts` | UI data contract parity | Manual/staging |
| `test:partner:check-ssot` | Partner regression SSOT | Manual |
| `test:staging:certify:check-ssot` | Staging cert SSOT | Manual |

---

## 3. Supabase / Database Architecture

**Source of truth:** `types/supabase.ts` (generated), `types/supabase.md` (human-readable), 284 migrations in `supabase/migrations/`.

### 3.1 Tables (45)

| Domain | Tables |
|--------|--------|
| Users / Auth | `profiles`, `user_push_subscriptions` |
| Marketplace | `listings`, `listing_bookmarks`, `listing_stats`, `listing_engagement_events`, `product_catalog`, `product_grading_market_prices`, `product_price_snapshots`, `product_watchlists` |
| P2P Trading | `member_orders`, `offers`, `chat_rooms`, `chat_messages`, `chat_room_reads` |
| Merchant Trading | `merchant_orders`, `merchant_shops`, `merchant_ledgers`, `kyc_records`, `kyc_applications`, `kyc_documents` |
| Payments / Settlement | `payout_batches`, `payout_requests`, `seller_receivables`, `platform_settings` |
| Rewards / Points | `reward_templates`, `user_rewards`, `reward_campaigns`, `reward_campaign_claims`, `reward_redemption_catalog`, `reward_redemption_claims`, `reward_template_audits`, `check_in_program`, `gamification_stats`, `point_ledger` |
| Moderation | `reports`, `report_attachments`, `moderation_cases`, `moderation_audit_logs`, `account_sanctions`, `grading_audit_logs` |
| Reputation | `transaction_reviews`, `user_collections` |
| Platform | `platform_announcements`, `notification_email_outbox` |

### 3.2 Views

- `public_profiles` — safe public profile fields (`security_barrier`)

### 3.3 Key Enums (State Machines)

| Enum | Values (summary) |
|------|------------------|
| `member_order_state` | `pending` → `meetup_arranged` → `completed` \| `cancelled` |
| `member_escrow_status` | `payment` → `custody` → `grading` → `shipped` → `released` \| `cancelled` |
| `escrow_state` (merchant) | `pending_payment` → `payment_held` → `shipped` → `authenticating` → `authenticated` → `completed_and_transferred` \| `refunded` |
| `offer_status` | `pending` → `accepted` \| `rejected` \| `cancelled` |
| `payment_capture_status` | `none` → `authorized` → `auth_fee_captured` → `fully_captured`; terminal: `voided`, `refunded`, `partially_refunded` |
| `member_seller_payout_status` | `none` → `held` → `ready` → `processing` → `paid` \| `frozen` \| `failed` |
| `payout_request_status` | `pending` → `ready` → `processing` → `completed` \| `failed` |
| `kyc_state` / `kyc_application_status` | pending → verified/approved \| rejected |
| `reward_template_status` | `draft` → `active` → `archived` |
| `sanction_type` | suspend, ban, freeze_payout, etc. |

**Note:** `merchant_orders.payout_status` and `refund_status` are **TEXT** (not enums) — validation only in RPCs.

### 3.4 Important RPCs (~250+ total)

**Offers & Order Creation:**
- `rpc_make_offer`, `rpc_modify_offer`, `rpc_accept_offer`, `rpc_reject_offer`
- `rpc_buy_now_listing`, `rpc_buy_now_merchant_listing`

**Payment Prepare / Capture (mostly service_role for finalize):**
- `rpc_prepare_member_auth_order_payment`, `rpc_prepare_merchant_order_payment`
- `rpc_attach_*_payment_intent`
- `rpc_mark_*_order_authorized`, `rpc_mark_*_order_paid`
- `rpc_finalize_auth_fee_capture`, `rpc_finalize_goods_capture`
- `rpc_mark_auth_order_payment_voided`

**Refunds:**
- `rpc_admin_prepare_auth_refund`, `rpc_finalize_auth_refund`
- `rpc_prepare_auth_grading_fail`, `rpc_finalize_auth_grading_fail`
- `rpc_prepare_moderation_order_refund`, `rpc_finalize_moderation_order_refund`

**Payouts:**
- `rpc_confirm_buyer_received`, `rpc_finalize_member_fps_payout_ready`
- `rpc_prepare_merchant_order_payout`, `rpc_finalize_merchant_order_payout`
- `rpc_admin_set_fps_payout_request_status`, `rpc_admin_batch_complete_fps_payout_requests`

**Coupons / Points:**
- `rpc_list_checkout_eligible_coupons`
- `fn_reserve_user_reward_for_*_order`, `fn_release_*_order_coupon`
- `execute_daily_check_in`, `rpc_redeem_points_catalog_item`
- `fn_apply_point_transaction` (internal ledger)

**Platform Config (service_role only post-remediation):**
- `fn_platform_financial_config`, `fn_platform_auth_escrow_config`

### 3.5 RLS & Security Patterns

- **~35 tables** with RLS enabled
- **~60 policies** across migrations
- Pattern: `REVOKE ALL FROM PUBLIC` → `GRANT EXECUTE` to `authenticated` / `service_role`
- **SECURITY DEFINER** RPCs with `auth.uid()` / `is_admin()` checks
- **Triggers:** `profiles_protect_role`, `fn_enforce_member_order_transitions`, `on_auth_user_created`

### 3.6 Latest Hardening

Migration `20261008120000_production_security_remediation.sql`:
- CRIT-01: `handle_new_user` always assigns `role = member`
- CRIT-02: Column-level UPDATE on `profiles`; role change blocked for non-service_role
- CRIT-03: Points RPCs (`fn_claim_mission_points`, `fn_redeem_member_points`) → service_role only
- DB-H-01: `kyc_records` restricted; public verification via `fn_get_merchant_public_verification`
- DB-H-02: `public_profiles` view replaces global profiles read
- DB-H-03: `platform_settings` public keys limited to legal docs
- DB-H-07: Remove global completed-order read policy

### 3.7 Security-Sensitive Tables / RPCs

| Area | Tables / RPCs | Sensitivity |
|------|---------------|-------------|
| Auth / Roles | `profiles.role`, `handle_new_user`, `profiles_protect_role` | Privilege escalation |
| Admin | `is_admin()`, admin RPCs, `platform_settings` | Platform config |
| PII / KYC | `kyc_applications`, `kyc_documents`, `profiles` | Personal data |
| Financial | `merchant_orders`, `member_orders`, `merchant_ledgers`, `payout_*` | Money movement |
| Points | `gamification_stats`, `point_ledger`, `user_rewards` | Virtual currency |
| Moderation | `account_sanctions`, `moderation_cases` | Account restrictions |

### 3.8 Financial / Concurrency-Sensitive Logic

| Risk | Mechanism |
|------|-----------|
| Double payment | Stripe PI idempotency; `payment_capture_status` FSM; service_role finalize RPCs |
| Double spending (coupons) | `fn_reserve_*` + stale reserve cron (`rpc_finalize_stale_coupon_reserve`) |
| Double payout | Payout status guards; T+3/T+7 holds; admin batch completion |
| Race on offer accept | `rpc_accept_offer` single-transaction; single pending offer constraint |
| Concurrent order cancel | Stripe void saga; `rpc_cancel_*` with capture status checks |
| Replay (webhook) | Stripe signature verification; idempotent RPC finalize |
| Points double-grant | Ledger append-only; direct mint RPCs service_role only |

---

## 4. Server Actions

**Location:** `app/actions/` — 47 files, all `"use server"`.

### 4.1 Auth Coverage Patterns

| Pattern | Used In | Notes |
|---------|---------|-------|
| `requireActiveAuthUser()` (mutation-guard) | `offers.ts` (mutations), `chat.ts` (`sendMessage`), `profile.ts` (mutations) | Checks suspension via `moderation_get_account_access_restriction` |
| `requireAdmin` / `isCurrentUserAdmin` | All `admin-*.ts`, `platform-legal.ts` | Admin role from `profiles.role` |
| `auth.getUser()` only | Most mutations: `orders`, `rewards`, `listings`, checkouts, etc. | **No suspension check** |
| No auth | `productCatalog.ts`, some public reads | Public data |

**Gap:** `requireActiveApiUser` exists in `lib/auth/require-active-api-user.ts` for API routes but is **not used in server actions** (only 3 files use `requireActiveAuthUser`).

### 4.2 HIGH RISK Server Actions Summary

| File | Key Exports | Auth | Tables/RPCs | Tests | Journey |
|------|-------------|------|-------------|-------|---------|
| **`orders.ts`** | cancel, complete, submit tracking, confirm received | getUser only | member/merchant orders, Stripe void | `tc-m25`, E2E | Order lifecycle |
| **`merchant-checkout.ts`** | buyNow, payment intent, status | getUser | merchant_orders, payment RPCs | integration, E2E | B2C checkout |
| **`member-auth-checkout.ts`** | load, payment intent, status | getUser | member_orders, payment RPCs | integration, E2E | C2C auth checkout |
| **`checkout.ts`** | loadCheckoutSession, getCheckoutPaymentStatus | delegated | — | E2E | Unified checkout |
| **`buy-now.ts`** | buyNowListing | getUser | `rpc_buy_now_listing` | `tc-m24` | Instant purchase |
| **`offers.ts`** | make/accept/modify/reject offer | mutation-guard (mutations) | offers, orders RPCs | integration, E2E | Negotiation |
| **`rewards.ts`** | check-in, grant points, redeem catalog, coupons | getUser | points/coupon RPCs | rewards integration, E2E | Rewards wallet |
| **`checkout-coupons.ts`** | listCheckoutEligibleCoupons | getUser | coupon RPCs | E2E | Checkout coupon |
| **`reward-flash.ts`** | claimFlashReward | getUser | flash campaign RPCs | partial | Flash campaigns |
| **`admin-payouts.ts`** | FPS batch, Connect retry, Stripe balance | requireAdmin | payout RPCs | fps integration | Admin payouts |
| **`admin-moderation.ts`** | resolve case, refund preview/retry | requireAdmin | moderation/refund RPCs | moderation integration, E2E | Dispute resolution |
| **`admin-grading.ts`** | pass/fail grading, refund, settlement | requireAdmin | grading/refund RPCs | grading integration, E2E | Grading ops |
| **`admin-kyc.ts`** | review KYC, Stripe bank summary | requireAdmin | kyc_*, Stripe | kyc integration, E2E | KYC review |
| **`admin-settings.ts`** | updatePlatformFinancialConfig | requireAdmin | platform_settings | auth-fee integration | Commission/auth fee |
| **`admin-member-orders.ts`** | confirmPlatformReceived, failMemberAuthOrder | **dev-only, no admin guard** | auth order RPCs | grading integration | Dev mock flow |
| **`merchant-kyc.ts`** | submitMerchantKycApplication | getOptionalAuthUser | kyc RPCs | kyc integration | Merchant KYC apply |
| **`merchant-finance.ts`** | settlements, summary | getOptionalAuthUser | finance RPCs | tc-m42 | Merchant finance |
| **`listings.ts`** | create/update listing | getUser | listings, moderation RPC | E2E | Listing management |
| **`reports.ts`** | submitUserReport | getUser | reports RPCs | E2E | User reporting |
| **`auth.ts`** | login, register, logout, password | createClient | profiles | E2E | Auth entry |

### 4.3 Lower-Risk Actions (Read-Heavy / Non-Financial)

`home.ts`, `marketplace.ts`, `collection.ts`, `inventory.ts`, `wishlist.ts`, `chat.ts` (reads), `reviews.ts`, `member-dashboard.ts`, `merchant-dashboard.ts`, `merchant-settings.ts`, `merchant-performance.ts`, `merchant-product-analytics.ts`, `notification-preferences.ts`, `push-subscriptions.ts`, `push-preferences.ts`, `user-activity.ts`, `productCatalog.ts`, `platform-legal.ts` (public reads).

### 4.4 Idempotency Observations

- Payment finalize RPCs designed for webhook replay (Stripe event idempotency)
- Coupon reserve/release has stale-reserve cron cleanup
- Offer accept creates order atomically in RPC
- Most server actions do **not** implement client-side idempotency keys
- Points/coupon grants rely on DB constraints + RPC guards

---

## 5. API Routes

**Location:** `app/api/` — 24 route handlers.

### 5.1 Route Inventory

| Route | Method | Purpose | Auth | HIGH RISK |
|-------|--------|---------|------|-----------|
| **`/api/stripe/webhook`** | POST | Stripe events: PI authorize/capture/void/refund, Connect account sync, transfer.created | Stripe signature (`STRIPE_WEBHOOK_SECRET`) | **YES — payment/refund/payout** |
| **`/api/stripe/connect/onboard`** | GET | Stripe Connect onboarding redirect | Session + KYC record | **YES — payout setup** |
| **`/api/stripe/connect/return`** | GET | Post-onboarding return; sync Connect flags | Session | **YES** |
| **`/api/stripe/connect/dashboard`** | GET | Express dashboard login link | Session + payout-ready check | **YES** |
| **`/api/cron/expire-merchant-pending-payment`** | GET | Cancel stale PIs; expire pending_payment orders | `CRON_SECRET` | **YES — payment void** |
| **`/api/cron/member-fps-payout-ready`** | GET | Finalize FPS payout candidates | `CRON_SECRET` | **YES — payout** |
| **`/api/cron/merchant-connect-payout-ready`** | GET | Connect payout ready candidates | `CRON_SECRET` | **YES — payout** |
| **`/api/cron/release-stale-coupon-reserves`** | GET | Release expired coupon reservations | `CRON_SECRET` | **YES — coupon** |
| **`/api/cron/process-email-outbox`** | GET | Process notification email queue | `CRON_SECRET` | Medium |
| **`/api/cron/order-fulfillment-reminders`** | GET | Order fulfillment push/email reminders | `CRON_SECRET` | Medium |
| **`/api/cron/aggregate-prices`** | GET/POST | Market price aggregation | `CRON_SECRET` | Low |
| **`/api/cron/ingest-platform-trades`** | GET/POST | Platform trade data ingest | `CRON_SECRET` | Low |
| **`/api/cron/wishlist-price-alerts`** | GET | Wishlist price alert notifications | `CRON_SECRET` | Low |
| **`/api/cron/chat-unread-digest`** | GET | Chat unread digest emails | `CRON_SECRET` | Low |
| **`/api/cron/reward-coupon-expiring-reminder`** | GET | Coupon expiry reminders | `CRON_SECRET` | Medium |
| **`/api/cron/merchant-connect-onboarding-reminder`** | GET | Connect onboarding nudge | `CRON_SECRET` | Medium |
| **`/api/cron/sanction-expiry-notifications`** | GET | Sanction expiry notifications | `CRON_SECRET` | Medium |
| **`/api/listings/upload-image`** | POST | Listing image → Bunny CDN | **`requireActiveApiUser`** | Medium (upload) |
| **`/api/profile/upload-avatar`** | POST | Profile avatar upload | Session auth | Low |
| **`/api/merchant/upload-avatar`** | POST | Merchant shop avatar | Session auth | Low |
| **`/api/merchant/upload-top-banner`** | POST | Merchant banner upload | Session auth | Low |
| **`/api/kyc/upload-document`** | POST | KYC document upload | Session auth | **YES — PII** |
| **`/api/reports/upload-evidence`** | POST | Report evidence upload | Session auth | Medium |
| **`/api/admin/upload-announcement-image`** | POST | Admin announcement image | Admin auth | Low |

### 5.2 Auth Patterns in API Routes

| Pattern | Routes |
|---------|--------|
| `requireActiveApiUser()` | `listings/upload-image` (recently added) |
| Session `supabase.auth.getUser()` | Upload routes (profile, merchant, kyc, reports, admin) |
| `CRON_SECRET` header/query | All `/api/cron/*` |
| Stripe webhook signature | `/api/stripe/webhook` |
| Session redirect (no JSON) | Stripe Connect routes |

### 5.3 UNKNOWN / UNTESTED API Routes

| Route | Gap |
|-------|-----|
| `/api/profile/upload-avatar` | No dedicated integration test found |
| `/api/merchant/upload-*` | Partial coverage via `tc-m30/m31` upload tests |
| `/api/kyc/upload-document` | KYC integration covers flow partially |
| `/api/reports/upload-evidence` | Moderation E2E covers report submit, not upload route directly |
| `/api/admin/upload-announcement-image` | `upload-announcement-image.integration.test.ts` exists |
| Cron routes (most) | `cron-routes.integration.test.ts` covers subset; not all crons individually tested |

### 5.4 External APIs

- **Stripe:** Payment intents, Connect accounts, webhooks, refunds, transfers
- **Bunny CDN:** Image storage (listings, avatars, banners, KYC docs, report evidence)
- **Resend:** Email delivery (via outbox processor)
- **OneSignal:** Push notifications (client-side SDK)

---

## 6. Testing Infrastructure

### 6.1 Frameworks

| Framework | Config | Scope |
|-----------|--------|-------|
| **Vitest 4.x** | `vitest.config.mts` | Unit + integration |
| **Playwright 1.61** | `playwright.config.ts` | E2E |
| **Stryker 9.x** | `stryker*.config.*` | Mutation testing (rewards, moderation) |
| **fast-check** | In PBT tests | Property-based testing (coupons, moderation) |

### 6.2 Test Inventory

| Group | Location | Command | Framework | Env | DB | Browser | Workflows |
|-------|----------|---------|-----------|-----|-----|---------|-----------|
| Unit | `tests/unit/` (~78) | vitest | Vitest | Minimal | Mock | No | Config contracts, notification gates, pricing |
| Integration — Rewards | `tests/integration/rewards/` (15) | `test:integration:rewards` | Vitest | Rewards env | **Real** | No | Coupons, points, check-in, matrix |
| Integration — Grading | `tests/integration/grading/` (18) | `test:integration:grading` | Vitest | Base + Stripe | **Real** | No | Auth grading FSM, pass/fail, cancel |
| Integration — Moderation | `tests/integration/moderation/` (5) | `test:integration:moderation` | Vitest | Full moderation | **Real** | No | Disputes, refunds, sanctions |
| Integration — Platform | `tests/integration/platform/` (11) | `test:integration:platform` | Vitest | Base | **Real** | No | Legal, AML, auth fee, FPS, connect |
| Integration — Trading | `tests/integration/trading/` (6) | `test:integration:trading-a2` | Vitest | Base | **Real** | No | P2P, buy-now, reviews, order mutations |
| Integration — Security | `tests/integration/security/` (1) | `test:integration:security` | Vitest | Base | **Real** | No | Production security remediation |
| Integration — Stripe | `tests/integration/stripe/` (2) | Various | Vitest | Stripe env | **Real** | No | Webhook route, Connect routes |
| Integration — KYC | `tests/integration/kyc/` (2) | `test:integration:kyc` | Vitest | Base | **Real** | No | Merchant KYC, admin list |
| Integration — Chat | `tests/integration/chat/` (2) | `test:integration:chat-actions` | Vitest | Base | **Real** | No | Chat actions, single pending offer |
| Integration — Uploads | `tests/integration/uploads/` (2) | `test:integration:upload-routes` | Vitest | Bunny env | **Real** | No | Upload route handlers |
| E2E — Core | `e2e/*.spec.ts` (~60) | `test:e2e` | Playwright | Full E2E | **Real** | **Real** | Member/merchant/admin journeys |
| E2E — Partner | `e2e/partner/` (~47) | `test:e2e:partner` | Playwright | Full E2E | **Real** | **Real** | Partner regression P-* |
| E2E — Rewards | `platform-rewards-*.spec.ts` | `test:e2e:rewards-gate` | Playwright | Stripe | **Real** | **Real** | B2C/C2C checkout + coupons |
| E2E — Moderation | `admin-moderation.spec.ts`, etc. | `test:e2e:moderation-gate` | Playwright | Seed required | **Real** | **Real** | Report → admin resolve → refund |

### 6.3 Test Helpers & Fixtures

| Helper | Path | Purpose |
|--------|------|---------|
| `vitest.setup.ts` | `tests/integration/shared/` | Global integration setup |
| `auth-context.ts`, `auth-state.ts`, `guest-auth.ts` | `tests/integration/shared/` | Auth fixtures for integration |
| `seed-user-points.ts` | `tests/integration/shared/` | Points seeding (service role) |
| Domain fixtures | `tests/integration/*/helpers/` | Rewards, moderation, grading, merchant fixtures |
| `auth.setup.ts` | `e2e/` | Playwright storageState generation |
| `test-data.ts`, `chat-test-data.ts` | `e2e/fixtures/` | E2E fixture IDs |
| Seed scripts | `scripts/seed-*.ts` | Moderation, FPS, marketplace E2E seeds |

### 6.4 Skip / False-Pass Analysis

| Pattern | Count | ⚠️ FALSE-PASS RISK |
|---------|-------|---------------------|
| `describe.skipIf(!has*Env())` in integration | ~52 files | **YES** — entire suite skipped silently |
| Runtime `test.skip()` in E2E | ~400+ calls | **YES** — missing env/fixtures = 0 tests run |
| `test.skip` / `describe.skip` / `it.skip` hardcoded | **0 in tests/** | No |
| Conditional skip in security test | 1 file | **YES** if base env missing |
| Project gating (`testInfo.project.name !== "buyer"`) | Widespread | Expected — not false pass within project |
| Fixture guards ("run seed first") | Many E2E | **YES** — skip without seed |

### 6.5 Security & Financial Test Coverage

| Domain | Unit | Integration | E2E | Notes |
|--------|------|-------------|-----|-------|
| Payment / Stripe | `stripe-capture-policy`, `merchant-payment-intent-guard` | webhook-route, connect-routes, grading stripe smoke | platform-rewards-stripe-reconcile, merchant-auth-baseline | Strong |
| Coupons | `rewards-mutation-contract`, `compute-pricing` | coupon-fsm, coupon-pbt, coupon-security, rewards-matrix | rewards-checkout-coupon, platform-rewards-matrix | Strong (matrix opt-in) |
| Points | `redeem-points-catalog-action` | points-redemption-catalog, admin-check-in | member-rewards-redeem | Medium |
| Refunds | `auth-grading-fail-*`, `moderation-order-refund-saga` | moderation matrix, phase-h-refund | moderation-auth-refund E2E | Strong |
| Payouts | `execute-connect-payout`, `fps-payout-config` | fps-payout, connect-payout-pipeline | admin-stripe-finance (smoke) | Medium |
| Auth / RBAC | `roles-path-guard`, `require-admin-page` | production-security | admin periphery E2E | **production-security not in CI** |
| KYC | — | merchant-kyc, admin-kyc-list | admin-merchants-kyc, p-f04b | Partial UI |
| Upload security | `upload-route.test.ts` | tc-m30/m31 | — | Route-level only |
| Concurrency / idempotency | PBT tests | coupon-pbt, moderation-pbt | — | Logic layer only |
| Suspended user mutations | — | production-security (new) | admin-moderation AB5 | **New, not in CI** |

---

## 7. SSOT / Documentation

### 7.1 Primary SSOT Documents

| Path | Purpose | Feature IDs | Testing Requirements | Current? | Conflicts |
|------|---------|-------------|---------------------|----------|-----------|
| `docs/dev/system-feature-registry.md` | 67-feature staging checklist (F-M/C/A/S) | F-M-01–26, F-C-01–13, F-A-01–14, F-S-01–13 | T0–T3 depth per feature; links to E2E/integration artifacts | Claims 67/67 ☑ | **Contradicts test-coverage-ssot (27/67)** |
| `docs/dev/test-coverage-ssot.md` | Journey/technical test SSOT v2.5 | J-*, TC-*, CC-*, SEC-* | S0–S2 solidity; Gate/Partial/HasTest/Missing | Header says 27/67 | **Stale vs registry** |
| `docs/dev/INTEGRATION_QUEUE.md` | Backend↔frontend handoff (~50 flows) | Flow names | Ready/Partial/Wired status | Active | Partial flows marked ☑ in registry |
| `docs/dev/api.md` | API contract SSOT | — | Envelope format, domain listing | Active | — |
| `docs/dev/database.md` | Database SSOT | — | ENUMs, DDL, RLS patterns | Active | May lag latest migrations |
| `docs/dev/config-contract-registry.md` | Config key parity | CC-* | CC-UNIT + CC-INT + CC-E2E per key | Active | Cron HTTP marked ☐ |
| `docs/dev/partner-regression.md` | Partner UI regression (P-*) | P-A/B/C/D/E/F | SC-P0 requirements | Active | — |
| `docs/dev/PRODUCTION_GATE.md` | Production sign-off gate | — | Phase list, env requirements | Active | Not in CI |
| `docs/dev/prelaunch-gate.md` | Prelaunch gate phases | — | Env + manual QA | Active | — |
| `docs/dev/staging-certification.md` | Staging cert command | SC-* | `test:staging:certify` | Active | Manual only |
| `docs/dev/e2e.md` | E2E env vars + setup | — | Env table, project roles | Active | No `.env.example` |
| `docs/dev/e2e-tiering.md` | E2E tier classification | — | L2–L6 tiers | Active | — |
| `docs/dev/escrow-payment-policy.md` | Escrow payment rules | — | Business policy | Active | — |
| `docs/dev/refund-policy.md` | Refund rules | — | Business policy | Active | — |
| `docs/dev/capture-policy.md` | Capture policy | — | Business policy | Active | — |
| `docs/dev/email-notifications-ssot.md` | Email trigger registry | — | Phase gates | Active | — |
| `docs/dev/push-notifications-ssot.md` | Push notification registry | — | Phase gates | Active | — |
| `docs/dev/ui-feature-map.json` + `.md` | UI route → feature mapping | SC-UI-MAP | CI Gate 2b | Active | — |
| `docs/dev/ui-data-contracts.json` | UI data contract assertions | — | Partner data contract E2E | Active | — |
| `docs/Role-Based-Access-Control.md` | RBAC reference | — | Role permissions | Active | — |
| `PRODUCTION_READINESS_AUDIT.md` | Production audit (untracked) | — | Security findings | Recent | References new security files |
| `.stitch/designs/DESIGN.md` | Stitch design system | — | UI only | Active | — |

### 7.2 Follow-Up Packets

~45 flows under `docs/dev/follow-up/<flow-name>/` with `backend.md` + `frontend.md` (+ optional plan, PARTNER_REPORT, e2e-checklist).

Key financial flows: `unified-checkout`, `member-auth-checkout`, `merchant-checkout`, `admin-payouts`, `member-fps-payout`, `admin-moderation`, `auth-escrow-v2`, `platform-rewards-v2`.

### 7.3 Document Discrepancies (Report Only)

1. **Registry vs test-coverage-ssot:** 67/67 ☑ vs 27/67 — progress claims unreliable
2. **INTEGRATION_QUEUE Partial vs registry ☑:** offers/negotiation UI, chat inbox, user trading orders, merchant KYC UI marked Partial but registry checked
3. **No `.env.example`:** env requirements scattered across docs and scripts
4. **`database.md` vs migrations:** 284 migrations; doc may not reflect latest remediation migration
5. **`test-coverage-solidity-ssot.md`:** Referenced in `.cursorrules` but file is `test-coverage-ssot.md`

---

## 8. CI / Environment

### 8.1 CI Currently Verifies (on push to main/Production)

| Check | Workflow | Command |
|-------|----------|---------|
| TypeScript | `ci.yml` | `bunx tsc --noEmit` |
| Lint | `ci.yml` | `bun run lint` |
| UI Feature Map | `ci.yml` | `bun run test:ui:check-map` |
| Production Build | `ci.yml` | `bun run build` |

### 8.2 CI Scheduled / Label-Gated

| Check | Workflow | Trigger |
|-------|----------|---------|
| Rewards integration + E2E | `rewards.yml` | Schedule 21:00 UTC, label `rewards`, dispatch |
| Nightly coverage (L2–L6) | `nightly-test-coverage.yml` | Schedule 19:00 UTC, dispatch |
| Moderation gate | `moderation-integration.yml` | Schedule 04:00 UTC, label `moderation` |
| FPS payout integration | `fps-payout-integration.yml` | Schedule 04:30 UTC, label `fps-payout` |
| Platform integration | `nightly-test-coverage.yml` | PR label `platform` |
| Nightly E2E P2 | `nightly-test-coverage.yml` | PR label `nightly-e2e` |

### 8.3 CI Does NOT Verify

- All integration tests (except scheduled subsets)
- All E2E tests (except scheduled subsets)
- `test:production:gate` / `test:production:gate:signoff`
- `test:staging:certify`
- `test:integration:security` (production security remediation)
- Full grading integration suite
- `test:e2e:partner` / `test:partner:regression`
- Email/push notification phase gates
- `build:ci` (empty-env prerender guard) — only in production gate
- Auth escrow gate
- Prelaunch gates
- Mutation tests (except weekly rewards mutation in rewards.yml)
- Concurrency / idempotency E2E
- Suspended-user mutation blocking across all actions

### 8.4 Environment Configuration

**Required for Phase 1a (prelaunch):**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `E2E_ADMIN_EMAIL/PASSWORD`, `E2E_BUYER_EMAIL/PASSWORD`, `E2E_SELLER_EMAIL/PASSWORD`
- `E2E_SELLER_ID`, `E2E_LISTING_ID`

**Required for Phase 1b (Stripe E2E):**
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`

**Cron routes:** `CRON_SECRET` for `/api/cron/*`

**Vercel crons:** 13 scheduled jobs in `vercel.json` (production/staging deployment)

### 8.5 Environment Risks

| Risk | Impact |
|------|--------|
| No `.env.example` | Onboarding friction; silent test skips |
| Integration tests skip without env | False green on missing secrets |
| E2E runtime skips | False green on missing fixtures/seeds |
| `build` vs `build:ci` | CI build may pass where prerender would fail without env guards |
| Production gate local-only | Full sign-off never automated in CI |
| Staging/production parity unknown | No automated staging cert in CI |
| Security integration untracked | New remediation tests not wired to any workflow |
| SSOT doc drift | Feature completion claims may be inaccurate |

---

## 9. Critical User Journeys

Based on routes, actions, RPCs, and E2E specs actually present in the codebase:

| # | Journey | Entry Points | Key Actions/RPCs | Test Artifacts |
|---|---------|--------------|------------------|----------------|
| 1 | **Signup / Login / Logout** | `/auth` | `auth.ts` | E2E setup, `member-auth-password` |
| 2 | **Password recovery** | `/auth/forgot-password` | `auth.ts` | `member-auth-password` |
| 3 | **Suspended account** | `/auth/suspended` | moderation sanctions | `admin-moderation` AB5 |
| 4 | **Profile settings** | `/profile/user/settings` | `profile.ts` | `member-auth-settings` |
| 5 | **Merchant KYC apply** | Merchant settings | `merchant-kyc.ts`, `rpc_submit_merchant_kyc_application` | kyc integration, `p-f04b` |
| 6 | **Admin KYC review** | `/admin/merchants` | `admin-kyc.ts` | kyc integration, `admin-merchants-kyc` |
| 7 | **Stripe Connect onboarding** | Merchant finance | `/api/stripe/connect/*` | connect-routes integration |
| 8 | **Listing create/edit** | Inventory | `listings.ts` | `member-inventory`, E2E |
| 9 | **Marketplace browse/search** | `/marketplace`, `/search` | `marketplace.ts` | `marketplace-storefront`, `p-e04` |
| 10 | **Make/accept/reject offer** | Product detail, chat | `offers.ts`, offer RPCs | `member-offer-negotiation`, `marketplace-search-offer` |
| 11 | **Buy now (P2P)** | Listing detail | `buy-now.ts` | `tc-m24` |
| 12 | **Buy now (merchant B2C)** | Merchant listing | `merchant-checkout.ts` | `p-e05`, rewards phase 2 |
| 13 | **P2P meetup order** | Trading | `orders.ts`, member order RPCs | `member-trading-p2p` |
| 14 | **C2C auth escrow** | Offer accept + checkout | `member-auth-checkout.ts`, auth escrow RPCs | `member-auth-escrow`, `p-e08` |
| 15 | **B2C auth escrow (merchant)** | Merchant checkout | `merchant-checkout.ts`, grading RPCs | `merchant-auth-baseline-checkout`, grading E2E |
| 16 | **Merchant direct (no auth)** | Merchant checkout | `merchant-checkout.ts` | `p-e08d` |
| 17 | **Payment (Stripe PI)** | `/checkout/[id]` | Payment prepare/attach RPCs + webhook | Stripe reconcile E2E |
| 18 | **Coupon at checkout** | Checkout | `checkout-coupons.ts`, reserve RPCs | `rewards-checkout-coupon`, matrix |
| 19 | **Points check-in / redeem** | Rewards page | `rewards.ts` | `member-rewards-redeem`, phase 4 |
| 20 | **Order cancel** | Order detail | `orders.ts`, cancel RPCs + Stripe void | integration, E2E guards |
| 21 | **Order complete / confirm received** | Order detail | `orders.ts`, complete RPCs | P2P E2E, payout trigger |
| 22 | **Inbound/outbound tracking** | Order detail | `orders.ts`, tracking RPCs | auth escrow E2E |
| 23 | **Admin grading (pass/fail/refund)** | `/admin/grading` | `admin-grading.ts` | grading integration, `admin-grading` E2E |
| 24 | **Moderation report → resolve → refund** | Report + admin disputes | `reports.ts`, `admin-moderation.ts` | moderation gate |
| 25 | **Admin FPS payout batch** | `/admin/payouts` | `admin-payouts.ts` | fps integration |
| 26 | **Merchant Connect payout** | Cron + admin | Connect payout RPCs | connect-payout integration |
| 27 | **Admin platform settings** | `/admin/settings` | `admin-settings.ts` | auth-fee integration |
| 28 | **Admin user control / sanctions** | `/admin/user_control` | `admin-user-control.ts` | `admin-user-control`, `admin-dispute-freeze` |
| 29 | **Chat (realtime)** | Chat inbox | `chat.ts` | `global-chat-realtime` |
| 30 | **Transaction review** | Order detail / profile | `reviews.ts` | `tc-m22` |
| 31 | **Collection / wishlist** | Member dashboard | `collection.ts`, `wishlist.ts` | `member-collection-wishlist` |
| 32 | **Public profile + ratings** | `/profile/[id]` | `profile.ts`, `reviews.ts` | `public-profile-page` |
| 33 | **Platform announcements** | `/announcements` | `admin-announcements.ts` | announcements gate |
| 34 | **Legal pages** | `/terms`, `/privacy` | `platform-legal.ts` | `legal-pages-smoke` |
| 35 | **Admin check-in program** | `/admin/check-in-program` | `admin-check-in-program.ts` | `admin-check-in-program` |
| 36 | **Flash reward campaigns** | Rewards | `reward-flash.ts` | partial |
| 37 | **Merchant finance settlements** | Merchant finance | `merchant-finance.ts` | `merchant-finance-smoke`, `p-f04b` |

---

## 10. High-Risk State Transitions

### 10.1 Member Orders (P2P)

```text
# Meetup flow
pending → meetup_arranged → completed
pending → cancelled
meetup_arranged → cancelled

# Auth escrow flow (escrow_status)
payment → custody → grading → shipped → released
payment → cancelled (void PI)
grading → cancelled (fail grading → refund)
```

### 10.2 Merchant Orders

```text
# Escrow status
pending_payment → payment_held → shipped → authenticating → authenticated → completed_and_transferred
pending_payment → cancelled (expiry cron / manual cancel)
authenticated → refunded (grading fail / moderation refund)

# Payment capture
none → authorized → auth_fee_captured → fully_captured
authorized → voided (cancel)
fully_captured → refunded / partially_refunded

# Payout (TEXT status)
pending → held → processing → paid
held → frozen (sanction)
processing → failed → (retry)
```

### 10.3 Offers

```text
pending → accepted (creates order)
pending → rejected
pending → cancelled (modify creates new pending)
```

### 10.4 Listings

```text
active → sold (order created)
active → inactive (seller action)
```

### 10.5 Coupons (user_rewards)

```text
available → reserved (checkout) → used
available → reserved → released (cancel/void/stale cron)
```

### 10.6 Points

```text
balance += earn (check-in, template, campaign)
balance -= spend (catalog redeem)
ledger append-only via fn_apply_point_transaction
```

### 10.7 KYC

```text
kyc_applications: pending → approved | rejected
kyc_records: pending → verified | rejected
Stripe Connect: charges_enabled / payouts_enabled sync
```

### 10.8 Moderation / Sanctions

```text
report: submitted → under_review → resolved
moderation_case: open → resolved
sanction: active → expired
account: active → suspended | banned
payout: held → frozen (freeze_payout sanction)
```

### 10.9 Payout Requests (FPS)

```text
pending → ready → processing → completed
processing → failed
```

---

## 11. Known QA Gaps

### 11.1 Untested / Partially Tested

| Gap | Evidence |
|-----|----------|
| Main CI has no DB/E2E tests | `ci.yml` only runs tsc/lint/build |
| `test:integration:security` not in any workflow | New file, no CI wiring |
| Production gate not automated | Local-only ~2.5h script |
| Staging certification not in CI | Manual `test:staging:certify` |
| Auth escrow gate not in CI | `test:auth-escrow:gate` manual only |
| Email/push phase gates not in CI | 20+ phase scripts, no workflow |
| Full partner regression not in CI | `test:e2e:partner` manual |
| `build:ci` not in main CI | Prerender guard only in production gate |
| Cron routes partially tested | `cron-routes.integration.test.ts` covers subset |
| Upload routes (profile/merchant/kyc) | Partial; no suspension guard test |
| Flash reward campaigns | Limited test coverage |
| Merchant notifications | INTEGRATION_QUEUE notes mock only |
| Admin catalog mutations | Read-only integration |
| Concurrent mutation / double-click | No dedicated tests |
| Two-tab / stale page during checkout | No dedicated E2E |
| Permission change mid-workflow | No dedicated tests |
| API timeout / partial failure retry | No dedicated tests |

### 11.2 Mocked Only

| Area | Evidence |
|------|----------|
| Email notification phases | Unit gate tests with mocks |
| Push notification phases | Unit gate tests with mocks |
| Merchant settings notifications | INTEGRATION_QUEUE: mock |

### 11.3 Missing Authorization Coverage

| Gap | Detail |
|-----|--------|
| Suspension guard on most mutations | Only 3 action files use `requireActiveAuthUser` |
| Admin-member-orders dev actions | No admin guard, dev-only |
| Direct RPC invocation | service_role RPCs not tested for authenticated bypass |
| Role escalation | `production-security.integration.test.ts` exists but not in CI |

### 11.4 Missing Idempotency / Concurrency Coverage

| Gap | Detail |
|-----|--------|
| Double-click checkout pay | No E2E |
| Duplicate offer accept | RPC guards exist; no concurrent test |
| Webhook replay | Integration test exists; not in main CI |
| Stale coupon reserve race | Cron tested partially |
| Double admin payout batch | No concurrent test |

### 11.5 Missing E2E

| Journey | Status |
|---------|--------|
| Full merchant grading ops (P15) | Partial — preflight scripts exist |
| Member FPS payout end-to-end | Integration only; limited E2E |
| Admin reward campaign management | Limited |
| Variable commission/appraisal fee UI | Config tested; UI partial |

### 11.6 SSOT / Documentation Gaps

- Registry claims 67/67 but test-coverage-ssot says 27/67
- No `.env.example`
- Partial flows marked complete in registry

---

## 12. Unknown Workflows Worth Testing

Realistic high-risk workflows not clearly covered by existing tests:

| # | Workflow | Risk | Suggested Focus |
|---|----------|------|-----------------|
| 1 | Double-click "Pay" on checkout | Double charge attempt | E2E + integration |
| 2 | Refresh browser during payment processing | Stale PI / duplicate attach | E2E |
| 3 | Back button from checkout success to checkout | Re-pay attempt | E2E |
| 4 | Two tabs: accept offer in both | Race on single pending offer | Integration |
| 5 | Two tabs: apply same coupon at checkout | Double reserve | Integration |
| 6 | Submit listing while account gets suspended | Mutation after sanction | Action + integration |
| 7 | Complete order while payout frozen | Payout state conflict | Integration |
| 8 | Admin refund while buyer confirms received | Concurrent state change | Integration |
| 9 | Webhook arrives after manual cancel | PI state mismatch | Integration |
| 10 | Cron expires payment while buyer paying | Race with Stripe | Integration |
| 11 | Direct URL to `/checkout/[id]` for completed order | Guard bypass | E2E (partial: `p-b06`) |
| 12 | Expired session mid-checkout | Auth loss during payment | E2E |
| 13 | Suspended user calls order cancel action | Auth guard gap | Integration |
| 14 | Non-admin direct access to admin action | Authorization bypass | Integration |
| 15 | Upload large file / wrong MIME to upload routes | Input validation | Integration |
| 16 | Retry failed moderation refund | Saga recovery | Integration (partial) |
| 17 | Merchant Connect payout during grading recovery hold | Hold deduction race | Integration |
| 18 | Points redeem at zero stock | Oversell | Integration |
| 19 | Check-in twice same day | Duplicate earn | Integration |
| 20 | Browser close/reopen during auth escrow tracking submit | Partial state | E2E |
| 21 | API timeout on Stripe webhook processing | Partial finalize | Integration |
| 22 | Direct API call to cron route without secret | Unauthorized cron trigger | Integration |
| 23 | Profile role UPDATE attempt by authenticated user | Privilege escalation | Integration (production-security) |
| 24 | Concurrent admin FPS batch completion | Double payout | Integration |

---

## 13. Security-Sensitive Components

### 13.1 Authentication

| Component | Location | Sensitivity |
|-----------|----------|-------------|
| Supabase Auth | `lib/supabase/`, `app/actions/auth.ts` | Session management |
| Auth callback | `app/auth/confirm-email/` | Email confirmation |
| Password flows | `auth.ts` | Credential reset |
| `proxy.ts` | Root | Route-level auth redirect |
| `getOptionalAuthUser()` | `lib/auth/session.ts` | SSR auth guard |

### 13.2 Authorization

| Component | Location | Sensitivity |
|-----------|----------|-------------|
| `isCurrentUserAdmin()` | `lib/auth/require-admin.ts` | Admin role check |
| `requireAdminPageAccess()` | `lib/auth/require-admin.ts` | Admin layout SSR gate |
| `requireActiveAuthUser()` | `lib/auth/mutation-guard.ts` | Mutation + suspension check |
| `requireActiveApiUser()` | `lib/auth/require-active-api-user.ts` | API route auth + suspension |
| `profiles.role` + trigger | DB migration | Role escalation prevention |
| RLS policies | 284 migrations | Row-level access control |

### 13.3 PII / KYC

| Component | Location | Sensitivity |
|-----------|----------|-------------|
| `kyc_applications`, `kyc_documents` | DB | Identity documents |
| `/api/kyc/upload-document` | API | Document upload |
| `admin-kyc.ts` | Actions | Admin review + signed URLs |
| `public_profiles` view | DB | Safe public exposure |

### 13.4 Admin / Moderation

| Component | Location | Sensitivity |
|-----------|----------|-------------|
| `admin-moderation.ts` | Actions | Case resolution, refund |
| `admin-user-control.ts` | Actions | User search, sanctions |
| `admin-settings.ts` | Actions | Financial config |
| `account_sanctions` | DB | suspend/ban/freeze_payout |
| `moderation_get_account_access_restriction` | RPC | Suspension check |

### 13.5 Service Role Boundaries

| Component | Sensitivity |
|-----------|-------------|
| Stripe webhook handler | Marks orders paid, finalizes capture/refund |
| Cron routes | Payout ready, coupon release, payment expiry |
| `createAdminClient()` | Bypasses RLS for admin ops |
| E2E seed RPCs | Must never be exposed to client |
| Points RPCs (post-remediation) | service_role only |

---

## 14. Financial-Sensitive Components

### 14.1 Payment Processing

| Component | Flow |
|-----------|------|
| `app/api/stripe/webhook/route.ts` | All Stripe event processing |
| `member-auth-checkout.ts` | C2C auth payment intent |
| `merchant-checkout.ts` | B2C payment intent |
| `rpc_prepare_*_payment` | Payment preparation |
| `rpc_mark_*_authorized/paid` | Payment state transitions |
| `rpc_finalize_*_capture` | Capture finalize |
| `payment_capture_status` enum | Capture FSM |

### 14.2 Refunds

| Component | Flow |
|-----------|------|
| `admin-grading.ts` → fail grading | Auth refund saga |
| `admin-moderation.ts` → refund | Moderation refund saga |
| `rpc_finalize_auth_refund` | Stripe refund finalize |
| `rpc_finalize_moderation_order_refund` | Post-sale refund |
| `refund_status` (TEXT) | Refund tracking |

### 14.3 Payouts

| Component | Flow |
|-----------|------|
| `admin-payouts.ts` | FPS batch, Connect retry |
| `rpc_finalize_member_fps_payout_ready` | Member seller FPS |
| `rpc_prepare/finalize_merchant_order_payout` | Connect transfer |
| `/api/cron/member-fps-payout-ready` | Cron trigger |
| `/api/cron/merchant-connect-payout-ready` | Cron trigger |
| T+3 / T+7 holds | Payout timing guards |

### 14.4 Coupons / Subsidies

| Component | Flow |
|-----------|------|
| `checkout-coupons.ts` | Eligible coupon listing |
| `fn_reserve_user_reward_for_*` | Checkout reservation |
| `fn_compute_platform_subsidy` | Discount calculation |
| `/api/cron/release-stale-coupon-reserves` | Stale reserve cleanup |
| `user_rewards.reserved_*` | Reservation state |

### 14.5 Points / Rewards

| Component | Flow |
|-----------|------|
| `rewards.ts` | Check-in, grant, redeem |
| `point_ledger` | Append-only ledger |
| `gamification_stats.points_balance` | Balance |
| `rpc_redeem_points_catalog_item` | Catalog redemption |
| `admin-rewards.ts`, `admin-reward-campaigns.ts` | Admin template/campaign management |

### 14.6 Platform Financial Config

| Component | Flow |
|-----------|------|
| `admin-settings.ts` | Commission rate, auth fee |
| `platform_settings` table | Config storage |
| `fn_platform_financial_config` | service_role only |
| `fn_platform_commission_rate` | Used in payout snapshot |

---

## 15. Recommended QA Priorities

Priority order for `AUTONOMOUS_QA_PROTOCOL.md` based on this discovery:

### P0 — Must Verify Before Any Release

1. Wire `test:integration:security` into CI (or production gate)
2. Extend `requireActiveAuthUser` to all financial mutations (orders, checkouts, rewards, listings)
3. Ensure main CI runs at minimum `build:ci` (not just `build`)
4. Add env validation step that **fails** if integration tests would全部 skip
5. Stripe webhook + payment FSM integration on every PR (label-gated minimum)

### P1 — High-Value Autonomous QA Commands

| Command | Covers |
|---------|--------|
| `bunx tsc --noEmit && bun run lint && bun run build:ci` | Compile + prerender guard |
| `bun run test:integration:security` | Security remediation |
| `bun run test:gate:partial` | Webhook, coupon, connect, moderation subset |
| `bun run test:e2e:smoke-partial` | Core smoke journeys |
| `bun run test:ui:check-map && bun run test:ui:check-data-contracts` | Contract parity |

### P2 — Financial Regression Suite

| Command | Covers |
|---------|--------|
| `bun run test:integration:rewards` | Coupons, points, matrix |
| `bun run test:integration:grading` | Auth grading FSM |
| `bun run test:integration:moderation` | Dispute refunds |
| `bun run test:integration:fps-payout` | FPS pipeline |
| `bun run test:integration:merchant-connect-payout` | Connect payout |
| `bun run test:e2e:rewards-gate` | Checkout + coupon E2E |

### P3 — Journey Coverage Expansion

1. Suspended-user mutation blocking (all HIGH RISK actions)
2. Double-click / refresh during checkout E2E
3. Concurrent offer accept / coupon reserve integration
4. Cron route auth rejection tests
5. Upload route suspension guard parity with listings route

### P4 — Documentation Hygiene

1. Create `.env.example` from `prelaunch-check-env.sh` requirements
2. Reconcile registry (67/67) vs test-coverage-ssot (27/67)
3. Update INTEGRATION_QUEUE Partial statuses vs registry
4. Rename reference to `test-coverage-ssot.md` in rules (not `test-coverage-solidity-ssot.md`)

### P5 — Scheduled / Manual Only (Keep but Don't Rely on for PR)

- `test:production:gate:signoff`
- `test:staging:certify`
- `test:e2e:partner`
- `test:rewards:mutation` / `test:moderation:mutation`
- Email/push phase gates

---

## Appendix A: Auth Guard File Reference

| File | Path | Used By |
|------|------|---------|
| `mutation-guard.ts` | `lib/auth/mutation-guard.ts` | Server actions (3 files) |
| `require-active-api-user.ts` | `lib/auth/require-active-api-user.ts` | API routes (1 file: listings upload) |
| `require-admin.ts` | `lib/auth/require-admin.ts` | Admin layout + admin actions |
| `session.ts` | `lib/auth/session.ts` | SSR pages, optional auth |
| `roles-path-guard` | `lib/auth/` | Route access by role |

## Appendix B: Key Config Files

| File | Purpose |
|------|---------|
| `playwright.config.ts` | E2E config, projects, webServer |
| `vitest.config.mts` | Unit + integration config |
| `vitest.mutation.config.mts` | Coupon PBT mutation |
| `vitest.moderation-mutation.config.mts` | Moderation PBT mutation |
| `stryker*.config.*` | Stryker mutation testing |
| `next.config.ts` | Next.js |
| `vercel.json` | Cron schedules |
| `components.json` | shadcn |
| `proxy.ts` | Auth proxy |

## Appendix C: Feature ID Cross-Reference

| SSOT | ID Pattern | Count |
|------|------------|-------|
| Feature Registry | F-M-*, F-C-*, F-A-*, F-S-* | 67 |
| Test Coverage | J-*, TC-*, CC-*, SEC-* | ~100+ |
| Partner Regression | P-A/B/C/D/E/F-* | ~50+ |
| UI Feature Map | SC-UI-MAP | CI enforced |
| Config Contract | CC-* | Per config key |

---

*End of document. Generated from repository source at commit time (2026-09-08). No application code, migrations, tests, or CI configs were modified during this analysis.*
