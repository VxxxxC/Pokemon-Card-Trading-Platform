# Partner Checklist — 平台獎勵 v2（人手 QA）

> **已合併至 SSOT：** [PARTNER_QA.md](../../PARTNER_QA.md)（M1 rewards 頁、R3 G2.6、R4 券肉眼）  
> Gate `test:rewards:gate` 已覆蓋 logic；本頁保留歷史 Admin UI 步驟參考。

**對象：** Frontend / Partner  
**後端：** Aaron（actions、RPC、payout）  
**詳細步驟：** [QA_CHECKLIST.md](./QA_CHECKLIST.md) · E2E 覆蓋：[QA_MATRIX_RESULTS.md](./QA_MATRIX_RESULTS.md)

---

## 一句話

**Release gate**（`bun run test:rewards:gate`）已覆蓋 checkout 用券、搶券、**積分商城**、Stripe 對帳、P0 釋券/過期/還券、訂單詳情實付。Partner 只需 **Admin UI smoke**（一般券 / 積分商城分離 flow + 簽到）同可選跨裝置 spot-check。

---

## 開測前

- [ ] `bunx supabase db push`（含 E2E backdate RPC）
- [ ] Admin + Member 測試帳；商戶 listing（順豐、可選鑑定）
- [ ] Stripe 測試模式（E2E reconcile / 訂單詳情需要）

**後端 / CI（Partner 可跳過若綠燈）：**

```bash
bun run test:rewards:gate
```

或分步（除錯用；CI 與 gate 已合併為單次 Playwright）：

```bash
bun run test:integration:rewards
bun run test:e2e:rewards-gate   # phase2/3/4/matrix + checkout-coupon + order-detail + stripe-reconcile
```

細分（可選）：

```bash
bun run test:e2e:rewards
bun run test:e2e:rewards-checkout-coupon
bun run test:e2e:stripe-reconcile
```

GitHub：`.github/workflows/rewards.yml`（nightly / `workflow_dispatch` / PR label `rewards`）

---

## 唔使人手重測（自動化已覆蓋）

| 區域 | 說明 |
|------|------|
| 免運 / 折扣券 direct checkout | phase2 B1、B2、B3.1（auth 開關清空選券、picker 仍顯示）/3.3–3.5 · `rewards-checkout-coupon` E2E-C1～C4 |
| merchant_auth + 券補貼 | phase2 B2b.1/2 |
| 搶券、每日上限、搶光、暫停/恢復 | phase3 C3.x、C3.8 |
| auto_grant `trade_count` | matrix M-G1–G3 |
| PI 金額 = `buyer_total_amount` | stripe-reconcile R1；webhook R-04 guard |
| 有補貼出款無 `source_transaction` | stripe-reconcile R2 |
| 無券出款綁 charge | stripe-reconcile R3 |
| **P0-1** 取消付款釋放券 | Vitest `I-P0-1` + webhook `I-P0-1b` |
| **P0-2** 48h 過期釋放券 | Vitest `I-P0-2` |
| **P0-3** 鑑定失敗還券（DB 路徑） | Vitest `I-P0-3` |
| **P0-4** 訂單詳情實付 | E2E `E2E-P0-4` |
| **P0-5** `event_once` 發放 | Vitest `I-P0-5` |
| **Phase 4** 積分商城兌換 | `platform-rewards-phase4` C4.x · Vitest `I-G*` |

---

## P0 — 已自動化（無需人手逐項點）

| # | 原人手項 | 自動化 |
|---|----------|--------|
| 1 | 取消付款釋放券 | `coupon-partner-p0` I-P0-1 / `coupon-webhook` I-P0-1b |
| 2 | 48h 過期釋放券 | `coupon-partner-p0` I-P0-2 |
| 3 | 鑑定失敗還券 | `coupon-partner-p0` I-P0-3 |
| 4 | 訂單詳情實付 | `rewards-order-detail` E2E-P0-4 |
| 5 | `event_once` 發放 | `coupon-partner-p0` I-P0-5 |

---

## P1 — 建議驗（Admin smoke，約 10 分鐘）

| # | 試咩 | 路由 | 預期 | 通過 |
|---|------|------|------|------|
| 6 | **鑑定單 PI / capture** | merchant_auth checkout + 券 → Stripe Dashboard | authorize 金額 = `buyer_total_amount`；鑑定費 + 貨款 capture 正確 | |
| 7 | **直發開鑑定 + 用券（Phase 2b）** | direct checkout：開啟鑑定開關 → 選**符合鑑定資格**券 → 繼續付款 | Picker **仍顯示**；開關會清空已選券並以 `useAuth` 重載列表；摘要有平台優惠、prepare 成功（E2E B3.1/B2b 已覆蓋，可選 spot-check） | |
| 8 | **非鑑定券用於鑑定單** | `requires_authentication: false` 券 + auth 訂單 | 不符合資格 | ✅ `I-D4`（可 skip） |
| 9 | **Admin 精靈逐步** | `/admin/campaigns` 新增/編輯模板 | 單頁表單預填、發布、限制欄位正確 | ✅ 2026-07-29 |
| 10 | **簽到計劃儲存** | `/admin/campaigns?tab=check-in` | 改 7 日階梯 + completion bonus → 會員簽到生效 | ✅ 2026-07-29 |

---

## P2 — 有時間再驗

| # | 試咩 | 備註 |
|---|------|------|
| 11 | 搶券 **未開始**（`starts_at` 前） | 按鈕 disabled / 文案 — ✅ Partner UI 2026-07-29 · `I-F3` + `C3.9` |
| 12 | 商戶角色 `trade_count` auto_grant | 買家路徑 E2E 有，商戶未單獨開 case |
| 13 | Admin 搶券檔期 **ROI tab** | 檔期 CRUD E2E 有；ROI 為 mock |
| 14 | 跨瀏覽器 / 手機 checkout 用券 | 純 UI smoke |

---

## 快速通過標準

- [ ] `bun run test:rewards:gate` 全綠（或 CI `rewards.yml` 綠燈）
- [x] P1 **#9–10** Admin 各點一次（精靈 + 簽到）— ✅ Partner 2026-07-29
- [x] **Phase 3** 限時搶券 happy path（E2.1–E2.3 + E3.1）— ✅ Partner 2026-07-29
- [x] **Phase 4** 積分商城（G1 Admin 分離 flow + G2.5 persona）— ✅ Partner 2026-08-09
- [ ] （可選）P1 #6 鑑定單 Stripe capture 至少跑通一單；#7–8 鑑定用券 spot-check（合法組合 + 不符合資格券）
- [ ] 無 console error、無錯誤 Toast

---

## 問題回報

附：訂單 id、`user_rewards.id`、截圖、Stripe PI id（如有）。後端對照 [backend.md](./backend.md)。
