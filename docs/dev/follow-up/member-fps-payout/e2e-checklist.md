# Member FPS Pipeline — Partner E2E（精簡版）

> **適用：** staging · 新鑑定單 `escrow_capture_model = 'single'`（見 [capture-policy.md](../../capture-policy.md)）  
> **Partner 必做：** [PARTNER_QA.md](../../PARTNER_QA.md) **M6**（4 步 · ~15 min）  
> **Gate 已覆蓋（勿重測）：** `bun run test:integration:fps-payout` — 1A confirm · 1B finalize/candidates · admin 銷帳 · fee SSOT  
> **鑑定入款：** [admin-grading PARTNER_HANDOFF](../admin-grading/PARTNER_HANDOFF.md) · **後端：** [backend.md](./backend.md) · **前端：** [frontend.md](./frontend.md)

---

## 前置（開測前一次過）

- [ ] `bunx supabase db push` 含 **`20260923120000`**（admin FPS 銷帳 RPC）
- [ ] Stripe test mode + webhook（付款後 `authorized`）
- [ ] Seller 已填 **FPS 姓名 + ID**（否則 cron 後為 `pending`，不可銷帳）
- [ ] 測試帳號：Buyer / Seller / Admin（見 PARTNER_QA）

---

## M6 必做四步（與 PARTNER_QA 對齊）

### 6.1 — 付款（single capture 新單）

- [ ] 上架鑑定 listing → Buyer 出價／購買 → **新單** `escrow_capture_model = 'single'`
- [ ] Stripe test 卡付款成功 → `payment_capture_status = authorized`（商品款未 capture）

### 6.2 — Admin 鑑定通過

- [ ] 賣家入庫 → Admin 入庫確認（**不扣商品款**）→ Admin 鑑定 **通過**
- [ ] 預期：一次 full capture → `fully_captured`

### 6.3 — 買家確認收貨（Phase 1A）

- [ ] Admin 出庫物流 → **Buyer** 確認收貨
- [ ] 預期：`seller_payout_status = held`，`payout_hold_until ≈ now + 3 days`

### 6.4 — Admin FPS 銷帳（Phase 1B + Admin）

- [ ] 等 T+3 屆滿（或 staging SQL backdate `payout_hold_until`）→ cron 產生 `payout_requests` **`ready`**
- [ ] Admin `/admin/payouts` → FPS 分頁 → **銷帳**（必填 **FPS 參考**）
- [ ] 預期：`payout_requests.completed`；訂單 `seller_payout_status = paid`；賣家詳情「已撥款」

---

## Gate 已覆蓋（Partner 勿重測）

| 項目 | 自動化 |
|------|--------|
| `rpc_confirm_buyer_received` → held + T+3 | `member-fps-pipeline.integration.test.ts` |
| `rpc_list_member_fps_payout_ready_candidates` | 同上 |
| `rpc_finalize_member_fps_payout_ready` + fee snapshot | `fps-payout-fee.integration.test.ts` |
| pending / frozen / batch / 無 FPS 參考 | `admin-fps-payout-mutations.integration.test.ts` |
| FPS 收集 Dialog（1C） | 可獨立於 Stripe 驗；非 M6 必做 |

---

## SQL 抽查（可選）

```sql
-- 訂單 + 出款狀態
SELECT id, order_number, escrow_capture_model, payment_capture_status,
       seller_payout_status, payout_hold_until, buyer_confirmed_at
FROM member_orders WHERE id = '<order_id>';

-- FPS 提現單
SELECT id, status, amount, gross_payout_hkd, fps_transfer_fee_hkd, admin_fps_reference
FROM payout_requests WHERE order_id = '<order_id>';
```

---

## Dev 驗證

```bash
bun run test:integration:fps-payout    # prelaunch 1a 已含
bun run test:fps-payout:gate             # 獨立 full gate（含 env check + lint + build:ci）
```
