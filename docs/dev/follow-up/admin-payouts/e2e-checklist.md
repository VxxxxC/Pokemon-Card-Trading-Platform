# Merchant Connect Payout — Partner E2E（精簡版）

> **適用：** staging · merchant B2C Connect T+7 hold  
> **Partner 必做：** [PARTNER_QA.md](../../PARTNER_QA.md) **M7**（4 步 · ~10 min）  
> **Gate 已覆蓋（勿重測）：** `bun run test:integration:merchant-connect-payout` — held candidate · admin retry RPC · finalize_failed  
> **後端：** [backend.md](./backend.md) · **前端：** [frontend.md](./frontend.md)

---

## 前置（開測前一次過）

- [ ] `bunx supabase db push` 含 **`20260924150000`**
- [ ] `E2E_LISTING_ID` 為 **merchant persona** listing（`seller_persona = 'merchant'`）
- [ ] 該 merchant 已 KYC verified + Stripe Connect **charges/payouts enabled**（否則 buyer confirm 可能 fail）
- [ ] 測試帳號：Buyer / Admin（見 PARTNER_QA）

---

## M7 必做四步（與 PARTNER_QA 對齊）

### 7.1 — Dev seed

- [ ] Dev 跑 `bun run seed:merchant-connect-payout-e2e`
- [ ] 預期：JSON 輸出 `heldOrderId`、`failedOrderId`、兩筆 **`orderNumber`**

### 7.2 — Admin 保留中（T+7）

- [ ] Admin `/admin/payouts` → tab **「💳 商戶流水 (Stripe)」** → chip「保留中（T+7）」
- [ ] 搜尋框輸入 held 的 **`orderNumber`**
- [ ] 預期：見 seeded held 列；撥款時間顯示 **「保留至 …」**（未來 T+7 日期）

### 7.3 — Admin 已失敗 + 重試按鈕

- [ ] chip「已失敗」→ 搜尋 failed 的 **`orderNumber`**
- [ ] 預期：見 seeded failed 列；操作欄有 **重試撥款**

### 7.4 — （可選）重試撥款

- [ ] staging 有 `STRIPE_SECRET_KEY` 時點 **重試撥款**
- [ ] 預期：toast 成功或明確錯誤；唔白屏

---

## Gate 已覆蓋（Partner 勿重測）

| 項目 | 自動化 |
|------|--------|
| Connect payout candidate criteria | `merchant-connect-payout-pipeline.integration.test.ts` M1 |
| Admin reset failed → prepare retry | 同上 M2 / M2b |
| Refund-in-window retry guard | 同上 M3 |
| `finalize_failed` marks `failed` | `execute-connect-payout.test.ts` |

---

## SQL 抽查（可選）

```sql
SELECT id, order_number, payout_status, payout_hold_until, payout_error,
       buyer_confirmed_at, stripe_transfer_id
FROM merchant_orders
WHERE id IN ('<heldOrderId>', '<failedOrderId>');
```

---

## Dev 驗證

```bash
bun run seed:merchant-connect-payout-e2e
bun run test:integration:merchant-connect-payout   # prelaunch 1a 已含
```
