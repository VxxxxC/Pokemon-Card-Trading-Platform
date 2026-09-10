# Admin Moderation — v2 Roadmap & Pre-Launch Items

> **Status:** 📋 Product decisions recorded (2026-08-10)  
> **v1 SSOT:** [backend.md](./backend.md) · [frontend.md](./frontend.md) · [PARTNER_QA_SIGNOFF.md](./PARTNER_QA_SIGNOFF.md)  
> **Payment / fault SSOT:** [refund-policy.md](../../refund-policy.md)（退款 breakdown）· [escrow-payment-policy.md](../../escrow-payment-policy.md)（capture／出款）

---

## v1 定位（已實作）

**舉報 → Admin 人手裁定 → 帳戶制裁**（封禁、suspend、凍結出款、下架、禁 chat）。  
舉報入口：**chat**、**public profile**（唔包括 listing 詳情頁）。  
舉報人結果：**in-app** modal + ack（G+）。

Logic regression：`bun run test:moderation:gate:full`（2026-08-10 全綠）。

---

## Pre-v1 上線（唔屬 v2）

以下與其他需要 email／push 嘅位 **一次過接**，唔單獨開 moderation v2。

| 項目 | 說明 |
|------|------|
| **Email 通知（全站 batch）** | 含：Admin 裁定後 **通知被罰用戶**（案件摘要、制裁類型／期限）；**唔需要專用 frontend**（backend resolve 觸發 email job）。舉報人 in-app 維持現狀。 |
| **Push** | 同上，與全站通知策略一併上線。 |
| **Partner QA** | P1 staging 煙霧可與其他 flow **稍後一次過簽**；logic 已由 gate 覆蓋。 |

---

## v2 範圍

### 1. Phase F — 自動升級（deferred from v1）

- Cron：案件分數／pending 時長／重犯 subject → 自動標記或升級 queue 優先級。
- Admin dashboard pending count 提醒。
- **唔**自動封人；仍須 Admin resolve。

### 2. 申訴 Portal

| 類型 | 說明 |
|------|------|
| **A. 帳號制裁申訴** | 被 suspend／ban／限制上架後，用戶提交覆核請求；Admin 可解封或維持。 |
| **B. 訂單金流申訴** | 僅在 [§3 退款窗口](#3-escrow-退款-saga) 內可連動退款 saga。 |

- Admin 發出仲裁後，被罰用戶 **email 通知** 屬 pre-v1 batch（見上）；申訴 **UI／流程** 屬 v2。

### 3. Escrow 退款 Saga — ✅ Phase H（v1）

Admin resolve `upheld` 時可 **手動勾選** 售後退款（預設關）；`upheld_warn_only` 可僅警告／退款無制裁。

#### 硬條件（過窗唔退款）

| 訂單類型 | 可退款窗口 | 過窗後 |
|----------|------------|--------|
| Member 鑑定 (#2) | 買家確認後 **3 日**（同 T+3 FPS hold） | 僅帳號治理／`seller_payable`；無自動 refund |
| Merchant (#3/#4) | 買家確認後 **7 日**（同 T+7 Connect hold） | 無一般「安排退款」；已 transfer 走 reversal／ledger／chargeback |
| P2P (#1) | — | **永不** platform refund |

Gate 實作應檢查：`buyer_confirmed_at`、`payout_hold_until`、`escrow_status`／`payout_status`（已 FPS 或 `completed_and_transferred` → block）。

#### 主戰場：merchant 非鑑定（`merchant_direct`）

- #3 automatic capture；售後爭議（貨不對版、嚴重與 listing 不符）多數落喺此路徑。
- **鑑定單**：fail 時已由 **grading saga** 處理退款；pass 後再申訴機會低，僅窗口內窄 category 考慮。

#### `fault_party` 與手續費

詳表見 [refund-policy §8.2](../../refund-policy.md#82-s3-breakdown-表鑑定-pass-後)（S3 售後）與 [§7](../../refund-policy.md#7-s1--鑑定失敗grading-fail)（S1 grading fail）。

| fault | 買家（S3 摘要） | Stripe processing fee |
|-------|-----------------|------------------------|
| **seller** | eligible 全退 | → merchant ledger / seller payable |
| **buyer** | `eligible - stripe_fee_actual` | 買家承擔 |
| **platform** | 全退（鑑定單可含 D） | 平台 absorb |
| **carrier** / **inconclusive** | 全退 eligible | 視物流；UI → **PR3** |

全單 seller-fault 退款時商戶 **唔保留 commission**；未 transfer 則 block cron；已 transfer 則 reversal + ledger。

平台券補貼由平台 absorb，不向商戶追。

#### 與舉報時間的關係

- 用戶可 **隨時舉報**（chat／profile）→ 帳號制裁不受窗口限制。
- **訂單退款** 僅在確認收貨後 N 日內；過窗舉報只做制裁，唔動金流。

### 4. Listing 頁直接舉報

- v1 **唔做**；`offline_trade`／`harassment` 仍要求 chat context。
- v2：listing 詳情／卡片入口 + 必要時擴展 `context_type`。

---

## 明確唔做（v2 亦唔優先）

- ML／NLP 自動裁決
- Chargeback 專用 UI（政策 §12 記錄 + freeze 已有方向）
- 與 `/admin/grading` 工作台合併為單一 UI

---

## 參考

- [6phase-test-plan.md §1.2](./6phase-test-plan.md) — v1 closure out of scope  
- [PARTNER_QA.md](../../PARTNER_QA.md) — Partner 上線前唯一人手清單  
- [subject-history-plan.md](./subject-history-plan.md) — Phase G（已完成，與 Phase F 獨立）
