---
name: phase4-pbt
description: Dynamic Property-Based Testing (PBT) Auditor using fast-check. Creates missing PBT suites from Phase 1 & 2 discussion records when none exist, then verifies mathematical invariants, boundary inputs, and non-negative constraints.
disable-model-invocation: true
---

# 🟣 Phase 4 — Dynamic Property-Based Testing (PBT)

When invoked, verify or generate Property-Based Tests (`fast-check`) for pure logic or math modules related to the current feature.

## 🔍 Step 1: Dynamic Module Discovery & Mandatory Creation Gate
1. **Infer Context:** Detect the current feature, pure logic modules, and user story from conversation history.
2. **Identify Targets:** Locate pure calculation/helper functions in the active feature (e.g., pricing math, discount rules, date expiry logic, status classifiers).
3. **Locate Existing PBT Files:** Search for:
   - `**/*.pbt.test.ts`
   - `tests/integration/**/*pbt*.integration.test.ts`
   - Any Vitest suite importing `fast-check` for the same feature/domain.
4. **CREATE IF MISSING (Mandatory TDD Gate):**
   - If **no** matching PBT test file exists, **stop and create a brand-new test file first** — do **not** skip straight to execution.
   - Preferred paths:
     - `tests/integration/<domain>/<feature>-pbt.integration.test.ts`
     - `lib/<domain>/<feature>.pbt.test.ts` (pure helpers only)
   - **Base Test Specs on Phase 1 & 2 Discussion Records:** Mine the current conversation for outputs from prior **Phase 1 (FSM)** and **Phase 2 (Threat Model)** runs. If those phases were not run yet, invoke or infer their findings before authoring.
     - **From Phase 1 (FSM):** Encode discovered states/enums as `fc.constantFrom(...)` arbitraries; property-test illegal transition guards, idempotency (same input → same output), and stale/TTL boundary timestamps.
     - **From Phase 2 (Threat Model):** Property-test server-side invariants flagged as high-risk — non-negative amounts, discount caps, ownership-sensitive classifiers, and inputs that must never throw or leak on malformed client payloads.
   - Reuse existing project patterns (`fast-check`, `COUPON_PBT_NUM_RUNS`, shared helpers under `tests/integration/**/helpers/`).

## 🛡️ Step 2: Invariants Audit
Verify that properties enforce fundamental invariants:
1. **Mathematical Bounds:** Amounts must never be negative (`buyerTotal >= 0`); discounts must not exceed item subtotal.
2. **Boundary Stability:** Dates, timezones, and extreme inputs (`0`, `MAX_INT`, empty strings) do not throw unhandled exceptions.
3. **Mutual Exclusivity:** Status classification enums are strictly non-overlapping.

## 🚀 Step 3: Execution
- Run PBT runner (e.g., `bun run test:integration:<domain>:pbt` or `COUPON_PBT_NUM_RUNS=1000 bunx vitest run <file_path>`).
- If shrink failure occurs, report the counterexample and add a minimal exact unit test killer.

## 🏁 Step 4: Output Report
Output a summary: **Created/Found PBT Files | Properties Written (Phase 1/2 sourced) | Counterexamples Found | Fixes Applied | Final Pass Rate**.