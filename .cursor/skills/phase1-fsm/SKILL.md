---
name: phase1-fsm
description: Dynamic FSM & State Transition Auditor. Automatically detects the current feature context from conversation history, searches for status/state columns or RPCs, and verifies state machine integrity.
disable-model-invocation: true
---

# 🟢 Phase 1 — Dynamic FSM & State Auditor

When invoked, perform a state machine audit for the feature currently being discussed in the conversation.

## 🔍 Step 1: Dynamic Context & Code Discovery
1. **Infer Target Feature:** Determine the feature/module in focus from the user's latest conversation history.
2. **Discover Code Artifacts:** Dynamically search the codebase for:
   - Database migrations/schemas containing `status`, `state`, or enum columns relevant to this feature.
   - RPCs, Server Actions, or API handlers that perform state transitions.
   - Any existing integration or unit tests for this feature.

## 🛡️ Step 2: FSM Security & Integrity Audit
Audit the discovered logic against these 4 criteria:
1. **Illegal Transitions:** Are invalid state jumps prevented (e.g., `CANCELLED` -> `PAID`)?
2. **Concurrency Protection:** Do transition RPCs use `FOR UPDATE` or row-level locking to prevent race conditions?
3. **Idempotency:** Is re-executing the same transition safe and non-duplicative?
4. **Stale/TTL Cleanup:** Is there a timeout, lock expiry, or Cron mechanism for pending states?

## 🚀 Step 3: Execution & Output
- Run any relevant existing tests found via `bun run test:...`.
- If tests are missing or failing, propose a minimal Vitest FSM matrix test.
- Output a clean report: **Feature Context | Discovered States | Gaps Found | Proposed Fixes**.