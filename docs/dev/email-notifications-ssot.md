# Email Notifications SSOT

> **Status:** Phase 0 infra live — outbox + Resend worker; Supabase Auth for confirm/reset.  
> **Related:** [system-feature-registry.md](./system-feature-registry.md) · [INTEGRATION_QUEUE.md](./INTEGRATION_QUEUE.md)  
> **In-app today:** F-M-23 reporter outcome (`ReportOutcomeNotificationHost`), reward unlock modal, chat realtime — **do not replace**; email should **mirror** critical events.

---

## 0. Conventions

### ID format

`E-<DOMAIN>-<NN>` — stable template / event key for code + Resend/Supabase template mapping.

| Domain prefix | Area |
|---------------|------|
| `E-ACC` | Account / auth |
| `E-MCH` | Merchant onboarding / KYC / Connect |
| `E-OFF` | Offers / negotiation |
| `E-ORD` | Orders (generic) |
| `E-ORD-P2P` | C2C face-to-face (no auth) |
| `E-ORD-B2C` | Merchant direct (non-auth) |
| `E-GRD-C2C` | C2C auth escrow (`member_escrow_status`) |
| `E-GRD-B2C` | Merchant B2C auth (`merchant_orders.escrow_state`) |
| `E-REF` | Refunds |
| `E-MOD` | Reports / moderation / disputes |
| `E-PAY` | Payouts / receivables |
| `E-RWD` | Rewards (optional) |
| `E-OPS` | Ops / marketing (optional) |

### Priority

| Tier | Meaning |
|------|---------|
| **P0** | MVP — money, account safety, legal-adjacent |
| **P1** | Important — action required / seller/buyer SLA |
| **P2** | Nice — digest, marketing, duplicate of strong in-app |

### Row columns (registry)

| Column | Description |
|--------|-------------|
| **Trigger** | RPC, Stripe webhook, cron, or Supabase Auth |
| **Recipient** | Who gets the email (`buyer`, `seller`, `merchant`, `reporter`, …) |
| **Channel today** | `none` / `in-app` / `chat` / `supabase-auth` |
| **Feature** | Cross-ref from system-feature-registry |
| **Template key** | Suggested slug for i18n / Resend (`email.{id}.subject`) |
| **Notes** | Merge rules, dedupe, persona caveats |

### Delivery split (implementation)

| Provider | Events |
|----------|--------|
| **Supabase Auth templates** | `E-ACC-01` confirm signup, `E-ACC-03` password reset, `E-ACC-05` email change |
| **App transactional (e.g. Resend)** | All order, offer, grading, moderation, payout events |
| **In-app only (keep)** | Reward unlock modal, chat messages, optional P2 reminders |

### Dedupe / batching rules

1. **Grading intake + in-progress** → single email「平台已收貨，鑑定中」(`E-GRD-*-03` covers `04`).
2. Same order + same event class → max **1 email / 24h** for reminders (`E-ORD-07`, `E-ORD-08`).
3. Report outcome → **email + in-app** both (`E-MOD-02` + F-M-23).
4. Dual-role merchants: send to **auth email**; deep links use **member** routes for buy-side, **merchant** for sell-side.

---

## 1. Account & auth (`E-ACC`)

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature | Template key |
|----|------------|---------|-----------|---|---------------|---------|--------------|
| E-ACC-01 | 註冊 — 驗證 email | Supabase `signUp` | New user | P0 | supabase-auth | F-M-01 | `acc.confirm_signup` |
| E-ACC-02 | Email 驗證成功 | Auth hook / first login after confirm | User | P1 | none | F-M-01 | `acc.email_verified` |
| E-ACC-03 | 忘記密碼 / 重設連結 | `resetPasswordForEmail` | User | P0 | supabase-auth | F-M-02 | `acc.password_reset` |
| E-ACC-04 | 密碼已變更 | After successful reset | User | P1 | none | F-M-02 | `acc.password_changed` |
| E-ACC-05 | 登入 email 變更確認 | Profile email update | Old + new email | P0 | none | F-M-12 | `acc.email_change` |
| E-ACC-06 | 帳號 **suspend**（限期停權） | `rpc_resolve_moderation_case` → `sanction_type=suspend` | Subject user | P0 | in-app redirect | F-M-03 | `acc.suspended` |
| E-ACC-07 | 帳號 **ban**（永久） | Sanction `ban` | Subject user | P0 | in-app | F-A-05 | `acc.banned` |
| E-ACC-08 | 停權屆滿 / 制裁解除 | Sanction expiry / lift | Subject user | P1 | none | F-M-03 | `acc.sanction_lifted` |
| E-ACC-09 | 其他制裁（warn / restrict_listing / restrict_chat / freeze_payout） | Moderation sanction | Subject user | P1 | partial | F-A-05 | `acc.sanction_applied` |
| E-ACC-10 | 可疑登入 / 新裝置（若實作） | Auth security hook | User | P2 | none | — | `acc.security_alert` |

---

## 2. Merchant onboarding (`E-MCH`)

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature | Template key |
|----|------------|---------|-----------|---|---------------|---------|--------------|
| E-MCH-01 | 商戶申請已提交 | `rpc_submit_merchant_kyc_application` | Applicant | P1 | none | F-C-08 | `mch.application_submitted` |
| E-MCH-02 | KYC **核准** | Admin approve KYC | Merchant | P0 | none | F-C-08, F-A-07 | `mch.kyc_approved` |
| E-MCH-03 | KYC **拒絕**（附原因） | Admin reject KYC | Merchant | P0 | none | F-C-08 | `mch.kyc_rejected` |
| E-MCH-04 | Stripe Connect 入驻未完成提醒 | Cron / dashboard nudge | Merchant | P1 | in-app banner | F-C-09 | `mch.connect_onboarding_reminder` |
| E-MCH-05 | Connect 已啟用，可收款 | Stripe account.updated | Merchant | P1 | in-app | F-C-09 | `mch.connect_enabled` |
| E-MCH-06 | Connect / payout 異常需補件 | Stripe requirements | Merchant | P0 | none | F-C-09, F-A-10 | `mch.connect_action_required` |

---

## 3. Offers (`E-OFF`)

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature | Template key |
|----|------------|---------|-----------|---|---------------|---------|--------------|
| E-OFF-01 | 買家 **新叫價** | `rpc_make_offer` | Seller | P0 | chat | F-M-06, F-M-15 | `offer.received` |
| E-OFF-02 | 買家 **修改出價** | `rpc_modify_offer` | Seller | P1 | chat | F-M-15 | `offer.countered` |
| E-OFF-03 | 賣家 **接受** offer | `rpc_accept_offer` | Buyer | P0 | chat + card | F-M-15 | `offer.accepted` |
| E-OFF-04 | 賣家 **拒絕** offer | `rpc_reject_offer` | Buyer | P0 | chat | F-M-15 | `offer.rejected` |
| E-OFF-05 | Offer **失效**（掛單下架等） | Listing inactive / order created elsewhere | Buyer | P1 | chat | F-M-06 | `offer.expired` |
| E-OFF-06 | **立即購買**（訂單已建立） | `rpc_buy_now_listing` | Seller | P0 | chat | F-M-07 | `offer.buy_now` |
| E-OFF-07 | 重複 pending offer 被拒 | `rpc_make_offer` guard | Buyer | P2 | toast | — | `offer.duplicate_pending` |

---

## 4. Orders — generic (`E-ORD`)

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature | Template key |
|----|------------|---------|-----------|---|---------------|---------|--------------|
| E-ORD-01 | **付款成功**（託管建立） | Stripe webhook / checkout success | Buyer + seller | P0 | chat | F-M-19 | `order.payment_confirmed` |
| E-ORD-02 | **待付款逾時**自動取消 | Cron `expire-merchant-pending-payment` | Buyer + seller | P0 | none | F-S-12 | `order.payment_expired` |
| E-ORD-03 | 訂單 **取消**（非退款路徑） | Cancel RPCs | Both parties | P0 | chat/system | — | `order.cancelled` |
| E-ORD-04 | 賣家 **已發貨** / 物流更新 | Ship RPC / logistics fields | Buyer | P0 | order detail | — | `order.shipped` |
| E-ORD-05 | 買家 **確認收貨** | Confirm receipt RPC | Seller / merchant | P0 | timeline | — | `order.buyer_confirmed` |
| E-ORD-06 | 訂單 **完成** | `released` / `completed` | Both | P1 | timeline | F-M-14 | `order.completed` |
| E-ORD-07 | 提醒：已發貨 **N 日未確認** | Cron reminder | Buyer | P1 | none | — | `order.confirm_reminder` |
| E-ORD-08 | 提醒：已付款 **未發貨** | Cron reminder | Seller / merchant | P1 | none | — | `order.ship_reminder` |
| E-ORD-09 | **評價邀請** | Post-complete + no review | Both | P2 | in-app CTA | F-M-14 | `order.review_invite` |

### 4a. C2C face-to-face (`E-ORD-P2P`)

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature | Template key |
|----|------------|---------|-----------|---|---------------|---------|--------------|
| E-ORD-P2P-01 | 面交已約定 | `meetup_arranged` | Both | P1 | none | F-M-14 | `p2p.meetup_arranged` |
| E-ORD-P2P-02 | 面交完成 | Complete RPC | Counterparty | P1 | chat | F-M-14 | `p2p.meetup_completed` |

---

## 5. C2C auth grading (`E-GRD-C2C`)

States: `member_escrow_status` — `payment → custody → grading → shipped → released` (+ `cancelled`).  
Admin: `auth_result` `passed` / `failed`.

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature | Template key |
|----|------------|---------|-----------|---|---------------|---------|--------------|
| E-GRD-C2C-01 | 已付款 — **請賣家寄平台** | Payment captured → `custody` | Seller | P0 | order UI | F-M-16 | `grading.c2c.ship_to_platform` |
| E-GRD-C2C-02 | 賣家已填 **入庫物流** | Inbound tracking saved | Buyer | P1 | order detail | F-M-16 | `grading.c2c.inbound_shipped` |
| E-GRD-C2C-03 | 平台 **已收貨**（鑑定中） | Admin intake / `grading` | Buyer + seller | P1 | timeline | F-S-08 | `grading.c2c.intake` |
| E-GRD-C2C-04 | 鑑定中（可與 03 合併） | — | — | P2 | — | — | — |
| E-GRD-C2C-05 | 鑑定 **通過** — 已寄出買家 | Pass + outbound | Buyer + seller | P0 | timeline | F-S-08 | `grading.c2c.passed_shipped` |
| E-GRD-C2C-06 | 鑑定 **失敗** | `auth_result=failed` | Buyer + seller | P0 | admin + order | F-S-08 | `grading.c2c.failed` |
| E-GRD-C2C-07 | 鑑定失敗 — **退款**處理中/完成 | `rpc_finalize_auth_grading_fail` | Buyer | P0 | none | F-S-08 | `grading.c2c.refund` |
| E-GRD-C2C-08 | 鑑定失敗 — **待賣家取回** | Awaiting seller return | Seller | P1 | admin grading | F-S-08 | `grading.c2c.seller_return` |
| E-GRD-C2C-09 | 買家 **確認收貨**（通過路徑） | Buyer confirm on `shipped` | Seller | P0 | timeline | F-M-16 | `grading.c2c.buyer_confirmed` |
| E-GRD-C2C-10 | 款項 **釋放** / FPS 出款 | `released` / payout cron | Seller | P1 | none | F-S-04 | `grading.c2c.payout_released` |

---

## 6. Merchant B2C auth (`E-GRD-B2C`)

States: `escrow_state` — `pending_payment → payment_held → authenticating → authenticated → completed_and_transferred` (+ `refunded`).

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature | Template key |
|----|------------|---------|-----------|---|---------------|---------|--------------|
| E-GRD-B2C-01 | 下單待付款 | Order created | Buyer | P1 | checkout | F-C-10 | `grading.b2c.awaiting_payment` |
| E-GRD-B2C-02 | 已付款 — **商戶寄平台** | `payment_held` | Merchant | P0 | merchant order | F-C-10 | `grading.b2c.merchant_ship_in` |
| E-GRD-B2C-03 | 商戶 **入庫物流** | Inbound tracking | Buyer | P1 | order detail | F-C-11 | `grading.b2c.inbound_shipped` |
| E-GRD-B2C-04 | **鑑定中** | `authenticating` | Buyer + merchant | P1 | timeline | F-C-13 | `grading.b2c.authenticating` |
| E-GRD-B2C-05 | 鑑定 **通過** — 寄出買家 | Pass + outbound | Buyer + merchant | P0 | timeline | F-C-13 | `grading.b2c.passed_shipped` |
| E-GRD-B2C-06 | 鑑定 **失敗** | `auth_result=failed` | Buyer + merchant | P0 | admin | F-C-13 | `grading.b2c.failed` |
| E-GRD-B2C-07 | 失敗 — **追償 / 退款**更新 | Recovery + refund RPCs | Merchant (+ buyer) | P0 | finance UI | F-S-08 | `grading.b2c.fail_settlement` |
| E-GRD-B2C-08 | 買家 **確認收貨** | Buyer confirm | Merchant | P0 | timeline | F-C-11 | `grading.b2c.buyer_confirmed` |
| E-GRD-B2C-09 | T+7 後 **Connect 撥款** | `merchant-connect-payout-ready` cron | Merchant | P1 | payout UI | F-S-04 | `grading.b2c.payout_completed` |

### 6a. Merchant B2C direct (non-auth) (`E-ORD-B2C`)

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature | Template key |
|----|------------|---------|-----------|---|---------------|---------|--------------|
| E-ORD-B2C-01 | 付款成功 — 請商戶發貨 | Payment held | Merchant | P0 | merchant order | F-C-11 | `b2c.payment_merchant_action` |
| E-ORD-B2C-02 | 商戶已發貨 | Outbound / direct ship | Buyer | P0 | order detail | F-C-11 | `b2c.shipped` |
| E-ORD-B2C-03 | 完成 / Connect 撥款 | `completed_and_transferred` | Merchant | P1 | timeline | F-S-04 | `b2c.completed` |

---

## 7. Refunds (`E-REF`)

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature | Template key |
|----|------------|---------|-----------|---|---------------|---------|--------------|
| E-REF-01 | 售後退款 **已批准**（處理中） | Admin moderation refund | Buyer | P0 | none | F-A-05b | `refund.approved` |
| E-REF-02 | 退款 **成功** | Stripe refund webhook | Buyer | P0 | none | F-S-07 | `refund.completed` |
| E-REF-03 | 退款 **失敗** | Stripe / RPC error | Buyer + ops | P0 | none | — | `refund.failed` |

---

## 8. Moderation & reports (`E-MOD`)

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature | Template key |
|----|------------|---------|-----------|---|---------------|---------|--------------|
| E-MOD-01 | 舉報 **已受理** | `submitUserReport` | Reporter | P1 | none | F-M-22 | `mod.report_received` |
| E-MOD-02 | 舉報 **結案** | `rpc_resolve_moderation_case` | Reporter | P0 | **in-app** | F-M-23 | `mod.report_outcome` |
| E-MOD-03 | 被舉報方：案件 **成立** + 制裁 | Case upheld + sanction | Reported user | P0 | in-app | F-A-05 | `mod.report_upheld_subject` |
| E-MOD-04 | **出款凍結** | `freeze_payout` / dispute | Merchant / seller | P0 | admin | F-A-13 | `mod.payout_frozen` |
| E-MOD-05 | 爭議 **解凍** / 結案 | Case resolved | Affected user | P1 | none | F-A-05 | `mod.payout_unfrozen` |
| E-MOD-06 | 要求 **補充證據** | Admin case action | Involved user | P1 | none | F-A-05 | `mod.evidence_request` |

---

## 9. Payouts & receivables (`E-PAY`)

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature | Template key |
|----|------------|---------|-----------|---|---------------|---------|--------------|
| E-PAY-01 | Connect 撥款 **處理中** | `processing` payout status | Merchant / seller | P1 | finance | F-S-04 | `payout.processing` |
| E-PAY-02 | Connect 撥款 **成功** | Transfer created / paid | Merchant / seller | P0 | order/finance | F-S-04 | `payout.completed` |
| E-PAY-03 | Connect 撥款 **失敗** | `failed` payout status | Merchant | P0 | none | F-S-04 | `payout.failed` |
| E-PAY-04 | 會員 FPS 出款 ready / 完成 | `member-fps-payout-ready` cron | Member seller | P1 | none | F-S-04 | `payout.fps_completed` |
| E-PAY-05 | 鑑定失敗 **追償**待繳 | Seller receivable pending | Merchant | P0 | merchant order | Auth escrow v2 | `payout.recovery_due` |

---

## 10. Rewards & ops (optional) (`E-RWD`, `E-OPS`)

| ID | Event (ZH) | Trigger | Recipient | P | Channel today | Feature | Template key |
|----|------------|---------|-----------|---|---------------|---------|--------------|
| E-RWD-01 | 積分兌換 / 券發放 | `rpc_redeem_*` / grant | User | P2 | **modal** | F-M-21 | `rewards.grant` |
| E-RWD-02 | 券 **即將過期** | Cron | User | P2 | none | — | `rewards.coupon_expiring` |
| E-OPS-01 | 平台重要公告 | Admin publish | Segment / all | P2 | in-app | F-M-24 | `ops.announcement` |
| E-OPS-02 | 掛單審核結果（若有） | Listing moderation | Seller | P2 | none | — | `ops.listing_review` |

---

## 11. P0 MVP subset (first ship)

Recommended **~20 templates** for v1 transactional email:

```
E-ACC-01, E-ACC-03, E-ACC-06, E-ACC-07
E-MCH-02, E-MCH-03
E-OFF-01, E-OFF-03, E-OFF-04, E-OFF-06
E-ORD-01, E-ORD-02, E-ORD-04, E-ORD-05
E-GRD-C2C-01, E-GRD-C2C-05, E-GRD-C2C-06, E-GRD-C2C-07
E-GRD-B2C-02, E-GRD-B2C-05, E-GRD-B2C-06
E-REF-02
E-MOD-02
E-PAY-02
```

---

## 12. Production-safe wiring protocol（唔搞亂 production-ready code）

> **適用：** Phase 1+ 所有 app transactional email 接線。平台其餘 flow 已 ~95% production-ready；email work **只加法、唔改契約**。

### 原則

1. **只加法** — 新 `template` → `lib/notifications/*-emails.ts` → 在既有 action / webhook / cron **成功之後** 加 `await enqueue…()`。唔改現有 enqueue 條件、RPC 參數、return shape、UI。
2. **一 slice 一驗** — 每完成 1–2 個 `E-*` event，必跑：
   ```bash
   bun run test:email:phase1
   bun run test:email:phase2   # Phase 3+ 加 test:email:phase3
   bunx tsc --noEmit
   ```
3. **Idempotency** — `idempotency_key` = `E-*` + entity id + role/transition；webhook / moderation 重送唔應 duplicate 寄信（outbox unique）。
4. **禁碰範圍（除非用戶明確要求）**
   - `components/`、`app/(routes)/` 展示層
   - 已 ship 嘅 Phase 1/2 wire 邏輯（除 `import` + 一行 enqueue）
   - `supabase/migrations/`、RPC 簽名、payment / escrow 業務規則
5. **Slice 順序** — 低耦合先（webhook refund、admin KYC）→ moderation / sanction（多收件人）→ payout fail / recovery。

### 有歧義先問（INTENT CHECK）

- 同一觸發點多個 event（例：ban = `E-ACC-07` + `E-MOD-03`？收件人不同？）
- 需新 DB 欄位或改 RPC 先能寄信
- Auth email（`E-ACC-01/03`）— 走 Supabase Dashboard SMTP，**唔**入 app outbox

### Agent / PR 自檢

- [ ] 只新增檔案或單點 enqueue；無刪改既有 business branch
- [ ] `email-phase*-registry.ts` + gate test 已更新
- [ ] `backend.md` / `manual-test.md` 已補 event 行（如適用）
- [ ] Phase 1/2 gate 仍全綠

---

## 13. Implementation checklist (when wiring)

- [x] `notification_events` table or outbox queue (idempotency key = `E-*` + entity id + transition)
- [x] Worker: read outbox → Resend (cron `/api/cron/process-email-outbox`)
- [ ] User prefs: `email_transactional` opt-out (legal/marketing separate)
- [ ] Deep links: member vs merchant persona URLs
- [ ] Vitest: trigger mapping smoke (RPC → event id)
- [ ] E2E: optional mailpit / Resend test mode for P0 subset
- [ ] Update [INTEGRATION_QUEUE.md](./INTEGRATION_QUEUE.md) row when backend ready

---

## 14. Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-08-31 | — | §12 Production-safe wiring protocol (Phase 3+ guardrails) |
| 2026-08-30 | — | Phase 0: outbox table, Resend worker, E-ACC-04 enqueue |
| 2026-08-30 | — | Initial SSOT draft from product flows + codebase FSM |
