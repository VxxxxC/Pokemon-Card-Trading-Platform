# Admin moderation & disputes — frontend

> **Status:** ✅ Phase A–E+ wired · Phase G subject history · reporter outcome modal  
> **Planned:** Phase F auto-escalation → [v2-plan.md](./v2-plan.md)  
> **v2:** Appeal portal · listing 舉報 · admin refund preview（PR3C）  
> **Backend contract:** [backend.md](./backend.md)  
> **Routes:** `/admin/disputes`, `/admin/disputes/[id]`  
> **Policy:** [refund-policy.md](../../refund-policy.md) · [escrow-payment-policy.md](../../escrow-payment-policy.md)（capture／出款）

## Overview

Replace mock `mockDisputes.ts` with live moderation cases.  
User reports flow: **舉報 dialog** → case queue → **admin 詳情** (evidence + optional chat + orders) → score adjustment + sanction.

---

## File layout (target)

```
app/admin/disputes/
  page.tsx                          # SSR guard + initial case list
  AdminDisputesClient.tsx           # NEW — extract from inline page content
  [id]/
    page.tsx                        # SSR load getAdminModerationCase
    DisputeDetailClient.tsx         # REWIRE — keep layout, drop mock types

app/components/report/
  UserReportModal.tsx               # ADD image upload + category hints

lib/moderation/
  category-config.ts                # shared with backend (import client-safe parts)

e2e/
  user-report.spec.ts               # extend attachments + category column
  admin-moderation.spec.ts          # NEW — admin queue smoke
```

**Reuse from mock (keep UX):**

- `highlightSensitiveKeywords` in `DisputeDetailClient.tsx` (PayMe, FPS, WhatsApp, URLs, HK phone).
- Escrow step timeline when order context present.
- Audit log panel + arbitration action select (map to `resolveAdminModerationCase`).

---

## Part 1 — User report dialog (`UserReportModal`)

### Current

- 4 category dropdown (`REPORT_CATEGORIES`)
- Textarea details
- `submitUserReport({ reportedUserId, category, details, chatRoomId? })`

### Additions

| UI | Behaviour |
|----|-----------|
| **證據圖片** | 0–3 images; preview thumbnails; remove before submit |
| **Category hint** | Below dropdown — dynamic copy from `CATEGORY_CONFIG[slug].adminHints` / `userHint` |
| **Chat required banner** | When `offline_trade` or `harassment` and no `chatRoomId`: disable submit + link copy「請在對話視窗內舉報」 |
| **Upload recommended** | When `fraud` / `offline_trade`: show「建議上傳截圖」 |

### Upload flow (recommended)

1. User picks images → client validates size/type (match listing rules).
2. On submit: upload each via `POST /api/reports/upload-evidence` → collect `attachmentIds`.
3. Call `submitUserReport({ ..., attachmentIds })`.
4. On failure: toast; do not leave modal open with partial state.

### Props (unchanged + optional)

```typescript
interface UserReportModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  targetUserName: string;
  targetType?: "user" | "merchant" | "chat_message";
  chatRoomId?: string;   // required for chat-context categories when opened from chat
  onSuccess?: () => void;
}
```

### Entry points (no new routes)

| Location | `chatRoomId` |
|----------|--------------|
| `GlobalChatConsole` / `ChatReportDialogBody` | ✅ pass room id |
| `ProfileHeaderWithChat` / public profile | ❌ profile-only; block chat-required categories or show warning |
| Merchant profile variant | same as profile |

### Acceptance

- [ ] Fraud + chat room: submit succeeds; attachments optional.
- [ ] Offline trade from profile (no room): submit blocked with clear message.
- [ ] Offline trade from chat: submit succeeds; admin case shows chat panel.
- [ ] Max 4th image rejected client-side.
- [ ] Existing e2e (`user-report.spec.ts`) still pass.

---

## Part 2 — Admin disputes list (`/admin/disputes`)

### Replace

- `mockDisputes` import → `searchAdminModerationCases` (client refetch or SSR + transition).

### Columns (align mock + backend)

| Column | Source |
|--------|--------|
| 案件編號 | `case.caseNumber` |
| 類別 | `primaryCategory` label |
| 嚴重程度 | Derive from `finalScore` bands (critical ≥60, medium ≥30, low &lt;30) |
| 舉報人 | First reporter display name (+N) |
| 被舉報人 | `subject.displayName` |
| 分數 | `finalScore` (show `autoScore` + adjustment tooltip) |
| 狀態 | `open` / `reviewing` / `resolved` / `dismissed` |
| 提交時間 | `createdAt` |

### Filters

- Tabs: 全部 / 待處理 (`open`+`reviewing`) / 已完成 (`resolved`+`dismissed`) — match dashboard `?status=pending` deep link.
- Category pill filter.
- Search: case number, username, display name.
- Sort default: `finalScore DESC`, then `createdAt ASC`.

### Dashboard link

`DashboardClient` pending disputes CTA → `/admin/disputes?status=pending` (already exists); wire count from `pendingCount` in search response.

### Acceptance

- [x] No `mockDisputes` import in production path.
- [x] Pagination works.
- [x] Row click → `/admin/disputes/[caseId]`.

---

## Part 3 — Admin case detail (`/admin/disputes/[id]`)

### Layout (3-column desktop, stack mobile)

```
┌─────────────────────────────────────────────────────────────┐
│ ← 返回   Case MOD-…   [status badge]   finalScore: 72      │
├──────────────────┬──────────────────┬───────────────────────┤
│ A. 舉報摘要       │ B. 對話紀錄       │ C. 裁定                │
│ - reports list   │ (conditional)    │ - score breakdown     │
│ - user uploads   │ keyword highlight│ - admin ± score       │
│ - reporter notes │ load more        │ - sanction form       │
├──────────────────┴──────────────────┴───────────────────────┤
│ D. 關聯訂單（conditional）  escrow timeline if escrow order      │
└─────────────────────────────────────────────────────────────┘
```

### Panel A — Reports & evidence

- List each report: category, reporter, date, contribution, details text.
- **User-uploaded images:** grid + lightbox (`ImageViewer` or existing pattern).
- Flag: `evidenceSufficient` from backend — red banner if category requires chat but missing.

### Panel B — Chat (conditional)

**Show when:**

- `chatAccess.available === true`, OR
- `primaryCategory` ∈ `{ offline_trade, harassment }` (show empty state if missing).

**Load:** `getAdminModerationChatThread(caseId, roomId)` on expand or page load.

**UI:**

- Reuse mock chat bubble layout + `highlightSensitiveKeywords`.
- System messages styled distinctly (`is_system_warning`).
- Offer / order system messages: link to order panel.
- Pagination: 「載入更早訊息」→ `loadOlder` with cursor.

**If chat required but missing:**

- Show CTA: 「證據不足 — 建議駁回或標記 insufficient_evidence」.
- Disable **裁定成立 (upheld)** without admin override checkbox + reason.

### Panel D — Orders (conditional)

**Show when:** `relatedOrders.length > 0` OR category `fraud` / logistics-related.

- Card per order: number, type (member/merchant), amount, escrow status, tracking.
- Link: `/profile/user/orderDetail/{id}` or merchant equivalent (admin new tab).
- Escrow stepper: reuse `MerchantB2cDirectTimeline` / member auth timeline read-only.

**No order + offline_trade:** show copy「無平台訂單 — 符合私下交易風險特徵」.

### Panel C — Scoring & resolution

**Score breakdown (read-only):**

```
自動分數 (autoScore): 55
  - 誘導私下交易 ×2 …
  - 言語辱罵 ×1 …
管理員調整: +10  「多次獨立舉報交叉驗證」
─────────────────
最終分數: 65
```

**Admin adjustment:**

- Number input `adjustment` (+/−).
- Textarea `adjustmentReason` (required if ≠ 0).

**Resolution actions** (map mock select → API):

| UI label (mock) | API `resolution` + `sanction` |
|-----------------|-------------------------------|
| 駁回舉報 | `dismissed` |
| 證據不足 | `insufficient_evidence` |
| 凍結帳戶 N 日 | `upheld` + `suspend` + `endsAt` |
| 永久封禁 | `upheld` + `ban` + `scope: account` |
| 限制 Member 上架 | `upheld` + `restrict_listing` + `scope: member_persona` |
| 限制 Merchant 店鋪 | `upheld` + `restrict_listing` + `scope: merchant_persona` |
| 凍結出款 | `upheld` + `freeze_payout` |

Phase H resolve UI：`orderRefund` checkbox + `fault_party`（seller / buyer / platform / **carrier** / **inconclusive**）— 見 [backend.md](./backend.md) Phase H。Carrier 須選 `carrierLiabilityParty`（seller / platform）。

**PR3C refund preview:** When refund checkbox + order + fault selected, debounced `previewModerationOrderRefund` shows read-only §2.1 breakdown (`data-testid="moderation-refund-preview"`). Loading / error states; hidden when inputs incomplete.

**Violation persona:** select `member` / `merchant` / `both` / `unknown` (required on upheld).

**Submit:** `resolveAdminModerationCase` → toast → redirect to list or refresh.

### Audit log

- Right column or bottom: `auditLog` from case bundle.
- Append optimistically after resolve.

### Acceptance

- [x] Case loads reports list + contribution scores (read-only).
- [x] User attachments display when Bunny configured.
- [x] `chatAccess` insufficient-evidence banner when category requires chat.
- [x] Case with chat room loads thread (Phase D).
- [x] Adjust score + resolve (Phase E).
- [x] Related orders panel read-only (Phase E+).
- [x] Suspended account page `/auth/suspended` (Phase E+).
- [x] `bun run build:ci` passes.

---

## Partner manual QA（Phase E + E+）

> **給 partner 試：** 後端 / SQL / enforcement 細節見 [backend.md §Partner manual QA](./backend.md#partner-manual-qaphase-e--e)。  
> 本節聚焦 **Admin UI** 操作路徑。

### 前置

1. 使用 **admin** 帳號登入。
2. 確保至少有一筆 **pending** 案件（可先以 buyer 對 seller 提交 chat 舉報）。
3. 路由：`/admin/disputes` → 點案件編號進入詳情。

### UI 驗收清單

| # | 操作 | 預期 UI |
|---|------|---------|
| F1 | 開啟 pending 案件 | 舉報摘要、證據、聊天（如有）、風控分數、裁定表單皆可見 |
| F2 | 風控分數：輸入 adjustment、原因 →「儲存調整」 | Toast「風控分數已更新」；分數區反映新 `finalScore` |
| F3 | adjustment ≠ 0 但不填原因 | Toast 錯誤「調整分數時必須填寫原因」 |
| F4 | 裁定：選「駁回舉報」→ 執行 | Toast 成功；redirect 至 completed 列表 |
| F5 | 證據不足 banner 顯示時 | upheld 類下拉項 disabled；可 dismiss / insufficient_evidence |
| F6 | 勾選「管理員強制裁定」+ 原因 → 選 upheld 制裁 | 可成功提交 |
| F7 | upheld 類選項 | 顯示「違規身分」下拉（必填） |
| F8 | 已結案案件 | 裁定表單 disabled；header 顯示 resolution badge |
| F9 | subject 區塊 | 若有有效制裁，顯示 `activeSanctions` 列表 |
| F10 | **關聯訂單** panel（fraud / offline_trade 類別） | 標題「關聯訂單」；有訂單時顯示卡片 + timeline；無訂單 offline_trade 顯示私下交易提示 |
| F11 | 訂單卡「在新分頁開啟訂單詳情」 | 正確開啟 member / merchant order detail |
| F12 | 審計紀錄 | resolve / adjust_score / view_chat 等中文標籤 |

### 被制裁用戶體驗（需第二帳號或 partner 配合）

| # | 操作 | 預期 |
|---|------|------|
| F13 | Admin 對 subject 裁定「凍結帳戶 7 日」後，subject 登入並開 `/profile/user` | 導向 `/auth/suspended`，標題「帳戶已暫停」 |
| F14 | 在 suspended 頁按「登出並返回登入」 | 回到登入頁，可換帳號 |
| F15 | Admin 裁定「永久封禁」後，subject 嘗試登入 | 無法登入（Auth ban） |

### 不屬本階段（應 **看不到** 或不可用）

- Escrow 退款 / 釋款選項（`buyer_refunded` 等 mock）— 不應出現在裁定下拉
- 關聯訂單上的退款 / 釋款按鈕 — read-only only
- 制裁撤銷 UI — 尚未實作

### 自動化（可選）

```bash
bun run test:e2e e2e/admin-moderation.spec.ts --project=guest   # 需 E2E_ADMIN_*
bun run test:e2e e2e/admin-moderation.spec.ts --project=buyer -g "suspended user"
```

---

## Shared constants (`lib/moderation/category-config.ts`)

Export for **both** frontend hints and backend weights:

```typescript
export const REPORT_CATEGORY_CONFIG = {
  fraud: {
    label: "惡意欺詐 / 虛假交易",
    uiValue: "惡意欺詐 / 虛假交易", // matches UserReportModal until slug migration
    baseWeight: 40,
    evidence: { upload: "recommended", chat: "optional", order: "recommended" },
    userHint: "建議附上交易截圖及訂單編號（如有）。",
    adminHint: "核對訂單狀態、付款紀錄與對話是否一致。",
  },
  offline_trade: { /* … chat required … */ },
  harassment: { /* … chat required … */ },
  other: { /* … */ },
} as const;
```

Frontend: import `userHint` / `evidence.chat === 'required'`.  
Backend: import `baseWeight` + validation rules.

---

## SSR / CI guards

| Page | Guard |
|------|-------|
| `app/admin/disputes/page.tsx` | `isCurrentUserAdmin()` → else redirect |
| `app/admin/disputes/[id]/page.tsx` | same + `notFound()` if case missing |

Do not call Supabase in client without env at build — follow existing admin pages pattern.

---

## E2E (new `admin-moderation.spec.ts`)

1. Buyer submits chat report `offline_trade` with attachment (service role verify).
2. Admin login → `/admin/disputes?status=pending` sees case.
3. Open detail → chat panel visible → message text present.
4. Dismiss case → disappears from pending tab.

---

## Out of scope

### v1 已完成（勿再列為 out of scope）

- ✅ Reporter in-app outcome notification（`ReportOutcomeNotificationHost`）
- ✅ Phase H post-sale refund on resolve（`merchant_direct` / `merchant_auth` / `member_auth` prepare）

### Pre-v1 上線（全站 batch，唔屬 moderation v2）

- Email／push：含 Admin 裁定後 **通知被罰用戶**（backend only，無專用 UI）

### v2 — 見 [v2-plan.md](./v2-plan.md)

- Accused-user **appeal portal**（制裁申訴 + 窗口內訂單申訴）
- Listing 頁直接舉報
- Admin refund amount **preview** panel on resolve（PR3C）
- Phase F auto-escalation cron

### 其他 deferred

- In-app dispute filing on order detail（escrow P3 售後 flow，與舉報分開）
- Auto-suspend without admin UI indicator

---

## Styling notes

- Keep existing admin disputes dark theme and badge colours from mock (`categoryBadgeClasses`, `statusBadgeClasses`).
- New upload zone in report modal: minimal/unstyled placeholder OK per backend wire-up protocol; frontend dev polishes later.
- Do not remove mock keyword highlighter when rewiring — move to `lib/moderation/highlight-chat-keywords.tsx` if shared.
