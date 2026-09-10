---
name: phase3-vitest
description: Dynamic Vitest Authoring, Execution & Fix Loop. Automatically creates missing unit/integration tests based on Phase 1 & 2 specs if none exist, then executes and fixes them.
disable-model-invocation: true
---

# 🟡 Phase 3 — Dynamic Vitest Authoring, Runner & Fix Loop

When invoked, ensure comprehensive Vitest test coverage (unit/integration) exists for the current feature, write missing tests, and execute the fix loop.

## 🔍 Step 1: Dynamic Discovery & Mandatory Creation Gate
1. **Infer Context:** Detect the current feature, business logic, and user story from conversation history.
2. **Locate Existing Tests:** Search for test files matching the feature in:
   - `tests/integration/**/*.integration.test.ts`
   - `lib/**/*.test.ts` / `app/**/*.test.ts`
3. **CREATE IF MISSING (Mandatory TDD Gate):**
   - If NO matching test file exists, **immediately create a new test file**:
     - Integration tests: `tests/integration/<domain>/<feature>.integration.test.ts`
     - Unit tests: `lib/<domain>/<feature>.test.ts`
   - **Base Test Specs on Context:** Auto-generate test cases covering:
     - **Phase 1 (5 UI States):** Ideal, Empty, Loading, Partial, and Error states.
     - **Phase 2 (FSM Matrix):** All valid state transitions, illegal state jumps, and edge conditions.

## 🚀 Step 2: Execution & Fix Loop
1. Execute the target test file using Bun/Vitest:
   - `bun run test:integration:<domain>` OR `bunx vitest run <file_path>`
2. **Fix Loop:** If assertions fail:
   - Analyze stack trace and failing expectations.
   - Fix production logic or RPC/migration bugs.
   - **Rule:** Never weaken assertions just to force a pass.
   - Re-run tests until 100% green.

## 🏁 Step 3: Output Report
Output a summary: **Created/Found Test Files | Test Cases Written | Fixes Applied | Final Pass Rate**.