# 資料庫架構與查詢 TODO 追蹤器（PostgreSQL DDL 與 RLS）

> 本文件為 HKCardVault 由前端沙盒過渡至 Supabase 生產環境的 **資料庫單一真理源 (SSOT)**。
> 所有 DDL、ENUM、外鍵約束與 Row-Level Security（RLS）策略，均由前端 state factories 與 custom types 逆向校準而得。
>
> **核心鐵律：**
> 1. **全額付訖 (Full Pay)**：`orders` 表嚴禁出現任何 `deposit_*` / 訂金 / 成數定金欄位。
> 2. **品味字母品相**：`condition` 一律為 `'A' | 'B' | 'C' | 'D'` 四級純字母制。
> 3. **分類分片**：`item_type` 一律為 `'card' | 'box_set'` 雙態 ENUM。
> 4. **Fail-Closed RLS**：策略不明確時一律拒絕。

---

## 0. 前端真理源對照索引 (Source-of-Truth Trace)

| 前端檔案 | 抽取的核心契約 | 對應資料表 |
|----------|----------------|------------|
| `app/lib/types/rbac.ts` | `UserRole = 'USER' \| 'MERCHANT' \| 'ADMIN' \| 'PENDING_MERCHANT'` | `profiles` |
| `app/lib/types/trading.ts` | `OrderStatus`、`STATUS_STEP_INDEX`、`SaleOrder` | `orders` |
| `app/components/shared/AddAssetModal.tsx` | `GlobalAssetPayload`、`itemType`、`selectedGrader/Score/Condition`、6 槽相片 | `listings` / `user_collections` |
| `app/components/merchant/NewListingForm.tsx` | `itemType`、`photos:{url,remark}[6]`、級聯分級 | `listings` |
| `app/store/useHkCardVaultStore.ts` | `Message`、`ChatRoom`、`SpecialTransactionData` | `messages` / `chat_rooms` |
| `app/checkout/[id]/page.tsx` | `[id]` = 訂單 id / `ORD-*`；金額由 `rpc_prepare_merchant_order_payment` 權威計算（優惠券 UI 暫停用） | `merchant_orders` |
| `app/components/market/WishlistTable.tsx` | `WishlistEntry` from `getWishlistEntries` | `product_watchlists` |
| `app/components/rewards/CheckInCard.tsx` | `CHECK_IN_STEPS`（7 日積分階梯） | `gamification_stats` / `point_ledger` |
| `app/store/useUIStore.ts` | `DemoRole = 'GUEST' \| 'USER' \| 'MERCHANT' \| 'ADMIN'` | RLS 角色守衛 |

---

## 1. 列舉型別 (Enumerated Types)

```sql
-- 使用者角色（對齊 app/lib/types/rbac.ts UserRole）
CREATE TYPE user_role AS ENUM ('USER', 'PENDING_MERCHANT', 'MERCHANT', 'ADMIN');

-- 商品分類分片（對齊 AddAssetModal/NewListingForm itemType）
CREATE TYPE item_type AS ENUM ('card', 'box_set');

-- 品相字母分級（對齊 selectedCondition）
CREATE TYPE card_condition AS ENUM ('A', 'B', 'C', 'D');

-- 第三方鑑定機構（對齊 selectedGrader）
CREATE TYPE grader_authority AS ENUM ('RAW', 'PSA', 'CGC', 'BGS', 'ARS', 'OTHER');

-- 商品上架狀態（對齊 ListingStatus）
CREATE TYPE listing_status AS ENUM ('draft', 'active', 'sold', 'pending');

-- 全額託管訂單狀態機（對齊 app/lib/types/trading.ts OrderStatus）
CREATE TYPE escrow_status AS ENUM ('payment', 'custody', 'shipped', 'grading', 'released', 'cancelled');
-- 實作現況：B2C 用 escrow_state（見 §2.4.1），Payment Milestone 1 起首個狀態為
-- 'pending_payment'（訂單已成立、買家未付款），Stripe 收款成功才轉 'payment_held'。

-- 議價要約狀態（對齊 SpecialTransactionData.initialStatus）
CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'rejected', 'countered');

-- 聊天訊息類型（對齊 Message.type / Message.sender）
CREATE TYPE message_type AS ENUM ('text', 'special_transaction');
CREATE TYPE message_sender AS ENUM ('me', 'them', 'system');

-- KYC 申請狀態（對齊 KycStatus）
CREATE TYPE kyc_status AS ENUM ('pending', 'approved', 'rejected');

-- 配送渠道（對齊 checkout shippingType）
CREATE TYPE shipping_method AS ENUM ('sf', 'meetup');
```

---

## 2. 核心資料表 DDL

### 2.1 `profiles` — 使用者主檔（鏡像 `auth.users`）

```sql
CREATE TABLE public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  pkt_id          TEXT UNIQUE NOT NULL,                  -- 對外分享 HKCV-ID（對齊 /profile/[id]）
  display_name    TEXT NOT NULL,
  handle          TEXT UNIQUE NOT NULL,
  avatar_seed     TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  bio             TEXT,
  email           TEXT,
  role            user_role NOT NULL DEFAULT 'USER',     -- 對齊 rbac.ts，新註冊預設 USER
  kyc_status      kyc_status,                            -- NULL = 從未申請
  is_banned       BOOLEAN NOT NULL DEFAULT FALSE,        -- 對齊 admin/users 封禁
  stripe_account_id TEXT,                                -- Stripe Connect Express 戶口
  stripe_connected  BOOLEAN NOT NULL DEFAULT FALSE,
  rating          NUMERIC(3,2) NOT NULL DEFAULT 0.00,    -- 雙向評分均值
  review_count    INTEGER NOT NULL DEFAULT 0,
  level_tier      INTEGER NOT NULL DEFAULT 1,            -- 身份等級（對齊 UserProfile.levelTier）
  xp_current      INTEGER NOT NULL DEFAULT 0,
  xp_required     INTEGER NOT NULL DEFAULT 100,
  -- 積分餘額見 gamification_stats.points_balance（唔放 profiles，避免雙寫）
  shop_name       TEXT,                                  -- MERCHANT 專屬店名（對齊 MerchantProfile.shopName）
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role ON public.profiles (role);
CREATE INDEX idx_profiles_handle ON public.profiles (handle);
```

### 2.1b `gamification_stats` — 簽到 streak + 積分餘額 SSOT

> **實際 migration：** `20260705181000_points_ledger_and_check_in.sql`  
> 可用 PTS **唔** 存於 `profiles`；所有加減經 `fn_apply_point_transaction`。

```sql
CREATE TABLE public.gamification_stats (
  user_id         UUID PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  points_balance  INTEGER NOT NULL DEFAULT 0,   -- 可用餘額（簽到 / 任務 / 模板發放 − 兌換）
  current_streak  INTEGER NOT NULL DEFAULT 0,
  longest_streak  INTEGER NOT NULL DEFAULT 0,
  last_check_in   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.1c `point_ledger` — 積分變動 audit

```sql
CREATE TABLE public.point_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL,              -- 正=入帳，負=扣減
  balance_after   INTEGER NOT NULL,
  source_type     TEXT NOT NULL,                 -- daily_check_in | reward_template | mission_claim | admin_adjust | redemption
  source_ref      UUID,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`user_rewards` 記錄已發放獎勵實例（coupon / points 模板 dedup），**唔** 作積分總帳。

### 2.2 `card_catalog` — 卡牌官方資料快取（TCGdex / JustTCG 回填）

```sql
CREATE TABLE public.card_catalog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type     item_type NOT NULL DEFAULT 'card',       -- 分類分片，杜絕單卡/盒組互相覆寫
  card_number   TEXT NOT NULL,                            -- 例 'sv2a-182'
  name          TEXT NOT NULL,                            -- 例 'Charizard ex SAR (噴火龍)'
  jp_name       TEXT,
  series_set    TEXT,                                     -- 擴充包系列（box_set 以此模糊匹配）
  rarity        TEXT,                                     -- 'SAR' | 'UR' | 'SR' | 'AR' | 'CSR'
  hero_image    TEXT,
  needs_review  BOOLEAN NOT NULL DEFAULT FALSE,           -- 非 API 覆蓋之小眾卡需 Admin 人工複核
  cached_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_type, card_number)                         -- 複合鍵，多分類並發 upsert 互不踐踏
);

CREATE INDEX idx_card_catalog_number ON public.card_catalog (item_type, card_number);
CREATE INDEX idx_card_catalog_search ON public.card_catalog
  USING gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(jp_name,'')));
```

### 2.3 `listings` — 商品上架表（單卡與盒組統一分片）

```sql
CREATE TABLE public.listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  catalog_id      UUID REFERENCES public.card_catalog (id) ON DELETE SET NULL,
  item_type       item_type NOT NULL DEFAULT 'card',       -- 對齊前端 itemType（BOX/SET 徽章）
  name            TEXT NOT NULL,
  card_no         TEXT,                                    -- 單卡編號（box_set 可為 NULL）
  series_set      TEXT,
  rarity          TEXT,
  grader          grader_authority NOT NULL DEFAULT 'RAW', -- 對齊 selectedGrader
  grade_score     TEXT,                                    -- 容納 '10 (Black Label)' 等複合分數
  condition       card_condition NOT NULL DEFAULT 'A',     -- 對齊 selectedCondition（A/B/C/D）
  condition_desc  TEXT,                                    -- 品相補充描述
  selling_price   NUMERIC(12,2) NOT NULL CHECK (selling_price >= 0),
  photos          JSONB NOT NULL DEFAULT '[]'::jsonb,      -- 6 槽 {url, remark}[]，強制 >= 2 張
  status          listing_status NOT NULL DEFAULT 'draft',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 上架（active）時強制至少 2 張實物相片（對齊 NewListingForm 強制下限）
  CONSTRAINT chk_listing_photos_min CHECK (
    status <> 'active' OR jsonb_array_length(photos) >= 2
  )
);

CREATE INDEX idx_listings_seller ON public.listings (seller_id);
CREATE INDEX idx_listings_status ON public.listings (status) WHERE status = 'active';
CREATE INDEX idx_listings_item_type ON public.listings (item_type);
```

### 2.3.1 `listing_stats` — 掛單統計（生產 schema）

> SSOT：`types/supabase.ts` · migration `20260706120000_listing_stats_inventory_extend.sql`

| Column | Type | Notes |
|--------|------|-------|
| `listing_id` | UUID PK FK → `listings.id` | ON DELETE CASCADE |
| `views` | INTEGER NOT NULL DEFAULT 0 | `rpc_increment_listing_view` — merchant listing page land 或 `ExecutionSlideOver` open |
| `offers_count` | INTEGER NOT NULL DEFAULT 0 | Cumulative offers; +1 in `rpc_make_offer` only |
| `updated_at` | TIMESTAMPTZ | |

Init trigger on `listings` INSERT. Seller RLS: read own stats via `listings.seller_id = auth.uid()`.

### 2.3.2 `listing_engagement_events` — 瀏覽／叫價時序

> migration `20260717200000_listing_engagement_events.sql` · guest anon `20260720120000_listing_view_guest_anon.sql`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `listing_id` | UUID FK → `listings.id` | ON DELETE CASCADE |
| `actor_id` | UUID FK → `profiles.id` | nullable（訪客 view 為 NULL） |
| `event_type` | `listing_engagement_event_type` | `view` \| `offer` |
| `occurred_at` | TIMESTAMPTZ | |

Dual-write with `listing_stats`: `rpc_increment_listing_view` → `view`（`GRANT` anon + authenticated；active listing only）；`fn_bump_listing_offers_count` → `offer`. Merchant product analytics chart buckets read from events; KPI totals read from `listing_stats`.

RPC: `get_merchant_product_analytics(p_product_id, p_time_range, p_history_page, p_history_page_size)` — migration `20260717201000_merchant_product_analytics.sql`.

### 2.4 `orders` — 全額託管訂單（嚴禁訂金欄位）

```sql
CREATE TABLE public.orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_code       TEXT UNIQUE NOT NULL,                  -- TXN-HKCV-{id}-{seq}（對齊 success page）
  listing_id        UUID NOT NULL REFERENCES public.listings (id) ON DELETE RESTRICT,
  buyer_id          UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  seller_id         UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  order_type        TEXT NOT NULL DEFAULT 'B2C' CHECK (order_type IN ('B2C', 'C2C')),
  escrow_status     escrow_status NOT NULL DEFAULT 'payment',

  -- 金流明細（100% 全額付訖；嚴禁任何 deposit_* 欄位）
  item_subtotal     NUMERIC(12,2) NOT NULL CHECK (item_subtotal >= 0),
  shipping_fee      NUMERIC(12,2) NOT NULL DEFAULT 0,      -- SF=30 / meetup=0
  auth_fee          NUMERIC(12,2) NOT NULL DEFAULT 0,      -- 可選 HK$150 第三方鑑定費（獨立行項）
  coupon_discount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  -- 對齊前端公式：max(item_subtotal + shipping_fee + auth_fee - coupon_discount, 0)

  -- 配送資料（對齊 checkout shipping states）
  shipping_method   shipping_method NOT NULL DEFAULT 'sf',
  sf_locker_code    TEXT,
  sf_address        TEXT,
  buyer_phone       TEXT,
  meetup_detail     TEXT,
  buyer_remark      TEXT,                                  -- 給賣家的特殊交割備註
  has_authentication BOOLEAN NOT NULL DEFAULT FALSE,       -- 是否開啟鑑定增值服務

  -- 物流
  tracking_no       TEXT,

  -- Stripe Connect
  stripe_payment_intent_id TEXT,
  platform_fee_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_no_self_trade CHECK (buyer_id <> seller_id)
);

CREATE INDEX idx_orders_buyer ON public.orders (buyer_id);
CREATE INDEX idx_orders_seller ON public.orders (seller_id);
CREATE INDEX idx_orders_status ON public.orders (escrow_status);
```

> **實作現況：** 訂單已按賣家身份拆表為 `merchant_orders`（B2C）與 `member_orders`（C2C），
> 上述 `orders` 為原始設計參考。B2C 金流欄位在 Payment Milestone 1
> （migration `20260729110000_merchant_order_stripe_payment.sql`）補齊。

#### 2.4.1 `merchant_orders` 金流欄位（Payment Milestone 1）

```sql
ALTER TABLE public.merchant_orders
  ADD COLUMN IF NOT EXISTS item_subtotal   NUMERIC,            -- = final_price（成交價）
  ADD COLUMN IF NOT EXISTS shipping_fee    NUMERIC NOT NULL DEFAULT 0,  -- SF=30 / meetup=0
  ADD COLUMN IF NOT EXISTS auth_fee        NUMERIC NOT NULL DEFAULT 0,  -- 150 / 0
  ADD COLUMN IF NOT EXISTS shipping_method TEXT,                -- 'sf' | 'meetup'
  ADD COLUMN IF NOT EXISTS total_amount    NUMERIC,             -- 實際 Stripe 收款額
  ADD COLUMN IF NOT EXISTS paid_at         TIMESTAMPTZ;         -- webhook 確認收款時間
-- stripe_payment_intent_id 已存在；新增 partial index 供 webhook 反查
CREATE INDEX IF NOT EXISTS idx_merchant_orders_stripe_payment_intent_id
  ON public.merchant_orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
```

`escrow_state` enum 新增 `pending_payment`（`BEFORE 'payment_held'`，migration `20260729100000`）。
> ⚠️ PostgreSQL 不允許同 transaction 內新增並使用 enum 值 → enum 與使用必須分開 migration。

相關 RPC（詳見 [merchant-checkout/backend.md](./follow-up/merchant-checkout/backend.md)）：
`rpc_buy_now_merchant_listing`、`rpc_prepare_merchant_order_payment`、
`rpc_attach_merchant_order_payment_intent`、`rpc_mark_merchant_order_paid`（`service_role` only）。

### 2.5 `chat_rooms` 與 `messages` — 交易議價聊天艙

```sql
-- 確定性房號：generateDeterministicRoomId(buyerId, sellerId)（雙向對稱 MD5 雜湊）
CREATE TABLE public.chat_rooms (
  id            TEXT PRIMARY KEY,                          -- 確定性房號（非 uuid，由前端雜湊產生）
  buyer_id      UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  seller_id     UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  last_message  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, seller_id)
);

CREATE TABLE public.messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       TEXT NOT NULL REFERENCES public.chat_rooms (id) ON DELETE CASCADE,
  sender_id     UUID REFERENCES public.profiles (id) ON DELETE SET NULL, -- system 訊息為 NULL
  sender_role   message_sender NOT NULL,                  -- 'me' | 'them' | 'system'
  type          message_type NOT NULL DEFAULT 'text',
  body          TEXT NOT NULL,

  -- special_transaction 內嵌要約資料（對齊 SpecialTransactionData）
  offer_listing_id UUID REFERENCES public.listings (id) ON DELETE SET NULL,
  offer_card_name  TEXT,
  offer_card_id    TEXT,
  offer_price      NUMERIC(12,2),
  offer_status     offer_status,                          -- pending/accepted/rejected/countered
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_room ON public.messages (room_id, created_at);
```

### 2.6 `product_watchlists` — 願望清單追價（live SSOT）

> 取代早期設計稿 `wishlists`（`card_catalog` + `card_ref`）。Live DB 使用 `product_catalog.id` + grade 維度。

```sql
-- Live 表擴展（見 migration 20260706100000_product_watchlists_wishlist_extend.sql）
CREATE TABLE public.product_watchlists (
  user_id           UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES public.product_catalog (id) ON DELETE CASCADE,
  grading_company   TEXT NOT NULL DEFAULT 'RAW',
  grading_score     TEXT NOT NULL DEFAULT 'A',
  tracked_price     NUMERIC(12,2) NULL,     -- 加入時 snapshot
  target_price      NUMERIC(12,2) NULL,     -- 目標價（Phase 2 UI；Phase 3 OneSignal alert）
  alert_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  last_alerted_at   TIMESTAMPTZ NULL,       -- push 冷卻（Phase 3 預留）
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id, grading_company, grading_score)
);

CREATE INDEX idx_product_watchlists_alert
  ON public.product_watchlists (product_id, grading_company, grading_score)
  WHERE target_price IS NOT NULL AND alert_enabled = TRUE;
```

**30D 走勢**：read-time JOIN `product_grading_market_prices`（matching grade），唔 FK。

**購買 alert（Phase 3）**：比對同 grade active `listings.price` ≤ `target_price` → OneSignal push。

### 2.6.1 ~~`wishlists`~~（設計稿 — 未部署，已棄用）

```sql
-- DEPRECATED: 以下 DDL 僅作歷史參考，請使用 product_watchlists
CREATE TABLE public.wishlists (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  catalog_id    UUID REFERENCES public.card_catalog (id) ON DELETE CASCADE,
  card_ref      TEXT NOT NULL,
  tracked_price NUMERIC(12,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, card_ref)
);
```

### 2.7 `user_check_ins` — 7 日簽到防作弊

```sql
-- 對齊 CheckInCard CHECK_IN_STEPS：第 1-7 天積分 10/15/20/25/30/40/100
CREATE TABLE public.user_check_ins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  check_in_date   DATE NOT NULL,                           -- timezone('Asia/Hong_Kong', now())::date
  streak_day      INTEGER NOT NULL CHECK (streak_day BETWEEN 1 AND 7),
  points_awarded  INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, check_in_date)                          -- 同日防重複簽到
);

CREATE INDEX idx_check_ins_user ON public.user_check_ins (user_id, check_in_date DESC);
```

### 2.8 `user_collections` — 私人收藏（身家計算器）

```sql
CREATE TABLE public.user_collections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES public.product_catalog (id) ON DELETE CASCADE,
  grading_company TEXT NOT NULL DEFAULT 'RAW',
  grading_score   TEXT NOT NULL DEFAULT 'A',
  purchase_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_collections_user_created ON public.user_collections (user_id, created_at DESC);
```

> **縮圖：** 唔存 `photos`；UI 用 `product_catalog.image_url`。  
> **市價（collection）：** `resolveCollectionMarketValue` — 同規格 SNKRDUNK → 平台同規格最低掛單 → `purchase_price`（唔用其他 grade）。  
> **已上架狀態：** derive from 用戶 active `listings`（同 grade match）；`listedCount` on summary；出售走 `openAddAssetModal({ mode: "merch", sellPrefill })`。

### 2.9 `coupons` — 平台優惠券庫

```sql
-- 對齊 checkout AVAILABLE_COUPONS（WELCOME-TCG-50 / SF-FREE-DUANWU / VIP-DISCOUNT-100）
CREATE TABLE public.coupons (
  code            TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  discount_amount NUMERIC(12,2) NOT NULL CHECK (discount_amount >= 0),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.order_coupons (
  order_id        UUID NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  coupon_code     TEXT NOT NULL REFERENCES public.coupons (code) ON DELETE RESTRICT,
  PRIMARY KEY (order_id, coupon_code)                      -- 支援單訂單多券累加
);
```

### 2.10 `kyc_applications` — 商戶入駐審核

```sql
CREATE TABLE public.kyc_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  shop_name       TEXT NOT NULL,
  document_path   TEXT NOT NULL,                           -- supabase.storage kyc-docs 路徑
  status          kyc_status NOT NULL DEFAULT 'pending',
  reviewed_by     UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ
);

CREATE INDEX idx_kyc_status ON public.kyc_applications (status);
```

---

## 3. Row-Level Security（RLS）策略

> **角色語意：** `GUEST` = 未經身份驗證（`auth.uid()` 為 NULL）；`USER` / `MERCHANT` / `ADMIN` 由 `profiles.role` 判定。
> 所有資料表一律 `ENABLE ROW LEVEL SECURITY`，預設 fail-closed。

```sql
-- 共用 helper：取得當前請求者的角色
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS user_role LANGUAGE sql STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN');
$$;
```

### 3.1 `profiles`

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- GUEST + 所有人：公開檔案可讀（對外分享 HKCV-ID）
CREATE POLICY profiles_public_read ON public.profiles
  FOR SELECT USING (true);

-- USER：僅能更新自己的檔案，且不得自行竄改 role / is_banned
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- ADMIN：全權管理（含封禁、角色升級）
CREATE POLICY profiles_admin_all ON public.profiles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
```

### 3.2 `listings`

```sql
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- GUEST + 所有人：僅可瀏覽 active 商品（草稿不外洩）
CREATE POLICY listings_public_read ON public.listings
  FOR SELECT USING (status = 'active' OR seller_id = auth.uid() OR public.is_admin());

-- 只有 MERCHANT 且 KYC 通過可上架（USER / GUEST fail-closed）
CREATE POLICY listings_merchant_insert ON public.listings
  FOR INSERT WITH CHECK (
    seller_id = auth.uid()
    AND public.current_role() = 'MERCHANT'
    AND (SELECT kyc_status FROM public.profiles WHERE id = auth.uid()) = 'approved'
  );

-- 商戶僅能改自己的上架
CREATE POLICY listings_merchant_update ON public.listings
  FOR UPDATE USING (seller_id = auth.uid() AND public.current_role() = 'MERCHANT')
  WITH CHECK (seller_id = auth.uid());
```

### 3.3 `orders`

```sql
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 僅買賣雙方本人或 ADMIN 可讀
CREATE POLICY orders_party_read ON public.orders
  FOR SELECT USING (
    auth.uid() = buyer_id OR auth.uid() = seller_id OR public.is_admin()
  );

-- 僅買賣雙方可更新各自負責的狀態欄位
CREATE POLICY orders_party_update ON public.orders
  FOR UPDATE USING (auth.uid() = buyer_id OR auth.uid() = seller_id)
  WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- 訂單建立由 Stripe Webhook 以 service_role 寫入（繞過 RLS）；客戶端不得直接 INSERT
```

### 3.4 `messages` / `chat_rooms`

```sql
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages   ENABLE ROW LEVEL SECURITY;

CREATE POLICY rooms_party_access ON public.chat_rooms
  FOR ALL USING (auth.uid() = buyer_id OR auth.uid() = seller_id)
  WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE POLICY messages_party_read ON public.messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.chat_rooms r
    WHERE r.id = room_id AND (r.buyer_id = auth.uid() OR r.seller_id = auth.uid())
  ));

CREATE POLICY messages_party_insert ON public.messages
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.chat_rooms r
    WHERE r.id = room_id AND (r.buyer_id = auth.uid() OR r.seller_id = auth.uid())
  ));
```

### 3.5 `product_watchlists` / `user_check_ins` / `user_collections`

```sql
ALTER TABLE public.product_watchlists    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_check_ins   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_watchlists_owner ON public.product_watchlists
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY check_ins_owner ON public.user_check_ins
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY collections_owner ON public.user_collections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### 3.6 `kyc_applications`

```sql
ALTER TABLE public.kyc_applications ENABLE ROW LEVEL SECURITY;

-- 申請人可讀自己的狀態；ADMIN 可讀全部並審核
CREATE POLICY kyc_self_read ON public.kyc_applications
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY kyc_self_insert ON public.kyc_applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY kyc_admin_update ON public.kyc_applications
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
```

---

## 4. 防作弊與一致性程序 (Stored Procedures)

### 4.1 簽到與積分（防併發、SSOT）

> **實作：** `execute_daily_check_in()` in `20260705181000` / `20260705182000`  
> 簽到 streak 寫入 `gamification_stats`；PTS 經 `fn_apply_point_transaction` → `points_balance` + `point_ledger`。

```sql
-- 概念流程（簡化；完整邏輯見 migration）
-- 1. FOR UPDATE gamification_stats WHERE user_id = auth.uid()
-- 2. 計算 HK 時區 streak + 當日 PTS（對齊 CHECK_IN_POINT_LADDER）
-- 3. fn_apply_point_transaction(uid, v_points, 'daily_check_in', ...)
-- 4. fn_recalculate_reputation_tags(uid); fn_try_auto_grant_rewards(uid)
```

任務領取 / 積分兌換須經專用 RPC（`fn_claim_mission_points`、`fn_redeem_member_points`），同樣只呼叫 `fn_apply_point_transaction`，**禁止** 直接 `UPDATE gamification_stats.points_balance`。

---

## 5. 索引總表

| 資料表 | 索引欄位 | 類型 | 目的 |
|--------|----------|------|------|
| `card_catalog` | `(item_type, card_number)` | UNIQUE / B-tree | 毫秒級分類自動完成 |
| `card_catalog` | `tsvector(name, jp_name)` | GIN | 全文模糊搜尋 |
| `listings` | `status` | Partial (`= 'active'`) | 大盤現貨列表 |
| `listings` | `item_type` | B-tree | 多分類篩選不互污 |
| `orders` | `buyer_id` / `seller_id` | B-tree | 雙端訂單中心查詢 |
| `messages` | `(room_id, created_at)` | B-tree | 聊天訊息時序拉取 |
| `product_watchlists` | `(user_id, product_id, grading_company, grading_score)` | UNIQUE | 防重複追蹤（同卡多 grade） |
| `user_check_ins` | `(user_id, check_in_date)` | UNIQUE | 同日防重複簽到 |

---

## 6. 待辦事項清單（Backend Migration TODO）

- [ ] 建立全部 ENUM 型別與 10 張核心資料表。
- [ ] 為每張表 `ENABLE ROW LEVEL SECURITY` 並套用上述策略（fail-closed 驗證）。
- [ ] 建立 `card_catalog` GIN 全文索引與 `(item_type, card_number)` 複合 UNIQUE。
- [ ] 部署 `execute_daily_check_in()` 與 `current_role()` / `is_admin()` helper。
- [ ] 建立 SQL Trigger：`auth.users` INSERT 時自動寫入 `profiles`（`role = 'USER'`）。
- [ ] 建立 Storage Bucket `listing-images`（公開讀，MERCHANT 寫）與 `kyc-docs`（私密簽名）。
- [ ] 灌入 `coupons` 種子資料（WELCOME-TCG-50 / SF-FREE-DUANWU / VIP-DISCOUNT-100）。
