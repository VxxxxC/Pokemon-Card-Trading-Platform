# HKCardVault 託管、付款與退款政策（SSOT）

> **版本**：v0.1  
> **狀態**：設計定案（未完全落地）  
> **取代**：與本文件衝突之舊 `server.md` 付款描述，以本文件為準。  
> **退款細則（情境／breakdown／責任方）**：以 [refund-policy.md](./refund-policy.md) 為準；本文件 §6–§9 為摘要。

本文件定義四類訂單的收款、capture、退款、出款、責任分攤與 Admin 操作。實作里程碑見 [§14](#14-實作里程碑)。

---

## 1. 訂單分類

| ID | 類型 | 平台收款 | 出款 | 鑑定 |
|----|------|----------|------|------|
| 1 | Member P2P | 否 | 無（當事人自行交收） | 否 |
| 2 | Member 鑑定 | Stripe 信用卡 | 賣家線下 FPS（平台外） | 是 |
| 3 | Merchant 非鑑定 | Stripe 信用卡 | Stripe Connect transfer | 否 |
| 4 | Merchant 鑑定 | Stripe 信用卡 | Stripe Connect transfer | 是 |

平台 **只參與 2、3、4**。類型 1 僅提供撮合、聊天、評價、舉報。

**入款**：平台參與訂單一律 **信用卡經 Stripe（HKD）**。  
**出款**：Member 賣家 → **私人 FPS**；Merchant → **Stripe Connect**。

---

## 2. 資金與費用原則

### 2.1 通用

| 項目 | 規則 |
|------|------|
| **鑑定費（auth_fee）** | 預設 HK$150；**入庫後鑑定服務已開始** — 退留依 `fault_party` 與階段（S1 fail / S3 售後）；細則見 [refund-policy §4](./refund-policy.md#4-鑑定費auth_fee總規則) |
| **Stripe processing fee** | 未 capture 即 void → 目標 **零** processing fee；已 capture 後 refund → **Stripe 不退還已收 processing fee** |
| **Fee 轉嫁** | 預設由 **Member 賣家 / Merchant** 承擔（`seller_payable` / merchant ledger）；`platform` fault 由平台 absorb；`buyer` fault 由買家承擔（**減少應退金額**，不額外向卡 charge） |
| **Merchant 佣金** | 卡價 8%（第一版）；條款註明 **已包含 payment processing 成本**；售後 refund 之不可回收 stripe fee 另計入 merchant ledger |

### 2.2 PaymentIntent 策略

> **Capture 模型 SSOT：** [capture-policy.md](./capture-policy.md) — 新單 `escrow_capture_model = 'single'`；legacy `NULL` 仍 multicapture。

| 類型 | PI 策略 |
|------|---------|
| 1 P2P | 無 PI |
| 2、4 鑑定（**新單 single**） | **單一 PI，`capture_method: manual`**，authorize 全額 → pass 一次 capture |
| 2、4 鑑定（**legacy multicapture**） | **單一 PI，`capture_method: manual`**，分階段 partial capture |
| 3 非鑑定 | **單一 PI，`capture_method: automatic`**（付款即 capture 入平台） |

**鑑定類 PI 授權總額** = `item_subtotal + inbound/outbound shipping + auth_fee`（v2 四行；見 auth-escrow-v2）

#### Single capture 時序（新單，預設）

1. **Checkout**：authorize 全額 → `authorized`
2. **Admin 入庫**：**不 capture**（必要時 re-auth）
3. **鑑定通過**：一次 `capture(buyer_total_amount)` → `fully_captured`
4. **鑑定失敗**：見 [refund-policy §7.2](./refund-policy.md)

#### Legacy 分階段 capture 時序（`escrow_capture_model IS NULL`）

1. **Checkout**：authorize 全額 → `authorized`
2. **Admin 確認入庫**：`capture(auth_fee)` → `auth_fee_captured`
3. **鑑定通過**：`capture(item_subtotal + shipping)` → `fully_captured`
4. **鑑定失敗（入庫後）**：依 `fault_party` — 見 [refund-policy §7.1](./refund-policy.md)
5. **入庫前取消**：`payment_intent.cancel`

### 2.3 Unified checkout 與兩條出款路（2026-07 sync）

**Checkout（入款）** — 全部非 P2P 走 `/checkout/{orderId}` 兩步 wizard；見 [unified-checkout/backend.md](./follow-up/unified-checkout/backend.md)。

| 階段 | Member 鑑定 (#2) | Merchant (#3 / #4) |
|------|------------------|---------------------|
| 收款 | Stripe manual PI · **single capture at pass** 🟡 Partner QA | 非鑑定：automatic ✅；鑑定：manual 🟡 Partner QA |
| 出款觸發 | 買家確認收貨 | 買家確認收貨 |
| Hold | **T+3** | **T+7** |
| 出款方式 | **FPS** + `payout_requests`（平台外轉數） | **Stripe Connect** `transfers.create` |

Checkout **唔負責**出款；T+3 / T+7 只喺買家確認後啟動。

---

## 3. 付款子狀態 `payment_capture_status`

與 Stripe PI 分開儲存，供 RPC / Admin / webhook 冪等同步：

| 值 | 含義 |
|----|------|
| `none` | 未建立 PI / P2P |
| `authorized` | PI `requires_capture` |
| `auth_fee_captured` | 已 partial capture 鑑定費（**legacy staged 入庫**）；single 新單入庫後仍為 `authorized` |
| `fully_captured` | 卡價 + 運費已 capture |
| `voided` | PI canceled |
| `refunded` | 全額已退（售後或 fail） |
| `partially_refunded` | 部分退款 |

---

## 4. Authorization 過期與 SLA

| 規則 | 期限 |
|------|------|
| 買家付款後須有入庫 tracking + Admin 入庫 | **7 個曆日**內；否則 `payment_expired`，void PI，listing 釋放 |
| 入庫後須完成入庫確認（single：**不 capture**；legacy：須 `capture(auth_fee+inbound)`） | **24 小時**內 |
| 入庫後鑑定須出結果 | **10 個工作天**內；超時 Admin 介入（不自動判 buyer fault） |
| Authorize 將過期（約第 6 日） | **入庫確認時**自動 re-auth（off_session）；失敗則通知買家重新付款 |

---

## 5. 取消與鑑定鎖定期

### 5.1 Hard lock

自 **Admin 確認入庫** 起，至 **鑑定結果（pass/fail）寫入** 止：

- 買家、賣家 **均不可取消**
- 僅 Admin：`pass` / `fail`（含 `fault_party`）

### 5.2 取消矩陣（摘要）

| 階段 | 1 P2P | 2 Member 鑑定 | 3 Merchant | 4 Merchant 鑑定 |
|------|-------|---------------|------------|-----------------|
| `pending` 未付款 | 賣家可 cancel | 賣家可 cancel | 48h 逾時釋放 | 同左 |
| 已 authorize、未入庫 | — | 賣家可 cancel → void PI | — | 同左 |
| 入庫～鑑定結果 | — | **不可 cancel** | — | **不可 cancel** |
| 已出庫、未確認收貨 | — | 不可 cancel；可 dispute | 可 dispute | 同左 |

類型 1：**僅賣家** 在 `pending` 可取消（`rpc_cancel_member_order`）。

---

## 6. 鑑定失敗

> **退款細則 SSOT**：[refund-policy §7](./refund-policy.md#7-s1--鑑定失敗grading-fail)

| 情境 | 摘要 |
|------|------|
| Admin fail | 必填 `fault_party` + 原因 |
| **Single + seller fault** | `PI.cancel` 全釋（含 D）→ 追賣家（現行 code ✅） |
| **Single + buyer fault** | **目標**：capture D only，釋放 A+B+C — **PR2 前 code 仍 full cancel** |
| **Single + platform / carrier / inconclusive** | 目標多為全釋含 D — 見 refund-policy §7.2 |
| **Legacy staged** | Refund 已 capture + `capture(0)`；fault 矩陣見 refund-policy §7.3 |
| 訂單終態 | Member → `cancelled`；Merchant → `refunded`；listing → `active` |
| 追償 | Seller fault → `seller_receivables` / `merchant_ledgers` `grading_fail_recovery` |

---

## 7. `fault_party` 與 fee／退款

**Enum**：`buyer | seller | platform | carrier | inconclusive`

> **售後 breakdown 與 Stripe fee 分攤**：[refund-policy §5](./refund-policy.md#5-stripe-processing-fee-規則)、[§8](./refund-policy.md#8-s3--收貨後售後phase-h舉報-resolve)

### S1 — Grading fail（摘要）

| fault | 買家（single 目標） | D（鑑定費） |
|-------|---------------------|-------------|
| `seller` / `platform` / `carrier` / `inconclusive` | 全釋（含 D） | 退畀買家 |
| `buyer` | A+B+C | **留平台**（PR2 前 code 仍全釋） |

### S3 — 收貨後售後（摘要）

| fault | eligible（鑑定 pass 後） | D |
|-------|--------------------------|---|
| `seller` / `buyer` / `carrier` | A+C（唔含 D） | 留平台 |
| `platform`（有原因） | A+C+D | 退畀買家 |
| `inconclusive` | 同 seller 對買家 eligible；UI → **PR3** | 留平台（除 platform fault） |

### Stripe fee（已 capture 後 refund）

| fault | Stripe fee 承擔 | 卡價／運費 |
|-------|-----------------|------------|
| `seller` | seller payable | 全退 buyer |
| `buyer` | buyer（少退） | `eligible - stripe_fee_actual` |
| `platform` | platform | 全退 buyer |
| `carrier` | seller 或 platform（視物流） | 全退 buyer |

**Stripe fee 公式（已 capture 後 refund）**：

- `stripe_fee_actual` 從 Stripe balance transaction 讀取
- `seller` / `merchant` fault → `seller_payable` 或 merchant ledger `+= stripe_fee_actual`
- `buyer` fault → `refund_to_buyer = eligible_amount - stripe_fee_actual`（不另 charge）
- 鑑定費 capture 產生之 fee 視作鑑定服務成本，由 auth_fee 收入 cover

---

## 8. 確認收貨與出款

### 8.1 Member 鑑定（#2）

**條件**：`auth_result = passed` + `outbound_tracking_no` 非空 + `payment_capture_status = fully_captured`

1. 買家 `confirmBuyerReceived` → `released` / `completed`
2. 記 `buyer_confirmed_at`；**不立即 FPS**
3. `payout_hold_until = buyer_confirmed_at + 3 個曆日`（**T+3**）
4. Cron（hold 到期 + `fully_captured`）→ insert **`payout_requests`**；`seller_payout_status` → `ready` → Admin 標記 FPS `paid`（**唔經 Connect**）

**FPS 金額（第一版）**：`item_subtotal - seller_payable_fees`（Member 不收平台佣金，只扣應付 stripe fee 等）

### 8.2 Merchant（#3、#4）

**條件**：#4 另需鑑定通過 + 出庫；#3 非面交需 `shipped`，面交可於 `payment_held` 確認（見 merchant-trading）

1. 買家 `completeMerchantOrder` → `rpc_confirm_merchant_buyer_receipt`（**不呼叫 Stripe**）
2. 記 `buyer_confirmed_at`；`payout_hold_until = buyer_confirmed_at + 7 個曆日`（**T+7**）；`payout_status = held`
3. 售後窗口內可 dispute → `payout_status = frozen`（MVP：cron guard；Admin freeze UI 留 P3）
4. T+7 到期後 hourly cron → `rpc_prepare_merchant_order_payout` → `stripe.transfers.create` → `rpc_finalize_merchant_order_payout`
5. `completed_and_transferred`；`payout_status = paid`

> 與 Member T+3 FPS hold 對齊：買家確認只啟動保留期，實際 Connect transfer 在 hold 到期後由 cron 執行。既有已 transfer 舊單不 backfill。

---

## 9. 收貨後售後（Post-delivery）

> **退款 breakdown SSOT**：[refund-policy §8](./refund-policy.md#8-s3--收貨後售後phase-h舉報-resolve) · Admin 操作：[REFUND_ADMIN_PLAYBOOK.md](./follow-up/admin-moderation/REFUND_ADMIN_PLAYBOOK.md)

| 類型 | 窗口 | 可申訴範圍 | 平台動作 |
|------|------|------------|----------|
| **#2 Member 鑑定** | 確認收貨後 **3 日內**（與 T+3 FPS hold 重疊） | 物流損毀、與鑑定報告明顯不符（不開放無限真偽爭議） | Stripe refund；`seller_payable`；freeze FPS |
| **#3 / #4 Merchant** | 確認收貨後 **7 日內**（與 T+7 Connect hold 重疊） | 物流、嚴重與 listing 不符 | `refund` + `transfer.reversal` 或 merchant ledger；hold 期內可 `frozen` 阻擋 cron transfer |
| **#1 P2P** | 無金流售後 | 僅舉報／封號 | 無 refund RPC |

| 時點（Member） | 處理 |
|----------------|------|
| FPS 前 | 可 Stripe refund（資金仍在平台） |
| FPS 後 | 無自動 clawback；追 `seller_payable` + 治理 |

---

## 10. Merchant `pending_payment` 逾時

| 項 | 值 |
|----|-----|
| 逾時 | **48 小時** 無 `payment_intent.succeeded` |
| 動作 | 訂單取消；listing → `active`；未完成 PI → `cancel` |
| 提醒 | 24h 通知買家 |

---

## 11. Capture 失敗補償（Saga）

同 Merchant Connect payout 模式：

1. Server Action / Admin 觸發 `stripe.paymentIntents.capture({ amount_to_capture })`
2. 成功後 service-role `rpc_finalize_*_capture` 寫 DB
3. Webhook `payment_intent.succeeded`（每次 partial capture）→ 同一 finalize RPC，冪等 `already_applied`
4. API 成功、DB 失敗 → webhook 補償；UI 顯示「核對中」

**Idempotency key 範例**：

- `auth-fee-capture:<orderKind>:<orderId>`
- `goods-capture:<full|goods>:<orderKind>:<orderId>` (`full` = single-capture PI, `goods` = legacy staged leg)

---

## 12. Chargeback

第一版：**記錄 + freeze + 人工結案**（不自動 representment）

| 事件 | 動作 |
|------|------|
| `charge.dispute.created` | 寫 `payment_disputes`；freeze Member FPS / Merchant 相關撥款 |
| Member 已 FPS | `seller_payable += dispute_amount + fees` |
| Merchant 已 transfer | Connect dispute + merchant ledger |

---

## 13. P2P（#1）邊界

1. 平台 **不代收代付**
2. 買家 **確認交收** = 放棄真偽／品相之 **金錢** 索償（見 `MemberOrderCompleteConfirmDialog` 文案）
3. 爭議僅 **舉報、評價、帳號處分** — 無平台 refund

---

## 14. Admin 能力（最小必備）

| 模組 | 能力 |
|------|------|
| **鑑定工作台** | 入庫 → trigger auth_fee capture；pass → goods capture；fail → fault + void/refund |
| **財務** | Member：FPS ready 列表（T+3 後）、freeze/unfreeze、標記 paid；Merchant：售後 refund |
| **爭議** | 接 `user_reports` + 訂單；結案寫 `fault_party` + 觸發 refund saga |
| **Audit** | `grading_audit_logs` + `payment_audit_logs`（建議新增） |

---

## 15. Stripe Webhook 清單

| 事件 | 用途 |
|------|------|
| `payment_intent.amount_capturable_updated` | authorize 成功 |
| `payment_intent.succeeded` | partial / full capture 完成 |
| `payment_intent.canceled` | void |
| `refund.created` / `charge.refunded` | 售後對賬 |
| `transfer.created` | Merchant payout finalize |
| `charge.dispute.created` | chargeback 記錄 + freeze |

---

## 16. 金額範例

### Merchant 鑑定 fail（卡價 100 + 運費 30 + 鑑定 150）

1. Authorize：280  
2. 入庫 capture：150（auth fee）  
3. Fail + seller fault：release authorize 130 → 買家實付 150；卡價與運費未扣  
4. 若曾誤 capture 全額再 refund：processing fee 由 seller ledger 承擔  

### Member 鑑定成功（卡價 100 + 鑑定 150，無運費）

1. 入庫 capture：150  
2. Pass capture：100  
3. 買家確認收貨 → T+3 無爭議 → FPS 賣家 100（減 seller_payable 如有）

---

## 17. 與現有實作差距

| 現況 | 目標 |
|------|------|
| 鑑定 checkout `capture_method: automatic` | manual + 分階段 capture | ✅ P0 |
| 無 `payment_capture_status` | 新增 enum + 欄位 | ✅ P0 |
| pass 無 goods capture | Admin pass → `fully_captured` | ✅ P1 |
| fail 用 refund 而非 void | fail → cancel uncaptured | ✅ P1 |
| 無 `fault_party` | 新增 enum + Admin 必填 | ✅ P1 |
| Member 鑑定中賣家仍可 RPC cancel（`pending`） | 鑑定 lock 後禁止 |
| 確認收貨後無 FPS hold | T+3 + `payout_hold_until` |
| 無 `seller_payable` ledger | 新增 ledger + fee 分攤 | P2 |
| Merchant 收貨後售後 | 7 日窗口 + refund/reversal saga |
| `pending_payment` 無逾時 | 48h job |

---

## 18. 實作里程碑

| Phase | 內容 |
|-------|------|
| **P0** | 鑑定 PI manual + 分階段 capture；webhook；`payment_capture_status`；封鑑定 cancel | ✅ |
| **P1** | Admin pass/fail 接 capture；`fault_party`；fail void 路徑 | ✅ |
| **P2** | Member T+3 FPS hold + `seller_payable`；Merchant 48h pending 逾時 |
| **P3** | 售後 dispute（Member 3 日 / Merchant 7 日）；Merchant refund + reversal |
| **P4** | re-auth 過期 job；chargeback 記錄；disputes 真後台 |

---

## 19. 相關文件

- [admin-grading/PARTNER_HANDOFF.md](./follow-up/admin-grading/PARTNER_HANDOFF.md) — 🟡 Partner QA（single capture E2E 主流程）
- [admin-grading/backend.md](./follow-up/admin-grading/backend.md) — 鑑定工作台（須對齊本文件 capture 時序）
- [unified-checkout/backend.md](./follow-up/unified-checkout/backend.md) — 統一結帳 wizard + 入款兩 route / 出款 T+3 FPS vs T+7 Connect
- [member-fps-payout/backend.md](./follow-up/member-fps-payout/backend.md) — Member 鑑定 T+3 FPS 提現單
- [merchant-connect-payout-hold/backend.md](./follow-up/merchant-connect-payout-hold/backend.md) — Merchant T+7 Connect cron
- [server.md](./server.md) — 伺服器 TODO（付款章節以本文件為準）
