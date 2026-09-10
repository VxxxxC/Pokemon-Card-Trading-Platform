# Partner Report — User Reports (Chat + Public Profile)

**Date:** 2026-07-09  
**Flow:** Submit moderation reports from **GlobalChatConsole** (chat room) and **ProfileHeaderWithChat** (public profile)  
**Backend owner:** Backend track  
**Frontend owner:** Partner (polish + smoke-test)  
**Remote DB:** Migrations **`20260709300000`** + **`20260709310000`** — pushed (`bunx supabase db push` ✅)  
**E2E:** `e2e/user-report.spec.ts` — buyer project ✅ (chat, profile, chat+profile same case, profile duplicate blocked)

---

## Executive summary

| Area | Status |
|------|--------|
| `reports` table + RLS (reporter INSERT/SELECT) | ✅ Deployed |
| Pending dedupe index (context-aware: chat room / profile+category) | ✅ `20260812120000` |
| `submitUserReport` server action | ✅ Shipped |
| Chat console report UI → DB | ✅ Wired |
| Public profile report UI → DB | ✅ Wired |
| Structured `reason` payload (`[CATEGORY]` / `[SOURCE]` / `[ROOM_ID]` / `[DETAILS]`) | ✅ Shipped |
| Admin moderation UI (`status` workflow) | ⏳ Out of scope |
| Auto-notify / account freeze on report | ⏳ Out of scope |
| E2E coverage (both entry points + multi-context) | ✅ `user-report.spec.ts` |

**Partner action:** Smoke-test both report dialogs as a logged-in buyer; confirm toasts, dialog behaviour, and `reports` rows in Supabase. Polish is optional — backend contract is stable.

---

## Entry points

| UI | File | Trigger | `chatRoomId` |
|----|------|---------|--------------|
| Chat room header | `app/components/chat/GlobalChatConsole.tsx` | **舉報** → `ChatReportDialogBody` | ✅ `activeRoomId` (DB UUID only) |
| Public profile header | `app/components/profile/ProfileHeaderWithChat.tsx` | **🚩 舉報用戶** (inline dialog) | ❌ omitted |

Both call the same action:

```ts
import { submitUserReport } from "@/app/actions/reports";

// Chat
await submitUserReport({
  reportedUserId: activeRoom.partnerId,
  category: reportCategory,
  details: reportDetails,
  chatRoomId: activeRoomId,
});

// Profile
await submitUserReport({
  reportedUserId: member.id,
  category: reportCategory,
  details: reportDetails,
});
```

---

## Database

| Object | Migration | Purpose |
|--------|-----------|---------|
| `report_state` enum | `20260709300000` | `pending` · `reviewing` · `resolved` · `dismissed` |
| `reports` table | `20260709300000` | Idempotent `CREATE TABLE IF NOT EXISTS` |
| `reports_reporter_read` RLS | `20260709300000` | SELECT own rows only |
| `reports_reporter_insert` RLS | `20260709300000` | INSERT as self; `target_type = user`; not self |
| `idx_reports_pending_reporter_target` | `20260709300000` | ~~Unique pending per `(reporter_id, target_id)`~~ replaced by `20260812120000` |
| `idx_reports_pending_reporter_target_chat_room` | `20260812120000` | Unique pending per `(reporter_id, target_id, context_id)` for chat |
| `idx_reports_pending_reporter_target_profile_category` | `20260812120000` | Unique pending per `(reporter_id, target_id, category)` for profile |
| `service_role` GRANT | `20260709310000` | E2E admin audit helpers |

### Row shape (insert)

| Column | Value |
|--------|-------|
| `reporter_id` | `auth.uid()` |
| `target_type` | `"user"` |
| `target_id` | Reported `profiles.id` |
| `status` | `"pending"` |
| `reason` | Structured text (see below) |

### `reason` format

```
[CATEGORY] 惡意欺詐 / 虛假交易
[SOURCE] chat_room | profile
[ROOM_ID] <uuid>          ← chat only
[DETAILS] <user text>
```

Category values match `SelectItem` `value` in `ChatReportDialogBody.tsx` / `ProfileHeaderWithChat.tsx` (no server-side enum).

---

## Architecture

```
User clicks 舉報
  → AlertDialog (category + details)
  → submitUserReport (server action)
       ├─ auth.uid()
       ├─ validate UUID, category, details ≤ 2000
       ├─ chatRoomId? → isDbChatRoomId + chat_rooms party check
       └─ else → profiles exists check
  → INSERT reports (RLS)
  → toast success | error (dialog stays open on error)
```

Chat party validation runs in the **server action** (not RLS) because `reports` has no `room_id` column.

---

## Server action contract

| Action | File | Notes |
|--------|------|-------|
| `submitUserReport` | `app/actions/reports.ts` | Mutation; requires runtime auth |
| `formatReportReason` | `app/lib/reports/formatReportReason.ts` | Pure helper for `reason` text |

```ts
type SubmitUserReportResult =
  | { success: true; data: { reportId: string } }
  | { success: false; error: string };
```

### Error messages (user-facing)

| Condition | Error |
|-----------|-------|
| Not logged in | 請先登入 |
| Self-report | 無法舉報自己 |
| Mock/pending chat room | 對話尚未建立，無法舉報 |
| Not chat party | 無法舉報此對話中的用戶 |
| Duplicate pending (same chat room) | 您已在此對話提交過待審核的舉報，請等待處理結果 |
| Duplicate pending (profile, same category) | 您已在此用戶公開資料提交過同類別的待審核舉報，請等待處理結果 |
| Missing category | 請選擇舉報事項類別 |

---

## UI wired

| File | Change |
|------|--------|
| `GlobalChatConsole.tsx` | `handleReportConfirm` → async `submitUserReport`; `isReportSubmitting` |
| `ChatReportDialogBody.tsx` | `isSubmitting` prop; disabled confirm + 「提交中…」 |
| `ProfileHeaderWithChat.tsx` | Same action wiring; success `toast.success` (was `toast.error`) |

### Guards (chat)

- Report only when `activeRoom` exists **and** `isDbChatRoomId(activeRoomId)`
- Mock / `pending-*` / ephemeral rooms → error toast, dialog stays open

---

## Partner backlog

### P0 — Verify wired flows

- [ ] Apply migrations `20260709300000` + `20260709310000` on target env (linked remote ✅)
- [ ] **Chat:** Logged-in buyer opens DB chat room → 舉報 → category required → submit → success toast → row in `reports` with `[SOURCE] chat_room` + `[ROOM_ID]`
- [ ] **Profile:** `/profile/{seller-uuid}` → 🚩 舉報用戶 → submit → row with `[SOURCE] profile` (no `[ROOM_ID]`)
- [ ] Duplicate pending report → friendly error; dialog remains open
- [ ] Mock/pending chat room → 「對話尚未建立，無法舉報」
- [ ] Submit button disabled + 「提交中…」 during RPC

### P1 — E2E (automated)

```bash
bun run test:e2e e2e/user-report.spec.ts --project=buyer
```

Requires: `E2E_BUYER_*`, `E2E_SELLER_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `.env` Supabase URL.

### P2 — Polish (partner-owned, optional)

- [ ] Extract profile inline report form → reuse `ChatReportDialogBody` (DRY)
- [ ] Disable category `Select` while `isSubmitting`
- [ ] Empty-state copy if guest hits profile report (currently requires login at action layer)

### P3 — Out of scope (future backend/admin)

- [ ] Admin queue UI (`pending` → `reviewing` → `resolved` / `dismissed`)
- [ ] Slack/email notify on new report
- [ ] Report listing / message snapshot attachment

---

## SQL smoke test

```sql
-- Latest report by reporter
SELECT id, reporter_id, target_id, target_type, status, reason, created_at
FROM reports
WHERE reporter_id = '<reporter-uuid>'
ORDER BY created_at DESC
LIMIT 5;

-- Pending dedupe (should return 0 or 1 row per pair)
SELECT reporter_id, target_id, count(*)
FROM reports
WHERE status = 'pending'
GROUP BY reporter_id, target_id
HAVING count(*) > 1;
```

---

## Docs index

| Doc | Audience |
|-----|----------|
| [backend.md](./backend.md) | Action contract, migrations, backend verify |
| [frontend.md](./frontend.md) | UI touchpoints, acceptance checklist |
| [INTEGRATION_QUEUE.md](../../INTEGRATION_QUEUE.md) | Dashboard row |

---

## Smoke test commands

```bash
bun run dev
# 1. Log in as member → open chat with seller → 舉報 → submit
# 2. Visit /profile/{seller-uuid} → 🚩 舉報用戶 → submit
# 3. Check Supabase Table Editor → reports
```

```bash
bunx tsc --noEmit
bun run lint
bun run build:ci
bun run test:e2e e2e/user-report.spec.ts --project=buyer
```
