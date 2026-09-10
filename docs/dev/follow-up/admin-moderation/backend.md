# Admin moderation & disputes — backend

> **Status:** ✅ Phase A–E+ Ready + **Phase G subject history** + **reporter in-app outcome notifications**  
> **v2 / pre-launch:** [v2-plan.md](./v2-plan.md) · Phase F deferred to v2  
> **Phase G:** [subject-history-plan.md](./subject-history-plan.md) ✅ · **6-phase test plan:** [6phase-test-plan.md](./6phase-test-plan.md)  
> **Policy SSOT:** [refund-policy.md](../../refund-policy.md)（退款 breakdown）· [escrow-payment-policy.md](../../escrow-payment-policy.md)（capture／出款）  
> **Frontend handoff:** [frontend.md](./frontend.md)  
> **Replaces:** mock data in `app/admin/disputes/*`

## Scope

| In scope (MVP) | Out of scope (v2 — see [v2-plan.md](./v2-plan.md)) |
|----------------|------------------------------------------------------|
| User reports (`reports`) → moderation cases | ✅ **Phase H** — post-sale refund saga on resolve（見 [§8 refund-policy](../../refund-policy.md#8-s3--收貨後售後phase-h舉報-resolve) + I-H verify） |
| Category weights + case scoring + admin adjustment | ML / automated NLP on chat |
| Report image attachments (Bunny) | Accused-user appeal portal |
| Admin read-only chat thread (room-scoped) | Site-wide chat search |
| Account sanctions (`suspend` / `ban` / persona restrict) | Chargeback dispute UI |
| Subject history panel（重犯／歷史案件） | ✅ Phase G — `admin_get_subject_moderation_history` |
| Reporter outcome notification (in-app) | ✅ `outcome_acknowledged_at` + `get_unacknowledged_report_outcomes_for_me` |
| P2P + chat-only cases (account action only) | Listing 頁直接舉報 · Phase F auto-escalation cron |
| Chat + profile 舉報入口 | Merge with `/admin/grading` |

**Sanction subject:** `profiles.id` (= one auth account per email).  
**Sanction scope:** `account` \| `member_persona` \| `merchant_persona` (see §7).

---

## Files (planned)

| Path | Purpose |
|------|---------|
| `supabase/migrations/20260806120000_admin_moderation_phase_a.sql` | Phase A schema, enums, RPCs, RLS |
| `lib/moderation/category-config.ts` | Category enum, weights, evidence rules |
| `lib/moderation/compute-report-contribution.ts` | Score contribution per report |
| `lib/moderation/types.ts` | Shared DTOs (no duplicate table interfaces) |
| `app/actions/reports.ts` | Extend `submitUserReport` + attachment bind |
| `supabase/migrations/20260807120000_admin_moderation_phase_c.sql` | Phase C admin search + case bundle RPCs |
| `supabase/migrations/20260808120000_admin_moderation_phase_d.sql` | Phase D audit logs + chat thread RPC + bundle chat fallback |
| `app/actions/admin-moderation.ts` | Admin queue, case detail, chat thread |
| `app/api/reports/upload-evidence/route.ts` | Pre-submit or post-create image upload |
| `supabase/migrations/20260812120000_report_context_dedup.sql` | Context-aware pending dedup + bundle `roomIds` |
| `lib/storage/bunny.ts` | Add `uploadReportEvidenceToBunny` (separate prefix) |

---

## Migrations / env

- Push: `bunx supabase db push`
- Regenerate types: `bun run supabase:types`
- Storage: reuse `BUNNY_*` env (separate path prefix `reports/`)

---

## Schema (v1)

### Extend `reports`

| Column | Type | Notes |
|--------|------|-------|
| `category` | `report_category` enum | Stable slug; stop parsing `[CATEGORY]` from `reason` |
| `source` | `report_source` | `chat_room` \| `profile` |
| `context_type` | `text` | `chat_room` \| `member_order` \| `merchant_order` \| null |
| `context_id` | `uuid` | Room or order id |
| `case_id` | `uuid` FK | `moderation_cases.id`; set on submit or case merge |
| `category_weight_snapshot` | `int` | Weight at submit time |
| `contribution_score` | `numeric` | Server-computed after reporter trust |
| `details` | `text` | Free text (migrate from `reason` body or new column) |

Keep `reason` for backward compat during migration; new writes may duplicate summary into `reason` for audit.

### `report_attachments`

| Column | Type |
|--------|------|
| `id` | `uuid` PK |
| `report_id` | `uuid` FK → `reports` |
| `storage_path` | `text` |
| `mime_type` | `text` |
| `byte_size` | `int` |
| `created_at` | `timestamptz` |

RLS: reporter INSERT/SELECT own; admin SELECT via `is_admin()`; no access for accused.

### `moderation_cases`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK |
| `case_number` | `text` unique | e.g. `MOD-2026-000123` |
| `status` | `moderation_case_status` | `open` \| `reviewing` \| `resolved` \| `dismissed` |
| `subject_user_id` | `uuid` | Accused (`profiles.id`) |
| `primary_category` | `report_category` | Highest-weight report or admin set |
| `auto_score` | `numeric` | Sum of valid report contributions (deduped) |
| `admin_adjustment` | `numeric` | Default 0 |
| `final_score` | `numeric` | Generated: `auto_score + admin_adjustment` |
| `adjustment_reason` | `text` | Required when `admin_adjustment != 0` |
| `violation_persona` | `text` | `member` \| `merchant` \| `both` \| `unknown` |
| `resolution` | `text` | `upheld` \| `dismissed` \| `insufficient_evidence` |
| `assigned_admin_id` | `uuid` | Optional |
| `resolved_at` | `timestamptz` | |
| `resolved_by` | `uuid` | |

One open case per `subject_user_id` per rolling window (e.g. 7d) — merge new reports into existing case via RPC.

### `moderation_audit_logs`

| Column | Type |
|--------|------|
| `id` | `uuid` |
| `case_id` | `uuid` |
| `admin_id` | `uuid` |
| `action` | `text` | `view_chat`, `adjust_score`, `apply_sanction`, `resolve`, … |
| `payload` | `jsonb` |
| `created_at` | `timestamptz` |

Log **every** admin chat view (`action: view_chat`).

### `account_sanctions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK |
| `user_id` | `uuid` | Subject account |
| `scope` | `sanction_scope` | `account` \| `member_persona` \| `merchant_persona` |
| `type` | `sanction_type` | `warn` \| `restrict_listing` \| `restrict_chat` \| `freeze_payout` \| `suspend` \| `ban` |
| `starts_at` | `timestamptz` | |
| `ends_at` | `timestamptz` | null = permanent (admin only) |
| `source` | `text` | `auto` \| `admin` |
| `case_id` | `uuid` | |
| `reason` | `text` | |
| `revoked_at` | `timestamptz` | Appeal / admin lift |

Enforcement: middleware / server actions check active sanctions before listing, chat send, checkout, payout cron.

---

## Category config (`lib/moderation/category-config.ts`)

Align with `UserReportModal` dropdown values:

| `report_category` | Label (UI) | `baseWeight` | Evidence rules |
|-------------------|------------|--------------|----------------|
| `fraud` | 惡意欺詐 / 虛假交易 | 40 | upload: recommended; chat: optional; order: recommended |
| `offline_trade` | 誘導私下交易 | 30 | upload: recommended; chat: **required**; order: none |
| `harassment` | 言語辱罵 / 不當言論 | 15 | upload: optional; chat: **required**; order: none |
| `other` | 其他違規行為 | 10 | upload: optional; chat: optional; order: none |

### Contribution formula (per report)

```
contribution =
  category_weight_snapshot
  × reporter_trust_multiplier   // 0.3 new account … 1.0 trusted
  × context_bonus               // +0.1 if chat_room_id validated
  × recency_factor              // optional v1.1
```

- **Dismissed** reports: contribution `0`; decrement reporter trust counter.
- **Same case, same reporter, duplicate category within 24h:** second report contribution × 0.3.
- **Pending dedupe (migration `20260812120000`):** one open case per subject, but multiple pending reports allowed when context differs:
  - **Block:** same reporter + target + **same chat room** (any category)
  - **Block:** same reporter + target + **profile** + same `category`
  - **Allow:** different chat rooms (member vs merchant persona), chat + profile, profile fraud + chat harassment
  - Indexes: `idx_reports_pending_reporter_target_chat_room`, `idx_reports_pending_reporter_target_profile_category`
  - RPC errors: `您已在此對話提交過待審核的舉報…` · `您已在此用戶公開資料提交過同類別的待審核舉報…`
- **Do not** sum raw report count — sum contributions into `moderation_cases.auto_score`.

### Auto-escalation thresholds (suggested)

| `final_score` | System action |
|---------------|---------------|
| &lt; 30 | Queue only |
| 30–59 | Priority badge |
| 60–79 | Suggest `freeze_payout` + `restrict_listing` (admin confirm) |
| ≥ 80 | Optional **auto `suspend` 24–72h** + mandatory admin review within 48h |
| Permanent `ban` | **Admin only**, never auto |

---

## Server actions

All return `{ success: true, data } | { success: false, error: string }`.  
Admin actions: guard `isCurrentUserAdmin()` before RPC.

### User-facing (extend existing)

#### `submitUserReport(input)`

```typescript
type SubmitUserReportInput = {
  reportedUserId: string;
  category: ReportCategorySlug;  // enum, not free text
  details?: string;
  chatRoomId?: string;
  attachmentIds?: string[];      // pre-uploaded, max 3
};
```

Validation:

- `category` required; map from UI value → slug.
- If `evidence.chat === 'required'` and no valid `chatRoomId` → `{ error: "請在對話內使用舉報功能" }`.
- Max 3 attachments, each ≤ 5MB, image types only.
- Existing: no self-report; party validation for chat room.

On success:

1. Upsert / attach to `moderation_cases` for `subject_user_id`.
2. Insert `reports` row with structured fields + snapshots.
3. Link `report_attachments`.
4. Recompute `moderation_cases.auto_score`.

#### `uploadReportEvidence` (route or action)

Returns `{ attachmentId, publicUrl }` for client preview.  
Or: multipart `POST /api/reports/upload-evidence` with session auth.

### Admin

#### `searchAdminModerationCases(input?)`

```typescript
{
  page?: number;
  pageSize?: number;       // max 50
  status?: "open" | "reviewing" | "resolved" | "dismissed" | "all";
  category?: ReportCategorySlug;
  minScore?: number;
  search?: string;         // case_number, username, display_name
}
→ { rows: ModerationCaseRow[]; total: number; pendingCount: number }
```

#### `getAdminModerationCase(caseId)`

Returns:

```typescript
{
  case: ModerationCaseDetail;
  reports: ReportRow[];
  attachments: ReportAttachmentRow[];
  subject: { id, displayName, username, role };
  reporterSummaries: { id, displayName, reportCount }[];
  relatedOrders: AdminModerationOrderSummary[];  // 0..n
  chatAccess: {
    available: boolean;
    roomId: string | null;
    requiredForCategory: boolean;
    evidenceSufficient: boolean;
  };
  activeSanctions: AccountSanctionRow[];
  auditLog: ModerationAuditRow[];
}
```

#### `getAdminModerationChatThread(caseId, roomId)`

- Admin only; writes `moderation_audit_logs` `view_chat`.
- Returns messages chronologically (paginated): `{ id, senderId, content, createdAt, isSystemWarning, offerId?, orderId? }`.
- **Only** if `roomId` matches case context (reporter/target party room).

RPC: `admin_get_moderation_chat_thread(p_case_id, p_room_id, p_limit, p_before)`.

#### `adjustAdminModerationCaseScore(caseId, adjustment, reason)`

- `adjustment`: number (e.g. +20, -15).
- Updates `admin_adjustment`, `final_score`, audit log.

#### `resolveAdminModerationCase(caseId, input)`

```typescript
{
  resolution: "upheld" | "dismissed" | "insufficient_evidence";
  violationPersona?: "member" | "merchant" | "both" | "unknown";
  adjustment?: number;
  adjustmentReason?: string;
  sanction?: {
    scope: SanctionScope;
    type: SanctionType;
    endsAt: string | null;  // ISO; null = permanent ban
    reason: string;
  };
  notifyReporter?: boolean;  // default true — in-app outcome for reporters; false skips queue
  orderRefund?: {
    enabled: boolean;
    orderId: string;
    faultParty: "buyer" | "seller" | "platform" | "carrier" | "inconclusive";
    platformFaultReason?: string;  // required when faultParty === "platform"
    carrierLiabilityParty?: "seller" | "platform";  // required when faultParty === "carrier"
  };
}
```

**Phase H fault matrix (PR3B):**

| `faultParty` | Buyer refund | `feeRecoveryMode` | Seller receivable |
|--------------|--------------|-------------------|-------------------|
| `seller` | full eligible | `full` | refund + stripe fee |
| `carrier` + `carrierLiabilityParty: seller` | full eligible | `full` | refund + stripe fee |
| `carrier` + `carrierLiabilityParty: platform` | full eligible | `none` | none (platform absorbs fee) |
| `inconclusive` | full eligible | `fee_half` | `stripe_fee / 2` only |
| `buyer` | eligible − stripe fee | `none` | none |
| `platform` | eligible + auth fee (D) | `none` | none |

`carrierLiabilityParty` persisted in order `auth_notes` as `carrier_liability: seller|platform` for retry/finalize.

#### `previewModerationOrderRefund(input)` (PR3C — read-only)

```typescript
{
  orderId: string;
  faultParty: "buyer" | "seller" | "platform" | "carrier" | "inconclusive";
  platformFaultReason?: string;  // required when faultParty === "platform"
  carrierLiabilityParty?: "seller" | "platform";  // required when faultParty === "carrier"
}
```

- Admin guard + `fn_moderation_order_refund_eligible` gate (via RPC).
- RPC `fn_preview_moderation_order_refund_breakdown` — **no order writes, no Stripe**.
- IC-3: `stripeFeeHkd` always `null`; `stripeFeeNote` = finalize 時從 Stripe 讀取；buyer/seller recovery uses policy fee estimate internally.
- Returns `ModerationRefundBreakdownPreview` (§2.1 fields).

Side effects when `resolution === upheld` and sanction present:

| `scope` + `type` | Enforcement |
|------------------|-------------|
| `member_persona` + `restrict_listing` | Delist `seller_persona=member` listings |
| `merchant_persona` + `restrict_listing` | Hide shop / delist merchant listings |
| `*` + `freeze_payout` | Member `seller_payout_status=frozen`; merchant `payout_status=frozen` |
| `account` + `suspend` | Auth middleware block; revoke sessions optional |
| `account` + `ban` | Supabase auth ban + all above |

**Escrow order disputes** (future P3): same case may link `member_order_id` / `merchant_order_id`; refund RPCs invoked separately — not MVP.

---

## RPCs (SECURITY DEFINER)

| RPC | Purpose |
|-----|---------|
| `rpc_submit_user_report_v2` | Atomic report + case merge + score (optional; or keep in action) |
| `search_admin_moderation_cases` | Queue list |
| `admin_get_moderation_case_bundle` | Case + reports + attachments metadata |
| `admin_get_moderation_chat_thread` | Read-only chat; audit on call |
| `admin_get_moderation_order_context` | Order summaries for parties |
| `admin_get_subject_moderation_history` | Subject prior cases + sanction history (Phase G) |
| `get_unacknowledged_report_outcomes_for_me` | Reporter pending outcome notifications |
| `acknowledge_report_outcomes` | Mark report outcomes acknowledged |
| `rpc_apply_account_sanction` | Insert sanction + side-effect flags |
| `rpc_resolve_moderation_case` | Status + resolution + mark reports resolved/dismissed |

All require `_grading_require_admin()` or `is_admin()`.

---

## Chat & order context resolution

### Chat room

Priority when loading case:

1. `reports.context_type = chat_room` + `context_id` from triggering report.
2. Else: latest `chat_rooms` where parties = `(reporter, subject)` OR any reporter in case vs subject.
3. If `primary_category` requires chat and no room → `evidenceSufficient: false`.

### Orders

Join via:

- `chat_messages.member_order_id` / `merchant_order_id` in thread.
- Or active orders between parties (`buyer_id`/`seller_id` or `merchant_id`).

Return summary only (no PII beyond admin need): order id, number, amount, escrow status, shipping tracking.

---

## Reporter trust (v1 simple)

Store on `profiles` or `user_moderation_stats`:

| Field | Use |
|-------|-----|
| `reports_filed_upheld` | ↑ trust |
| `reports_filed_dismissed` | ↓ trust |
| `account_age_days` | New accounts &lt; 7d → multiplier 0.5 |

`reporter_trust_multiplier = clamp(0.3, 1.0, f(stats))`.

---

## Upload storage

- Path: `reports/{reportId}/{uuid}.{ext}` (or temp `reports/pending/{userId}/{uuid}` before report id exists).
- CDN: same Bunny host; **admin-only** signed URLs or public CDN with unguessable paths.
- Max 3 files per report; delete orphans on failed submit (cron optional).

---

## Integration with existing code

| Existing | Change |
|----------|--------|
| `app/actions/reports.ts` | Add category enum, attachments, case link |
| `formatReportReason` | Keep for `reason` audit string; add structured columns |
| `reports` RLS | Reporter read own; admin via service role / RPC |
| `chat_messages` RLS | Unchanged; admin reads via DEFINER RPC only |
| `/admin/disputes` mock | Replace with `searchAdminModerationCases` |
| `e2e/user-report.spec.ts` | Assert `category` column; optional attachment test |

---

## Test closure

✅ **6-phase test closure implemented** — [6phase-test-plan.md](./6phase-test-plan.md) · [fsm-audit.md](./fsm-audit.md) · [threat-model-moderation.md](./threat-model-moderation.md)

| Gate | Command |
|------|---------|
| Fast (daily / pre-push) | `bun run test:moderation:gate` |
| Full (pre-release sign-off) | `bun run test:moderation:gate:full && bun run build:ci` |

Integration matrix: **26 cases** (`I-R*` / `I-M*` / `I-L*` / `I-G*` / `I-N*`) in `tests/integration/moderation/moderation-matrix.integration.test.ts`.

## Verify (backend)

```bash
bunx tsc --noEmit
bun run lint
bun run build:ci
```

Manual:

1. Chat report `offline_trade` without `chatRoomId` → rejected.
2. Chat report with room → case created; `contribution_score` uses weight 30.
3. Profile report `offline_trade` → rejected (chat required).
4. Upload 2 images → linked to report; admin bundle returns URLs.
5. Admin `getAdminModerationChatThread` → messages; audit row `view_chat`.
6. `resolve` with `suspend` 7d → user cannot POST chat; listings hidden per scope.
7. Dismiss case → reports `dismissed`; subject score not increased.
8. Non-admin → all admin actions `{ success: false }`.

### Partner manual QA（Phase E + E+）

> **給 partner 試：** 以下為手動驗收清單。UI 步驟見 [frontend.md §Partner manual QA](./frontend.md#partner-manual-qaphase-e--e)。  
> 建議用 **staging / dev** 兩個測試帳號（舉報人 + 被舉報人），避免影響真實用戶。

#### 前置

| 項目 | 說明 |
|------|------|
| Admin 帳號 | 可進入 `/admin/disputes` |
| 測試案件 | 先跑 user-report flow 產生 `open` case，或沿用 E2E seed |
| Service role | SQL 抽查用 Supabase Dashboard 即可 |

#### Phase E — 裁定與制裁

| # | 步驟 | 預期 |
|---|------|------|
| E1 | Admin 開啟 **pending** 案件 → 風控分數區輸入 `+10` + 原因 →「儲存調整」 | Toast 成功；`finalScore` 更新；`moderation_audit_logs.action = adjust_score` |
| E2 | 選「駁回舉報」→ 執行裁定 | Redirect `/admin/disputes?status=completed`；`moderation_cases.status = dismissed`；reports `dismissed`；audit `resolve` |
| E3 | 新 case：`offline_trade` / `harassment` 且 **無** chat → 嘗試 upheld 類選項 | upheld 選項 disabled；可選 dismiss / insufficient_evidence |
| E4 | 證據不足 case：勾選「管理員強制裁定」+ 填覆寫原因 → upheld + 制裁 | 成功裁定；audit `resolve` payload 含 `evidenceOverrideReason` |
| E5 | upheld +「限制 Member 上架」 | `account_sanctions` 新增列；subject **member** listings → `inactive`；subject 新建 listing →「帳戶已被限制上架」 |
| E6 | upheld +「凍結出款」 | 相關 `member_orders.seller_payout_status` / `merchant_orders.payout_status` → `frozen`（僅 held/ready/processing） |
| E7 | 對已制裁 subject 發 chat | RPC / UI 發訊 →「帳戶已被限制發送訊息」（`restrict_chat` / `suspend` / `ban`） |

**SQL 抽查（案件 ID = `...`）：**

```sql
SELECT status, resolution, resolved_at, admin_adjustment, final_score
FROM moderation_cases WHERE id = '<case_id>';

SELECT action, payload, created_at
FROM moderation_audit_logs WHERE case_id = '<case_id>' ORDER BY created_at DESC;

SELECT scope, type, ends_at, revoked_at
FROM account_sanctions WHERE user_id = '<subject_user_id>' AND revoked_at IS NULL;
```

#### Phase E+ — Proxy / Auth ban / 訂單上下文

| # | 步驟 | 預期 |
|---|------|------|
| E+1 | Admin 裁定「凍結帳戶 7 日」→ 以 **subject** 登入 → 訪問 `/profile/user` | Redirect `/auth/suspended?type=suspend`；頁面顯示「帳戶已暫停」 |
| E+2 | 同上 subject 訪問 `/marketplace` | 同樣 redirect（非 `/auth/*`、`/api/*` 皆攔截） |
| E+3 | subject 在 `/auth/suspended` 點「登出並返回登入」 | 登出成功；可換其他帳號登入 |
| E+4 | **Admin** 帳號在 subject 被 suspend 期間訪問 `/admin` | **不受攔截**（admin 豁免） |
| E+5 | Admin 裁定「永久封禁」→ 以 subject 嘗試 `/auth` 登入 | 登入失敗（Supabase auth ban）；DB 有 `type=ban` sanction |
| E+6 | `ends_at` 已過的 suspend sanction（可手動改 DB 或等到期）→ subject 再訪問 `/profile/user` | 可正常進入（proxy 不再攔截） |
| E+7 | 開啟 **fraud** 或 **offline_trade** 案件詳情 | 右欄顯示「關聯訂單」panel |
| E+8 | 有平台訂單的 case（chat 綁 order 或雙方有 member/merchant order） | 訂單卡顯示編號、金額、escrow、tracking、read-only timeline、訂單連結 |
| E+9 | `offline_trade` 且 **無** 關聯訂單 | 文案「無平台訂單 — 符合私下交易風險特徵」 |

**Auth ban 失敗邊界：** 若 `SUPABASE_SERVICE_ROLE_KEY` 未設，永久 ban 仍會寫入 `account_sanctions` + 擋 chat/listing，但 Auth 層可能未封禁 — UI toast 可能顯示 `authBanWarning`。

#### 自動化（可選）

```bash
# 需 E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
bun run test:e2e e2e/admin-moderation.spec.ts

# suspend redirect（buyer project，不需 admin 憑證）
bun run test:e2e e2e/admin-moderation.spec.ts --project=buyer -g "suspended user"
```

---

## Phased delivery

| Phase | Deliverable |
|-------|-------------|
| **A** | ✅ Migration + category config + `submitUserReport` + `rpc_submit_user_report_v2` |
| **B** | ✅ `report_attachments` + upload API + `UserReportModal` evidence |
| **C** | ✅ `search_admin_moderation_cases` + `admin_get_moderation_case_bundle` + `/admin/disputes` live list/detail (read-only) |
| **D** | ✅ `moderation_audit_logs` + `admin_get_moderation_chat_thread` + detail chat panel + audit log |
| **E** | ✅ `account_sanctions` + `rpc_adjust/resolve` + chat DB block + listing action guard + detail resolve UI |
| **E+** | ✅ `moderation_get_account_access_restriction` + `proxy.ts` + `/auth/suspended` + `auth.ban` on resolve + `admin_get_moderation_order_context` |
| **F** | ⏳ v2 — Auto-escalation cron + dashboard pending count（見 [v2-plan.md](./v2-plan.md)） |
| **G** | ✅ Subject history RPC + admin panel + list badge「曾有違規」 |
| **G+** | ✅ Reporter in-app outcome (`outcome_acknowledged_at`, resolve `notifyReporter`) |
| **H** | ✅ Moderation post-sale refund saga — `20260910180000` + `moderation-order-refund-saga.ts` + admin resolve UI |
| **H+** | ✅ I-H14 Stripe smoke E2E — `e2e/moderation-stripe-refund-smoke.spec.ts` + `20260911120000` capture status fix |
| **H++** | ✅ I-H2/I-H3 auth refund confidence — `20260911130000` seeds + `test:integration:moderation` |

### I-H14 verify (pre-release)

```bash
bun run stripe:webhook:listen   # required: PI → payment_held
bun run test:e2e:moderation-stripe-smoke
# Staging:
PLAYWRIGHT_BASE_URL=https://<staging-host> bun run test:e2e:moderation-stripe-smoke
```

| Env | Purpose |
|-----|---------|
| `STRIPE_SECRET_KEY` | Real refund + assert |
| `E2E_BUYER_*` / `E2E_SELLER_*` / `E2E_ADMIN_*` | Checkout, fulfill, admin resolve |
| `SUPABASE_SERVICE_ROLE_KEY` | Seed case + DB asserts |
| `PLAYWRIGHT_BASE_URL` | Optional staging host |

Not included in `test:moderation:gate:full` (secrets + ~3–5 min + webhook).

### I-H2 / I-H3 verify (integration)

```bash
bunx supabase db push   # through 20260911140000
bun run test:integration:moderation
```

Covers `merchant_auth` and `member_auth` prepare paths with fake `pi_phase_h_*` (no Stripe). Member listing fixture excludes buyer `seller_id`.

---

## 退款政策

| 資源 | 用途 |
|------|------|
| [refund-policy.md](../../refund-policy.md) | 退款 SSOT（S0–S4、breakdown、fault_party） |
| [REFUND_ADMIN_PLAYBOOK.md](./REFUND_ADMIN_PLAYBOOK.md) | Admin 操作速查 |
| [refund-policy §12](../../refund-policy.md#12-實作對照與缺口) | Target vs code 缺口（PR3C preview） |
