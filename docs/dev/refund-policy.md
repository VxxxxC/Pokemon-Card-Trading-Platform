# HKCardVault 退款政策（SSOT）

> **版本**：v1.0（產品定案 — 2026-08-10）  
> **狀態**：📋 **Target policy**（實作對照見 [§12](#12-實作對照與缺口)）  
> **關聯**：[escrow-payment-policy.md](./escrow-payment-policy.md)（訂單分類／capture 時序）· [follow-up/refund-policy-rollout-plan.md](./follow-up/refund-policy-rollout-plan.md)（四 PR 落地）  
> **金流實作**：鑑定 fail → `auth-grading-fail-void-saga` · 售後 → Phase H `moderation-order-refund-saga`

本文件定義 **每一種退款情境** 下：買家實收、鑑定費、Stripe processing fee、賣家／商戶追償嘅 **breakdown**。  
與 [escrow-payment-policy.md](./escrow-payment-policy.md) 衝突時，**本文件為退款專項 SSOT**。

---

## 1. 訂單類型

| ID | 類型 | 代碼 `orderKind` | 平台金流 |
|----|------|------------------|----------|
| 1 | Member P2P | `member_p2p` | 無 |
| 2 | Member 鑑定 | `member_auth` | Stripe 入款 · FPS 出款 |
| 3 | Merchant 非鑑定 | `merchant_direct` | Stripe · Connect |
| 4 | Merchant 鑑定 | `merchant_auth` | Stripe · Connect |

**#1 永不** 經平台退款 RPC；僅舉報／制裁。

---

## 2. 金額組成（Breakdown 欄位）

買家 checkout 總額（`buyer_total_amount`）典型拆法：

| 欄位 | 說明 | 鑑定單 |
|------|------|--------|
| **A** `item_subtotal` / `final_price` | 卡牌成交價 | ✅ |
| **B** `inbound_shipping_fee` | 賣家→平台入庫運費 | ✅ 常見 |
| **C** `outbound_shipping_fee` / `shipping_fee` | 平台→買家出庫運費 | ✅ |
| **D** `auth_fee` | 鑑定服務費（預設 HK$150） | ✅ |
| **E** 平台補貼／券 | `platform_subsidy`、coupon | 視活動 |

記法：**買家總付 T = A + B + C + D − 券補貼**（實際以訂單快照為準）。

### 2.1 Breakdown 輸出格式（Admin／對客）

每筆退款應能列出：

```text
eligible_policy_hkd     … 政策可退基數（未扣 Stripe fee）
stripe_fee_hkd          … 不可回收 processing fee（若適用）
refund_to_buyer_hkd     … 實際 Stripe 退畀買家
auth_fee_retained_hkd   … 留平台嘅鑑定費（0 = 已退畀買家）
seller_recovery_hkd     … 向賣家／商戶追償總額（含 fee 若 seller fault）
platform_absorb_hkd     … 平台承擔（platform fault）
```

---

## 3. 訂單階段（決定用邊套規則）

| 階段 | 條件（簡化） | 退款通道 |
|------|----------------|----------|
| **S0** | 未付款，或已 authorize **未入庫** | 取消 PI / void |
| **S1** | 已入庫～**鑑定出結果前**；或鑑定 **fail** | **鑑定 fail saga** |
| **S2** | 鑑定 pass，已出貨，**買家未確認** | 原則不開放一般售後；個案 Admin |
| **S3** | 買家已確認，**售後窗口內** | **Phase H 舉報售後** |
| **S4** | 窗口外，或已 FPS／Connect 出款 | 無自動退款；追償／治理 |

| 類型 | 售後窗口（S3） |
|------|----------------|
| Member 鑑定 (#2) | 確認收貨後 **3 個曆日** |
| Merchant (#3/#4) | 確認收貨後 **7 個曆日** |

---

## 4. 鑑定費（auth_fee）總規則

> **入庫確認（`platform_received_at`）後，鑑定服務視為已開始。**

| 情境 | 鑑定費退畀買家？ | 實質承擔方 |
|------|------------------|------------|
| **S0** 未入庫取消 | ✅ 全退（含於 void） | 無（服務未開始） |
| **S1 fail — Seller fault**（假卡、嚴重不符） | ✅ **退** | **Seller** 追償（計入 recovery） |
| **S1 fail — Buyer fault**（寄錯、調包） | ❌ **不退** | **Buyer**（已購鑑定服務） |
| **S1 fail — Platform fault** | ✅ 退 | **Platform** absorb |
| **S1 fail — Carrier fault** | ✅ 退（卡價運費政策同 seller fault 對買家） | **Carrier 歸責方**（賣家物流→seller；平台物流→platform） |
| **S1 fail — Inconclusive** | ✅ 退鑑定費畀買家 | Stripe fee 50/50；鑑定費由 **Platform absorb**（ goodwill ） |
| **S3 售後 — 鑑定已 pass** | ❌ **不退**（預設） | 已消耗服務 |
| **S3 售後 — Platform fault**（須原因 + audit） | ✅ 退 | Platform |

**重要（Admin）：** 假卡、與 listing 嚴重不符 → 預設 **Seller fault**，唔好判 Buyer fault。  
**買家加購鑑定** 唔改變上表；僅 **Buyer fault** 時買家不得退鑑定費。

---

## 5. Stripe processing fee 總規則

- **未 capture 就 void / cancel**（S0、S1 single cancel 全單）：目標 **processing fee ≈ 0**。
- **已 capture 後 refund**（legacy staged、S3 售後）：Stripe **唔退**已收 fee → 必須分配承擔方。

| `fault_party` | 買家 `refund_to_buyer` | Stripe fee 承擔 |
|---------------|------------------------|-----------------|
| **seller** | `eligible_policy` 全額 | **Seller／Merchant** 追償（ledger / receivable） |
| **buyer** | `eligible_policy − stripe_fee_actual` | **Buyer** |
| **platform** | `eligible_policy` 全額 | **Platform** |
| **carrier**（賣家寄件） | `eligible_policy` 全額 | **Seller** |
| **carrier**（平台物流） | `eligible_policy` 全額 | **Platform** |
| **inconclusive** | `eligible_policy` 全額 | **各 50%**（買賣分攤；或 PR scope 內寫死 platform absorb — 以下表採 **50/50**） |

`stripe_fee_actual`：從 Stripe balance transaction 讀取（與現有 saga 一致）。

---

## 6. S0 — 未入庫／未付款

| 觸發 | 買家 | 鑑定費 | Stripe fee | 賣家 |
|------|------|--------|------------|------|
| 逾時未付、賣家取消、PI void | 無扣款或授權釋放 | 不適用 | ≈0 | 無追償 |
| Authorize 後、入庫前賣家取消 | 全額授權釋放 | 含於釋放 | ≈0 | 無 |

---

## 7. S1 — 鑑定失敗（Grading fail）

**通道**：Admin 鑑定工作台 → `rpc_prepare_auth_grading_fail` → `auth-grading-fail-void-saga`  
**必填**：`fault_party` + 原因

### 7.1 政策可退基數 `eligible_policy`（S1）

| 訂單 | `eligible_policy` |
|------|-------------------|
| 所有鑑定單 | **A + B + C**（卡價 + 入庫運費 + 出庫運費） |
| + 鑑定費 | 僅 **Seller / Platform / Carrier / Inconclusive** fault：**+ D** |
| Buyer fault | **唔加 D**（鑑定費留平台） |

### 7.2 Single capture（`escrow_capture_model = single`）— 目標行為

| fault | Stripe 動作 | 買家實收 | 鑑定費 D | Stripe fee | 賣家追償 |
|-------|-------------|----------|----------|------------|----------|
| **seller** | `PI.cancel`（授權全釋） | **T**（全額） | 退畀買家 | ≈0 | **T** + 0 fee |
| **buyer** | **Capture D only**，釋放 A+B+C | **A+B+C** | **留平台** | ≈0 | 0 |
| **platform** | `PI.cancel` | **T** | 退畀買家 | ≈0 | 0（平台 absorb） |
| **carrier** | 同 seller 對買家 | **T** | 退畀買家 | ≈0 | 物流歸責方 |
| **inconclusive** | `PI.cancel` | **T** | 退畀買家 | ≈0 | 0；fee 爭議 50/50 記帳 |

**範例**（T = 800+50+50+150 = 1050）：Seller fault 假卡 → 買家收 **1050**；追賣家 **1050**。  
Buyer fault 寄錯 → 買家收 **900**，平台留 **150** 鑑定費。

### 7.3 Legacy staged capture — 目標行為

| fault | Stripe 動作 | 買家實收 | 備註 |
|-------|-------------|----------|------|
| **seller** | Refund 已 capture（通常 D+B）+ capture(0) 釋放餘額 | **T** | 已 capture 部分可能產生 fee → **seller** 追償 |
| **buyer** | 保留已 capture **D**；釋放／退 A+B+C | **A+B+C** | 已 capture D 嘅 fee 視作鑑定成本 |
| **platform** | 全退買家 | **T** | Platform absorb fee |

### 7.4 S1 訂單終態

| | Member | Merchant |
|--|--------|----------|
| 訂單狀態 | `cancelled` | `refunded` |
| Listing | `active` | `active` |
| 追償表 | `seller_receivables` | `merchant_ledgers` (`grading_fail_recovery`) |

---

## 8. S3 — 收貨後售後（Phase H／舉報 resolve）

**通道**：Admin 裁定 `upheld` + 勾選售後退款 → `rpc_prepare_moderation_order_refund` → `moderation-order-refund-saga`  
**前提**：`auth_result = passed`（鑑定單）、窗口內、未出款／未 FPS 完成（見 eligibility RPC）

### 8.1 政策可退基數 `eligible_policy`（S3）

| `orderKind` | `eligible_policy` |
|-------------|-------------------|
| `merchant_direct` | **buyer_total**（全單） |
| `merchant_auth` | **A + C**（item + outbound shipping；唔含 D） |
| `member_auth` | **A + C**（item + outbound shipping；唔含 D） |
| + Platform fault | 鑑定單：**+ D**（須 `platformFaultReason`） |

`refund_to_buyer` 上限：`min(eligible_policy, buyer_total)`，再按 §5 處理 Stripe fee。

### 8.2 S3 breakdown 表（鑑定 pass 後）

假設：A=800, C=50, D=150, T=1000, `stripe_fee_actual`=30

| fault | eligible | 退買家 | 鑑定費 D | Stripe fee | 賣家追償 |
|-------|----------|--------|----------|------------|----------|
| **seller** | 850 | **850** | 留平台 150 | 30 → seller | **850 + 30 = 880** |
| **buyer** | 850 | **820** | 留平台 150 | 30 → buyer | 0 |
| **platform**（有原因） | 1000 | **1000** | 退畀買家 | 30 → platform | 0 |
| **carrier**（賣家物流） | 850 | **850** | 留平台 | 30 → seller | 850+30 |

**Merchant 佣金**：Seller fault 全退時 **唔保留平台佣金**；不可回收 stripe fee **另計** merchant ledger（與現行政策一致）。

### 8.3 S3 — Merchant 非鑑定（僅 A+C 併入 buyer_total）

| fault | eligible | 退買家 | Stripe fee |
|-------|----------|--------|------------|
| seller | buyer_total | 全額 | seller 追償 |
| buyer | buyer_total | 總額 − fee | buyer 承擔 |

### 8.4 S3 窗口與阻擋

| 阻擋條件 | 結果 |
|----------|------|
| 過 `payout_hold_until` | 不可 Phase H refund |
| Member `seller_payout_status` 非 `held`，或 FPS `completed` | 不可／僅追償 |
| Merchant 已有 `stripe_transfer_id` | 不可／reversal + ledger |
| `refund_status` 已 `refunded` / `processing` | 不可重複 |

---

## 9. S4 — 窗口外／已出款

| 情況 | 買家 | 平台動作 |
|------|------|----------|
| Member 已 FPS | 原則唔再 Stripe 退 | `seller_payable` 人手追；帳號制裁 |
| Merchant 已 Connect transfer | 原則唔自動退 | reversal／ledger；chargeback 流程 §12 escrow |
| P2P (#1) | 無 | 僅舉報 |

---

## 10. P2P（#1）

| 項目 | 規則 |
|------|------|
| 平台退款 | **永不** |
| 爭議 | 舉報 → 制裁；買賣自行協商 |

---

## 11. Admin 責任方指引

| 事實模式 | 建議 `fault_party` |
|----------|-------------------|
| 假卡、嚴重與 listing 不符 | **seller** |
| 買家寄錯卡、調包 | **buyer** |
| 鑑定中心操作錯誤 | **platform** |
| 物流損毀（賣家安排寄件） | **carrier**（承擔方 = seller） |
| 證據不足 | **inconclusive**（售後 UI 若未開則 PR3） |

Grading fail 與 Phase H **共用** `grading_fault_party` enum；售後 UI 支援 seller / buyer / platform / carrier / inconclusive（carrier 須選承擔方）。

---

## 12. 實作對照與缺口

| 規則 | Target | 現行 code（2026-08-10） |
|------|--------|-------------------------|
| S3 鑑定單唔退 D（除 platform） | ✅ | ✅ `fn_compute_moderation_order_refund` |
| S3 Stripe fee 分攤 | ✅ | ✅ `moderation-order-refund-saga` |
| S3 Member 3 日窗口 | ✅ | ✅ eligibility |
| S1 Seller fault single cancel 全退 + 追償 | ✅ | ✅ 大致一致 |
| **S1 Buyer fault single 留 D** | ✅ | ✅ `capture_auth_fee_only` saga（`20260912120000`） |
| S1 Platform / carrier / inconclusive | ✅ | ⚠️ enum 有；grading UI 未必全暴露 |
| S3 carrier / inconclusive | ✅ | ✅ `20260914120000` + DisputeDetailClient |
| Member S3 finalize（真 Stripe） | ✅ | ✅ `20260913140000` finalize/retry bypass |
| 政策文案 §2.1 vs §6 矛盾 | — | ❌ 以 **本文件** 為準 |

---

## 13. 相關文件

| 文件 | 用途 |
|------|------|
| [escrow-payment-policy.md](./escrow-payment-policy.md) | Capture 時序、出款 T+3/T+7 |
| [follow-up/admin-moderation/REFUND_ADMIN_PLAYBOOK.md](./follow-up/admin-moderation/REFUND_ADMIN_PLAYBOOK.md) | Admin 退款操作速查 |
| [follow-up/admin-moderation/backend.md](./follow-up/admin-moderation/backend.md) | Phase H RPC／resolve |
| [follow-up/admin-grading/backend.md](./follow-up/admin-grading/backend.md) | Grading fail saga |
| [follow-up/refund-policy-rollout-plan.md](./follow-up/refund-policy-rollout-plan.md) | 四 PR 落地計劃 |
