# Admin Moderation — STRIDE Threat Model

> **Status:** ✅ Phase 2 closure artifact  
> **Related:** [fsm-audit.md](./fsm-audit.md) · [6phase-test-plan.md](./6phase-test-plan.md)

## Scope

User report submit, admin moderation queue/detail/resolve, Phase G subject history, reporter in-app outcome notifications.

## STRIDE matrix

| ID | Category | Threat | Severity | Mitigation | Test |
|----|----------|--------|----------|------------|------|
| T-S1 | Spoofing | Non-admin invokes admin server actions | **High** | `requireAdmin()` / `_grading_require_admin()` | I-M5, I-G3 |
| T-S2 | Spoofing | Reporter impersonates another user on submit | Medium | `auth.uid()` = reporter_id in RPC | I-R1 |
| T-T1 | Tampering | User updates `reports.status` via PostgREST | **High** | RLS deny direct UPDATE | Documented; optional SQL audit |
| T-T2 | Tampering | User updates `moderation_cases` | **High** | RLS + SECURITY DEFINER RPCs only | I-M5 |
| T-R1 | Repudiation | Resolve without audit log | Medium | `_moderation_write_audit_log` on resolve | I-L1a/b (audit count) |
| T-I1 | Info disclosure | User B fetches user A unacknowledged outcomes | **High** | RPC filters `reporter_id = auth.uid()` | **I-N6** |
| T-I2 | Info disclosure | User B acks user A report IDs | **High** | `acknowledge_report_outcomes` WHERE `reporter_id = v_user_id` | **I-N6** |
| T-I3 | Info disclosure | Non-admin reads subject history | **High** | `admin_get_subject_moderation_history` requires admin | I-G3 |
| T-D1 | DoS | Flood duplicate pending reports | Medium | Unique indexes (profile category, chat room) | I-R5, I-R6 |
| T-D2 | DoS | Legacy reports flood outcome modals | Medium | Migration backfill sets `outcome_acknowledged_at` | **I-N7** |
| T-E1 | Elevation | Buyer calls `resolveAdminModerationCase` | **High** | Admin guard on action + RPC | I-M5 |
| T-E2 | Elevation | Authenticated calls admin history RPC directly | **High** | `_grading_require_admin()` in RPC | I-G3 |

## High-severity coverage

All **High** rows map to ≥1 automated test (see Test column).

## Out of scope

- Email/push notification channels → **pre-v1 全站 batch**（含被罰用戶 email）；in-app reporter ✅
- Phase F auto-escalation cron → **v2** ([v2-plan.md](./v2-plan.md))
- ML/NLP on chat content
- Appeal portal · escrow refund saga · listing 舉報 → **v2** ([v2-plan.md](./v2-plan.md))
