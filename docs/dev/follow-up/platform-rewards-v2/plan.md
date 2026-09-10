# Platform Rewards v2 — Plan（積分 · 折扣 · 免運）

> **Status:** 🟢 Phase 1–4 shipped · Phase 5 in progress  
> **Depends on:** Existing `reward_templates` / `user_rewards` / `point_ledger` (migrations `20260705180000`–`20260705188000`, `20260719150000`–`20260719170000`)  
> **Phase 4:** ✅ 積分兌換區塊嵌入 `/profile/user/rewards`（見 [phase-4-plan.md](./phase-4-plan.md)）  
> **Future v2（計劃中）：** `percent_off` 折扣券、實體禮品 / SKU 物流（見 §10 Future v2）  
> **永久不做（已移出 roadmap）：** `lucky_draw_ticket` 抽獎券、Member C2C `discount_coupon` checkout（見 §10 Cancelled）

## 1. Goals

1. **三種平台獎勵：** `points`、`discount_coupon`（固定金額 `amount_hkd`）、`free_shipping`。
2. **三種取得方式：** 簽到、條件達成（交易宗數等）、限時主動搶。
3. **Admin 可配置：** 活動倒數、領取/使用期限、全站與每人限額、適用範圍（含 merchant 非鑑定免運 + **補貼上限**）。
4. **Checkout 用券：** 折扣與免運共用 **平台補貼 + order snapshot**；佣金仍按原 `item_subtotal` × 8%，不罰商戶。
5. **積分：** 本期作直接發放類型；**積分換領**嵌入 [`/profile/user/rewards`](../../../app/profile/user/rewards/page.tsx) 頁內區塊（見 [phase-4-plan.md §Member UI](./phase-4-plan.md#member-ui--pointsredemptionsection) — 無獨立商城頁）。

### Design principles

| Principle | Decision |
|-----------|----------|
| **Template + Campaign** | `reward_templates` = 獎勵定義；`reward_campaigns` = 搶券檔期/庫存（Phase 3） |
| **Catalog, not free JSON** | Admin 表單 → RPC 校驗 → canonical JSON；`trigger_conditions.kind` 擴展需 migration |
| **Points SSOT** | `gamification_stats.points_balance` + `point_ledger`；只經 `fn_apply_point_transaction` |
| **Coupon instances** | `user_rewards`；checkout 用 `is_used` + order snapshot |
| **Platform subsidy** | `platform_subsidy_amount` 記錄平台補貼；商戶 `merchant_payout_amount` snapshot 不因券減少 |
| **One coupon per order** | v1：每單最多一張券（折扣 **或** 免運，不可疊加） |
| **Security** | `reward_templates` 無 client SELECT — RPC / admin service role |

---

## 2. Current state

| Asset | Status |
|-------|--------|
| `reward_templates` | ✅ DB + seed（`points`、`discount_coupon`、`free_shipping`） |
| `user_rewards` | ✅ 發放、dedup、`acknowledged_at` |
| `fn_try_auto_grant_rewards` | ✅ 條件達成自動發 |
| `get_reward_coupon_center` | ✅ wallet + locked catalog |
| `execute_daily_check_in` | ✅ 簽到 PTS 階梯（**獨立於 template**） |
| Checkout 用券 | ❌ 未接；`api.md` 標註優惠券暫不折扣 |
| Admin rewards CRUD | ❌ 僅 migration seed；`/admin/campaigns` 為 mock UI |
| `reward_campaigns` | ❌ 無表 |
| 積分換領商城 | ✅ Phase 4 — `reward_redemption_catalog` + `PointsRedemptionSection` |

### Existing trigger kinds (`trigger_conditions.kind`)

| kind | 用途 |
|------|------|
| `event_once` | `profile_complete`, `first_listing`, `first_chat` |
| `trade_count` | buyer / merchant 成交筆數 |
| ~~`check_in_streak`~~ | **已廢止** — 改用 `/admin/campaigns?tab=check-in`（簽到計劃） |
| ~~`check_in_cycle_day`~~ | **已廢止** — 同上 |

**簽到獎勵：** 每日階梯 + 簽滿 7 日加碼由 `check_in_program` + `execute_daily_check_in` 處理，不再經獎勵活動觸發條件。

### Supported `reward_type` values (v2)

`points` | `discount_coupon` | `free_shipping`

> DB enum 可能仍含 legacy `lucky_draw_ticket` 列 — **不新建、不擴展、不納入產品 roadmap**。

---

## 3. Reward types (admin-defined)

### 3.1 Points (`points`)

| Field | Schema |
|-------|--------|
| `reward_value` | `{ "points": number }` |
| 發放 | `fn_issue_reward_from_template` → `fn_apply_point_transaction` |
| 使用 | 累積餘額；Phase 4 才可兌換 catalog 項目 |

### 3.2 Discount coupon (`discount_coupon`)

| Field | Schema |
|-------|--------|
| `reward_value` | **MVP：** `{ "amount_hkd", "min_spend_hkd"? }` · **Future v2：** `percent_off`, `max_discount_hkd`（見 §10） |
| Checkout | `platform_subsidy_amount` = 折抵額（cap 後） |
| 佣金 | 仍按 **原** `item_subtotal` × 8% |
| Checkout 範圍 | **僅 merchant** 路徑（`merchant_direct` / `merchant_auth`）；Member C2C 折扣券 **不做** |

### 3.3 Free shipping (`free_shipping`)

| Field | Schema |
|-------|--------|
| `reward_value` | `{ "max_subsidy_hkd": number, "min_spend_hkd"?: number }` |
| Checkout | `platform_subsidy_amount` = `min(shipping_fee_snapshot, max_subsidy_hkd)` |
| 適用 | **必須** `shipping_method = 'sf'`；面交運費已為 0 |
| 範圍 | **含 merchant 非鑑定**；admin 設補貼上限防運費套利 |

**與折扣券同一套補貼框架：**

```text
buyer_total       = item_subtotal + shipping_fee + auth_fee - platform_subsidy_amount
merchant_payout   = item_subtotal - commission + shipping_fee   （不因平台券減少）
commission        = item_subtotal × 8%
platform_subsidy  = discount 金額 或 min(shipping_fee, max_subsidy_hkd)
```

---

## 4. Acquisition modes（三種取得方式）

| Mode | User action | System |
|------|-------------|--------|
| **簽到** | 點簽到 | `execute_daily_check_in` + 可選 template auto-grant |
| **條件達成** | 被動 | 事件後 `fn_try_auto_grant_rewards`（訂單完成、profile 完成等） |
| **限時搶** | 主動「搶」 | `rpc_claim_flash_reward(campaign_id)` 原子扣庫存（Phase 3） |

| `distribution_mode` (template) | 說明 |
|--------------------------------|------|
| `auto_grant` | 條件滿足即發（預設） |
| `manual_claim` | 達標後用戶手動領（v2 可選） |
| `flash_only` | 只可經 campaign 搶，不自動發 |

---

## 5. Admin controls

### 5.1 Two time windows（必須分開）

| Type | Meaning | Fields |
|------|---------|--------|
| **活動期** | 何時可搶 / 可解鎖 | `reward_campaigns.starts_at` / `ends_at` |
| **使用期** | 領到後幾時前要用 | `valid_duration_days` 或 `fixed_expiry_date` → `user_rewards.calculated_expiry` |

### 5.2 Quota dimensions

| Dimension | Mechanism |
|-----------|-----------|
| 全站總量 | `reward_templates.max_claims` / `claimed_count` |
| Campaign 場次庫存 | `reward_campaigns.max_claims` / `claimed_count`（搶券） |
| 每人終身 | `user_rewards.grant_dedup_key = 'lifetime'` |
| 每人每週期 | `once_per_cycle` + cycle key（簽到已有） |
| 每人每日搶 | `reward_campaigns.max_claims_per_user` |

### 5.3 Applicability (`restrictions`)

| Field | Purpose |
|-------|---------|
| `order_kinds` | `merchant`（商戶 checkout）；`member` 僅 Phase 5 **免運券**（`member_auth`），**不含** C2C 折扣券 |
| `requires_authentication` | `true` / `false` / `any` |
| `shipping_methods` | `['sf']`（免運必填） |
| `min_item_subtotal_hkd` | 滿額門檻 |
| `funded_by` | v1 固定 `platform` |

### 5.4 Template lifecycle

`draft` → `active` → `archived`；變更寫 `reward_template_audits`。

---

## 6. Checkout & Stripe (merchant B2C)

### 6.1 Order snapshot fields (`merchant_orders`)

| Column | Purpose |
|--------|---------|
| `coupon_user_reward_id` | 使用的 `user_rewards.id` |
| `coupon_type` | `discount_coupon` / `free_shipping` |
| `platform_subsidy_amount` | 平台補貼總額 |
| `buyer_total_amount` | 折後買家應付（PI amount） |
| `merchant_payout_amount` | 撥款 snapshot（prepare payout 時鎖定） |
| `commission_amount` | 仍按原 item 8% |

### 6.2 Flow

1. `rpc_prepare_merchant_order_payment(..., p_user_reward_id)` — 驗證券、計 subsidy、寫 snapshot（**Phase 2：僅非鑑定**；`p_use_auth` reject）。
2. Stripe PI `amount` = `buyer_total_amount`（automatic capture）。
3. Prepare 預留：`user_rewards.reserved_merchant_order_id`（**唔** set `is_used`）；換券時 release 舊券。
4. 付款成功 → `is_used = true`, `used_at = now()`；`pending_payment` 取消/過期 → release。
5. T+7 `transfers.create(merchant_payout_amount)` — §6.3 策略。

### 6.3 Stripe guard（非鑑定免運必做）

當 `buyer_total < merchant_payout_amount`（小單 + 高運費 + 補貼）時，`source_transaction` transfer 可能失敗。

**Phase 2 定案（merchant_direct only）：**

1. `max_subsidy_hkd` cap（admin 已要求）；
2. 若 `merchant_payout_amount <= amount_received`：transfer 綁 `source_transaction`；
3. 若 `merchant_payout_amount > amount_received`：**單筆** transfer 全額 `merchant_payout_amount`，**不綁** `source_transaction`（平台 Stripe balance 補差）；唔拆分多筆（避免與 `rpc_finalize_merchant_order_payout` 單 transfer 驗證衝突）。

**Phase 2 不做：** 鑑定 multicapture 用券（見 Phase 2b）。

### 6.4 Refund / grading fail

| Scenario | Coupon |
|----------|--------|
| `pending_payment` 取消 / 過期 | `fn_release_merchant_order_coupon`：清 `reserved_merchant_order_id`（**唔**依賴 `is_used` 預留） |
| 鑑定 fail 全額 void PI | **退回**券可用（Phase 2b；audit） |
| 已 capture 後退款 | 券不退回（v1） |

---

## 7. Data model (new / extended)

### 7.1 Extend `reward_templates`

| Column | Notes |
|--------|-------|
| `distribution_mode` | `auto_grant` \| `manual_claim` \| `flash_only` |
| `status` | `draft` \| `active` \| `archived` |
| `restrictions` | JSONB — §5.3 |
| `reward_value.max_subsidy_hkd` | 免運 admin 補貼上限 |

### 7.2 New `reward_campaigns` (Phase 3)

| Column | Notes |
|--------|-------|
| `template_id` | FK |
| `name`, `status` | 活動名 |
| `starts_at`, `ends_at` | 搶券倒數 |
| `max_claims`, `claimed_count` | 場次庫存 |
| `max_claims_per_user` | 每人限搶 |
| `override_valid_days` | 可覆寫領取後有效期 |

### 7.3 New `reward_campaign_claims` (Phase 3)

`campaign_id`, `user_id`, `user_reward_id`, `claimed_at` — 稽核 + 防重。

### 7.4 New `reward_template_audits`

`template_id`, `admin_id`, `diff`, `created_at`.

### 7.5 Phase 4 — `reward_redemption_catalog`

`template_id`, `points_cost`, `stock`, `is_active` — 積分換領用。

---

## 8. RPC / actions (target)

| RPC / action | Phase | Role |
|--------------|-------|------|
| `rpc_admin_upsert_reward_template` | 1 | Admin CRUD + validate |
| `rpc_admin_upsert_reward_campaign` | 3 | Campaign CRUD |
| `fn_compute_platform_subsidy(order, user_reward)` | 2 | 折扣 / 免運統一計算（非鑑定） |
| `rpc_prepare_merchant_order_payment` + coupon | 2 | 寫 snapshot + PI amount |
| `rpc_prepare_merchant_order_payment` + coupon（鑑定） | 2b | multicapture 金額調整 |
| `rpc_claim_flash_reward` | 3 | 原子搶券 |
| `rpc_redeem_points_catalog_item` | 4 | 積分換領 |

Existing to keep: `fn_try_auto_grant_rewards`, `get_reward_coupon_center`, `execute_daily_check_in`, `fn_grant_points_from_template`.

---

## 9. UI touchpoints

| Surface | Phase | Notes |
|---------|-------|-------|
| `/admin/rewards` or wire `/admin/campaigns` | 1–3 | Template + campaign CRUD |
| `/profile/user/rewards` | 1–3 | 搶券區、倒數、wallet |
| Merchant checkout wizard（`merchant_direct` 非鑑定） | 2 | 選券、補貼明細 |
| Merchant checkout wizard（`merchant_auth` 鑑定） | 2b | 選券 + multicapture 金額調整 |
| `/profile/user/rewards` 積分商城 section（Flash 下方） | 4 | 積分換領 |

---

## 10. Implementation phases

### Phase 1 — Admin templates + 條件發放（MVP）

**Goal:** Admin 建三類 template；條件類延續 auto-grant；無 checkout、無搶券。

- [ ] Migration: extend `reward_templates`, `reward_template_audits`, `restrictions`, `status`
- [ ] `rpc_admin_upsert_reward_template` + Zod/DB validate
- [ ] Admin UI: template wizard（type、reward_value、trigger、limits、restrictions）
- [ ] Member: locked catalog 顯示新 template（既有 RPC）
- [ ] Docs: `backend.md`, `frontend.md`, `INTEGRATION_QUEUE.md`

**Acceptance:** Admin 發布免運 template `max_subsidy_hkd=30`；profile 完成自動發 HK$2 券仍正常。

---

### Phase 2 — Checkout 用券（僅非鑑定 `merchant_direct`）

**Goal:** 非鑑定 Merchant B2C checkout（automatic capture）可用折扣 + 免運券；平台補貼；admin cap。

**Scope:**

- ✅ `merchant_direct`，`requires_authentication = false`，SF 運費 > 0 時可用免運
- ✅ Phase 2b：`merchant_direct` + 鑑定開關 ON → picker **仍顯示**，`useAuth: true` 重載列表，切換時清空選券（E2E B3.1）
- ❌ 在 **未**開啟鑑定開關的直發單誤傳 `p_use_auth=true` + 券 → prepare 應 reject（舊 B3.2 路徑）
- 券預留：`user_rewards.reserved_merchant_order_id` only（prepare **唔** set `is_used`）
- Payout：§6.3 定案（payout > charge 時單筆無 `source_transaction` transfer）

- [ ] Migration: `merchant_orders` coupon snapshot + `user_rewards.reserved_merchant_order_id`
- [ ] `fn_compute_platform_subsidy` + `rpc_list_checkout_eligible_coupons`
- [ ] Patch `rpc_prepare_merchant_order_payment`（`p_user_reward_id`、換券 release、非鑑定 gate）
- [ ] Stripe PI = `buyer_total_amount`；webhook paid / canceled / expiry release
- [ ] Payout + ledger 改用 `buyer_total_amount` 對账
- [ ] Checkout UI：`MerchantDirectReview` + coupon picker
- [ ] Admin wizard refactor（Step 1–3，Step 3 placeholder）
- [ ] E2E: 非鑑定 $100 + $45 運費、cap $30 → 買家少付 $30、payout 不變

**Acceptance:** 報表可查 `platform_subsidy_amount`；鑑定單無法用券；`bun run build:ci` 通過。

#### Phase 2 implementation checklist（開工前必讀）

**金額語意**

- [ ] 無券訂單：`buyer_total_amount = total_amount`（或 NULL + 全鏈 `COALESCE(buyer_total_amount, total_amount)`）
- [ ] `total_amount` 永遠 gross；PI / ledger `escrow_payment` 用 `buyer_total_amount`
- [ ] `merchant_payout_amount` 仍按 gross `item_subtotal + shipping`（confirm receipt 時 snapshot）

**鑑定路徑（Phase 2b）**

- [x] `merchant_auth` variant（訂單已 `requires_authentication`）— 顯示 picker，`useAuth: true`（E2E B2b）
- [x] `merchant_direct` + `authServiceEnabled` — picker **仍顯示**；切換時清空選券並以 `useAuth: true` 重載（E2E B3.1）
- [ ] 誤傳 `p_user_reward_id` + `p_use_auth=true` 而 listing/訂單未開鑑定 → RPC 錯誤，唔 silent ignore

**券生命週期**

- [ ] Prepare：**只** `reserved_merchant_order_id`；**禁止** `is_used=true` 預留
- [ ] 換券 / 取消券：prepare 開頭 `fn_release_merchant_order_coupon` 舊券
- [ ] Paid webhook：`is_used=true`, `used_at=now()`
- [ ] Canceled PI（非 manual）+ 48h expiry → release
- [ ] `FOR UPDATE` on `user_rewards` when reserving

**Eligible RPC 與 prepare SSOT**

- [ ] `rpc_list_checkout_eligible_coupons` 運費用 **`fn_merchant_checkout_shipping_fee`**（同 prepare），唔可以只睇 `p_shipping_method`
- [ ] Enforce `restrictions.min_item_subtotal_hkd`、`requires_authentication`（`false`/`any` only for Phase 2）、`order_kinds` 含 `merchant`
- [ ] 免運：`shipping_fee > 0` 且 SF；面交 ineligible

**Payout / Stripe（三處同步 `buyer_total`）**

- [ ] `rpc_prepare_merchant_order_payment` return payload
- [ ] `lib/merchant-order/parse-merchant-payout-preparation.ts` — PI 對账用 `buyer_total_amount`
- [ ] `lib/merchant-order/execute-connect-payout.ts` — `amount_received` vs `buyer_total`；`payout > charge` 時無 `source_transaction`
- [ ] Patch **`rpc_confirm_merchant_buyer_receipt`** 同 **`rpc_prepare_merchant_order_payout`** 兩邊 guard（唔只改一個）
- [ ] 營運：平台 Stripe balance 足夠 cover `merchant_payout - amount_received` 差額

**UI / 顯示**

- [ ] `orders.ts` / trading / order detail：買家實付 `buyer_total_amount ?? total_amount`
- [ ] Client `compute-pricing` 預覽標註非權威；運費 / 鑑定 toggle 變更 → refresh eligible + clear 免運券

---

### Phase 2b — Checkout 用券（鑑定 `merchant_auth`）

**Goal:** 鑑定加購訂單支援折扣（及日後免運若 outbound 運費入帳）；multicapture 金額與補貼一致。

- [ ] Patch `rpc_prepare_goods_capture` / auth fee capture 讀 `platform_subsidy_amount`
- [ ] 鑑定 fail void 退券（§6.4）
- [ ] `AuthEscrowReview` / 鑑定 checkout 接 coupon picker
- [ ] `requires_authentication` restrictions 完整 enforcement

**Defer reason:** multicapture authorize 總額 ≠ 分段 capture 目標；Phase 2 先 ship 非鑑定降低風險。

---

### Phase 3 — 限時搶 + Campaign admin

**Goal:** 倒數搶、場次庫存、每人限搶。

- [ ] `reward_campaigns`, `reward_campaign_claims`
- [ ] `rpc_claim_flash_reward`（原子 `claimed_count`）
- [ ] Admin campaign CRUD + 預覽
- [ ] Member 搶券 UI + 倒數

**Acceptance:** 100 張搶完即停；同 user 超每日上限被拒。

---

### Phase 4 — 積分商城（嵌入獎勵頁）✅

**Goal:** 會員 persona 用積分兌換 `discount_coupon` / `free_shipping`（無新 route）。

**詳細實作計劃：** [phase-4-plan.md](./phase-4-plan.md) — **Partner QA Part G ✅ 2026-08-09**

- [x] `reward_redemption_catalog`
- [x] `rpc_list_points_redemption_catalog` + `rpc_redeem_points_catalog_item` → `fn_redeem_member_points` + `fn_issue_reward_from_template` + 扣 stock
- [x] Admin「新增積分商城商品」分離 flow
- [x] `/profile/user/rewards` → `PointsRedemptionSection`（Flash 下方、折價券中心上方）

---

### Phase 5 — Member Auth 免運券

**Goal:** C2C 鑑定託管 checkout 使用平台免運券（僅 `free_shipping`）；賣家 FPS 仍收 `final_price`（Member **無** commission）。

**詳細實作計劃：** [phase-5-plan.md](./phase-5-plan.md)

- [ ] `member_orders` 券 snapshot + `reserved_member_order_id`
- [ ] 泛化 `fn_compute_platform_subsidy` / list / prepare / release / restore（member）
- [ ] `member_auth` checkout picker + authorize `is_used` 修復
- [ ] Partner QA Part F

### Phase 5b — Hardening (optional)

- 平台補貼成本 admin 報表
- `manual_claim` 條件獎勵
- 爭議單人工處理券狀態

### Future v2（計劃中，未排期）

| 項目 | 說明 |
|------|------|
| **`percent_off` 折扣券** | 擴展 `discount_coupon` `reward_value` + checkout subsidy 計算 + Admin 表單 |
| **實體禮品 / SKU 物流** | Catalog `kind = physical_sku`、收貨地址、庫存 / 出貨狀態（見 [phase-4-plan.md §v2 goods](./phase-4-plan.md#v2-physical-goods--deferred)） |

### Cancelled（永久不做，已移出 roadmap）

| 項目 | 原因 |
|------|------|
| **`lucky_draw_ticket` 抽獎券** | 香港牌照風險；不實作、不擴展 |
| **Member C2C `discount_coupon` checkout** | 產品定案：C2C 鑑定單僅支援免運（Phase 5）；折扣券僅 merchant 路徑 |

---

## 11. Risks

| Risk | Mitigation |
|------|------------|
| 非鑑定小單 `transfer > charge` | cap + transfer 策略 §6.3 |
| 商戶抬高 `base_courier_shipping_fee` | `max_subsidy_hkd` + 監察 |
| 搶券超賣 | Campaign 原子 `UPDATE … WHERE stock > 0` |
| 積分雙寫 | 只經 `fn_apply_point_transaction` |
| Admin 亂配 JSON | RPC validate + draft 發布 |

---

## 12. Related docs

| Doc | Link |
|-----|------|
| Member rewards (current) | [member-rewards-gamification/backend.md](../member-rewards-gamification/backend.md) |
| Merchant checkout / payout | [merchant-checkout/backend.md](../merchant-checkout/backend.md) |
| Escrow policy | [escrow-payment-policy.md](../../escrow-payment-policy.md) |
| API | [api.md](../../api.md) |

---

## 13. Changelog

| Date | Change |
|------|--------|
| 2026-07-29 | Initial plan — 三類獎勵、Template+Campaign、checkout 補貼、Phase 1–4 |
| 2026-08-04 | Phase 2 收窄為僅 `merchant_direct` 非鑑定；新增 Phase 2b；§6.3 payout 定案；券預留 `reserved_merchant_order_id`；§6.4 + Phase 2 implementation checklist |
| 2026-08-09 | Roadmap：Future v2 = `percent_off` + 實體禮品；Cancelled = 抽獎券 + Member C2C 折扣券 |
