---
name: phase2-threat-model
description: Dynamic AI Threat Modeling & Security Auditor. Audits RLS policies, IDOR vulnerabilities, RPC permissions, and PostgREST attack vectors for the feature in focus.
disable-model-invocation: true
---

# 🔵 Phase 2 — Dynamic AI Threat Modeling

When invoked, perform a security audit for the feature/module currently being discussed.

## 🔍 Step 1: Dynamic Context & Security Boundary Discovery
1. **Infer Context:** Identify the active feature/domain from the conversation.
2. **Search Security Artifacts:**
   - Locate RLS (Row Level Security) policies and table grant statements (`GRANT UPDATE/INSERT`).
   - Identify RPC execution permissions (e.g., `SECURITY DEFINER`, `REVOKE EXECUTE ON ... FROM PUBLIC`).
   - Locate client-facing Server Actions / API routes accepting user parameters.

## 🛡️ Step 2: Threat Vector Audit (STRIDE)
Check the discovered security setup for:
1. **Direct DB Tampering (RLS Leak):** Can users update restricted columns via PostgREST/client SDK?
2. **IDOR & Ownership Bypass:** Do RPCs verify `auth.uid()` against resource ownership?
3. **Privilege Escalation:** Can `authenticated` users trigger internal/admin/service_role RPCs?
4. **Client-Trusted Amounts:** Is pricing, subsidy, or total amount calculated on the server or trusted from client payload?

## 🚀 Step 3: Execution & Output
- Execute relevant security tests if available (`bun run test:...`).
- Output a STRIDE threat table: **Threat ID | Location | Risk Level | Mitigation Status**.