# Admin Moderation — Subject History Panel (Phase G)

> **Status:** 📋 Planned（優化時再做） → ✅ **Shipped 2026-08-09**  
> **Depends on:** Phase A–E+ ✅（`/admin/disputes` live）  
> **Blocked by:** Nothing  
> **Policy:** 永久 `ban` 仍 **Admin only, never auto** — 本 phase 只提供**只讀上下文**，不改計分／自動制裁  
> **Related:** [backend.md](./backend.md) · [frontend.md](./frontend.md) · Phase F（auto-escalation cron）→ [v2-plan.md](./v2-plan.md)

---

## 1. Problem

Admin 處理舉報時，詳情頁只顯示**本案**資料：

| 已有 | 缺失 |
|------|------|
| 本案 `autoScore` / `finalScore`、本案所有 `reports` | 同一被舉報人**過往案件**列表 |
| 本案 `auditLog` | **已結案**舊案裁定（upheld / dismissed） |
| **有效** `activeSanctions` | **已過期** suspend、歷史 `restrict_listing` / `freeze_payout` |
| 關聯訂單（本案 context） | 生涯統計（upheld 次數、近 90 日舉報次數） |

**分數模型限制：** `moderation_cases.final_score` 係 **per case**；舊案 resolved 後新舉報會開新 case（`_find_or_create_moderation_case` 只合併 7 日內 open/reviewing）。Admin 難以判斷**重犯**而加重罰則。

**現有 workaround：** 列表搜 username + 已完成 tab + SQL 手查 — 效率低。

---

## 2. Goals

1. 詳情頁顯示被舉報人**歷史仲裁檔案**（只讀），輔助「7 日 suspend vs 永久 ban」等人手裁定。
2. 提供**解釋性統計**，唔取代本案 `final_score`。
3. **唔改** per-case scoring、resolve saga、自動 ban 政策。

### Non-goals

| 不做 | 原因 |
|------|------|
| 生涯總分 merge 入新案 `auto_score` | 會 double-count、混淆本案證據權重 |
| 分數門檻自動永久 ban | 與現行政策衝突 |
| 全站 chat 搜尋 | Out of scope |
| Reporter 申訴 portal | Out of scope |

---

## 3. Design principles

| Principle | Decision |
|-----------|----------|
| **本案分數為主** | Panel 標題寫明「歷史參考」；本案 `finalScore` 仍係裁定主依據 |
| **只讀聚合** | 新 RPC / action；唔改 `rpc_submit_user_report_v2` |
| **含過期制裁** | `account_sanctions` 查 `revoked_at IS NULL`，**唔** filter `ends_at > now()` |
| **排除本案** | 歷史 case 列表預設 `id <> p_current_case_id`，避免重複 |
| **Admin guard** | `_grading_require_admin()` / `isCurrentUserAdmin()` |
| **CI** | 新 page 片段唔影響 prerender；action 跟現有 admin-moderation 模式 |

---

## 4. Proposed UX

### 4.1 Placement

`DisputeDetailClient.tsx` — 被舉報人區塊（username / 有效制裁）**下方**新增：

**「被舉報人歷史檔案」** panel（collapsible，預設展開若有 `upheldCount > 0` 或 `priorCaseCount > 0`）。

### 4.2 Summary row（頂部統計）

| 欄位 | 定義 |
|------|------|
| 歷史案件數 | `COUNT(moderation_cases)` where `subject_user_id` and `id <> current` |
| 裁定成立次數 | `COUNT(*)` where `resolution = 'upheld'`（歷史，不含本案若未結） |
| 近 90 日舉報次數 | `COUNT(reports)` join cases on subject，`reports.created_at > now() - 90d` |
| 曾受制裁 | Distinct `account_sanctions.type` 曾出現（含已過期） |

可選 badge：**重犯提示** — `upheldCount >= 2` 或 `priorSanctionCount >= 1` → 黃色「曾有違規紀錄」（**唔** block 裁定）。

### 4.3 Prior cases table

| Column | Source |
|--------|--------|
| 案件編號 | `case_number` → link `/admin/disputes/{id}` |
| 狀態 | `status` |
| 主類別 | `primary_category` |
| 最終分數 | `final_score`（**該案**分數，非累積） |
| 裁定 | `resolution` |
| 結案時間 | `resolved_at` |

排序：`resolved_at DESC NULLS LAST, created_at DESC`  
分頁：預設最近 **10** 筆；「載入更多」optional v1.1。

### 4.4 Sanction history table

| Column | Source |
|--------|--------|
| 類型 | `type` + `scope` |
| 來源案件 | `case_id` → case_number link |
| 開始 | `starts_at` |
| 結束 | `ends_at`（null = 永久） |
| 狀態 | active / expired / revoked（derive from `ends_at`, `revoked_at`） |
| 原因 | `reason` truncate |

### 4.5 Optional hint banner（P1）

當 **本案** `finalScore >= 30` **且** `upheldCount >= 1`：

> 建議：被舉報人曾有成立裁定，可考慮加重制裁（仍須 Admin 手動選擇）。

純 UI copy，**唔** call resolve。

---

## 5. Backend contract

### 5.1 New RPC

```sql
admin_get_subject_moderation_history(
  p_subject_user_id UUID,
  p_exclude_case_id UUID DEFAULT NULL,
  p_case_limit INT DEFAULT 10,
  p_sanction_limit INT DEFAULT 20
) RETURNS JSONB
```

**Returns:**

```typescript
type AdminSubjectModerationHistory = {
  subjectUserId: string;
  stats: {
    priorCaseCount: number;
    upheldCount: number;
    dismissedCount: number;
    reportsLast90Days: number;
    distinctSanctionTypes: string[];
  };
  priorCases: Array<{
    id: string;
    caseNumber: string;
    status: ModerationCaseStatus;
    primaryCategory: ReportCategorySlug | null;
    finalScore: number | null;
    resolution: ModerationResolution | null;
    createdAt: string;
    resolvedAt: string | null;
  }>;
  sanctionHistory: Array<{
    id: string;
    scope: SanctionScope;
    type: SanctionType;
    caseId: string | null;
    caseNumber: string | null;
    startsAt: string;
    endsAt: string | null;
    revokedAt: string | null;
    reason: string | null;
    status: "active" | "expired" | "revoked";
  }>;
};
```

### 5.2 Server action

```typescript
// app/actions/admin-moderation.ts
export async function getAdminSubjectModerationHistory(input: {
  subjectUserId: string;
  excludeCaseId?: string;
}): Promise<
  | { success: true; data: AdminSubjectModerationHistory }
  | { success: false; error: string }
>;
```

- Guard: `requireAdmin()`
- 可從詳情頁 SSR 一併 fetch，或 client lazy-load（建議 **SSR 連同 case bundle** 減少 waterfall）

### 5.3 Extend bundle（alternative）

將 history 併入 `admin_get_moderation_case_bundle` 回傳 `subjectHistory` 欄位 — 減 round-trip，但 bundle payload 變大。  
**建議 v1：** 獨立 RPC + 詳情 `page.tsx` parallel `Promise.all` fetch。

### 5.4 Files to add / touch

| Path | Change |
|------|--------|
| `supabase/migrations/20260811120000_admin_moderation_subject_history.sql` | RPC + grants |
| `app/actions/admin-moderation.ts` | `getAdminSubjectModerationHistory` + parser |
| `lib/moderation/types.ts` | `AdminSubjectModerationHistory` types |
| `app/admin/disputes/[id]/page.tsx` | Parallel fetch history |
| `app/admin/disputes/[id]/ModerationSubjectHistoryPanel.tsx` | **New** client panel |
| `app/admin/disputes/[id]/DisputeDetailClient.tsx` | Inject panel below subject header |
| `types/supabase.ts` | Regenerate after migration |

**唔改：** `rpc_resolve_moderation_case`, `_find_or_create_moderation_case`, scoring helpers.

---

## 6. SQL sketch

```sql
-- Stats: prior cases (exclude current)
SELECT COUNT(*) FILTER (WHERE resolution = 'upheld'),
       COUNT(*) FILTER (WHERE resolution = 'dismissed'),
       COUNT(*)
FROM moderation_cases
WHERE subject_user_id = p_subject_user_id
  AND (p_exclude_case_id IS NULL OR id <> p_exclude_case_id);

-- Reports last 90d (all cases for subject)
SELECT COUNT(*)
FROM reports r
JOIN moderation_cases mc ON mc.id = r.case_id
WHERE mc.subject_user_id = p_subject_user_id
  AND r.created_at > now() - interval '90 days';

-- Sanctions: include expired; status derived in SELECT
SELECT s.*, mc.case_number,
  CASE
    WHEN s.revoked_at IS NOT NULL THEN 'revoked'
    WHEN s.ends_at IS NOT NULL AND s.ends_at <= now() THEN 'expired'
    ELSE 'active'
  END AS status
FROM account_sanctions s
LEFT JOIN moderation_cases mc ON mc.id = s.case_id
WHERE s.user_id = p_subject_user_id
ORDER BY s.starts_at DESC
LIMIT p_sanction_limit;
```

Index note：已有 `moderation_cases (subject_user_id, created_at DESC)`、`account_sanctions (user_id, starts_at DESC)` — 應足夠 v1。

---

## 7. Phased delivery

| Sub-phase | Deliverable | Priority |
|-----------|-------------|----------|
| **G1** | Migration + RPC + action + types | P0 |
| **G2** | `ModerationSubjectHistoryPanel` + detail page wire | P0 |
| **G3** | List page badge「曾有違規」when subject has `upheldCount >= 1` on any open case | P1 |
| **G4** | Hint banner（§4.5） | P1 |
| **G5** | E2E: seed 2 cases same subject → detail shows prior case | P1 |

**Phase F**（auto-escalation cron / dashboard pending）→ [v2-plan.md](./v2-plan.md)，唔與 G 合併。

---

## 8. Acceptance checklist

- [x] Admin 開啟案件詳情 → 見「被舉報人歷史檔案」
- [x] 同一 subject 有 2+ 案件 → 列表顯示舊案（不含本案）含 case_number link
- [x] 7 日 suspend 已過期 → 制裁歷史仍顯示 `expired`
- [x] 本案 `finalScore` 顯示不受 history 影響
- [x] 非 admin → action 拒絕
- [x] Vitest `I-G1`–`I-G3` · `bunx tsc --noEmit` · `bun run build:ci`

---

## 9. Verify (manual)

1. Seed：user A 被舉報 → resolve upheld + suspend 7d → 等 `ends_at` 過期（或手改 DB）。
2. 新舉報 user A → 開新 case → Admin 詳情頁應見：prior case upheld、expired suspend。
3. 點舊案 link → 跳轉正確 `/admin/disputes/{id}`。

---

## 10. Integration queue (when shipped)

Update `INTEGRATION_QUEUE.md` row **Admin moderation** — Phase G ✅；本 plan 標 📋 → ✅。

---

## 11. Open questions (decide at implementation)

| # | Question | Suggested default |
|---|----------|-------------------|
| 1 | History 是否包含 `dismissed` 案件？ | **是** — Admin 需見完整紀錄 |
| 2 | `insufficient_evidence` 算 upheld？ | **否** — 只計 `resolution = 'upheld'` |
| 3 | 列表 badge 會否令 pending 隊列過噪？ | 僅 `open` case 且 subject `upheldCount >= 1` 顯示 |
| 4 | Merchant vs member persona 分開統計？ | v1 **否** — account-level 聚合即可 |
