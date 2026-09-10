# Merchant Checkout — 平台 Stripe 收款與 Connect 撥款（Milestone 1–2）

> B2C 商戶訂單真實收款：買家全額付款 → 資金 100% 入**平台** Stripe 帳戶託管 → webhook 確認後 `payment_held`。
> 買家確認收貨後，以 separate charge + transfer 將卡價扣平台佣金（`platform_settings` SSOT，每單 confirm 時 snapshot）及買家支付運費撥至 Merchant Connect；鑑定費全數留平台。

## 1. 託管狀態機

**鑑定單（`requires_authentication = true`）：**

```
pending_payment ──▶ payment_held ──▶ authenticating ──▶ authenticated ──▶ completed_and_transferred
```

**非鑑定直寄（`requires_authentication = false`）：**

```
pending_payment ──▶ payment_held ──▶ shipped ──▶ buyer confirm ──▶ held (T+7) ──▶ completed_and_transferred
                      （Stripe 收款）  （商戶發貨）   （無 Stripe）      （cron transfer）
```

面交：`payment_held` 即可買家確認（P2P-aligned），其後同 T+7 hold → cron transfer。

- 訂單成立（接受出價 / 立即購買）→ `pending_payment`
- `payment_intent.succeeded` webhook → `payment_held`（非鑑定 automatic）；鑑定單 `capture_mode=manual` 時改由 `amount_capturable_updated` → `authorized`
- 非鑑定：`rpc_submit_merchant_direct_fulfillment`（SF 單號 / 面交確認）→ `shipped`；買家確認收貨需 `escrow_status = shipped`
- `rpc_prepare_merchant_order_payout` 的 allowed-from **不含** `pending_payment`；非鑑定分支需 `shipped`（鑑定分支仍為 `authenticated`）
- `getMerchantSellerActionFlags().canSubmitLogistics` = auth inbound at `payment_held`；`canSubmitDirectFulfillment` = non-auth at `payment_held`

## 2. Migrations

| 檔案 | 內容 |
|------|------|
| `20260729100000_escrow_state_pending_payment.sql` | `escrow_state` 新增 `pending_payment`（PostgreSQL 不允許同一 transaction 內新增並使用 enum 值，故單獨一檔） |
| `20260729110000_merchant_order_stripe_payment.sql` | `merchant_orders` 金額明細欄位；`rpc_accept_offer` merchant 分支改 `pending_payment`；新 `rpc_buy_now_merchant_listing`；新 `rpc_mark_merchant_order_paid` |
| `20260729120000_merchant_order_payment_prepare.sql` | `fn_merchant_checkout_shipping_fee` / `fn_merchant_checkout_auth_fee`；`rpc_prepare_merchant_order_payment`；`rpc_attach_merchant_order_payment_intent` |
| `20260729130000_merchant_trading_pending_payment_facets.sql` | `fn_merchant_order_is_open` 納入 `pending_payment`；新 `fn_merchant_order_is_payment_stage`；重建 `search_merchant_trading_orders` facets |
| `20260729180000_merchant_connect_payout.sql` | payout snapshot 欄位與唯一索引；prepare/finalize/failed RPC；撤銷舊 completion bypass |
| `20260730100000_escrow_p0_manual_capture.sql` | `payment_capture_status`；鑑定單 `capture_method: manual` + partial auth_fee capture |
| `20260731120000_merchant_pending_payment_expiry.sql` | 48h `pending_payment` 逾時 RPC + `fn_merchant_order_needs_seller_action` auth inbound only |
| `20260803120000_escrow_state_shipped.sql` | `escrow_state` 新增 `shipped` |
| `20260803120100_merchant_direct_shipped.sql` | `rpc_submit_merchant_direct_fulfillment`；非鑑定 payout gate 改 `shipped`；重建 trading search facets |
| `20260803120500_merchant_shipping_fees.sql` | `merchant_shops.base_courier_shipping_fee`；`listings.extra_shipping_fee`；`fn_merchant_checkout_shipping_fee(method, merchant_id, listing_id)` |
| `20260803120800_merchant_meetup_buyer_confirm.sql` | Meetup buyer confirm at `payment_held` |
| `20260804120000_merchant_connect_payout_t7_hold.sql` | `payout_hold_until`；`rpc_confirm_merchant_buyer_receipt`；prepare 改 service_role + held gate；cron list RPC |
| `20260830120000_merchant_coupon_reserve_hardening.sql` | `user_rewards.reserved_at`；`fn_reserve_user_reward_for_merchant_order`；prepare 原子預留；`rpc_mark_merchant_order_paid` 過期/reserve 驗證；15m stale reserve cron RPCs；E2E seed/backdate helpers |
| `20260831120000_rewards_security_hardening.sql` | R-01 column UPDATE grant；R-02 `get_reward_coupon_center` 歸屬檢查；R-03 `fn_release_merchant_order_coupon` 僅 service_role |

### 運費模型（商戶自定）

| 欄位 | 表 | 說明 |
|------|-----|------|
| `base_courier_shipping_fee` | `merchant_shops` | 店舖統一快遞運費，預設 `30`，範圍 `0..500` |
| `extra_shipping_fee` | `listings` | 單件商品附加運費（merchant persona），預設 `0`，範圍 `0..200` |

結帳快遞運費：`fn_merchant_checkout_shipping_fee('sf', merchant_id, listing_id)` → base + extra（總額 ≤ 999）；面交為 `0`。金額由 `rpc_prepare_merchant_order_payment` 寫入 `merchant_orders.shipping_fee`，client 不可傳入。

### `merchant_orders` 新欄位

| 欄位 | 說明 |
|------|------|
| `item_subtotal` | 商品成交價（= `final_price`） |
| `shipping_fee` | 快遞運費（`base_courier_shipping_fee` + `extra_shipping_fee`；面交 `0`），`NOT NULL DEFAULT 0` |
| `auth_fee` | 鑑定費（`150` / `0`），`NOT NULL DEFAULT 0` |
| `shipping_method` | `'sf'` \| `'meetup'` |
| `total_amount` | 託管總額 = 三者之和 |
| `paid_at` | webhook 確認收款時間 |
| `stripe_payment_intent_id` | 既有欄位，本階段開始實際使用（partial index） |
| `commission_rate_applied` / `commission_amount` | 買家確認收貨時 snapshot（費率來自 `platform_settings.platform_financial_config`） |
| `merchant_payout_amount` | `item_subtotal - commission + shipping_fee` |
| `stripe_transfer_id` / `stripe_destination_account_id` | Connect transfer 對帳資料 |
| `buyer_confirmed_at` / `payout_status` | 買家確認及 `pending/held/processing/paid/failed/frozen` saga 狀態 |
| `payout_hold_until` | T+7 售後保留期滿時間（cron transfer gate） |
| `payout_attempted_at` / `transferred_at` / `payout_error` | 撥款稽核及安全化錯誤 |
| `sf_locker_code` / `sf_address` / `buyer_phone` | 快遞交收資料（`shipping_method = 'sf'` 時由 prepare RPC 寫入） |
| `meetup_detail` | 面交備註（`shipping_method = 'meetup'`） |
| `buyer_remark` | 買家給賣家的交割備註（可選） |

舊有 `payment_held` 訂單已回填 `item_subtotal` / `total_amount` = `final_price`。

## 3. RPC 契約

### `rpc_buy_now_merchant_listing(p_listing_id, p_buyer_id, p_use_auth)`
`SECURITY DEFINER` · `authenticated`。立即購買 = 以賣家開價建立 `offers`（`status='accepted'`）+ `merchant_orders`（`pending_payment`）+ 鎖 listing `inactive` + chat `SYSTEM_OFFER_ACCEPTED`。
Fail-closed：`auth.uid() = p_buyer_id`、listing 必須 `active` + `seller_persona='merchant'`、非自售、鑑定加購需賣家開放。
回傳 `{ order, order_kind: 'merchant', offer_id, message_id }`。

### `rpc_prepare_merchant_order_payment(p_order_id, p_shipping_method, p_use_auth, p_sf_locker_code?, p_sf_address?, p_buyer_phone?, p_meetup_detail?, p_buyer_remark?)`
`SECURITY DEFINER` · `authenticated`。**DB 為金額真理源**：由 SQL 常數算運費 / 鑑定費並寫入訂單，避免 client 或 action 傳入被篡改的總額。
Fail-closed：`auth.uid() = buyer_id`、必須 `pending_payment`、`p_shipping_method ∈ ('sf','meetup')`、鑑定加購需 listing 開放。
- `sf`：`p_sf_locker_code` + `p_buyer_phone` 必填；`p_sf_address` 可選
- `meetup`：`p_meetup_detail` 必填
- `p_buyer_remark` 可選（兩種配送方式皆可）
回傳 `{ order_id, merchant_id, item_subtotal, shipping_fee, auth_fee, total_amount, shipping_method, stripe_payment_intent_id }`。

### `rpc_attach_merchant_order_payment_intent(p_order_id, p_payment_intent_id)`
`SECURITY DEFINER` · `authenticated`。綁定 PaymentIntent（買家本人 + `pending_payment`）。

### `rpc_mark_merchant_order_paid(p_order_id, p_payment_intent_id, p_amounts jsonb)`
`SECURITY DEFINER` · **只授權 `service_role`**（webhook 專用）。
- 只允許 `pending_payment → payment_held`；已處理過回 `{ success: true, already_applied: true }`（webhook 重放安全）
- 訂單已綁定不同 PI 會 raise，攔截錯誤入帳
- 寫 `paid_at` + 金額明細（`p_amounts` 缺欄位則保留 DB 現值）
- Insert `merchant_ledgers`（`transaction_type='escrow_payment'`，同一訂單只插一次）

### Merchant payout RPCs

- `rpc_confirm_merchant_buyer_receipt(p_order_id)`：**authenticated buyer only**；snapshot 佣金／payout；設 `buyer_confirmed_at`、`payout_hold_until = now() + 7 days`、`payout_status = held`；**不 transfer**、**不更新 `escrow_status`**；冪等。
- **UI（方案 A）：** 買家確認後 trading／詳情 **視為交易完成**（`buyer_confirmed_at` 有值 → buyer tab `completed`、timeline `released`）；`escrow_status` 仍 `authenticated` 直至 T+7 cron `rpc_finalize_merchant_order_payout` → `completed_and_transferred`。商戶賣家列表仍留「待處理」tab，badge「款項保留中」。
- `rpc_prepare_merchant_order_payout(p_order_id)`：**service_role / cron only**；需 `held` + hold 到期 + snapshot；設 `processing`；REVOKE `authenticated` execute。
- `rpc_list_merchant_connect_payout_candidates(p_limit)`：cron 揀單。
- `rpc_finalize_merchant_order_payout(...)`：service-role only；核對 transfer 金額／destination，冪等寫 ledger → `completed_and_transferred`。
- `rpc_mark_merchant_order_payout_failed(p_order_id, p_error)`：service-role only；保留 snapshot，記錄可重試失敗。
- `rpc_admin_reset_merchant_connect_payout_retry(p_order_id, p_admin_id)`：service-role only；`failed` → `held`（mirror candidate guards + admin audit）；供 Admin「重試撥款」。
- **P2.5：** `executeMerchantConnectPayout` 在 `finalize_failed` 時亦 call `rpc_mark_merchant_order_payout_failed`，避免卡在 `processing`。

### Server actions / cron

| Action / route | 行為 |
|----------------|------|
| `completeMerchantOrder(orderId)` | 買家確認 → `rpc_confirm_merchant_buyer_receipt` only（無 Stripe） |
| `lib/merchant-order/execute-connect-payout.ts` | prepare → `transfers.create`（idempotency `merchant-order-payout:{orderId}`）→ finalize |
| `GET /api/cron/merchant-connect-payout-ready` | batch 50 held 到期訂單 → `executeMerchantConnectPayout` |

> `merchant_orders` 對 `authenticated` 只開放 `SELECT`（`merchant_orders_participant_read`），所以結帳期間所有寫入都經上述 RPC，唔用 service-role client。

## 4. Server Actions — `app/actions/merchant-checkout.ts`

| Action | 契約 |
|--------|------|
| `buyNowMerchantListing(listingId, useAuth?)` | `{ success: true, data: { orderId, orderNumber, checkoutHref } }`。先驗 listing 為 merchant + `isMerchantPayoutReady()`，再調 `rpc_buy_now_merchant_listing` |
| `loadMerchantCheckoutOrder(orderIdOrNumber)` | 結帳頁快照：金額、`isPayable`、`shippingMethod`、`listingAcceptsAuthentication`、商戶與商品資料 |
| `createMerchantOrderPaymentIntent(orderIdOrNumber, { shippingMethod, useAuth })` | `{ clientSecret, publishableKey, itemSubtotal, shippingFee, authFee, totalAmount }` |
| `getMerchantCheckoutPaymentStatus(orderIdOrNumber)` | `{ escrowStatus, totalAmount, paidAt }`，成功頁輪詢用 |
| `completeMerchantOrder(orderId)` | 買家確認收貨 → `rpc_confirm_merchant_buyer_receipt`；回傳 `{ success }`（**確認後不會即時出現 transfer ID**） |

`createMerchantOrderPaymentIntent` 流程：

1. `isSupabaseConfigured()` + Stripe 設定 guard（缺 env 回結構化錯誤，唔 throw）
2. `resolveMerchantOrderIdForBuyer` 解析 UUID / `ORD-*`，限買家本人
3. 訂單必須 `pending_payment`
4. **Fail-closed**：商戶 `kyc_records` 需通過 `isMerchantPayoutReady()`（verified + charges + payouts）
5. `rpc_prepare_merchant_order_payment` 取得權威金額
6. PaymentIntent：`amount = total_amount × 100`、`currency: 'hkd'`、`automatic_payment_methods`、**無** `application_fee_amount` / `transfer_data`；鑑定單（`useAuth`）設 `capture_method: manual`（新單 single capture at pass；legacy 另設 `request_multicapture: if_available`）— 見 [capture-policy.md](../../capture-policy.md)
7. 已有 PI 則 retrieve：`succeeded` / `processing` 直接擋（防重複收款）；`canceled` 重新建立；其餘 `update` amount
8. `rpc_attach_merchant_order_payment_intent` 回寫 PI id

PaymentIntent `metadata`：`order_kind: 'merchant'`、`order_id`、`order_number`、`buyer_id`、`merchant_id`、`listing_id`、`item_subtotal`、`shipping_fee`、`auth_fee`、`total_amount`、`shipping_method`。

## 5. Webhook — `app/api/stripe/webhook/route.ts`

| 事件 | 動作 |
|------|------|
| `account.updated` | （既有）同步 `kyc_records.stripe_charges_enabled` / `stripe_payouts_enabled` |
| `payment_intent.amount_capturable_updated` | 鑑定單 authorize → `authorized` + `custody` / `payment_held` |
| `payment_intent.succeeded` | 非鑑定 merchant 全額入帳；鑑定 partial auth_fee finalize |
| `payment_intent.canceled` | 鑑定單 void → `payment_capture_status=voided` |
| `payment_intent.payment_failed` | 只 `console.warn` 留痕，訂單維持 `pending_payment` 讓買家重試 |
| `transfer.created` | `metadata.order_kind === 'merchant_payout'` → 冪等 finalize |
| `refund.created` | 鑑定失敗退款 finalize |

事件清單 SSOT：`lib/stripe/webhook-events.ts`。

### 本機 dev

```bash
bun run stripe:webhook:listen
```

將 CLI 印出嘅 `whsec_...` 設入 `.env` 的 `STRIPE_WEBHOOK_SECRET`，另開 terminal 跑 `bun run dev`。

### Dashboard / staging 同步 events

```bash
# 更新帳戶上所有 webhook endpoint 的 enabled_events
bun run stripe:webhook:sync

# 若尚無 endpoint，建立一個（換成你的域名）
bun run stripe:webhook:sync -- --url https://YOUR_DOMAIN/api/stripe/webhook
```

## 6. Env

| 變數 | 用途 | 狀態 |
|------|------|------|
| `STRIPE_SECRET_KEY` | 伺服器 Stripe client | 已有 |
| `STRIPE_WEBHOOK_SECRET` | webhook 簽章驗證 | 已有 |
| **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** | 瀏覽器 `loadStripe()` | **需新增（`pk_test_…`）** |

> `lib/stripe.ts` 於 module 載入即 throw（缺 `STRIPE_SECRET_KEY`），所以有機會被 prerender 求值的模組要經 `lib/stripe/env.ts` 的 `getStripeClient()` lazy import。新 action 已遵守，`bun run build:ci` 通過。

## 7. 如何驗證

```bash
bunx supabase db push
bun run supabase:types
bunx tsc --noEmit && bun run lint && bun run build:ci
bun run stripe:webhook:listen   # 本機；見 lib/stripe/webhook-events.ts
```

驗收流程：

1. 商戶 KYC `verified` + Stripe Connect `charges_enabled` & `payouts_enabled`
2. 買家於 merchant listing 按「立即以 HK$… 購買」→ 訂單 `pending_payment`，listing 轉 `inactive`
3. `/checkout/[orderId]`：選配送 / 鑑定 → 建立 PaymentIntent → Payment Element 用 `4242 4242 4242 4242` 付款
4. Webhook 到達後訂單 `payment_held`、`paid_at` 有值、`merchant_ledgers` 出現一筆 `escrow_payment`
5. 未付款前商戶無「確認訂單並移交保管」CTA，買家無「確認完成」CTA
6. 重送同一 `payment_intent.succeeded` 事件 → `already_applied: true`，`merchant_ledgers` 不重複
7. 買家確認收貨 → Stripe Transfer destination 為商戶 Connect；金額為卡價扣 8% + 運費
8. 訂單 `completed_and_transferred`、`payout_status=paid`，ledger 各只有一筆 `commission_deduction` / `payout`

### 本次已驗證

| 項目 | 結果 |
|------|------|
| `bunx supabase db push` | ✅ `20260729180000_merchant_connect_payout.sql` 已同步 remote |
| `bunx tsc --noEmit` | ✅ 0 error |
| `bun run lint` | ✅ 0 error（既有 warnings） |
| `bun run build:ci` | ✅ 空 Supabase env 下通過，`/checkout/[id]` 與 `/checkout/[id]/success` 皆為 `ƒ` dynamic |
| DB contract | ✅ 100 + 30 + 150 → commission 8、payout 122；非買家拒絕；finalize replay 各一筆 ledger |
| Stripe test transfer | ✅ `pi_3TyXtx…` → `tr_3TyXtx…`，HK$121.08 到 test Connect，重送 idempotency key 得同一 transfer |
| `transfer.created` 簽名 webhook replay | ✅ 200；finalize 已完成時安全回 `already_applied` |

## 8. 非鑑定單 E2E 驗證清單（`useAuth=false`）

前置：`bun run stripe:webhook:listen` + `bun run dev`；商戶 KYC verified + Connect `charges_enabled` & `payouts_enabled`。

| # | 步驟 | 預期 |
|---|------|------|
| 1 | Buy now（**不勾鑑定**） | `pending_payment`，listing `inactive` |
| 2 | `/checkout/[orderId]` → SF/meetup → `4242…` | PI `capture_method=automatic` |
| 3 | Webhook `payment_intent.succeeded` | `payment_held`，`paid_at`，ledger `escrow_payment` ×1 |
| 4 | 商戶 `/profile/merchant/orderDetail/[id]` → SF 填單號或面交確認 | `escrow_status = shipped` |
| 5 | 買家 `/profile/user/trading` → 確認完成 | `completeMerchantOrder`（gate: `shipped`） |
| 6 | Stripe Dashboard | Transfer 至 Connect；金額 = 卡價 − 本單佣金 snapshot + 運費 |
| 7 | DB | `completed_and_transferred`；`commission_deduction` + `payout` ledger 各一筆 |
| 8 | Webhook replay | `already_applied`，無重複 ledger |

> 既有 `payment_held` 非鑑定訂單（migration 前建立）需商戶手動發貨一次才可測買家確認。

> 鑑定單（`useAuth=true`）：新單 single capture — 見 [capture-policy.md](../../capture-policy.md) · [admin-grading PARTNER_HANDOFF](../admin-grading/PARTNER_HANDOFF.md)。

## 10. `pending_payment` 48h 逾時 — 手動驗證（cron）

Cron：`GET /api/cron/expire-merchant-pending-payment`（`vercel.json` 每小時）。RPC：`rpc_list_merchant_pending_payment_expiry_candidates` + `rpc_finalize_merchant_pending_payment_expiry`（migration `20260731120000`）。

前置：`bun run dev`；`.env` 設 `CRON_SECRET`、`SUPABASE_SERVICE_ROLE_KEY`（Stripe PI cancel 為 best-effort）。

| # | 步驟 | 預期 |
|---|------|------|
| 1 | 商戶 listing buy now，**不付款**（勿完成 checkout） | `pending_payment`，listing `inactive` |
| 2 | 記錄 `order_id`、`listing_id` | — |
| 3 | Dev only — backdate 訂單：`UPDATE merchant_orders SET created_at = now() - interval '49 hours' WHERE id = '<uuid>' AND escrow_status = 'pending_payment'` | — |
| 4 | `curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/expire-merchant-pending-payment` | JSON `expired >= 1` |
| 5 | DB | `escrow_status = refunded`；`listings.status = active` |
| 6 | 再跑一次 curl | 冪等，無副作用 |
| 7 | （可選）若曾建立 PI | Stripe PI `canceled` 或已終態 |

## 11. 優惠券預留 FSM（V1–V3）— 手動驗證

Migration：`20260830120000_merchant_coupon_reserve_hardening.sql`

| 機制 | RPC / Cron | 說明 |
|------|------------|------|
| **V1 原子預留** | `fn_reserve_user_reward_for_merchant_order`（由 `rpc_prepare_merchant_order_payment` 呼叫） | 同一券不可同時預留於兩筆 `pending_payment` 訂單 |
| **V2 付款驗券** | `rpc_mark_merchant_order_paid` | `calculated_expiry < now()` 或 reserve 與訂單不符 → 拒絕入帳 |
| **V3 15m 幽靈鎖** | `GET /api/cron/release-stale-coupon-reserves`（`vercel.json` 每 15 分鐘） | `rpc_list_stale_coupon_reserve_candidates` + `rpc_finalize_stale_coupon_reserve`；仍保留 §10 的 48h 訂單逾時作後備 |

Vitest（遠端 DB）：`bun run test:integration:rewards` → `coupon-fsm.integration.test.ts`（I-C2 / I-C3 / I-C4）。

| # | 步驟 | 預期 |
|---|------|------|
| 1 | 兩筆 `pending_payment` 訂單對同一張券各呼叫一次 prepare | 第二筆失敗（無法預留 / 已被其他訂單預留） |
| 2 | prepare 成功後將券 `calculated_expiry` 設為過去，再呼叫 mark_paid | 失敗「已過期」；`is_used` 仍 false |
| 3 | prepare 後 `rpc_e2e_backdate_coupon_reserve(id, 16)` → `rpc_finalize_stale_coupon_reserve` | `reserved_merchant_order_id` 清空；訂單 `coupon_user_reward_id` 清空；券可再次 prepare |

## 12. Security hardening（R-01～R-03）

Migration：`20260831120000_rewards_security_hardening.sql`

| 修復 | 措施 |
|------|------|
| **R-01** | `authenticated` 僅可 `UPDATE user_rewards(acknowledged_at)`；券狀態欄位僅能經 SECURITY DEFINER RPC 變更 |
| **R-02** | `get_reward_coupon_center(p_user_id)` 拒絕非本人且非 admin 的跨用戶查詢 |
| **R-03** | `fn_release_merchant_order_coupon` 僅 `service_role` 可執行（prepare / webhook / cron 內部不受影響） |

Vitest：`coupon-security.integration.test.ts`（I-S1 / I-S2 / I-S3）。

## 13. Webhook 金額交叉驗證（R-04）

| 修復 | 措施 |
|------|------|
| **R-04** | `validateMerchantPaymentIntentAmount`（[`lib/stripe/merchant-payment-intent-guard.ts`](../../../lib/stripe/merchant-payment-intent-guard.ts)）於 `payment_intent.succeeded` 呼叫 `rpc_mark_merchant_order_paid` 前比對 `PI.amount` 與 metadata `buyer_total_amount`；不符則拒絕入帳 |

Vitest：`coupon-webhook.integration.test.ts`（I-P0-1b / I-R04）；unit `tests/unit/stripe/merchant-payment-intent-guard.test.ts`。

## 9. 已知缺口

- ~~`pending_payment` 訂單**無過期 / 取消機制**~~ → `rpc_finalize_merchant_pending_payment_expiry` + cron（見 migration `20260731120000`）
- ~~佣金率暫固定 8%，未接 `platform_settings` / Admin 動態設定~~ → migration **`20260916120000`** + `/admin/settings`；見 [variable-commission](../variable-commission/plan.md)
- ~~優惠券未接後端，checkout 券選單暫時 disabled，總額不折扣~~ → Phase 2 已接駁；見 `test:rewards:gate`
- 收件資料（電話 / 順豐櫃 / 面交備註 / 買家備註）仍只留前端 state，未有 DB 欄位
- Refund / transfer reversal 尚未落地；Member C2C payout 屬另一流程
