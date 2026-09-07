# Email notifications — manual test checklist

> **Scope:** Phase 1–6 app transactional + Supabase Auth emails（Phase 5B infra 未含）  
> **SSOT:** [email-notifications-ssot.md](../../email-notifications-ssot.md) · **Backend:** [backend.md](./backend.md)  
> **Automated gate（先跑）：** `bun run test:email:phase1` … `phase6`  
> **Registry：** `email-phase1-registry.ts` … `email-phase6-registry.ts`

---

## 0. 開測前（一次過）

### Env

- [x] `RESEND_API_KEY`（worker 寄信）
- [x] `RESEND_FROM_EMAIL` 或預設 `Cardvault HK <noreply@notify.cardvaulthk.com>`
- [x] `CRON_SECRET`（cron Bearer）
- [x] `SUPABASE_SERVICE_ROLE_KEY`（outbox + auth email lookup）
- [x] `NEXT_PUBLIC_SITE_URL` = 實際瀏覽 URL（建議 dev：`http://127.0.0.1:3000`）

### Supabase Dashboard

- [x] **Confirm email** ON（Authentication → Providers → Email）
- [x] **Site URL：** `http://127.0.0.1:3000`（唔用 `0.0.0.0`）
- [x] **Redirect URLs：** `http://127.0.0.1:3000/auth/callback` · `http://localhost:3000/auth/callback`
- [x] **SMTP：** `noreply@notify.cardvaulthk.com` via Resend；模板已貼（見 [supabase-auth-templates.md](../../email/supabase-auth-templates.md)）

### 本地瀏覽

- [x] 只用 `http://127.0.0.1:3000` 開站（避免 auth cookie / redirect loop）
- [x] `bun run dev` 已重啟（proxy / callback 改動後）

### 測試帳號（建議）

| 角色            | 用途                                    |
| --------------- | --------------------------------------- |
| Buyer           | 出價、付款、確認收貨                    |
| Merchant seller | 接受/拒絕 offer、發貨、商戶訂單         |
| Member seller   | C2C 鑑定單取消/確認（如測 member flow） |
| 新信箱          | 註冊 confirm（`E-ACC-01`）              |

### 自動 gate（必跑，代替逐 template 肉眼 check）

```bash
bun run test:email:phase1
bun run test:email:phase2
bun run test:email:phase3
bun run test:email:phase4
bun run test:email:phase5
bun run test:email:phase6
```

- [x] Phase 1–6 全綠（template render + outbox insert mock）

---

## 1. 共用：查 outbox + 跑 worker

> Producer 驗證（12 項未 tick cron/action）：見 [trigger-verify.md](./trigger-verify.md) · `bun run test:email:triggers` · `bun run verify:email-triggers --list`

### SQL — 最近 outbox

```sql
SELECT id, event_id, template_key, to_email, status, attempts,
       created_at, sent_at, last_error
FROM notification_email_outbox
ORDER BY created_at DESC
LIMIT 30;
```

### SQL — 按 event 篩選

```sql
SELECT event_id, to_email, status, idempotency_key, created_at
FROM notification_email_outbox
WHERE event_id = 'E-OFF-01'  -- 改成目標 event
ORDER BY created_at DESC;
```

### 手動觸發 worker

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:3000/api/cron/process-email-outbox"
```

- [x] 回傳 `success` / `sent` > 0
- [x] Resend Dashboard（`notify.cardvaulthk.com`）有對應 send
- [x] outbox `status = sent`（或 `dead` 時查 `last_error`）

---

## 2. Supabase Auth（唔經 app outbox）

| ID       | 事件     | 步驟                                  | 驗證                                                                      |
| -------- | -------- | ------------------------------------- | ------------------------------------------------------------------------- |
| E-ACC-01 | 註冊驗證 | 新信箱註冊 → 收 confirm 信            | `127.0.0.1` + `token_hash=pkce_...&type=signup` → `/auth/email-confirmed` |
| E-ACC-03 | 重設密碼 | `/auth/forgot-password`（**未登入**） | `token_hash=pkce_...&type=recovery` → `/auth/forgot-password/complete`    |
| —        | —        | 已登入改密碼走 `/auth/reset-password` | 唔發 recovery 信                                                          |

- [x] E-ACC-01 通過
- [x] E-ACC-03 通過

---

## 3. App transactional — Phase 1

> 每項：觸發 flow → 查 outbox 有 **正確** `event_id` **+** `to_email` → 跑 worker → 收件 / Resend log  
> 雙人 email（買家+賣家）要各有一 row。

### Account（Resend outbox）

| ID       | 觸發       | 操作                                            | Outbox 預期          |
| -------- | ---------- | ----------------------------------------------- | -------------------- |
| E-ACC-04 | 密碼已變更 | 完成 forgot-password 設密碼 **或** 設定頁改密碼 | 1 row → 該用戶 email |

- [x] E-ACC-04

### Offers

| ID       | 觸發     | 操作                          | Outbox 預期        |
| -------- | -------- | ----------------------------- | ------------------ |
| E-OFF-01 | 新叫價   | Buyer 對 active listing 出價  | Seller：`E-OFF-01` |
| E-OFF-02 | 修改出價 | Buyer 修改 pending offer 價格 | Seller：`E-OFF-02` |
| E-OFF-03 | 接受出價 | Seller accept offer           | Buyer：`E-OFF-03`  |
| E-OFF-04 | 拒絕出價 | Seller reject offer           | Buyer：`E-OFF-04`  |
| E-OFF-06 | 立即購買 | Buyer buy now                 | Seller：`E-OFF-06` |

- [x] E-OFF-01
- [x] E-OFF-02
- [x] E-OFF-03
- [x] E-OFF-04
- [x] E-OFF-06

**建議順序（一條 listing）：** 出價 → 改價 →（另開 listing）拒絕 →（另開）接受 → 付款；或 buy now 獨立測。

### Orders — 付款

| ID       | 觸發       | 操作                                                    | Outbox 預期                |
| -------- | ---------- | ------------------------------------------------------- | -------------------------- |
| E-ORD-01 | 付款成功   | 商戶直購/accept 後 Stripe 付款成功（webhook）           | Buyer + Seller：`E-ORD-01` |
| E-ORD-02 | 待付款逾時 | `pending_payment` 商戶單過 48h **或** staging 觸發 cron | Buyer + Seller：`E-ORD-02` |

- [x] E-ORD-01（需 Stripe webhook / test 卡）
- [x] E-ORD-02（`expire-merchant-pending-payment` cron，2026-09-07 staging）

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:3000/api/cron/expire-merchant-pending-payment"
```

### Orders — 履約

| ID       | 觸發         | 操作                                                                 | Outbox 預期                |
| -------- | ------------ | -------------------------------------------------------------------- | -------------------------- |
| E-ORD-04 | 已發貨       | Merchant **非鑑定** SF 單：`submitMerchantDirectFulfillment`         | Buyer：`E-ORD-04`          |
| E-ORD-05 | 買家確認收貨 | Buyer `completeMerchantOrder` **或** member `confirmBuyerReceived`   | Seller：`E-ORD-05`         |
| E-ORD-03 | 訂單取消     | Seller `cancelMemberOrder` **或** merchant `cancelMerchantAuthOrder` | Buyer + Seller：`E-ORD-03` |

- [x] E-ORD-04（需已付款、非 meetup、非鑑定直發）
- [x] E-ORD-05
- [x] E-ORD-03

---

## 3b. Phase 2 — mod / payout / grading / offer expired

| ID              | 觸發              | 操作                                                             | Outbox 預期                    |
| --------------- | ----------------- | ---------------------------------------------------------------- | ------------------------------ |
| E-MOD-02        | 舉報結案          | Admin `resolveAdminModerationCase`（`notifyReporter` 預設 true） | 每位 reporter：`E-MOD-02`      |
| E-PAY-02        | Connect 撥款成功  | Cron `merchant-connect-payout-ready` 或 admin payout             | Merchant：`E-PAY-02`           |
| E-GRD-C2C-01    | C2C 鑑定已付款    | Member auth Stripe webhook → custody                             | Seller：`E-GRD-C2C-01`         |
| E-GRD-C2C-05    | 鑑定通過出庫      | Admin grading outbound（member）                                 | Buyer + Seller：`E-GRD-C2C-05` |
| E-GRD-C2C-06    | 鑑定失敗          | Admin `adminFailGradingAndRefund`（member）                      | Buyer + Seller：`E-GRD-C2C-06` |
| E-GRD-C2C-07    | 鑑定失敗退款      | Grading fail finalize（saga / webhook）                          | Buyer：`E-GRD-C2C-07`          |
| E-GRD-B2C-02    | 商戶鑑定已付款    | Merchant auth webhook `payment_held`                             | Merchant：`E-GRD-B2C-02`       |
| E-GRD-B2C-05/06 | 商戶鑑定出庫/失敗 | Admin grading outbound / fail（merchant）                        | 同 C2C 對應                    |
| E-OFF-05        | 出價失效          | Accept offer / buy now / 下架 listing                            | 其他 pending buyer：`E-OFF-05` |

- [x] E-MOD-02
- [x] E-PAY-02（`run-email-trigger-batch-c.ts`，2026-09-07）
- [x] E-GRD-C2C-01 / 05 / 06 / 07
- [x] E-GRD-B2C-02 / 05 / 06
- [x] E-OFF-05

---

## 3c. Phase 3 — refunds / KYC / sanctions / grading P1 / B2C

| ID                 | 觸發                           | 操作                                                   | Outbox 預期                                         |
| ------------------ | ------------------------------ | ------------------------------------------------------ | --------------------------------------------------- |
| E-REF-01           | 仲裁退款批准                   | Admin resolve + `orderRefundPrepared`                  | Buyer：`E-REF-01`                                   |
| E-REF-02           | Stripe refund 完成             | Moderation / 售後 refund webhook                       | Buyer：`E-REF-02`（skip `auth_grading_*` metadata） |
| E-MCH-01           | KYC 提交                       | `submitMerchantKycApplication`                         | Applicant：`E-MCH-01`                               |
| E-MCH-02/03        | KYC 審核                       | Admin `reviewKycApplication`                           | Applicant：`E-MCH-02` / `E-MCH-03`                  |
| E-MCH-05           | Connect 開通                   | Stripe `account.updated` webhook                       | Merchant：`E-MCH-05`                                |
| E-MOD-01           | 舉報提交                       | `submitUserReport`                                     | Reporter：`E-MOD-01`                                |
| E-MOD-03/04        | 舉報成立 + 制裁                | Resolve `upheld` + `freeze_payout`                     | Subject：`E-MOD-03` / `E-MOD-04`                    |
| E-ACC-06/07        | 停權 / 封禁                    | Resolve sanction `suspend` / `ban`                     | Subject：`E-ACC-06` / `E-ACC-07`                    |
| E-PAY-03           | Connect 撥款失敗               | `executeMerchantConnectPayout` failure                 | Merchant：`E-PAY-03`                                |
| E-PAY-04           | Member FPS ready               | Cron `member-fps-payout-ready`                         | Seller：`E-PAY-04`                                  |
| E-PAY-05           | 商戶追償                       | Merchant grading fail                                  | Merchant：`E-PAY-05`                                |
| E-GRD-C2C-02/03    | 入庫物流 / intake              | `submitInboundTracking` / admin intake confirm         | Buyer (+ seller intake)                             |
| E-GRD-C2C-08/09/10 | 賣家寄回 / 買家確認 / FPS 銷帳 | Admin seller return / buyer confirm / clear settlement | Seller                                              |
| E-GRD-B2C-03/04    | 商戶入庫                       | `submitMerchantLogistics` / admin intake               | Buyer (+ merchant intake)                           |
| E-GRD-B2C-07/08    | 鑑定失敗結算 / 買家確認        | Admin fail / `completeMerchantOrder` (auth)            | Merchant                                            |
| E-ORD-06           | 訂單完成                       | Buyer complete / confirm received                      | Buyer：`E-ORD-06`                                   |
| E-ORD-B2C-01/02/03 | B2C 履約                       | Payment / ship / Connect payout                        | Merchant / Buyer                                    |

```bash
bun run test:email:phase3
```

- [x] Phase 3 gate 全綠
- [x] 抽樣 2–3 條真 flow outbox + worker（Batch A cron ×5 + worker sent，2026-09-07）

---

## 3d. Phase 4 — cron reminders + rewards P2

> Cron 提醒需 DB 有符合條件嘅 row（或 staging 調整日期）。門檻見 `order-reminder-config.ts`：發貨/確認 reminder **3 日**、Connect onboarding **48h**、券到期 **3 日內**。

| ID       | 觸發                        | 操作                                                                              | Outbox 預期          |
| -------- | --------------------------- | --------------------------------------------------------------------------------- | -------------------- |
| E-ORD-07 | 買家確認收貨 reminder       | 已發貨、買家未確認、超過 3 日 → cron `order-fulfillment-reminders`                | Buyer：`E-ORD-07`    |
| E-ORD-08 | 賣家發貨 reminder           | 已付款、賣家未發貨、超過 3 日 → 同上 cron                                         | Seller：`E-ORD-08`   |
| E-MCH-04 | Connect onboarding reminder | KYC 批准後 48h 仍未完成 Connect → cron `merchant-connect-onboarding-reminder`     | Merchant：`E-MCH-04` |
| E-MOD-05 | 撥款凍結解除                | Admin resolve `dismissed` / `insufficient_evidence`，subject 曾有 `freeze_payout` | Subject：`E-MOD-05`  |
| E-RWD-01 | 積分兌換 / 券發放           | User 兌換獎勵（`redeemRewardCatalogItem`）                                        | User：`E-RWD-01`     |
| E-RWD-02 | 優惠券快到期                | 券 3 日內到期 → cron `reward-coupon-expiring-reminder`                            | User：`E-RWD-02`     |

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:3000/api/cron/order-fulfillment-reminders"
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:3000/api/cron/merchant-connect-onboarding-reminder"
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:3000/api/cron/reward-coupon-expiring-reminder"
```

```bash
bun run test:email:phase4
```

- [x] E-ORD-07
- [x] E-ORD-08
- [x] E-MCH-04（idempotency 同日已 enqueue；cron `reminders:2`）
- [x] E-MOD-05（`run-email-trigger-batch-b.ts`，2026-09-07）
- [x] E-RWD-01（`run-email-trigger-batch-b.ts`，2026-09-07）
- [x] E-RWD-02
- [x] Phase 4 gate 全綠

---

## 3e. Phase 5A — Connect 補件、制裁、證據補充（E-MOD-06）

| ID       | 觸發                     | 操作                                                                       | Outbox 預期             |
| -------- | ------------------------ | -------------------------------------------------------------------------- | ----------------------- |
| E-MCH-06 | Stripe Connect 需補件    | Stripe `account.updated`（account 有 `requirements`）                      | Merchant：`E-MCH-06`    |
| E-ACC-08 | 制裁到期解除             | 定時制裁到期 → cron `sanction-expiry-notifications`                        | Subject：`E-ACC-08`     |
| E-ACC-09 | 新制裁（非 suspend/ban） | Admin resolve `upheld` + `restrict_listing` 等                             | Subject：`E-ACC-09`     |
| E-MOD-06 | 要求補充證據             | Admin `/admin/disputes/[id]` → **要求補充證據** → 揀被舉報人/舉報人 → 發送 | Target user：`E-MOD-06` |

**E-MOD-06 UI 驗證：**

- [x] 僅 `open` / `reviewing` 案件顯示表單
- [x] 選 **被舉報人** → outbox `to_email` = subject
- [x] 選 **舉報人** → outbox `to_email` = primary reporter（無舉報人時 option disabled）
- [x] 填補充說明 → 信中顯示 `message`
- [x] 案件狀態保持 open（唔會自動結案）

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:3000/api/cron/sanction-expiry-notifications"
```

```bash
bun run test:email:phase5
```

- [x] E-MCH-06
- [x] E-ACC-08（`sanction-expiry-notifications` cron，2026-09-07）
- [x] E-ACC-09（`run-email-trigger-batch-b.ts`，2026-09-07）
- [x] E-MOD-06
- [x] Phase 5 gate 全綠

---

## 3f. Phase 6 — 剩餘 P0/P1 triggers

| ID           | 觸發                      | 操作                                                                                      | Outbox 預期                            |
| ------------ | ------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------- |
| E-REF-03     | 退款失敗                  | 仲裁退款 saga fail / Stripe refund fail webhook / admin resolve refund error              | Buyer（+ ops 如配置）：`E-REF-03`      |
| E-ACC-02     | Email 已驗證              | 註冊 confirm 成功 → 進入 `/auth/email-confirmed`                                          | User：`E-ACC-02`                       |
| E-GRD-B2C-01 | 商戶鑑定待付款            | Buyer merchant auth **buy now** 建立訂單                                                  | Buyer：`E-GRD-B2C-01`                  |
| E-GRD-B2C-09 | 商戶鑑定 Connect 撥款完成 | B2C grading 單 Connect payout 完成（cron `merchant-connect-payout-ready` 或 payout flow） | Merchant：`E-GRD-B2C-09`               |
| E-PAY-01     | Connect 撥款處理中        | `executeMerchantConnectPayout` 進入 processing                                            | Merchant：`E-PAY-01`                   |
| E-ORD-P2P-01 | 面交已約定                | Member meetup listing：accept offer / buy now 建立面交單                                  | Buyer + Seller：`E-ORD-P2P-01`         |
| E-ORD-P2P-02 | 面交完成                  | Buyer complete meetup 訂單                                                                | Counterparty（seller）：`E-ORD-P2P-02` |
| E-ORD-09     | 評價邀請                  | Buyer 確認收貨 / complete order（member 或 merchant）                                     | Buyer：`E-ORD-09`                      |

```bash
bun run test:email:phase6
```

- [x] E-REF-03（`run-email-trigger-batch-b.ts`，2026-09-07）
- [x] E-ACC-02
- [x] E-GRD-B2C-01
- [x] E-GRD-B2C-09（`run-email-trigger-batch-c.ts`，2026-09-07）
- [x] E-PAY-01（`run-email-trigger-batch-c.ts`，2026-09-07）
- [x] E-ORD-P2P-01
- [x] E-ORD-P2P-02
- [x] E-ORD-09
- [x] Phase 6 gate 全綠

---

## 3g. 刻意 skip（今輪唔測）

| ID                  | 原因    |
| ------------------- | ------- |
| E-ACC-10            | 未 wire |
| E-OFF-07            | 未 wire |
| E-OPS-01 / E-OPS-02 | 未 wire |

**Phase 5B（人手 pass 後再做）：** `email_transactional` opt-out、deep link 審計、trigger-mapping Vitest 擴充。

---

## 4. 極簡 smoke（時間唔夠時）

只做以下 **6 步**，其餘靠 `bun run test:email:phase1` … `phase6`：

1. [x] 新信箱 **E-ACC-01** confirm link 可登入 → **E-ACC-02** `/auth/email-confirmed`
2. [x] **E-OFF-01** 叫價 → outbox + worker → 收信
3. [x] **E-ORD-01** 付款成功 → buyer+seller outbox（Stripe test）
4. [x] **E-ACC-03** forgot password 一輪
5. [x] Admin **E-MOD-06** 發送補充證據通知
6. [x] 任一 cron（`order-fulfillment-reminders` 等 Batch A）→ outbox row + worker

---

## 5. 常見問題

| 現象                            | 檢查                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 無 outbox row                   | action 是否 success；`createAdminClient` / service role；console `[offer-emails]` / `[order-emails]` |
| outbox `pending` 唔寄           | 跑 `process-email-outbox`；`RESEND_API_KEY`                                                          |
| `auth_callback` / redirect loop | Site URL、`127.0.0.1`、模板用 `token_hash`                                                           |
| 重複信                          | 查 `idempotency_key` 是否重觸發；webhook 重送                                                        |
| Auth 信樣式唔對                 | Dashboard 重新貼 `supabase/templates/auth/*.html`                                                    |

---

## 6. Sign-off

| 項目                                                | 日期 | 測試人 |
| --------------------------------------------------- | ---- | ------ |
| `bun run test:email:phase1` 全綠                    |      |        |
| `bun run test:email:phase2` 全綠                    |      |        |
| `bun run test:email:phase3` 全綠                    |      |        |
| `bun run test:email:phase4` 全綠                    |      |        |
| `bun run test:email:phase5` 全綠                    |      |        |
| `bun run test:email:phase6` 全綠                    |      |        |
| Supabase Auth E-ACC-01 / 03                         |      |        |
| App Phase 1–3 outbox 真 flow                        |      |        |
| App Phase 4–6 outbox 真 flow                        |      |        |
| E-MOD-06 admin UI                                   |      |        |
| Cron reminders（ORD-07/08、MCH-04、RWD-02、ACC-08） | 2026-09-07 | staging verify |
| Worker + Resend 真寄信抽樣                          | 2026-09-07 | 5/5 sent       |

**備註 / 失敗 event ID：**

```
（填寫）
```
