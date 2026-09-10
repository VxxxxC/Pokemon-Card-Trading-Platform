# Test Solidity Plan — UI ↔ Backend Contract Parity

> **Incident (2026-08-16):** Partner created C2C-eligible free-shipping coupons in Admin; checkout greyed them out. Root cause: integration tests used `buildMemberAuthFreeShippingInput()` with `order_kinds: ["merchant","member"]`, but Admin UI never exposed `order_kinds` (default `["merchant"]` only). Tests passed; partner path failed.

This document defines how we prevent **“tests green, partner red”** regressions across the platform—not only for rewards.

---

## 1. Problem class: Fixture Parity Gap (= Config Contract Parity)

| Layer | What happened |
|-------|----------------|
| **DB / RPC** | `restrictions.order_kinds` gates member checkout |
| **Admin UI** | Field missing; partners could not set `member` |
| **Integration tests** | Bypassed UI via `buildMemberAuthFreeShippingInput()` |
| **E2E** | Merchant checkout covered; C2C admin → checkout missing |

**Rule:** Any runtime config key affecting eligibility **must** be settable in Admin (or documented system-only) and covered by **CC-INT + CC-E2E** for P0 journeys.

**Macro registry:** [config-contract-registry.md](./config-contract-registry.md) — all domains, not only rewards.

---

## 2. Three-layer defense (mandatory for money / eligibility flows)

### Layer A — Single source of truth (SSOT)

- Product rules live in `docs/dev/` + RPC comments (e.g. member auth = `free_shipping` only).
- Admin defaults in `lib/admin-rewards/types.ts` + `defaultRestrictionsForRewardType()` must match RPC defaults.
- When RPC adds a new `restrictions.*` key → same PR must add Admin control or explicit “system-only” note.

### Layer B — Contract tests (fast, CI on every PR)

| Check | Example |
|-------|---------|
| **Form ↔ payload** | Unit: `buildDefaultActivityForm()` + type change → restrictions match `defaultRestrictionsForRewardType` |
| **Payload ↔ RPC** | Integration: publish via `upsertAdminRewardActivity` **without** fixture overrides; assert DB row |
| **Parse round-trip** | `activityRowToForm` preserves `order_kinds` after save |

Avoid `buildMemberAuthFreeShippingInput()`-style helpers for **asserting Admin behavior**—use them only for checkout/RPC edge cases.

### Layer C — Partner-path E2E (nightly / rewards gate)

Minimum bar for coupon flows:

1. Admin UI creates + publishes template (real clicks).
2. Buyer receives/grants coupon through normal path (grant RPC or auto-grant).
3. Checkout picker shows **eligible** (not grey) with expected subsidy.

**New spec:** `e2e/member-auth-coupon-admin.spec.ts` (C2C-ADM-1/2).

Extend matrix for other high-risk surfaces:

| Surface | Partner path test |
|---------|-------------------|
| Rewards checkout | ✅ merchant + member auth (this PR) |
| Merchant auth coupon | `platform-rewards-phase2` B2b.* |
| Flash claim → checkout | `platform-rewards-phase3` C3.7 |
| Points redeem → checkout | phase4 + checkout |
| Moderation refund | moderation-stripe-smoke |
| Member trading auth escrow | `member-auth-escrow` |

---

## 3. PR checklist (eligibility / payments / admin config)

Copy into PR description when touching `reward_templates`, checkout RPCs, or Admin campaign forms:

- [ ] Every new/changed `restrictions` or `reward_value` key has Admin UI or is documented system-only
- [ ] Default form values match RPC expectations (no silent `["merchant"]` for C2C-capable types)
- [ ] Unit test for form defaults / type-change behavior
- [ ] Integration test publishes **without** fixture-only restriction overrides (or dedicated “admin contract” test)
- [ ] E2E uses Admin UI for at least one happy path (if user-facing)
- [ ] `docs/dev/test-coverage-ssot.md` updated (TC id + changelog)

---

## 4. Test taxonomy (rename mentally)

| Tier | Purpose | Must not |
|------|---------|----------|
| **L1 E2E partner-path** | Real UI + real RPC | Inject hidden DB fields |
| **L2 Integration** | RPC FSM, concurrency, edge cases | Replace Admin contract tests |
| **L3 Unit** | Pure helpers, form mapping | Prove end-to-end eligibility |
| **Fixtures** | Speed for matrix / stress | Be the only proof Admin works |

---

## 5. Tooling backlog (next sprints)

| Priority | Item | Outcome |
|----------|------|---------|
| P0 | ✅ Admin `適用訂單` + free_shipping default both kinds | Partner can configure C2C |
| P0 | ✅ `member-auth-coupon-admin` E2E | Catches parity gap |
| P0 | ✅ `admin-publish-defaults.integration` (CC-INT / J-CPN-07) | Default form → DB |
| P1 | ESLint / codemod: flag `order_kinds` in test fixtures without `// @rpc-edge-only` | Review visibility |
| P2 | Playwright visual assert on grey `ineligibleReason` for negative cases | Regression on copy + logic |
| P2 | Nightly `test:nightly:coverage` includes C2C-ADM spec | Soak |
| P3 | OpenAPI/JSON Schema for `reward_templates.restrictions` | Generated Admin types |

---

## 6. Coverage SSOT linkage

- **Primary tracker:** [test-coverage-ssot.md](./test-coverage-ssot.md) v2.3 + [staging-certification.md](./staging-certification.md)（**認證 exit**）
- Map each **user journey** to at least one partner-path or matrix row.
- Mark fixture-only coverage with ⚠️ until **Solid ≥ S2** (or S1 for matrix-only negative flows).
- Changelog entry required when closing a parity gap incident.

---

## 7. Definition of “solid” for this repo

A flow is **solid** when:

1. Partner can configure it entirely through product UI (or documented API).
2. A failing configuration is visible in UI (validation or checkout `ineligibleReason`), not silent.
3. CI has one test that would have failed **before** the fix, using only partner-visible steps.
4. SSOT docs match code defaults.

---

## Changelog

| 日期 | Change |
|------|--------|
| 2026-08-16 | CC-INT J-CPN-07 · config-contract-registry · C2C-ADM-1b |
| 2026-08-16 | Link to test-coverage-ssot v2.2 |
| 2026-08-16 | Initial plan after C2C `order_kinds` / Admin parity incident; P0 fixes shipped |
