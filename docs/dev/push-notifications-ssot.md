# Push Notifications SSOT

> **Status:** Phase 0–1 live (OneSignal SDK + opt-in + DB sync). Phase 2 first send (wishlist) in progress.  
> **Related:** [email-notifications-ssot.md](./email-notifications-ssot.md) · [system-feature-registry.md](./system-feature-registry.md) · [INTEGRATION_QUEUE.md](./INTEGRATION_QUEUE.md)  
> **Provider:** OneSignal Web Push (self-hosted SDK v16, service worker scope `/onesignal/`)

---

## 0. Rollout progress (agent trace)

| Phase | PR | Deliverable | Status | Key files |
|-------|-----|-------------|--------|-----------|
| **0** | PR1 | SDK init, SW, login opt-in banner | ✅ | `OneSignalProvider`, `PushOptInBanner`, `public/vendor/onesignal/` |
| **1** | PR2 | `user_push_subscriptions` + client sync | ✅ | `push-subscriptions.ts`, `OneSignalSubscriptionSync`, migration `20261002100000` |
| **2** | PR3 | **P-WIS-01** wishlist price alert cron | ✅ | `send.ts`, `process-wishlist-price-alerts.ts`, `/api/cron/wishlist-price-alerts` |
| **3** | PR4 | **P-OFF-*** offer events (chat triggers) | ✅ | `offer-push.ts`, `push-delivery.ts`, `offers.ts`, `buy-now.ts` |
| **4** | PR5 | **P-ORD-*** order lifecycle subset | ✅ | `order-push.ts`, `order-emails.ts`, webhook/cron hooks |
| **5** | PR6 | User settings toggles (real prefs) | ✅ | `push_transactional`, `UserSettingsClient`, `push-delivery` gate |
| **6** | PR7 | **P-MOD-*** moderation / sanction mirror | ✅ | `moderation-push.ts`, `moderation-emails.ts` |
| **7** | PR8 | **P-CHT-01** chat unread daily digest | ✅ | cron + `process-chat-unread-digest.ts` |
| **8** | PR9a | **P-ORD-04–08** order lifecycle + cron reminders | ✅ | `order-push.ts`, `order-emails.ts` |
| **9** | PR9b | **P-GRD-C2C-*** C2C auth escrow mirror | 🚧 | `grading-push.ts` + `grading-emails.ts` hooks |
| **10** | PR9c | **P-GRD-B2C-*** merchant auth mirror | 🚧 | same |
| **11** | PR9d | **P-OFF-05–06** offer modify / expired (P2) | 🚧 | `offer-push.ts` + `offers.ts` |

**Gate commands (per phase):**

```bash
bun run test:push:phase1    # PR3 wishlist
bun run test:push:phase2    # PR4 offers (gate + send + action wiring)
bunx tsc --noEmit
bun run lint
```

### Per-PR test checklist (mandatory before merge)

> **Rule:** 每完成一個 push PR，必須補齊對應 test — 唔好累積到 PR8 先寫。

| PR | Required tests | Command |
|----|----------------|---------|
| **PR3** | `push-phase1-registry` + copy/cooldown gate | `bun run test:push:phase1` |
| **PR4** | phase2 gate + `offer-push-send` (merchant/negative) + `offer-push-action-wiring` | `bun run test:push:phase2` |
| **PR5** | `push-phase3-registry` + order send helper + action/cron wiring | `bun run test:push:phase3` |
| **PR6** | settings toggle contract tests (opt-in gates send) | `bun run test:push:phase6` |
| **PR7** | moderation push gate + send + email wiring | `bun run test:push:phase7` |
| **PR8** | chat digest cron gate (cooldown + unread threshold) | `bun run test:push:phase8` |
| **PR9a** | order extension + reminder cron gate + wiring | `bun run test:push:phase9a` |
| **PR9b** | C2C grading push gate + email wiring | `bun run test:push:phase9b` |
| **PR9c** | B2C grading push gate + email wiring | `bun run test:push:phase9c` |
| **Post-PR6** | One Playwright smoke journey (canonical offer or order flow) | `bun run test:e2e` *(targeted spec)* |

**PR4 test layers (reference):**

1. **Gate** — registry + copy (`push-phase2-gate.test.ts`)
2. **Send helper** — `eventId` / `userId` / `path` + merchant branch + lookup-fail skip (`offer-push-send.test.ts`)
3. **Action wiring** — RPC success → `sendOffer*Push` called; RPC fail → not called (`offer-push-action-wiring.test.ts`)

---

## 1. Conventions

### ID format

`P-<DOMAIN>-<NN>` — stable event key for code, tests, and future outbox (if added).

| Domain prefix | Area |
|---------------|------|
| `P-WIS` | Wishlist / price alerts |
| `P-OFF` | Offers / negotiation |
| `P-ORD` | Orders |
| `P-MOD` | Reports / moderation |
| `P-GRD` | Auth grading escrow (C2C + B2C) |
| `P-ACC` | Account / sanctions |
| `P-CHT` | Chat (high-volume; P2) |
| `P-RWD` | Rewards (P2) |

### Priority

| Tier | Meaning |
|------|---------|
| **P0** | Money-adjacent or time-sensitive user action |
| **P1** | Important — seller/buyer should know within hours |
| **P2** | Nice — digest, marketing, strong in-app duplicate |

### Delivery split

| Layer | Responsibility |
|-------|----------------|
| **Client** | Permission, `OneSignal.login(userId)`, subscription sync → `user_push_subscriptions` |
| **Server send** | OneSignal REST `POST /notifications` with `include_subscription_ids` |
| **Targeting** | Prefer DB `user_push_subscriptions` where `opted_in = true` (not segment blast) |
| **In-app keep** | Chat realtime, reward modal, F-M-23 report toast — push **mirrors** critical events only |

### Dedupe rules

1. Wishlist **P-WIS-01**: max **1 push / 24h** per `(user_id, product_id, grading_company, grading_score)` via `product_watchlists.last_alerted_at`.
2. Chat digest **P-CHT-01**: max **1 push / 24h** per `user_id` (daily bucket); skip if `unread_count = 0`.
3. Order reminders **P-ORD-06/07/08**: max **1 push / 24h** per `order_id` + event (align `E-ORD-07/08/09` email idempotency); reuse `buildDailyReminderIdempotencySuffix()` pattern.
4. Grading **P-GRD-***: **1 push per order + event + recipient** at state transition (mirror email `idempotency_key`; no repeat on webhook retry).
5. Order reminders: align with email SSOT — max 1 / 24h per order + event class when wired.
6. Same trigger as email: push is **additive**; email idempotency (`E-*` outbox) stays independent.

### Env

| Variable | Where |
|----------|--------|
| `NEXT_PUBLIC_ONESIGNAL_APP_ID` | Client init |
| `ONESIGNAL_REST_API_KEY` | Server send only |
| `CRON_SECRET` | Cron routes |

---

## 2. Infra checklist (Phase 0–1) ✅

- [x] Self-hosted OneSignal SDK (`public/vendor/onesignal/v16/`)
- [x] Service worker `public/onesignal/OneSignalSDKWorker.js`
- [x] `OneSignalProvider` in `app/layout.tsx`
- [x] Post-login opt-in card (`PushOptInBanner`)
- [x] Table `user_push_subscriptions` + RLS owner-only
- [x] `upsertUserPushSubscription` / `optOutUserPushSubscription`
- [x] `OneSignalSubscriptionSync` on login + subscription change
- [ ] Push outbox table (optional — defer until >3 event types)
- [x] User prefs `push_transactional` (Phase 6)

---

## 3. Event registry

### 3.1 Wishlist (`P-WIS`)

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature | Deep link |
|----|------------|---------|-----------|---|---------------|---------|-----------|
| P-WIS-01 | 願望清單 — 掛單價 ≤ 目標價 | Cron `wishlist-price-alerts` | Watchlist owner | P1 | none | F-M-10 | `/marketplace/product/{productId}` |

**Match rule:** `MIN(listings.price)` for `status = 'active'` + `listingMatchesWishlistGrade` ≤ `target_price`, `alert_enabled = true`.

### 3.2 Offers (`P-OFF`) — Phase 3 PR

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature |
|----|------------|---------|-----------|---|---------------|---------|
| P-OFF-01 | 收到新叫價 | `rpc_make_offer` success | Seller | P0 | chat |
| P-OFF-02 | 出價被接受 | `rpc_accept_offer` | Buyer | P0 | chat |
| P-OFF-03 | 出價被拒絕 | `rpc_reject_offer` | Buyer | P1 | chat |
| P-OFF-04 | 立即購買 | `rpc_buy_now_listing` | Seller | P0 | chat |

**PR9d (P2 — optional):**

| ID | Event (ZH) | Trigger | Recipient | P | Email mirror |
|----|------------|---------|-----------|---|--------------|
| P-OFF-05 | 買家修改出價 | `rpc_modify_offer` | Seller | P2 | E-OFF-02 |
| P-OFF-06 | 出價失效（下架等） | Listing inactive / order elsewhere | Buyer | P2 | E-OFF-05 |

### 3.3 Orders (`P-ORD`) — Phase 4 PR + PR9a

| ID | Event (ZH) | Trigger | Recipient | P | Channel today |
|----|------------|---------|-----------|---|---------------|
| P-ORD-01 | 付款成功 | Stripe webhook | Seller | P0 | chat |
| P-ORD-02 | 賣家已發貨 | Ship RPC | Buyer | P0 | order detail |
| P-ORD-03 | 待付款逾時取消 | Cron | Buyer | P1 | none |
| P-ORD-04 | 買家確認收貨 | Confirm receipt RPC | Seller | P1 | timeline |
| P-ORD-05 | 訂單完成 / 款項釋放 | `released` / `completed` | Counterparty | P1 | timeline |
| P-ORD-06 | 提醒：已發貨 N 日未確認 | Cron `order-fulfillment-reminders` | Buyer | P1 | none |
| P-ORD-07 | 提醒：已付款未發貨 | Cron `order-fulfillment-reminders` | Seller | P1 | none |
| P-ORD-08 | 評價邀請 | Post-complete RPC (no review yet) | Buyer + seller | P2 | in-app CTA |

**PR9a wiring:** mirror existing `order-emails.ts` enqueue sites + extend `process-order-fulfillment-reminders.ts` to call push after email enqueue (same candidate query).

**`push_transactional`:** P-ORD-04–08 gated same as P-ORD-01–03.

### 3.4 Moderation (`P-MOD`) — Phase 6 PR

| ID | Event (ZH) | Trigger | Recipient | P | Channel today |
|----|------------|---------|-----------|---|---------------|
| P-MOD-01 | 舉報結果 | `rpc_resolve_moderation_case` | Reporter | P1 | in-app F-M-23 |
| P-MOD-02 | 帳號制裁 | Sanction RPC | Subject | P0 | redirect |

### 3.5 Chat (`P-CHT`) — Phase 7 PR8

> **Not per-message push.** Realtime chat + inbox badge stay primary; push is a **daily nudge** when user still has unread.

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature | Deep link |
|----|------------|---------|-----------|---|---------------|---------|-----------|
| P-CHT-01 | 你有未讀訊息（每日摘要） | Cron `chat-unread-digest` (e.g. 09:00 HKT) | Users with `unread_count > 0` | P2 | in-app badge | F-M-13 | `/profile/user/chat` or active room |

**Match rule:**

1. Query inbox aggregate (`get_user_chat_inbox_lobby` or admin batch equivalent) → `SUM(unread_count) > 0` **or** any room `unread_count > 0`.
2. User has `user_push_subscriptions.opted_in = true`.
3. `last_chat_digest_pushed_at` is null or older than **24h** (per-user cooldown).
4. Skip if `profiles.last_active_at` within last **15 min** (client heartbeat while tab visible).

**Copy example:** `你有 {n} 則未讀訊息 — 打開收件匣查看`

**Why daily (not per message):**

| Approach | Complexity | Risk |
|----------|------------|------|
| Per new message | High — realtime hook on every insert, aggressive dedupe, tab-focus checks | Spam / notification fatigue |
| **Daily digest** | **Low–medium** — same pattern as wishlist cron; 1 row cooldown per user | User may see message hours later |

**Implementation sketch (PR8):**

| Piece | Notes |
|-------|--------|
| Migration | `profiles.last_chat_digest_pushed_at` **or** small `user_push_digest_state` table (preferred if multiple digest types) |
| Cron | `app/api/cron/chat-unread-digest/route.ts` + `vercel.json` schedule (1×/day) |
| Logic | `lib/notifications/process-chat-unread-digest.ts` |
| Send | Reuse `sendOneSignalPush` + `external_id` fallback |
| Tests | `push-phase2-registry` + gate (cooldown + unread threshold) |

**Out of scope for P-CHT-01:** offer/order system messages (covered by **P-OFF-*** / **P-ORD-*** instant push in PR4–5).

### 3.6 Account (`P-ACC`) — deferred

| ID | Event (ZH) | Trigger | Recipient | P |
|----|------------|---------|-----------|---|
| P-ACC-01 | 停權屆滿 | Sanction expiry cron | User | P2 |

### 3.7 Auth grading (`P-GRD`) — PR9b / PR9c

> Mirror **action-required** email events only. Intake + in-progress may merge copy (same as email `E-GRD-*-03` / `04`). **No** per-field logistics spam — max 1 push per transition per recipient.

#### C2C (`P-GRD-C2C-*`) — PR9b

| ID | Event (ZH) | Trigger | Recipient | P | Email |
|----|------------|---------|-----------|---|-------|
| P-GRD-C2C-01 | 已付款 — 請寄平台 | Payment → custody | Seller | P0 | E-GRD-C2C-01 |
| P-GRD-C2C-02 | 賣家已填入庫物流 | Inbound tracking | Buyer | P1 | E-GRD-C2C-02 |
| P-GRD-C2C-03 | 平台已收貨（鑑定中） | Admin intake / `grading` | Buyer + seller | P1 | E-GRD-C2C-03 |
| P-GRD-C2C-05 | 鑑定通過 — 已寄出 | Pass + outbound | Buyer + seller | P0 | E-GRD-C2C-05 |
| P-GRD-C2C-06 | 鑑定失敗 | `auth_result=failed` | Buyer + seller | P0 | E-GRD-C2C-06 |
| P-GRD-C2C-07 | 鑑定失敗 — 退款 | Fail finalize / webhook | Buyer | P0 | E-GRD-C2C-07 |
| P-GRD-C2C-08 | 待賣家取回 | Awaiting seller return | Seller | P1 | E-GRD-C2C-08 |
| P-GRD-C2C-09 | 買家確認收貨 | Buyer confirm on `shipped` | Seller | P0 | E-GRD-C2C-09 |
| P-GRD-C2C-10 | FPS 出款完成 | `released` / payout cron | Seller | P1 | E-GRD-C2C-10 |

#### B2C (`P-GRD-B2C-*`) — PR9c

| ID | Event (ZH) | Trigger | Recipient | P | Email |
|----|------------|---------|-----------|---|-------|
| P-GRD-B2C-01 | 下單待付款 | Order created (auth) | Buyer | P2 | E-GRD-B2C-01 |
| P-GRD-B2C-02 | 已付款 — 請商戶寄平台 | `payment_held` | Merchant | P0 | E-GRD-B2C-02 |
| P-GRD-B2C-03 | 商戶入庫物流 | Inbound tracking | Buyer | P1 | E-GRD-B2C-03 |
| P-GRD-B2C-04 | 鑑定中 | `authenticating` | Buyer + merchant | P1 | E-GRD-B2C-04 |
| P-GRD-B2C-05 | 鑑定通過 — 已寄出 | Pass + outbound | Buyer + merchant | P0 | E-GRD-B2C-05 |
| P-GRD-B2C-06 | 鑑定失敗 | `auth_result=failed` | Buyer + merchant | P0 | E-GRD-B2C-06 |
| P-GRD-B2C-07 | 失敗 — 追償 / 退款 | Recovery RPC / webhook | Merchant (+ buyer) | P0 | E-GRD-B2C-07 |
| P-GRD-B2C-08 | 買家確認收貨 | Buyer confirm | Merchant | P0 | E-GRD-B2C-08 |
| P-GRD-B2C-09 | Connect 撥款完成 | Payout cron | Merchant | P1 | E-GRD-B2C-09 |

**Wiring contract:** `lib/notifications/grading-push.ts` — each `send*` called **after** matching `enqueue*Grading*Email` in `grading-emails.ts`, `admin-grading.ts`, `auth-grading-fail-void-saga.ts`, `execute-connect-payout.ts`, Stripe webhook.

**`push_transactional`:** extend `TRANSACTIONAL_PUSH_EVENT_PREFIXES` with `P-GRD-` (PR9b).

**Out of scope PR9:** refund line-item detail pushes (`E-REF-*`), payout fail ops (`E-PAY-03`), merchant KYC (`E-MCH-*`).

---

## 4. MVP subsets

### Phase 1–8 (shipped)

```
P-WIS-01
P-OFF-01, P-OFF-02, P-OFF-04
P-ORD-01, P-ORD-02, P-ORD-03
P-MOD-01, P-MOD-02
P-CHT-01
```

### Phase 9 (target)

```
# PR9a — order + cron
P-ORD-04, P-ORD-05, P-ORD-06, P-ORD-07, P-ORD-08

# PR9b — C2C grading (skip P-GRD-C2C-04; merged into 03)
P-GRD-C2C-01 … P-GRD-C2C-10 (no 04)

# PR9c — B2C grading
P-GRD-B2C-02 … P-GRD-B2C-09  # 01 optional P2

# PR9d — offers P2
P-OFF-05, P-OFF-06
```

**Phase 9 total:** +23 events (12 live → **35**). Still **&lt; half** of email catalog — by design.

---

## 5. Production-safe wiring protocol

1. **只加法** — new `sendPush*` helper → call **after** existing RPC/webhook/cron success. Do not change return shapes or UI data contracts.
2. **Skip gracefully** — if `!isOneSignalConfigured()`, log + return `{ skipped: true }` (CI / local without secrets).
3. **No segment spam** — always target `include_subscription_ids` from `user_push_subscriptions`.
4. **禁碰範圍（unless explicit）** — `components/` styling-only tasks; payment/escrow RPC signatures; new migrations without approval.
5. **一 slice 一驗** — update `push-phase*-registry.ts` + gate test per phase; add send-helper + action/cron wiring tests before marking PR ✅ (see §0 checklist).

---

## 6. Implementation maps

### PR3 (P-WIS-01)

| File | Purpose |
|------|---------|
| `lib/notifications/onesignal/send.ts` | REST wrapper |
| `lib/notifications/push-config.ts` | Cooldown hours, cron batch limit |
| `lib/notifications/push-phase1-registry.ts` | Event catalog for gate tests |
| `lib/notifications/wishlist-push.ts` | Copy + URL builder |
| `lib/notifications/process-wishlist-price-alerts.ts` | Cron business logic |
| `app/api/cron/wishlist-price-alerts/route.ts` | Cron entry |
| `vercel.json` | Schedule (hourly) |
| `tests/unit/notifications/push-phase1-gate.test.ts` | Registry + pure helpers |

### PR4 (P-OFF-01–04)

| File | Purpose |
|------|---------|
| `lib/notifications/push-delivery.ts` | Load subscriptions + `sendPushToUser` |
| `lib/notifications/offer-push.ts` | Offer copy + send helpers |
| `lib/notifications/push-phase2-registry.ts` | P-OFF event catalog |
| `app/actions/offers.ts` | Wire after make/accept/reject offer RPC |
| `app/actions/buy-now.ts` | Wire after buy-now RPC |
| `tests/unit/notifications/push-phase2-gate.test.ts` | Copy + registry gate |
| `tests/unit/notifications/offer-push-send.test.ts` | Send helper: recipient, path, merchant, negative |
| `tests/unit/notifications/offer-push-action-wiring.test.ts` | Action RPC success/fail → push call |

### PR5 (P-ORD-01–03)

| File | Purpose |
|------|---------|
| `lib/notifications/order-push.ts` | Order copy + send helpers |
| `lib/notifications/push-phase3-registry.ts` | P-ORD event catalog |
| `lib/notifications/order-emails.ts` | Wire after payment / ship / expiry email enqueue |
| `tests/unit/notifications/push-phase3-gate.test.ts` | Copy + registry gate |
| `tests/unit/notifications/order-push-send.test.ts` | Send helper: recipient, path, negative |
| `tests/unit/notifications/order-push-action-wiring.test.ts` | Email enqueue → push call |

### PR6 (push_transactional)

| File | Purpose |
|------|---------|
| `supabase/migrations/20261003100000_profiles_push_transactional.sql` | `profiles.push_transactional` default true |
| `lib/notifications/push-prefs.ts` | Transactional event classification + profile lookup |
| `lib/notifications/push-delivery.ts` | Skip P-OFF/P-ORD when pref off |
| `app/actions/push-preferences.ts` | `updatePushTransactionalPreference` |
| `app/actions/profile.ts` | Expose `pushTransactional` in `getUserSettings` |
| `app/profile/user/settings/UserSettingsClient.tsx` | Wire「訂單狀態更新」toggle |
| `tests/unit/notifications/push-prefs.test.ts` | Event class + profile pref |
| `tests/unit/notifications/push-delivery-prefs.test.ts` | Delivery gate |
| `tests/unit/notifications/push-preferences-action.test.ts` | Settings action |

### PR7 (P-MOD-01–02)

| File | Purpose |
|------|---------|
| `lib/notifications/moderation-push.ts` | Moderation copy + send helpers |
| `lib/notifications/push-phase7-registry.ts` | P-MOD event catalog |
| `lib/notifications/moderation-emails.ts` | Wire after resolve case email enqueue |
| `tests/unit/notifications/push-phase7-gate.test.ts` | Copy + registry gate |
| `tests/unit/notifications/moderation-push-send.test.ts` | Send helper wiring |
| `tests/unit/notifications/moderation-push-action-wiring.test.ts` | Email enqueue → push call |

### PR8 (P-CHT-01)

| File | Purpose |
|------|---------|
| `supabase/migrations/20261003110000_chat_unread_digest_push.sql` | Cooldown column + digest candidate RPC |
| `lib/notifications/chat-push.ts` | Copy + cooldown helpers |
| `lib/notifications/process-chat-unread-digest.ts` | Cron business logic |
| `app/api/cron/chat-unread-digest/route.ts` | Cron entry |
| `supabase/migrations/20261003120000_profiles_last_active_at.sql` | `last_active_at` column for 15m online skip |
| `app/components/notifications/UserActivityHeartbeat.tsx` | Client heartbeat → `profiles.last_active_at` |
| `app/actions/user-activity.ts` | `touchUserLastActive` server action |
| `vercel.json` | Daily schedule (01:00 UTC / 09:00 HKT) |
| `tests/unit/notifications/push-phase8-gate.test.ts` | Registry + pure helpers (incl. 15m skip) |
| `tests/unit/notifications/process-chat-unread-digest.test.ts` | Cron send + skip paths |

### PR9a (P-ORD-04–08)

| File | Purpose |
|------|---------|
| `lib/notifications/order-push.ts` | New copy + `sendOrder*Push` helpers |
| `lib/notifications/push-phase9a-registry.ts` | P-ORD-04–08 catalog |
| `lib/notifications/order-emails.ts` | Wire push after confirm / complete / review enqueue |
| `lib/notifications/process-order-fulfillment-reminders.ts` | Wire push after ship/confirm reminder emails |
| `lib/notifications/push-prefs.ts` | *(no change — already P-ORD-)* |
| `tests/unit/notifications/push-phase9a-gate.test.ts` | Copy + registry |
| `tests/unit/notifications/order-push-reminders.test.ts` | Cron wiring smoke |

### PR9b (P-GRD-C2C-*)

| File | Purpose |
|------|---------|
| `lib/notifications/grading-push.ts` | C2C copy + send helpers |
| `lib/notifications/push-phase9b-registry.ts` | Event catalog |
| `lib/notifications/grading-emails.ts` | Wire after each C2C enqueue |
| `lib/notifications/push-prefs.ts` | Add `P-GRD-` to transactional prefixes |
| `tests/unit/notifications/push-phase9b-gate.test.ts` | Gate |
| `tests/unit/notifications/grading-push-c2c-wiring.test.ts` | Email hook → push called |

### PR9c (P-GRD-B2C-*)

| File | Purpose |
|------|---------|
| `lib/notifications/grading-push.ts` | B2C helpers (extend) |
| `lib/notifications/push-phase9c-registry.ts` | Event catalog |
| `lib/notifications/grading-emails.ts` + `admin-grading.ts` + webhook | Wire hooks |
| `tests/unit/notifications/push-phase9c-gate.test.ts` | Gate |
| `tests/unit/notifications/grading-push-b2c-wiring.test.ts` | Wiring |

### PR9d (P-OFF-05–06, P2)

| File | Purpose |
|------|---------|
| `lib/notifications/offer-push.ts` | Modify + expired copy |
| `app/actions/offers.ts` | Wire modify / rely on existing expired email path for push |

---

## 7. Changelog

| Date | Change |
|------|--------|
| 2026-09-03 | PR9a **P-ORD-04–08** wired via order-emails + phase9a tests |
| 2026-09-03 | **Phase 9 scoped** — P-ORD-04–08, P-GRD-C2C/B2C mirror, cron reminders, P-OFF-05/06 |
| 2026-09-03 | PR8 **P-CHT-01** daily chat unread digest cron + tests |
| 2026-09-03 | PR7 **P-MOD-01–02** wired via moderation-emails + phase7 tests |
| 2026-09-03 | PR6 `push_transactional` pref + settings toggle + delivery gate |
| 2026-09-03 | PR5 **P-ORD-01–03** wired via order-emails + phase3 tests |
| 2026-09-03 | PR4 tests: action wiring + merchant/negative; §0 per-PR test checklist |
| 2026-09-03 | PR4 **P-OFF-01–04** wired; add **P-CHT-01** daily digest (PR8) |
| 2026-09-02 | Initial SSOT; Phase 2 PR3 (P-WIS-01) scoped |
