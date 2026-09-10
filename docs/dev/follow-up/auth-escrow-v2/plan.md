# Auth Escrow v2 — Plan（鑑定託管金流 · 兩段順豐運費）

> **Status:** 🟡 Draft — product / policy reset (2026-08)  
> **Refund rules superseded by:** [refund-policy.md](../../refund-policy.md)（本 plan 內 auth_fee／fail 矩陣僅作歷史參考）  
> **Supersedes (partial):** [escrow-payment-policy.md](../../escrow-payment-policy.md) §2.2 capture 時序、§6 鑑定失敗、單一 `shipping_fee` 語意  
> **Blocks:** [Platform Rewards v2 Phase 2b](../platform-rewards-v2/plan.md)（鑑定 checkout 用券）、Member 鑑定 Phase 5 用券  
> **Does not block:** Rewards Phase 2 / 3（`merchant_direct` 非鑑定）、`test:rewards:gate` 非鑑定 E2E

## 1. Goals

1. **鑑定單只得兩種：** Member 鑑定（C2C `#2`）、Merchant 鑑定（B2C `#4`）。產品規格唔再以「直發開鑑定」作獨立類型描述（implementation 上 `merchant_direct` + 鑑定開關仍可存在，但金流語意對齊 Merchant 鑑定）。
2. **物流：** 鑑定全流程 **只用順豐速遞**；平台 admin 設定 **固定單程運費**（例 HK$30），減少運費不確定性。
3. **兩段運費：** 賣家 → 平台（inbound）、平台 → 買家（outbound）；checkout 與 DB snapshot **分開記錄**。
4. **買家 authorize 全額：** 卡價 + 鑑定費 + inbound + outbound；checkout **breakdown** 四行清晰展示。
5. **Single capture at pass（v2.1 定案，取代 multicapture）：**
   - Checkout → **authorize 全額** `buyer_total`（無 partial capture）
   - 入庫確認 → **不 capture**；必要時 **re-auth** PI（>6 天授權）
   - 鑑定通過 → **一次** `capture(buyer_total, final_capture: true)`
   - 鑑定失敗（新單、未 capture）→ **cancel PI**（無 Stripe 退款費）
6. **責任分攤（v2 定案）：**
   - **鑑定成功：** 買家承擔全部（已 authorize 金額；成功後按既有 T+3 FPS / T+7 Connect 出款賣家應得部分）。
   - **鑑定失敗（賣方責任）：** 買家 **全額退回**（卡價 + 鑑定費 + 兩段運費）；賣方承擔全部費用（含 Stripe processing fee）；**平台收到賣方結清款項後** 才安排寄回卡牌。
7. **賣方追償分線：** Merchant → `merchant_ledgers` 記賬 + 未來 payout 抵扣；Member → `seller_receivables`（人手 FPS）+ Admin 確認收款。

### Design principles

| Principle | Decision |
|-----------|----------|
| **SSOT** | 本 plan + 更新後 `escrow-payment-policy.md`；rewards plan 只引用金額契約，不重複定義運費 |
| **Fixed SF leg fee** | 平台設定 `platform_sf_leg_fee_hkd`（或等價 config）；唔用商戶店鋪可變運費計鑑定單 |
| **Split shipping columns** | `inbound_shipping_fee` + `outbound_shipping_fee`；棄用鑑定單單一 `shipping_fee` 模糊語意 |
| **Fail = refund captured** | 入庫後已 capture 的鑑定費／inbound 須 **Stripe refund**，唔係只靠 `capture(0)` void 餘額 |
| **Return gate** | `outbound_tracking_no` 僅在 `seller_settlement_status = cleared`（或等價）後可填 |
| **Rewards later** | 鑑定用券喺 v2 金額穩定後重做；免運 **只減 outbound** |

---

## 2. Order types in scope

| ID | 類型 | 表 | Checkout variant | 出款 |
|----|------|-----|------------------|------|
| 2 | Member 鑑定 | `member_orders` | `member_auth` | FPS T+3 |
| 4 | Merchant 鑑定 | `merchant_orders` (`requires_authentication = true`) | `merchant_auth` | Connect T+7 |

**Out of scope（本 epic）：** Member P2P 無鑑定、Merchant 非鑑定直發、面交／商戶自選快遞（仍走既有 Phase 2 rewards 路徑）。

---

## 3. Logistics model

### 3.1 Flow

```text
買家 checkout authorize 全額
    → 賣家順豐寄卡入庫（inbound）
    → Admin 確認入庫 → capture(鑑定費 + inbound)
    → 鑑定中
    → 通過：capture(卡價 + outbound) → 平台順豐寄買家
    → 失敗（賣方責）：refund 買家 + 賣方追償 → 收款後寄回賣家
```

### 3.2 Platform SF leg fee

| Config | 說明 |
|--------|------|
| `platform_sf_leg_fee_hkd` | Admin 設定，例 `30` |
| `inbound_shipping_fee` | snapshot = `platform_sf_leg_fee_hkd` |
| `outbound_shipping_fee` | snapshot = `platform_sf_leg_fee_hkd` |
| 總運費 | `inbound + outbound`（例 HK$60） |

鑑定單 **唔** 使用 `merchant_shops.base_courier_shipping_fee` 或 listing `extra_shipping_fee`（該模型保留予非鑑定直發）。

### 3.3 與免運券的交界（Rewards — 後置）

| 券類型 | 鑑定單行為（v2 後實作） |
|--------|-------------------------|
| `free_shipping` | 補貼 **僅 outbound**：`min(outbound_shipping_fee, max_subsidy_hkd)` |
| `discount_coupon` | 補貼 **卡價**（`item_subtotal`），不影響運費段 |
| 面交 | **不適用**鑑定單（無面交選項） |

---

## 4. Checkout amounts

### 4.1 Gross（無券）

```text
total_amount =
  item_subtotal
  + auth_fee                    -- 預設 HK$150
  + inbound_shipping_fee
  + outbound_shipping_fee
```

**PI authorize** = `total_amount`（有券時改為 `buyer_total_amount`，見 §8）。

### 4.2 Checkout UI breakdown（必填）

| 行 | 欄位 |
|----|------|
| 商品成交價 | `item_subtotal` |
| 鑑定服務費 | `auth_fee` |
| 運費（賣家寄送平台） | `inbound_shipping_fee` |
| 運費（平台寄送買家） | `outbound_shipping_fee` |
| 平台優惠（有券） | `- platform_subsidy_amount` |
| **買家應付** | `buyer_total_amount` |

Member / Merchant 鑑定 **同一套 breakdown**；Merchant 鑑定另保留佣金／Connect 出款語意（不影響買家應付列）。

### 4.3 成功後賣家應得（概要）

買家已付全額；成交後出款應反映「賣家實際墊付 inbound 寄平台」：

| 賣家類型 | 出款基礎（成功、無爭議） |
|----------|--------------------------|
| Member | FPS：`item_subtotal + inbound_shipping_fee − seller_payables`（Stripe fee 等按 policy） |
| Merchant | Connect：`item_subtotal − commission + inbound_shipping_fee`（gross 佣金基數不變；運費段入 payout snapshot） |

> 精確公式在 `backend.md` 與 payout RPC patch 定案；本 plan 鎖定 **inbound 須入賣家應收**。

---

## 5. Multicapture timeline

單一 PI，`capture_method: manual`（與現有 P0 一致）。

| Step | 觸發 | Stripe capture | `payment_capture_status` |
|------|------|----------------|--------------------------|
| 0 | 買家付款 | authorize 全額 | `authorized` |
| 1 | Admin 確認入庫 | `auth_fee + inbound_shipping_fee` | `auth_fee_captured`¹ |
| 2a | 鑑定 **通過** | `item_subtotal + outbound_shipping_fee`（券後買家段：見 §8） | `fully_captured` |
| 2b | 鑑定 **失敗**（賣方責） | refund 已 capture + void 餘額；見 §6 | `refunded` / `voided` |

¹ 狀態名可保留 `auth_fee_captured` 以減 migration churn，但語意擴展為「入庫階段款項已 capture」。

### 5.1 Goods capture 金額（通過）

```text
pass_capture_amount =
  buyer_total_amount
  - auth_fee_captured
  - inbound_shipping_fee_captured
```

有 outbound 免運券時，`buyer_total` 已扣 outbound 補貼，但 **pass capture 仍須 capture 授權內 outbound 段**（與現有 multicapture + subsidy 模式一致，細節見 rewards 交界 doc）。

---

## 6. 鑑定失敗 — 賣方責任（v2 定案）

> **取代** 現行 `escrow-payment-policy.md` §6「auth_fee 不退」及 Partner handoff「fail 只留 HK$150」。

### 6.1 買家

| 項目 | 動作 |
|------|------|
| 卡價 | 全額 refund（未 capture 釋放 + 已 capture 部分 refund） |
| 鑑定費 | **全額 refund** |
| inbound 運費 | **全額 refund** |
| outbound 運費 | 未 capture → void；已 capture → refund |
| 優惠券 | `is_used` 還原；`reserved_*` 釋放（與現有 `fn_restore_*` 對齊） |

### 6.2 賣方

| 項目 | 動作 |
|------|------|
| 應付總額 | 買家已收退款總額 + **Stripe processing fee**（實際從 balance transaction 讀） |
| Merchant | `INSERT merchant_ledgers` 負數／`grading_fail_recovery` 類型；`payout_status` 或新欄位標記欠款 |
| Member | `INSERT seller_receivables`；`settlement_status = pending` |
| 寄回卡牌 | **禁止** 直至 Admin 標記賣方已結清（或 Connect 自動抵扣完成） |

### 6.3 Admin fail 流程（目標 saga）

1. `rpc_prepare_auth_grading_fail` — 鎖單、`fault_party`（MVP 可先支援 `seller` 主路徑）
2. Stripe — 對已 capture 金額建立 **refund**（非僅 `capture(0)`）
3. Stripe — `capture(0, final_capture: true)` 釋放未 capture 餘額（若仍有）
4. `rpc_finalize_auth_grading_fail` — 訂單 `cancelled` / `refunded`、listing 釋放、寫入賣方 receivable
5. Admin **待追償** 隊列 → 收款確認 → `seller_settlement_status = cleared` → 允許填 **寄回** tracking

### 6.4 其他 `fault_party`

| fault | v2 MVP | 後續 |
|-------|--------|------|
| `seller` | 本 plan 全額退款 + 賣方追償 | ✅ 優先 |
| `buyer` / `platform` / `carrier` / `inconclusive` | 保留 enum；金額矩陣 **另表** 於 policy §7 擴展 | P2 |

---

## 7. Seller settlement（追償）

### 7.1 Merchant（Stripe Connect）

| 機制 | 說明 |
|------|------|
| `merchant_ledgers` | 擴展 `transaction_type`（例 `grading_fail_recovery`）；`amount` 可為負 |
| 未來 payout | `rpc_prepare_merchant_order_payout` 與 **全局欠款** 抵扣（同商戶多單合併） |
| 即時扣款 | Connect Debit / 獨立 PI — **非 MVP**；先 ledger + 人工確認 |

### 7.2 Member（人手 FPS）

| 機制 | 說明 |
|------|------|
| `seller_receivables`（新表） | `order_id`, `seller_id`, `amount_hkd`, `status` (`pending`/`paid`/`waived`), `fps_reference`, `paid_at` |
| Admin UI | 待收款列表 → 標記已收 → 解鎖寄回 |
| FPS 後追償 | 無自動 clawback；依 receivable + 治理（限制上架、moderation） |

### 7.3 Return shipment gate

```text
允許 rpc_submit_*_outbound_tracking 當且僅當：
  auth_result = 'failed'
  AND seller_settlement_status = 'cleared'
  AND fault_party = 'seller'   -- 或可配置
```

鑑定 **通過** 的 outbound 仍為「寄畀買家」，走現有 pass → shipped 路徑。

---

## 8. Rewards dependency（交界摘要）

| 項目 | v2 前（現況） | v2 後 |
|------|---------------|-------|
| 鑑定單運費 | 常為 0；免運券先寫入 `shipping_fee` | 永遠兩段；免運只減 outbound |
| `fn_compute_platform_subsidy` | `p_shipping_method = 'sf'` 單段 | `p_outbound_shipping_fee` 或拆分參數 |
| Phase 2b E2E B2b | 基於舊金額 | **重做** |
| Member 鑑定用券 | 未接 | 併入「Rewards on Auth」wave，唔單獨 Phase 5 |

**實作順序：** Auth Escrow v2（無券）→ Rewards on Auth（券）→ `test:rewards:gate` 鑑定 case 更新。

---

## 9. Current state vs gap

| 資產 | 現況 | v2 目標 |
|------|------|---------|
| Member prepare | 卡價 + 鑑定費；無運費 | + inbound + outbound |
| Merchant auth prepare | 鑑定費；免運券才寫 `shipping_fee` | 永遠兩段 snapshot |
| `rpc_prepare_auth_fee_capture` | 只 capture `auth_fee` | capture `auth_fee + inbound` |
| `rpc_prepare_goods_capture` | Member：`item_subtotal`；Merchant：`buyer_total − auth_fee` | 對齊 §5.1 pass 公式 |
| Fail saga | `capture(0)`；**auth_fee 不退** | refund captured + seller receivable |
| `seller_payable` / receivables | policy 提及；**無表** | `seller_receivables` + ledger 擴展 |
| Checkout UI | 鑑定單運費顯示 0 | 四行 breakdown |
| `escrow-payment-policy.md` | §6 auth_fee 不退 | 更新為 v2 fail 矩陣 |
| Platform SF config | 無 | `platform_settings` 或 migration seed |

---

## 10. Implementation phases

### Phase A — Policy & schema（無 Stripe 改動）

- [ ] 本 plan review 定案 + 更新 `escrow-payment-policy.md` v0.2
- [ ] Migration：`inbound_shipping_fee`, `outbound_shipping_fee`, `seller_settlement_status`, `platform_sf_leg_fee` config
- [ ] `seller_receivables` 表 + RLS
- [ ] `merchant_ledgers.transaction_type` 擴展（若需 migration）
- [ ] `docs/dev/follow-up/auth-escrow-v2/backend.md` + `frontend.md`

### Phase B — Checkout & prepare（無 fail saga）

- [ ] `rpc_prepare_member_auth_order_payment` / merchant auth prepare — 兩段運費 snapshot
- [ ] PI amount = `buyer_total_amount`（暫無券）
- [ ] Checkout breakdown（Member + Merchant 鑑定）
- [ ] Multicapture step 1：capture 鑑定費 + inbound
- [ ] Multicapture step 2：capture 卡價 + outbound（pass）
- [ ] 成功路徑 payout snapshot 含 inbound 賣家應收

### Phase C — Fail & settlement

- [ ] Fail saga：refund + receivable / ledger → **[phase-c-plan.md](./phase-c-plan.md)**
- [ ] Admin 追償 UI + 寄回 gate
- [ ] E2E：入庫 → fail（seller）→ 買家全退 → 收款 → 寄回

### Phase D — Rewards on Auth（解鎖 Phase 2b）

- [x] 重做 `fn_compute_platform_subsidy` / prepare 券參數 → **[phase-d-plan.md](./phase-d-plan.md)**
- [x] `escrow_capture_model = 'single'` 有券時亦寫入 DB（P0）
- [x] Picker + E2E B2b / D2
- [x] Partner QA → **[PARTNER_QA.md](./PARTNER_QA.md)**（P0–P2 ✅ 2026-07-29）

---

## 11. Open questions（定案前）

| # | 問題 | 建議默認 |
|---|------|----------|
| Q1 | `platform_sf_leg_fee_hkd` 全局一個數，定 Member/Merchant 分開？ | 全局一個（簡化） |
| Q2 | 入庫 capture 狀態名是否改名 `intake_captured`？ | 保留 `auth_fee_captured`，文檔註明含 inbound |
| Q3 | fail MVP 是否只實作 `fault_party = seller`？ | 是；其他 fault 沿用舊矩陣直至 P2 |
| Q4 | 鑑定失敗寄回對象 | 寄回 **賣家**（非買家）；買家已全額退款 |
| Q5 | 商戶鑑定 inbound 運費入 payout 定係只 Member？ | **兩者** 賣家墊付 inbound，出款都應含 |

---

## 12. Related docs

| Doc | 關係 |
|-----|------|
| [escrow-payment-policy.md](../../escrow-payment-policy.md) | SSOT — 待 v0.2 同步 |
| [admin-grading/PARTNER_HANDOFF.md](../admin-grading/PARTNER_HANDOFF.md) | 待更新 fail 預期（全退 vs 留 HK$150） |
| [member-fps-payout/backend.md](../member-fps-payout/backend.md) | FPS 金額含 inbound |
| [merchant-checkout/backend.md](../merchant-checkout/backend.md) | Connect payout 與 ledger |
| [platform-rewards-v2/plan.md](../platform-rewards-v2/plan.md) | Phase 2b blocked on 本 epic |
| [unified-checkout/backend.md](../unified-checkout/backend.md) | Checkout wizard 兩 variant |

---

## 13. Changelog

| Date | Change |
|------|--------|
| 2026-08-08 | Initial draft — 兩段順豐、multicapture 拆分、seller-fault 全退、追償分線、rewards 依賴、implementation phases |
