---
name: phase6-e2e
description: Dynamic Playwright E2E UI Automation Runner. Creates missing E2E specs from Phase 1 & 2 discussion records when none exist, then executes browser tests for the feature in focus.
disable-model-invocation: true
---

# 🟤 Phase 6 — Dynamic Playwright E2E Runner

When invoked, execute Playwright E2E tests for the feature in focus to verify real browser UI rendering and interactions.

## 🔍 Step 1: Dynamic Spec Discovery & Mandatory Creation Gate
1. **Infer Context:** Detect the current feature, user journey, and UI touchpoints from conversation history.
2. **Locate Existing Specs:** Search `e2e/**/*.spec.ts` for specs matching the feature name, domain, or user journey.
3. **CREATE IF MISSING (Mandatory TDD Gate):**
   - If **no** matching E2E spec exists, **stop and create a brand-new spec file first** — do **not** skip straight to execution.
   - Preferred path: `e2e/<feature-or-journey>.spec.ts`
   - **Base Test Specs on Phase 1 & 2 Discussion Records:** Mine the current conversation for outputs from prior **Phase 1 (FSM)** and **Phase 2 (Threat Model)** runs. If those phases were not run yet, invoke or infer their findings before authoring.
     - **From Phase 1 (FSM):** Cover happy-path state transitions end-to-end (e.g., pending → paid → fulfilled); assert UI blocks or error messaging for illegal transitions; verify stale/TTL pending states surface correct disabled buttons or recovery flows.
     - **From Phase 2 (Threat Model):** Cover IDOR/unauthorized access (wrong user cannot see or act on another user's resource); assert server-rejected tampering shows user-friendly Toast/alert copy; never assert only on client-side enablement — confirm the backend rejection path in UI.
   - Reuse existing project patterns (`e2e/fixtures/`, `e2e/helpers/`, `test.skip` guards for missing env, `test.describe.configure({ mode: "serial" })` when order matters).

## 🚀 Step 2: Execution & UI Verification
1. Run target Playwright spec:
   `bun run test:e2e -- e2e/<spec_name>.spec.ts`
2. Verify key UI assertions:
   - Disabled/Enabled state of buttons (e.g., threshold unmet).
   - Real-time Order Summary updates upon selection.
   - User-friendly Toast alerts on error responses (e.g., expired/stale state).
3. If failure occurs, inspect Playwright trace/screenshots, fix UI/Client state code, and re-run.

## 🏁 Step 3: Output Report
Output a summary: **Created/Found Spec Files | Scenarios Written (Phase 1/2 sourced) | UI Assertions Verified | Fixes Applied | Final Pass Rate**.