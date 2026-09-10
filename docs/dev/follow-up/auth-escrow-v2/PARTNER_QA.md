# Partner QA — Auth Escrow v2 + 鑑定用券（Phase D）

> **人手清單已合併：** [PARTNER_QA.md](../../PARTNER_QA.md)（M3 退款、O1/O2 鑑定、R4 券肉眼）  
> 本頁保留歷史簽收記錄；新 Partner session 請只用 PARTNER_QA.md。

> **Owner:** Partner / Frontend QA  
> **Backend track:** `aaron-backend-wired`  
> **Automated gate (backend dev):** `bun run test:auth-escrow:gate` — 34 Vitest + B2b E2E；**Partner 唔使跑** unless regression怀疑

---

## 前置

```bash
git pull origin aaron-backend-wired
bun install
bunx supabase db push
bun run supabase:types   # 可選
```

確認 migration 含 `20260910100000_auth_escrow_phase_d_coupons.sql`。

### `.env.local`（手測必須）

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY` + Stripe webhook（鑑定 authorize / capture）
- Admin 帳號可登入 `/admin/grading`
- 測試用 buyer / merchant listing（支援鑑定 `use_authentication`）

---



## 已由自動化覆蓋（Partner 唔使重驗）


| 項目                                                              | 覆蓋                                           |
| --------------------------------------------------------------- | -------------------------------------------- |
| 鑑定 + 折扣券 / 免運券 DB snapshot（v2 四行、`escrow_capture_model=single`） | `test:auth-escrow:gate` → I-D1 / I-D2 / B2b  |
| PI 金額 = `buyer_total_amount`                                    | B2b + `assertPaymentIntentMatchesBuyerTotal` |
| Grading fail 還券（RPC）                                            | I-D3 / I-P0-3                                |
| 券預留 / 過期 / stale release                                        | integration rewards suite                    |
| 非鑑定券 + auth preview 不符合                                         | `I-D4`                                       |
| 搶券 `starts_at` 前不可 claim                                        | `I-F3` + `C3.9`                              |


---



## P0 — 商戶鑑定主流程（新單 `escrow_capture_model = 'single'`）

⚠️ **必須用 migration** `20260901140000` **之後開嘅新單**；舊單 `escrow_capture_model IS NULL` 走 legacy multicapture。


| #    | 步驟                                | 預期                                                                                      | 通過  |
| ---- | --------------------------------- | --------------------------------------------------------------------------------------- | --- |
| P0.1 | 買家開 **新** 商戶鑑定單，Stripe test 卡付款   | `escrow_status = payment_held`；PI `requires_capture`                                    | ✅ |
| P0.2 | 賣家填 **入庫** 物流                     | 訂單進入可入庫狀態                                                                               | ✅ |
| P0.3 | Admin `/admin/grading` → **確認入庫** | 入庫成功；**唔** partial capture 鑑定費（single 模型）                                               | ✅ |
| P0.4 | Admin **鑑定通過**                    | PI **一次** full capture = `buyer_total_amount`；`payment_capture_status = fully_captured` | ✅ |




### SQL 抽查（可選）

```sql
SELECT id, escrow_capture_model, shipping_fee,
       inbound_shipping_fee, outbound_shipping_fee,
       total_amount, buyer_total_amount, payment_capture_status
FROM merchant_orders
WHERE id = '<order_id>';
```

預期：`escrow_capture_model = 'single'`，`shipping_fee = 0`，inbound/outbound > 0。

---



## P1 — 鑑定 + 用券（Rewards Phase 2b）

金額細節已由 `test:auth-escrow:gate` 覆蓋；Partner 主要驗 **checkout UI + 手感**。


| #    | 步驟                                    | 預期                                       | 通過  |
| ---- | ------------------------------------- | ---------------------------------------- | --- |
| P1.1 | `merchant_auth` 訂單 checkout + **折扣券** | 摘要有「平台優惠」；實付減少；付款成功                      | ✅ |
| P1.2 | 同上 + **免運券**                          | 平台優惠 ≤ outbound 段；無單一 `shipping_fee` 列混淆 | ✅ |
| P1.3 | `merchant_direct` 開啟鑑定開關 + 用券         | 同 P1.1/P1.2；切換 auth 開關會清空已選券             | ✅ |


---



## P2 — Fail + 追償（回歸）


| #    | 步驟                                        | 預期                              | 通過  |
| ---- | ----------------------------------------- | ------------------------------- | --- |
| P2.1 | Admin 鑑定 **fail**（`fault_party = seller`） | 買家全額退款 / PI void；券還原（訂單 coupon 清空 + reserve 清除） | ✅ |
| P2.2 | `/admin/grading` → **待追償** tab            | 顯示賣家欠款；清償後可進入寄回流程               | ✅ |


---



## 唔使驗

- 舊單 `escrow_capture_model IS NULL`（除非刻意 legacy regression）
- `bun run test:rewards:gate` 全 suite（M-M1 / R2 / E2E-C1 與本 epic 無關）
- Member C2C 鑑定 full Stripe E2E（見 [admin-grading/PARTNER_HANDOFF.md](../admin-grading/PARTNER_HANDOFF.md) 另一條線）

---



## 相關文檔


| Doc                                                                                  | 用途                          |
| ------------------------------------------------------------------------------------ | --------------------------- |
| [PARTNER_HANDOFF.md](../admin-grading/PARTNER_HANDOFF.md)                            | Admin 入庫 / pass / fail 操作細節 |
| [phase-d-plan.md](./phase-d-plan.md)                                                 | Phase D 金額契約 + verify SQL   |
| [platform-rewards-v2/QA_CHECKLIST.md](../platform-rewards-v2/QA_CHECKLIST.md) Part D | 獎勵用券補充                      |
| [backend.md](./backend.md)                                                           | RPC / migration 索引          |


---



## Sign-off

| 區塊 | 狀態 | 日期 |
|------|------|------|
| P0 — 商戶鑑定主流程 | ✅ Partner cleared | 2026-07-29 |
| P1 — 鑑定 + 用券 | ✅ Partner cleared | 2026-07-29 |
| P2 — Fail + 追償 | ✅ Partner cleared | 2026-07-29 |

**P0–P2 全部完成** → `INTEGRATION_QUEUE.md`：**Auth Escrow v2**、**Rewards Phase 2b** 標為 ✅ Partner QA。