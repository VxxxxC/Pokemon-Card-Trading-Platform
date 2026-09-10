# Auth Escrow v2 — Phase D（Rewards on Auth）

> **Status:** ✅ Implemented — gate ✅ · **Partner QA** P0–P2 ✅ ([PARTNER_QA.md](./PARTNER_QA.md))  
> **Unlocks:** Platform Rewards Phase 2b (`merchant_auth` + `merchant_direct` 鑑定開關用券)

## 目標

鑑定 checkout 在**有券**時仍使用 Auth Escrow v2 四行金額契約（inbound/outbound、`shipping_fee=0`、single capture），而非 legacy `shipping_fee` + multicapture 語意。

**MVP 範圍：** Merchant 鑑定 checkout only。  
**Out of scope：** `member_auth` 用券、新券種、`percent_off`、積分商城。

---

## P0 — `escrow_capture_model`（必須一併修）

`20260901140000` 內：

```sql
v_use_v2_auth_amounts := COALESCE(p_use_auth, false) AND p_user_reward_id IS NULL;
v_escrow_capture_model := CASE WHEN v_use_v2_auth_amounts THEN 'single' ELSE NULL END;
```

**auth + 有券 → DB `escrow_capture_model = NULL`**，會令 admin grading / pass capture / fail saga 走 legacy multicapture（讀 DB，唔係 Stripe PI metadata）。

**Phase D 定案：**

```sql
v_escrow_capture_model := CASE WHEN COALESCE(p_use_auth, false) THEN 'single' ELSE NULL END;
```

有冇券，`p_use_auth=true` 都必須寫入 `'single'`。

**驗收：** prepare 後 `requires_authentication=true` 且有用券 → `escrow_capture_model='single'`。

---

## 核心 Bug（金額）

有券時 `v_use_v2_auth_amounts=false` → legacy `total = item + shipping_fee + auth`；免運券還把 `shipping_fee` 設成商戶報價 SF；唔寫 inbound/outbound。

---

## v2 金額契約

| 欄位 | 公式 |
|------|------|
| `total_amount` | `fn_compute_auth_escrow_amounts(item).total_amount` |
| `shipping_fee` | **0** |
| `inbound_shipping_fee` / `outbound_shipping_fee` | 來自 `fn_compute_auth_escrow_amounts` |
| `platform_subsidy_amount` | 見下表 |
| `buyer_total_amount` | `total_amount − platform_subsidy_amount` |
| Stripe PI | `buyer_total_amount`（single authorize） |
| `escrow_capture_model` | `p_use_auth` → `'single'` |

### 券類型補貼

| 券 | `platform_subsidy_amount` |
|----|---------------------------|
| `discount_coupon` | `LEAST(amount_hkd, item_subtotal)` |
| `free_shipping` | `LEAST(outbound_shipping_fee, max_subsidy_hkd)`，基數 = `fn_platform_auth_sf_leg_fee()`，**唔用** `fn_merchant_checkout_shipping_fee` |

賣家 payout 仍按 gross（item − commission + inbound）；平台補貼由平台承擔。

---

## 實作

### Migration

`supabase/migrations/20260910100000_auth_escrow_phase_d_coupons.sql`

1. **`fn_compute_platform_subsidy`** — auth + `free_shipping` 用 outbound leg；非 auth 路徑不變  
2. **`rpc_list_checkout_eligible_coupons`** — auth preview 用 outbound leg  
3. **`rpc_prepare_merchant_order_payment`** — 以 `20260901140000` 為底：auth 永遠 v2 amounts + `escrow_capture_model='single'`；刪除 coupon legacy gate

```bash
bun run test:auth-escrow:gate
```

或分開：

```bash
bun run test:integration:rewards
bun run test:e2e:auth-escrow   # B2b only
```

### Frontend（輕量）

- `compute-pricing.ts` / `CheckoutClient.tsx` — preview 依 RPC `preview_subsidy`（權威仍係 prepare）

### E2E

- 取消 `platform-rewards-phase2.spec.ts` B2b.1 / B2b.2 skip  
- 擴 `getMerchantOrderCouponSnapshot`：`shipping_fee`, `inbound/outbound`, `escrow_capture_model`  
- B2b.1 / B2b.2 驗 v2 snapshot + `escrow_capture_model='single'`

### 文檔

- 本檔、`backend.md`、`plan.md`、**[PARTNER_QA.md](./PARTNER_QA.md)**、`platform-rewards-v2/backend.md`、`QA_CHECKLIST.md` D2、`INTEGRATION_QUEUE.md`

---

## 驗證 SQL

```sql
SELECT requires_authentication,
       escrow_capture_model,
       shipping_fee,
       inbound_shipping_fee,
       outbound_shipping_fee,
       total_amount,
       platform_subsidy_amount,
       buyer_total_amount,
       total_amount - platform_subsidy_amount AS buyer_check
FROM merchant_orders
WHERE id = '<order_id>';
```

預期：`escrow_capture_model='single'`，`shipping_fee=0`，`buyer_check = buyer_total_amount`；免運時 `platform_subsidy_amount <= outbound_shipping_fee`。

---

## 風險

| 項目 | 處理 |
|------|------|
| PI metadata vs DB split-brain | 修 DB `escrow_capture_model`（P0） |
| `member_auth` 用券 | defer |
| 補貼單 payout > buyer_total | Phase 2 已有守衛；回歸一單 |
| Legacy multicapture RPC | 不 patch（新單一律 single） |
