# API 整合 TODO 追蹤器（RESTful 與 RPC 端點登記冊）

> 本文件為 HKCardVault 後端 **API 路由單一真理源 (SSOT)**，由前端 payload 提交處理器逆向校準。
> 所有路由均標註精確 HTTP 動詞、請求結構與強型別 JSON 回應圖譜。
>
> **慣例：**
> - Next.js Route Handlers 置於 `app/api/**/route.ts`；Server Actions 標註 `[Server Action]`。
> - 寫入端點一律於伺服器端 fail-closed 驗證角色（`USER` / `MERCHANT` / `ADMIN`）。
> - 金額一律遵循全額付訖（Full Pay），回應中嚴禁出現 `deposit_*` 欄位。

---

## 0. 通用回應信封 (Envelope)

```jsonc
// 成功
{ "ok": true, "data": { /* 端點專屬 payload */ } }
// 失敗（fail-closed）
{ "ok": false, "error": { "code": "FORBIDDEN", "message": "需要 MERCHANT 權限" } }
```

---

## 1. 身份驗證與會員 (Auth & Profile)

| 方法 | 路徑 / Action | 請求 Payload | 回應圖譜 | 權限 |
|------|---------------|--------------|----------|------|
| `POST` | `[Server Action] signUp` | `{ email, password, displayName }` | `{ userId, role: 'USER' }` | GUEST |
| `POST` | `[Server Action] signInWithPassword` | `{ email, password }` | `{ session, role }` | GUEST |
| `POST` | `[Server Action] signOut` | `{}` | `{ ok: true }` | USER+ |
| `GET` | `/api/profile/[pktId]` | — | `Profile`（見下） | GUEST |
| `PATCH` | `[Server Action] updateProfile` | `Partial<Pick<Profile,'displayName'\|'handle'\|'bio'\|'email'>>` | `Profile` | 本人 |
| `POST` | `[Server Action] submitKyc` | `{ shopName, documentPath }` | `{ status: 'pending' }` | USER → PENDING_MERCHANT |

```ts
interface Profile {
  id: string; pktId: string; displayName: string; handle: string;
  avatarSeed: string; role: 'USER'|'PENDING_MERCHANT'|'MERCHANT'|'ADMIN';
  kycStatus: 'pending'|'approved'|'rejected'|null;
  rating: number; reviewCount: number; levelTier: number;
  xpCurrent: number; xpRequired: number; pointsBalance: number;
  shopName: string|null; stripeConnected: boolean;
}
```

---

## 2. 卡牌目錄與搜尋 (Catalog & Search)

| 方法 | 路徑 | 請求 | 回應圖譜 | 權限 |
|------|------|------|----------|------|
| `GET` | `/api/catalog/search?q=&itemType=card\|box_set` | query string | `CatalogEntry[]` | GUEST |
| `GET` | `/api/catalog/[itemType]/[cardNumber]` | — | `CatalogEntry` | GUEST |
| `POST` | `/api/catalog/sync` | `{ cardNumber, itemType }` | `CatalogEntry`（外部 API 回填 + upsert） | ADMIN / 系統 |

```ts
interface CatalogEntry {
  id: string; itemType: 'card'|'box_set'; cardNumber: string;
  name: string; jpName: string|null; seriesSet: string|null;
  rarity: 'SAR'|'UR'|'SR'|'AR'|'CSR'|null; heroImage: string|null;
  needsReview: boolean; cachedAt: string;
}
```

> **解耦鐵律：** 模糊關鍵字 `q` 與結構化 `itemType` / `rarity` 為獨立維度（對齊 `HeroSearch.tsx`）。多分類查詢以 `(itemType, cardNumber)` 命中，**嚴禁** 全域 `q` 覆寫其他分類結果。

---

## 3. 商品上架與大盤 (Listings & Marketplace)

| 方法 | 路徑 / Action | 請求 Payload | 回應圖譜 | 權限 |
|------|---------------|--------------|----------|------|
| `GET` | `/api/listings?itemType=&rarity=&status=active&page=` | query | `{ items: Listing[], total: number }` | GUEST |
| `GET` | `/api/listings/[id]` | — | `Listing` | GUEST |
| `POST` | `[Server Action] searchMarketplaceProducts` | `MarketplaceSearchInput` | `{ data: MarketplaceProductRow[], meta: MarketplacePaginationMeta }` | GUEST |
| `POST` | `[Server Action] getMarketplacePriceBounds` | — | `{ minPrice, maxPrice }` | GUEST |
| `POST` | `[Server Action] createListing` | `CreateListingInput` | `Listing` | MERCHANT (KYC approved) |
| `PATCH` | `[Server Action] updateListing` | `{ id, ...Partial<CreateListingInput> }` | `Listing` | 上架者本人 |
| `POST` | `[Server Action] uploadListingImage` | `multipart/form-data`（≤ 6 張） | `{ urls: string[] }` | MERCHANT |

```ts
// 對齊 AddAssetModal.GlobalAssetPayload + NewListingForm 提交
interface CreateListingInput {
  itemType: 'card' | 'box_set';
  name: string;
  cardNo?: string;                 // box_set 可省略
  seriesSet?: string;
  grader: 'RAW'|'PSA'|'CGC'|'BGS'|'ARS'|'OTHER';
  gradeScore?: string;             // 例 '10 (Black Label)'
  condition: 'A'|'B'|'C'|'D';
  conditionDesc?: string;
  sellingPrice: number;
  photos: { url: string; remark: string }[];  // active 時強制 >= 2 張
  status: 'draft' | 'active';
}

interface Listing extends CreateListingInput {
  id: string; sellerId: string; rarity: string|null;
  status: 'draft'|'active'|'sold'|'pending';
  createdAt: string; updatedAt: string;
}
```

> **Implemented (v2 + keyword RPC):** `app/actions/marketplace.ts` (async actions only). Types: `app/lib/marketplace/types.ts`. Parsers: `app/lib/marketplace/searchParsers.ts`. Migration `20260704220000` adds `p_keyword`. See `docs/dev/follow-up/marketplace-search/backend.md`.

```ts
// searchMarketplaceProducts — live contract (simplified)
interface MarketplaceSearchInput {
  query?: string;
  setCode?: string;
  cardNumber?: string;
  rarities?: string[];
  sellerModes?: string[];
  gradeFilters?: { company: string; score: string | null }[];
  priceMin?: number;
  priceMax?: number;
  sortKey?: '最新' | '價格：由低到高' | '價格：由高到低';
  page?: number;
  pageSize?: number;
}

interface MarketplacePaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
}
```

---

## 4. 議價聊天與要約 (Messaging & Offers)

| 方法 | 路徑 / Action | 請求 Payload | 回應圖譜 | 權限 |
|------|---------------|--------------|----------|------|
| `GET` | `/api/chat/rooms` | — | `ChatRoom[]` | 本人 |
| `GET` | `/api/chat/rooms/[roomId]/messages` | — | `Message[]` | 房間成員 |
| `POST` | `[Server Action] sendMessage` | `{ roomId, body }` | `Message` | 房間成員 |
| `POST` | `[Server Action] injectOffer` | `OfferInput` | `Message`（`type:'special_transaction'`） | 買家 |
| `PATCH` | `[Server Action] respondOffer` | `{ messageId, action: 'accept'\|'reject'\|'counter', counterPrice? }` | `{ offerStatus }` | 賣家／買家 |

```ts
// 對齊 useHkCardVaultStore.SpecialTransactionData
interface OfferInput {
  buyerId: string; buyerName: string;
  sellerId: string; sellerName: string;
  cardId: string; cardName: string;
  offerPrice: number; isInstantTake: boolean;
}

interface Message {
  id: string; roomId: string;
  senderRole: 'me'|'them'|'system';
  type: 'text'|'special_transaction';
  body: string; createdAt: string;
  offer?: {
    cardId: string; cardName: string; offerPrice: number;
    status: 'pending'|'accepted'|'rejected'|'countered';
  };
}
```

> **狀態機：** `pending → accepted | rejected | countered`。`accepted` 後觸發直購跳轉至 `/checkout/[listingId]`（對齊 `SpecialTransactionMessage` 的 accept 後直結帳閉環）。房號採確定性雙向對稱雜湊 `generateDeterministicRoomId(buyerId, sellerId)`。

---

## 5. 託管結帳與金流 (Escrow Checkout & Settlement)

### 5.1 B2C 商戶託管結帳與 Connect 撥款（✅ 已落地，Payment Milestone 1–2）

`app/actions/merchant-checkout.ts` / `app/actions/buy-now.ts` — 詳細契約見 [merchant-checkout/backend.md](./follow-up/merchant-checkout/backend.md) · [buy-now-chat/backend.md](./follow-up/buy-now-chat/backend.md)。

| 方法 | 路徑 | 請求 Payload | 回應圖譜 | 權限 |
|------|------|--------------|----------|------|
| `POST` | `[Server Action] buyNowListing` | `(listingId, useAuth?)` | `{ orderId, orderNumber, orderKind, roomId, offerId, paymentHref, … }` | 買家（非自售） |
| `POST` | `[Server Action] buyNowMerchantListing` | `(listingId, useAuth?)` | 同上（`buyNowListing` 別名） | 買家（非自售） |
| `GET` | `[Server Action] loadMerchantCheckoutOrder` | `(orderIdOrNumber)` | `MerchantCheckoutOrder` | 訂單買家 |
| `POST` | `[Server Action] createMerchantOrderPaymentIntent` | `(orderIdOrNumber, { shippingMethod, useAuth, userRewardId? })` | `{ clientSecret, publishableKey, itemSubtotal, shippingFee, authFee, totalAmount, buyerTotalAmount, platformSubsidyAmount }` | 訂單買家 |
| `GET` | `[Server Action] listCheckoutEligibleCoupons` | `(orderId, { shippingMethod? })` | `CheckoutEligibleCoupon[]` | 訂單買家（非鑑定 merchant_direct） |
| `GET` | `[Server Action] getMerchantCheckoutPaymentStatus` | `(orderIdOrNumber)` | `{ escrowStatus, totalAmount, paidAt }` | 訂單買家 |
| `POST` | `[Server Action] completeMerchantOrder` | `(orderId)` | `{ success }` | 訂單買家 |

金額由 DB 權威計算（`rpc_prepare_merchant_order_payment`）：`total_amount` = gross；非鑑定直發及 **鑑定商戶訂單（Phase 2b）** 可選一張券，`buyer_total_amount = gross − platform_subsidy_amount`，PI 用買家實付（鑑定為 manual capture authorize）。鑑定免運以順豐報價作補貼基數。詳見 [platform-rewards-v2 QA](./follow-up/platform-rewards-v2/QA_CHECKLIST.md)。

### 5.2 Member 鑑定託管結帳（✅ 已落地，Payment Milestone 1.5）

`app/actions/member-auth-checkout.ts` — 僅 `member_orders.use_authentication=true`；P2P 無鑑定不接 Stripe。詳見 [member-auth-checkout/backend.md](./follow-up/member-auth-checkout/backend.md)。

| 方法 | 路徑 | 請求 Payload | 回應圖譜 | 權限 |
|------|------|--------------|----------|------|
| `GET` | `[Server Action] loadMemberAuthCheckoutOrder` | `(orderIdOrNumber)` | `MemberAuthCheckoutOrder` | 訂單買賣雙方 |
| `POST` | `[Server Action] createMemberAuthPaymentIntent` | `(orderIdOrNumber)` | `{ clientSecret, publishableKey, itemSubtotal, authFee, totalAmount }` | 訂單買家 |
| `GET` | `[Server Action] getMemberAuthPaymentStatus` | `(orderIdOrNumber)` | `{ escrowStatus, paymentConfirmedAt, paymentCaptureStatus, totalAmount }` | 訂單參與方 |

金額：`final_price + HK$150` 鑑定費（`rpc_prepare_member_auth_order_payment`）。PI `capture_method: manual`；webhook `payment_intent.amount_capturable_updated`（`order_kind=member_auth`）→ `authorized` + `custody`；Admin 入庫 partial capture 鑑定費 → `auth_fee_captured` + `grading`。

### 5.2.1 統一結帳 Wizard（✅ 已落地）

`app/actions/checkout.ts` + `lib/checkout/*` — 商戶 B2C + Member 鑑定託管共用 `/checkout/[orderId]` 兩步精靈。詳見 [unified-checkout/backend.md](./follow-up/unified-checkout/backend.md)。

**入款兩 route：** 非鑑定 merchant → PI `automatic` ✅；鑑定單 → **single capture**（新單）／legacy multicapture 🟡 Partner QA（[capture-policy](./capture-policy.md) · [PARTNER_HANDOFF](./follow-up/admin-grading/PARTNER_HANDOFF.md)）。**出款（非 checkout）：** Member 鑑定 → FPS + T+3 `payout_requests` + admin 銷帳；Merchant → Connect + T+7 cron。FPS gate：`bun run test:integration:fps-payout`。

| 方法 | 路徑 | 請求 Payload | 回應圖譜 | 權限 |
|------|------|--------------|----------|------|
| `GET` | `[Server Action] loadCheckoutSession` | `(orderIdOrNumber)` | `CheckoutSession`（`merchant_direct` \| `merchant_auth` \| `member_auth`） | 訂單買家 |
| `GET` | `[Server Action] getCheckoutPaymentStatus` | `(orderIdOrNumber)` | `{ orderKind, isPaid, isProcessing, totalAmount }` | 訂單買家 / 參與方 |
| `POST` | `lib/checkout/prepare-payment` | `(session, merchantDirectForm?)` | `{ clientSecret, publishableKey, totalAmount }` | client 呼叫（包裝既有 PI actions） |

### 5.3 規劃中 / 未落地的 REST 介面

| 方法 | 路徑 | 請求 Payload | 回應圖譜 | 權限 |
|------|------|--------------|----------|------|
| `POST` | `/api/checkout/quote` | `QuoteInput` | `QuoteResult` | USER+ ⏳ |
| `POST` | `/api/checkout/create-payment-intent` | `{ listingId, ...QuoteInput }` | `{ clientSecret, ledgerCode }` | USER+ ⏳（已由 5.1 server action 取代） |
| `GET` | `/api/orders/[id]` | — | `Order` | 買賣雙方 ⏳ |
| `GET` | `/api/orders?role=buyer\|seller&scope=active\|completed` | query | `Order[]` | 本人 ⏳ |
| `PATCH` | `[Server Action] shipOrder` | `{ orderId, trackingNo }` | `Order` | 賣家 ⏳ |

```ts
// 對齊 checkout/[id]/page.tsx 計算引擎
interface QuoteInput {
  shippingMethod: 'sf' | 'meetup';      // sf → shippingFee=30；meetup → 0
  authServiceEnabled: boolean;          // true → authFee=150
  couponCodes: string[];                // 可多選累加
}

interface QuoteResult {
  itemSubtotal: number;
  shippingFee: number;                  // 30 | 0
  authFee: number;                      // 150 | 0
  couponDiscount: number;               // Σ coupon.discount
  totalAmount: number;                  // max(subtotal + shipping + auth - discount, 0)
}

interface Order {
  id: string; ledgerCode: string;       // TXN-HKCV-{id}-{seq}
  listingId: string; buyerId: string; sellerId: string;
  orderType: 'B2C'|'C2C';
  escrowStatus: 'payment'|'custody'|'shipped'|'grading'|'released'|'cancelled';
  itemSubtotal: number; shippingFee: number; authFee: number;
  couponDiscount: number; totalAmount: number;
  shippingMethod: 'sf'|'meetup'; trackingNo: string|null;
  hasAuthentication: boolean; createdAt: string;
  // ❌ 全額付訖：絕無 depositPaid / depositAmount 欄位
}
```

---

## 6. Stripe Connect（見 `server.md` 完整 Webhook 生命週期）

| 方法 | 路徑 | 請求 | 回應 | 權限 |
|------|------|------|------|------|
| `POST` | `/api/stripe/connect/onboard` | `{}` | `{ accountLinkUrl }` | MERCHANT |
| `GET` | `/api/stripe/connect/return` | `?account=` | `302 → /marketplace/payment-status` | MERCHANT |
| `POST` | `/api/stripe/connect/login-link` | `{}` | `{ dashboardUrl }` | MERCHANT (已綁定) |
| `POST` | `/api/webhooks/stripe` | Stripe raw body（驗簽） | `200 OK` | Stripe 簽章 |

---

## 7. 遊戲化與願望清單 (Gamification & Wishlist)

### 7.1 簽到 / 積分

| 方法 | 路徑 / Action | 請求 | 回應 | 權限 |
|------|---------------|------|------|------|
| `POST` | `[Server Action] executeCheckIn` | `{}` | `{ streakDay, pointsAwarded, pointsBalance }` | USER+ |

### 7.1a Platform rewards v2 (admin templates + flash campaigns)

| Action | Input | Output | 權限 |
|--------|-------|--------|------|
| `listAdminRewardTemplates` | `{ status?, page?, pageSize? }` | `{ rows, total }` | ADMIN |
| `upsertAdminRewardTemplate` | `AdminRewardTemplateUpsertInput` | `{ templateId, row }` | ADMIN |
| `setAdminRewardTemplateStatus` | `(templateId, status)` | `{ ok }` | ADMIN |
| `listAdminRewardCampaigns` | `{ status?, page?, pageSize? }` | `{ rows, total }` | ADMIN |
| `upsertAdminRewardCampaign` | campaign payload | `{ campaignId, row }` | ADMIN |
| `setAdminRewardCampaignStatus` | `(campaignId, status)` | `{ ok }` | ADMIN |
| `listActiveFlashCampaigns` | — | `FlashCampaignView[]` | USER+ |
| `claimFlashReward` | `(campaignId)` | `{ userRewardId }` | USER+ |
| `getUserRewardCoupons` | — | wallet + locked catalog | USER+ |
| `listCheckoutEligibleCoupons` | `(orderId, opts?)` | eligible coupons | USER+ |

Flash claim RPC：`rpc_claim_flash_reward` — atomic stock + HKT daily cap + `fn_issue_reward_from_template` dedup `flash:{campaign_id}:{date}`。`flash_only` 模板不會出現在 `get_reward_coupon_center` locked 列表。

### 7.2 願望清單 (`product_watchlists`)

> SSOT：`docs/dev/database.md` §2.6 · 實作：`app/actions/wishlist.ts`  
> 無 REST `/api/wishlist` — 前端直接呼叫 Server Actions。

| 方法 | Action | 請求 | 回應 | 權限 |
|------|--------|------|------|------|
| `POST` | `toggleWishlist` | `{ productId, gradingCompany, gradingScore?, trackedPrice? }` | `{ success, data: { isFavored } }` | USER+ |
| `POST` | `removeFromWishlist` | `{ productId, gradingCompany, gradingScore }` | `{ success, data: { ok: true } }` | 本人 |
| `POST` | `updateWishlistTarget` | `{ productId, gradingCompany, gradingScore, targetPrice, alertEnabled? }` | `{ success, data: { ok: true } }` | 本人 |
| `POST` | `updateWishlistGrade` | `{ productId, gradingCompany, gradingScore, nextGradingCompany, nextGradingScore? }` | `{ success, data: { ok: true } }` | 本人 |
| `GET` | `getWishlistEntries` | — | `{ success, data: WishlistEntry[] }` | 本人 |
| `GET` | `getUserWishlistFavoredKeys` | — | `{ success, data: string[] }` | 本人 |
| `GET` | `getUserWishlistProductIds` | — | `{ success, data: string[] }` | 本人 |

```ts
// app/lib/wishlist/types.ts — 對齊 WishlistTable
type WishlistEntry = {
  productId: string;
  displayId: string | null;
  name: string;
  cardCode: string;
  rarity: string | null;
  imageUrl: string | null;
  gradingCompany: string;
  gradingScore: string;
  gradeLabel: string;
  trackedPrice: number | null;       // 加入時快照
  targetPrice: number | null;        // Phase 3 警報門檻
  currentMarketPrice: number | null; // exact-grade market cache avg
  marketDataSource: string | null;   // snkrdunk | platform
  lowestListingPrice: number | null; // active listings (display context only)
  trend30d: number | null;
  chartPoints: { date: string; price: number }[];
};
```

**價格語意：** 表格參考市價用 `resolveWishlistDisplayValue`（同規格 SNKRDUNK cache → 平台成交 cache → `trackedPrice`）。`lowestListingPrice` 保留供放售參考；`chartPoints` / `trend30d` 為 SNKRDUNK 30D 走勢。

**Favored key：** `productId::gradingCompany::gradingScore`（`buildWishlistFavoredKey`）。

### 7.3 投資組合（Collection — Server Actions）

| Action | 輸入 | 輸出 | 權限 |
|--------|------|------|------|
| `getCollectionPortfolioSummary` | — | `CollectionPortfolioSummary` | USER+ |
| `getCollectionEntries` | `{ page?, pageSize?, filter?, query? }` | `CollectionEntriesPage` | USER+ |
| `addToCollection` | `{ productId, gradingOptionId, purchasePrice }` | `{ collectionId }` | USER+ |
| `removeFromCollection` | `{ collectionId }` | `{ ok: true }` | USER+ |
| `updateCollectionGrade` | `{ collectionId, nextGradingOptionId }` | `{ ok: true }` | USER+ |
| `updateCollectionPurchasePrice` | `{ collectionId, purchasePrice }` | `{ ok: true }` | USER+ |

```ts
type CollectionListFilter = "all" | "graded" | "raw" | "listed";

type GetCollectionEntriesInput = {
  page?: number;       // default 1
  pageSize?: number;   // default 20, max 50
  filter?: CollectionListFilter;
  query?: string;      // name / card code / set code
};

type CollectionEntriesPage = {
  entries: CollectionEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type CollectionPortfolioSummary = {
  totalMarketValue: number;   // Σ resolveCollectionMarketValue
  totalPurchasePrice: number; // Σ purchase_price
  unrealizedPnl: number;    // totalMarketValue - totalPurchasePrice
  pnlPercent: number;
  cardCount: number;
  gradedCount: number;
  rawCount: number;
  listedCount: number;        // active listing + grade match
};

type CollectionEntry = {
  collectionId: string;
  productId: string;
  name: string;
  cardCode: string;
  setCode: string;
  rarity: string | null;
  imageUrl: string | null;           // product_catalog.image_url
  gradingCompany: string;
  gradingScore: string;
  gradeLabel: string;
  gradingOptionId: string;
  purchasePrice: number;
  currentMarketValue: number | null;
  valuationSource: "snkrdunk" | "platform" | "purchase_price" | null;
  trend30d: number | null;           // exact grade SNKRDUNK only; list rows omit chart JSON
  status: "holding" | "listed";      // derived from user active listings
  activeListingId: string | null;
};
```

**身家估值 / 未實現損益：** `getCollectionPortfolioSummary`；每卡用 `resolveCollectionMarketValue`（同規格 SNKRDUNK cache → 同規格平台成交 cache → 入手價）。唔用其他 grade 參考價，唔用 active 掛單價。卡牌跟 grading；盒組跟密封/已開封。  
**表格：** `getCollectionEntries` 伺服器端 filter + 分頁；僅 hydrate 當前頁。  
**出售：** `openAddAssetModal({ mode: "merch", sellPrefill })` → `submitCardListingWithProgress`（保留 collection row）。

### 7.4 賣家庫存（Inventory — Server Actions）

| Action | 輸入 | 輸出 | 權限 |
|--------|------|------|------|
| `getUserInventorySummary` | — | `{ totalListings, activeCount, soldCount, inactiveCount }` | USER+ (seller) |
| `getUserInventoryGroups` | `{ query?, page?, pageSize? }` | paginated `InventoryProductGroup[]` | USER+ |
| `incrementListingView` | `listingId` | `{ success }` | GUEST + USER（訪客 `actor_id` null；賣家自己由 client skip） |

**觸發：** land `/marketplace/[sellerId]/product/[listingId]`（`trackListingView` on mount）或打開 `ExecutionSlideOver`。公開聚合頁 `/marketplace/product/[catalogId]` landing 唔計，只靠 slide-over。

**分組：** `listings.product_id` = `product_catalog.id`；每組多個 listing（不同 grade/price）。  
**統計：** `listing_stats.views`、`listing_stats.offers_count`（累計叫價，僅 `rpc_make_offer` +1）。

### 7.5 會員總覽（Member Dashboard — Server Action）

| Action | 輸入 | 輸出 | 權限 |
|--------|------|------|------|
| `getMemberDashboardOverview` | — | `{ profile, tradingStats }` | USER+ |

```ts
type MemberDashboardTradingStats = {
  completedTradesCount: number;  // profiles.completed_trades_count (C2C buy+sell completed + B2C buy completed_and_transferred; not cancelled/refunded)
  heldCardCount: number;           // collection + orphan active listings (deduped)
  listedForSaleCount: number;    // collection listed + orphan active
  totalMarketValue: number;      // resolveCollectionMarketValue (same as collection tab)
};
```

**總覽列表上限：** 待處理訂單 / 最近評價各 `pageSize: 5`（`MEMBER_DASHBOARD_PREVIEW_LIMIT`）；經 `searchUserTradingOrders` / `getPublicProfileReviews` 並行拉取，唔包在 overview action 內。

> **Guest 守衛：** `getWishlistEntries` / `getCollectionPortfolioSummary` / `getCollectionEntries` / collection & wishlist mutations / `getUserInventorySummary` / `getUserInventoryGroups` / `getMemberDashboardOverview` / `executeCheckIn` 無 session 時回 `{ success: false, error: "請先登入" }`。

---

## 8. 管理後台 (Admin)

| 方法 | 路徑 / Action | 請求 | 回應 | 權限 |
|------|---------------|------|------|------|
| `GET` | `/api/admin/metrics` | — | `{ gmv, commission, activeUsers, liveOrders }` | ADMIN |
| `GET` | `/api/admin/kyc?status=pending` | query | `KycApplication[]` | ADMIN |
| `PATCH` | `[Server Action] reviewKyc` | `{ applicationId, decision: 'approve'\|'reject' }` | `{ status, newRole? }` | ADMIN |
| `GET` | `/api/admin/users?q=&role=` | query | `Profile[]` | ADMIN |
| `PATCH` | `[Server Action] toggleBan` | `{ userId, isBanned }` | `Profile` | ADMIN |
| `POST` | `[Server Action] upsertPlatformSetting` | `{ key, value }` | `{ ok: true }` | ADMIN |
| `POST` | `[Server Action] triggerScraperJob` | `{ jobType: 'mercari'\|'skunk' }` | `{ jobId }` | ADMIN |
| `GET` | `[Server Action] searchAdminGradingOrders` | `{ tab, orderKind?, keyword?, page?, pageSize? }` | `{ rows, total, page, pageSize }` | ADMIN |
| `POST` | `[Server Action] adminConfirmGradingIntake` | `{ orderKind, orderId }` | `{ applied: true }` | ADMIN |
| `POST` | `[Server Action] adminPassGrading` | `{ orderKind, orderId, gradingOptionId, notes? }` | `{ applied: true }` — goods capture saga → `fully_captured` + `auth_grading_*` | ADMIN |
| `POST` | `[Server Action] adminSubmitGradingOutbound` | `{ orderKind, orderId, trackingNo }` | `{ applied: true }` | ADMIN |
| `POST` | `[Server Action] adminFailGradingAndRefund` | `{ orderKind, orderId, faultParty, reason? }` | `{ applied: true }` — single buyer: capture auth_fee; single seller/platform: PI cancel; legacy: capture(0) | ADMIN |
| `GET` | `[Server Action] getAdminGradingAuditHistory` | `{ orderKind, orderId }` | `AuditRow[]` | ADMIN |
| `POST` | `[Server Action] submitUserReport` | `{ reportedUserId, category, details?, chatRoomId?, attachmentIds? }` | `{ success, reportId?, caseId?, caseNumber? }` | USER+ |
| `GET` | `[Server Action] getUnacknowledgedReportOutcomes` ✅ Phase G+ | — | `{ reportId, caseNumber, resolution, message }[]` — copy from `moderation_cases.resolution` | USER+ |
| `POST` | `[Server Action] acknowledgeReportOutcomes` ✅ Phase G+ | `reportIds[]` | `{ updated }` | USER+ |
| `POST` | `/api/reports/upload-evidence` | multipart image (≤5MB, max 3) | `{ attachmentId, publicUrl }` | USER+ |
| `GET` | `[Server Action] searchAdminModerationCases` ✅ Phase C | `{ page?, status?, category?, minScore?, search? }` | `{ rows, total, pendingCount }` — rows include `subjectPriorUpheldCount` (Phase G) | ADMIN |
| `GET` | `[Server Action] getAdminModerationCase` ✅ Phase C | `caseId` | case bundle (reports, attachments, chatAccess, auditLog, activeSanctions, **relatedOrders**; read-only order summaries) | ADMIN |
| `GET` | `[Server Action] getAdminSubjectModerationHistory` ✅ Phase G | `{ subjectUserId, excludeCaseId? }` | prior cases + sanction history + stats | ADMIN |
| `GET` | `[Server Action] getAdminModerationChatThread` ✅ Phase D | `{ caseId, roomId, before? }` | paginated messages + audit `view_chat` on first page | ADMIN |
| `POST` | `[Server Action] adjustAdminModerationCaseScore` ✅ Phase E | `{ caseId, adjustment, reason? }` | `{ caseId }` | ADMIN |
| `POST` | `[Server Action] resolveAdminModerationCase` ✅ Phase E/E+ | `{ caseId, resolution, violationPersona?, sanction?, evidenceOverrideReason?, notifyReporter? }` | `{ caseId, status, resolution, authBanWarning? }` — `notifyReporter` default true; permanent `ban` triggers `auth.admin` ban | ADMIN |
| `GET` | `[RPC] moderation_get_account_access_restriction` ✅ Phase E+ | `{ p_user_id }` (self or admin) | `{ blocked, type?, endsAt?, reason? }` — used by `proxy.ts` |

> 完整契約見 [follow-up/admin-moderation/backend.md](./follow-up/admin-moderation/backend.md)。

---

## 9. 外部數據 API（價格與行情）

| 來源 | 用途 | 對應前端 |
|------|------|----------|
| TCGdex / JustTCG | 卡牌官方資料、稀有度標籤 | `card_catalog` 回填 |
| Mercari JP（Apify / SKUNK 爬蟲） | 已成交歷史價、行情走勢 | `PriceTicker`、市場走勢圖 |
| 匯率 API（HKD ⇌ JPY） | 身家估值換算 | `portfolio/networth` |

> 更新頻率（對齊 `requirement.md`）：Top 100 熱門卡每日 4 次、普通卡每日 1 次、非熱門卡每週 1 次。
