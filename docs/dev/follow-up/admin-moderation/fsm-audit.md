# Admin Moderation — FSM Audit

> **Status:** ✅ Phase 1 closure artifact  
> **Related:** [6phase-test-plan.md](./6phase-test-plan.md) · [threat-model-moderation.md](./threat-model-moderation.md)

## Feature context

舉報機制：用戶提交 `reports` → 聚合至 `moderation_cases` → 管理員 resolve → 可選通知舉報人（`outcome_acknowledged_at`）及帳戶制裁（`account_sanctions`）。

## Discovered states

### `reports.status` (`report_state`)

| State | Meaning |
|-------|---------|
| `pending` | 待審核 |
| `resolved` | 案件裁定成立（`moderation_cases.resolution = upheld`） |
| `dismissed` | 案件駁回或證據不足（`resolution ∈ {dismissed, insufficient_evidence}`） |

**Transitions:** `pending` → `resolved` | `dismissed`（僅經 `rpc_resolve_moderation_case`）

### `moderation_cases.status` (`moderation_case_status`)

| State | Meaning |
|-------|---------|
| `open` | 待處理 |
| `reviewing` | 審核中（可選中間態） |
| `resolved` | 裁定成立（`resolution = upheld`） |
| `dismissed` | 駁回或證據不足 |

**Transitions:** `open`/`reviewing` → `resolved` | `dismissed`（僅經 resolve RPC）

### `moderation_cases.resolution` (`moderation_resolution`)

| Value | `reports.status` | Notes |
|-------|------------------|-------|
| `upheld` | `resolved` | 可附帶 sanction |
| `dismissed` | `dismissed` | |
| `insufficient_evidence` | `dismissed` | UI copy 必須用 resolution，唔好用 report status |

### `reports.outcome_acknowledged_at`

| State | Meaning |
|-------|---------|
| `NULL` | 舉報人未確認結果（in-app modal 待顯示） |
| `timestamp` | 已確認或 resolve 時 `notifyReporter: false` 自動設 ack |

**Transitions:**
- Resolve + `notifyReporter: true`（default）→ 保持 `NULL`
- Resolve + `notifyReporter: false` → 設為 `now()`
- `acknowledge_report_outcomes` → 設為 `now()`
- Migration backfill：既有 `resolved`/`dismissed` → 設 ack（防舊案 flood modal）

### `account_sanctions`

Active while `ends_at IS NULL OR ends_at > now()`. Expired sanctions appear in subject history as `expired` (I-G2).

## FSM integrity audit

| Criterion | Finding | Test |
|-----------|---------|------|
| **Illegal transitions** | `rpc_resolve_moderation_case` rejects when `status NOT IN (open, reviewing)` → `案件已結案` | **I-L3** |
| **Concurrency** | Resolve loads case `FOR UPDATE` ([`20260910160000`](../../../supabase/migrations/20260910160000_report_outcome_notifications.sql) L83–87) | Documented; race E2E optional |
| **Idempotency** | `acknowledge_report_outcomes` on already-acked IDs → `updated: 0` | **I-N5** |
| **Idempotency** | Duplicate profile/chat submit rejected by unique indexes | I-R5, I-R6 |
| **Notify false** | Sets `outcome_acknowledged_at` at resolve | **I-N3** (db-assert) |
| **Stale/TTL** | No cron for pending reports; pending dedup via DB indexes | Acceptable MVP |

## Gaps / follow-ups

| Gap | Severity | Notes |
|-----|----------|-------|
| Double-submit race on resolve | Low | `FOR UPDATE` mitigates; no integration race test |
| Phase F auto-escalation | v2 | [v2-plan.md](./v2-plan.md) |
| `reviewing` → manual only | Info | No automated transition to `reviewing` in MVP |

## Test mapping summary

| FSM concern | Test ID |
|-------------|---------|
| Resolve dismiss / uphold | I-L1a, I-L1b |
| insufficient_evidence lifecycle | I-N2 (extended) |
| Double resolve blocked | I-L3 |
| Outcome ack queue | I-N1, I-N3, I-N4, I-N5, I-N7 |
| Subject history stats | I-G1, I-G4 |
