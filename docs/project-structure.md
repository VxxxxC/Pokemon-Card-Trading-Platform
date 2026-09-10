# 🗂️ HKCardVault - 完整專案結構樹 (Full-Depth)

## 📊 項目統計

- **根目錄層級**: 5 層
- **主要目錄**: 13 個（`app/`, `components/`, `lib/`, `types/`, `scripts/`, `e2e/`, `supabase/`, `docs/`, `public/`, `.stitch/`, `.agents/`, `.github/`, `.vscode/`）
- **總檔案數**: 740+ 個（排除 `node_modules`、`.next`）
- **TypeScript/TSX 檔案**: 410+ 個
- **DB migrations**: 143 檔（`supabase/migrations/`）
- **語言**: TypeScript/TSX, CSS, JSON, Markdown, SQL
- **框架**: Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui, Zustand, Serwist (PWA), Playwright (E2E)
- **後端整合**: Supabase（Auth、RLS、RPC、Server Actions、Realtime、Cron）；Member 鑑定託管 + Stripe manual capture（P0）；Merchant B2C checkout + Connect 撥款；**Member FPS payout pipeline**（T+3 hold → cron → admin FPS 表）
- **Package manager**: Bun only（`bun.lock`；見 `.cursorrules` §7）

---

## 🌳 頂層結構 (Top-Level)

```
Pokemon-Card-Trading-Platform-Client/
├─ 🔧 配置 & 規範
│   ├── package.json                 # scripts: dev, build, build:ci, lint, supabase:types, test:*, test:e2e
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── eslint.config.mjs
│   ├── postcss.config.mjs
│   ├── playwright.config.ts         # Playwright E2E（讀 `.env` / `.env.local`）
│   ├── vercel.json                  # Cron: 市場價 ingest/aggregate、merchant 付款逾時、member FPS payout ready
│   ├── components.json              # shadcn/ui
│   ├── middleware.ts                # Supabase session + RBAC（env 未設定時安全跳過）
│   ├── .cursorrules                 # 開發守則（含 §8 CI-safe Supabase / prerender）
│   ├── bun.lock
│   └── README.md
│
├─ 📁 app/                           # Next.js App Router（路由 + UI + store + hooks）
├─ 🧩 components/                    # shadcn/ui + 跨路由共用元件
├─ 📦 lib/                           # 後端輔助、Supabase client、domain helpers
├─ 🗄️ types/                         # Supabase CLI 生成型別 + 衍生文件
│   ├── supabase.ts                  # 唯一 DB schema 來源（`bun run supabase:types`）
│   └── supabase.md                  # 同上命令自動生成的人類可讀摘要
├─ 🛠️ scripts/                       # 開發 / CI 輔助腳本
├─ 🎭 e2e/                           # Playwright E2E specs + fixtures（見 docs/dev/e2e.md）
├─ 🐘 supabase/                      # migrations + config.toml
├─ 📖 docs/                          # 需求、RBAC、dev handoff
├─ 🎨 .stitch/                       # Stitch 設計系統
├─ 🤖 .agents/skills/                # Agent 技能庫
├─ 🔗 .github/workflows/ci.yml       # tsc → lint → build（無 .env）
└─ 🌐 public/                        # 靜態資源 & PWA
```

---

## 📁 app/ — App Router

```
app/
├── 根層級
│   ├── page.tsx                     # 首頁
│   ├── layout.tsx                   # 全局 Layout（AddAssetModal、ListingSubmitOverlay、GlobalChatOverlay、ExecutionSlideOverHost）
│   ├── not-found.tsx                # 404
│   ├── globals.css
│   ├── manifest.json
│   ├── sw.ts
│   └── settings/page.tsx
│
├── actions/                         # ⭐ Server Actions（前後端契約）
│   ├── auth.ts                      # 登入 / 註冊 / 密碼重設
│   ├── profile.ts                   # 用戶設定、頭像、FPS 收款資料（fps_id + fps_name）
│   ├── marketplace.ts               # 搜尋、商品詳情、掛單簿、成交紀錄、市場價格、商戶櫥窗
│   ├── productCatalog.ts            # 目錄搜尋（Hero / AddAsset）
│   ├── listings.ts                  # 上架提交（Bunny + listings insert）
│   ├── offers.ts                    # 出價 / 接受 / 拒絕 / 修改 / OfferCard context
│   ├── chat.ts                      # inbox, sendMessage, markRoomRead → RPC
│   ├── orders.ts                    # searchUser/MerchantTradingOrders, complete/cancel, member order detail, auth escrow actions
│   ├── member-auth-checkout.ts      # Member 鑑定單 Stripe PI（manual capture；新單 single / legacy multicapture）
│   ├── merchant-checkout.ts         # Merchant B2C Stripe checkout + Connect payout saga
│   ├── buy-now.ts                   # 立即購買 → 聊天 / 訂單
│   ├── reviews.ts                   # 雙盲評價 + member/merchant reviewed-order batch + 公開檔案評價列表
│   ├── reports.ts                   # submitUserReport（聊天 / 檔案檢舉）
│   ├── home.ts                      # 首頁三區塊 bootstrap（願望清單 / 商戶 / C2C）
│   ├── collection.ts                # 收藏 portfolio bootstrap + 售出歸檔
│   ├── inventory.ts                 # 賣家庫存 accordion
│   ├── wishlist.ts                  # 願望清單 toggle + 列表
│   ├── rewards.ts                   # 簽到、積分、折價券中心
│   ├── member-dashboard.ts          # 用戶總覽 dashboard stats
│   ├── merchant-dashboard.ts        # 商戶總覽 dashboard stats
│   ├── merchant-settings.ts         # 店鋪設定
│   ├── merchant-kyc.ts              # 商戶 KYC 申請
│   ├── merchant-performance.ts      # 商戶績效 analytics RPC
│   ├── merchant-product-analytics.ts # 單 SKU 瀏覽/互動 analytics
│   ├── admin-dashboard.ts           # 管理員數據總覽
│   ├── admin-payouts.ts             # Admin 財務：Stripe balance、Merchant Connect ledger、Member FPS ledger
│   ├── admin-grading.ts             # Admin 鑑定工作台（intake / pass / fail / outbound）
│   ├── admin-kyc.ts                 # Admin KYC 審核
│   ├── admin-member-orders.ts       # Dev/admin：鑑定託管狀態推進（mock flow）
│   └── adminCatalog.ts              # Admin 目錄管理
│
├── api/
│   ├── cron/
│   │   ├── ingest-platform-trades/route.ts       # Cron：平台成交快照 ingest
│   │   ├── aggregate-prices/route.ts           # Cron：快照聚合 → market_prices cache
│   │   ├── expire-merchant-pending-payment/route.ts  # Cron：B2C 未付款逾時 + PI cancel
│   │   └── member-fps-payout-ready/route.ts      # Cron：T+3 hold 到期 → payout_requests
│   ├── stripe/
│   │   ├── webhook/route.ts         # Stripe webhook（merchant + member_auth capture saga）
│   │   └── connect/onboard/route.ts # Merchant Connect 入駐
│   ├── kyc/upload-document/route.ts
│   ├── listings/upload-image/route.ts
│   ├── profile/upload-avatar/route.ts
│   └── merchant/
│       ├── upload-avatar/route.ts
│       └── upload-top-banner/route.ts
│
├── auth/                            # 認證
│   ├── page.tsx                     # 登入 / 註冊
│   ├── AuthForm.tsx
│   ├── AuthFormShell.tsx
│   ├── callback/route.ts            # OAuth / magic link callback
│   ├── forgot-password/
│   │   ├── page.tsx
│   │   ├── ForgotPasswordForm.tsx
│   │   └── complete/                # 郵件連結後設定新密碼
│   └── reset-password/              # 已登入更改密碼
│       ├── page.tsx
│       └── ResetPasswordForm.tsx
│
├── marketplace/
│   ├── page.tsx                     # 大盤搜尋（Supabase RPC v2）
│   ├── MarketplacePageClient.tsx      # 客戶端搜尋狀態 + 篩選互動
│   ├── layout.tsx
│   ├── MarketplaceChrome.tsx        # 商品詳情頁隱藏全局 Nav
│   ├── product/[id]/
│   │   ├── page.tsx                 # SSR catalog + ProductDetailClient
│   │   └── ProductDetailClient.tsx  # 掛單簿、成交紀錄、市場價 banner、價格圖表；order book → 全域 ExecutionSlideOver
│   ├── [id]/                        # 商戶櫥窗（Supabase storefront）
│   │   ├── page.tsx
│   │   ├── MerchantStorefrontPageClient.tsx
│   │   └── product/[productId]/
│   │       ├── page.tsx
│   │       └── MerchantProductDetailPageClient.tsx  # BuyButton → 全域 slide-over
│   └── payment-status/page.tsx
│
├── profile/                         # 三層級檔案系統（見下方路由表）
│   ├── user/
│   │   ├── (dashboard)/             # 總覽 / 收藏 / 庫存 / 交易列表
│   │   ├── orderDetail/[id]/        # 會員訂單詳情（P2P + 鑑定託管）
│   │   ├── rewards/                 # 折價券中心
│   │   └── settings/
│   ├── merchant/                    # 商戶 dashboard + trading + analytics
│   │   ├── (dashboard)/             # 總覽 / 庫存 / 交易 / 績效 / analytics
│   │   ├── orderDetail/[id]/        # 商戶訂單詳情（B2C）
│   │   └── settings/
│   └── [id]/                        # 公開檔案 + /rating 評價列表
├── home/                            # 首頁 SSR 區塊 data loaders
│   ├── HomeWishlistSectionData.tsx
│   ├── HomeMerchantSectionData.tsx
│   ├── HomeC2cSectionData.tsx
│   └── HomeSectionSkeletons.tsx
├── checkout/[id]/                   # B2C / Member auth Stripe 結帳
├── admin/                           # 管理員 RBAC（多數已接 Supabase）
│   ├── dashboard/                 # 數據總覽
│   ├── grading/                   # 鑑定工作台（Member + Merchant）
│   ├── payouts/                   # 財務與結算（Connect ledger + Member FPS）
│   │   ├── page.tsx
│   │   ├── AdminPayoutsClient.tsx
│   │   └── components/
│   │       ├── FpsLedgerTab.tsx           # Member FPS 提現表
│   │       ├── MerchantConnectLedgerTab.tsx
│   │       └── PlatformBalanceSection.tsx
│   ├── merchants/                   # KYC / 商戶管理
│   ├── catalog/ · campaigns/ · disputes/ · settings/ · user_control/ · announcements/
│   └── layout.tsx
├── search/page.tsx
├── ~offline/page.tsx
├── serwist/[path]/route.ts
│
├── lib/                             # App 層工具（非根 lib/）
│   ├── marketplace/
│   │   ├── types.ts                 # 搜尋 / 詳情 / 掛單 / 市場價型別
│   │   ├── searchParsers.ts
│   │   └── perf-log-client.ts
│   ├── chat/                        # DB 聊天映射 + Realtime 解碼 + 已讀游標 + persona room key
│   │   ├── constants.ts             # isDbChatRoomId, buildPendingChatRoomId(persona)
│   │   ├── partnerRoomKey.ts        # partnerId + persona 複合房間識別
│   │   ├── partnerRoomKey.test.ts
│   │   ├── mapDbChats.ts            # inbox rows → Zustand ChatRoom / Message（含 partnerPersona）
│   │   ├── mergeChatRooms.ts        # mock + DB room 合併（按 persona 去重）
│   │   ├── hydrateChatRoomThread.ts # 長線程分頁 hydrate
│   │   ├── persistMarkRoomRead.ts   # markRoomRead 客戶端持久化
│   │   ├── roomHydration.ts         # 房間訊息 hydration 協調
│   │   ├── offerCardImage.ts
│   │   ├── offerCardContextCache.ts
│   │   ├── resolveMemberOrderId.ts  # member + merchant order id 收集
│   │   └── realtimeChatMessages.ts  # merchant_order_id on system msgs
│   ├── merchant-order/              # 商戶訂單 UI 映射 + seller actions
│   │   ├── types.ts
│   │   ├── map-sale-order.ts
│   │   └── merchant-seller-actions.ts
│   ├── member-order/                # 訂單詳情映射（P2P / auth escrow）
│   ├── collection/                  # 收藏 portfolio 型別 + perf log
│   ├── dashboard/                   # 用戶總覽型別 + perf log
│   ├── home/                        # 首頁區塊型別 + perf log
│   ├── inventory/                   # 庫存 accordion 型別 + perf log
│   ├── reports/                     # formatReportReason
│   ├── reviews/                     # 評價 UI 型別
│   ├── wishlist/                    # 願望清單型別
│   ├── hooks/
│   │   ├── useCurrentUserId.ts
│   │   ├── useChatRoomRealtime.ts
│   │   ├── useChatThreadPagination.ts
│   │   ├── useRoomReviewedOrderIds.ts
│   │   ├── useMarketplaceSearch.ts
│   │   ├── useMarketplaceSellerSearch.ts
│   │   ├── useMarketplaceProductListings.ts
│   │   ├── useMarketplaceProductTradeHistory.ts
│   │   ├── useMarketplaceProductMarketPrice.ts
│   │   ├── useMarketplaceListingDetail.ts
│   │   ├── useProductCatalogSearch.ts
│   │   ├── useHeroMarketplaceSearch.ts
│   │   ├── useUserTrading.ts
│   │   ├── useCollection.ts
│   │   ├── useInventory.ts
│   │   ├── useWishlist.ts
│   │   ├── useMemberDashboard.ts
│   │   ├── useMemberTitleDisplay.ts
│   │   ├── usePublicProfileReviews.ts
│   │   ├── useIsDesktopChat.ts
│   │   ├── usePWAEnvironment.ts
│   │   └── usePwaInstall.ts
│   ├── mock-data/                   # 過渡期 mock（profile / chat / orders）
│   └── types/                       # rbac, trading
│
├── store/                           # Zustand
│   ├── useMarketStore.ts
│   ├── useUIStore.ts                # AddAsset modal、mockRole、**openExecutionSlideOver** / close
│   ├── useHkCardVaultStore.ts       # 全局聊天（partnerPersona）+ offers 狀態帳本 + orderKind
│   ├── useMerchantStore.ts
│   ├── useMockDbStore.ts
│   └── useListingSubmitStore.ts     # 上架提交 overlay 狀態
│
└── components/                      # App 層 UI（80+ 元件，按 domain 分目錄）
    ├── marketplace/                 # MarketplaceCard, AccordionFilters, PriceSpreadBadge, AskOrderBookRow…
    ├── home/                        # HeroSearch、NewArrivals、PremiumMarket、WishlistTicker…
    ├── market/                      # CollectionTable, WishlistTable, WishlistButton
    ├── shared/                      # AddAssetModal, CollectionAddAfterListingDialog, MarketSkeletons…
    ├── navigation/                  # TopNav, BottomNav, MobileHeader, Footer…
    ├── profile/                     # ProfileAvatar, PublicPersonaProfileHeader, ProfileHeaderWithChat…
    ├── rewards/                     # CheckInCard, RewardUnlockedModal, UserProfileDashboardShell…
    ├── transactions/
    │   ├── GlobalTxButtons.tsx      # BuyButton（→ 全域 slide-over）
    │   ├── ExecutionSlideOverHost.tsx
    │   ├── ExecutionSlideOver.tsx
    │   ├── MemberAuthMockPaymentPanel.tsx   # dev：mock 付款
    │   ├── MemberAuthStripePaymentPanel.tsx # prod：Stripe manual capture
    │   └── OrderLifecycleStepper.tsx
    ├── trading/                     # ReviewModal（交易評價彈窗）
    ├── user/                        # UserOrderRow, MemberOrderDetailView, FpsIdCollectDialog, P2P/Auth 發票與時間軸…
    ├── chat/                        # GlobalChatOverlay, GlobalChatConsole, ChatUnreadDot, OfferCard, ChatReportDialogBody…
    ├── merchant/                    # MerchantOrderRow, MerchantOrderDetailView, MerchantTradingClient…
    └── …                            # admin, pwa, cards, ticker…
```

---

## 📦 lib/ — 根層級 Domain & Infra

```
lib/
├── supabase/
│   ├── env.ts                       # getSupabasePublicEnv(), isSupabaseConfigured()
│   ├── server.ts                    # createClient() — SSR / Server Actions
│   ├── client.ts                    # createClient() — browser / Realtime
│   ├── public.ts                    # 公開 env 讀取輔助
│   ├── admin.ts                     # service_role（僅 server / cron）
│   └── middleware.ts                # updateSession()
│
├── auth/
│   ├── session.ts                   # getOptionalAuthUser(), resolveCurrentDemoRole()
│   ├── roles.ts                     # RBAC 路由
│   ├── dual-persona.ts              # 雙身分 self-dealing guard 文案
│   ├── guard-member-persona-server.ts
│   ├── resolve-active-listing-persona-server.ts
│   ├── member-persona-features.ts
│   ├── validation.ts
│   ├── username.ts
│   ├── password-errors.ts
│   └── site-url.ts
│
├── marketplace/
│   ├── filter-options.ts
│   ├── product-listing-filters.ts
│   ├── listing-display.ts
│   ├── map-listing-to-execution.ts
│   ├── map-seller-listing.ts
│   ├── load-seller-profile.ts / load-seller-listing-detail.ts
│   ├── market-price.ts
│   ├── portfolio-pricing.ts
│   ├── platform-snapshot-ingest.ts
│   ├── seller-identity.ts / seller-profile.ts
│   ├── search-default.ts / product-detail-default.ts
│   ├── constants.ts
│   └── perf-log.ts
│
├── catalog/
│   └── element-types.ts
│
├── collection/
│   ├── build-entries.ts
│   ├── load-user-collection.ts
│   ├── constants.ts
│   └── perf-log.ts
│
├── dashboard/
│   ├── member-trading-stats.ts
│   ├── constants.ts
│   └── perf-log.ts
│
├── home/
│   ├── load-home-listings.ts
│   ├── constants.ts
│   └── perf-log.ts
│
├── grading/
│   └── options.ts
│
├── listings/
│   ├── validation.ts
│   ├── images.ts / image-files.ts
│   ├── client-upload.ts
│   ├── submit-card-listing.ts
│   ├── build-inventory-groups.ts
│   ├── load-user-inventory.ts
│   ├── active-listing-persona.ts    # member/merchant 掛單 persona SSOT
│   ├── track-listing-view.ts        # 市集卡片點擊瀏覽計數
│   ├── auth-service-copy.ts
│   ├── constants.ts
│   ├── errors.ts
│   └── perf-log.ts
│
├── merchant-order/                  # B2C merchant_orders helpers（根 lib/）
│   ├── merchant-order-rpc.ts        # rpc_complete_merchant_order 封裝
│   ├── load-buyer-merchant-orders.ts # 買家 trading 列表合併
│   ├── resolve-order-id.ts
│   └── constants.ts
│
├── member-order/
│   ├── auth-escrow.ts               # escrow 狀態常數 / canPay·canConfirmReceipt guards
│   ├── seller-payout.ts             # 賣家 FPS 撥款狀態中文 label
│   ├── member-order-rpc.ts          # complete/cancel RPC 封裝
│   ├── resolve-order-id.ts / resolve-listing-id.ts
│   ├── repair-listing-id.ts
│   ├── order-kind.ts / constants.ts
│   ├── dev-mock-flow.ts             # dev：一鍵推進鑑定單（⚠️ 跳過 FPS pipeline）
│   └── perf-log.ts
│
├── payments/
│   ├── member-auth-payment.ts
│   ├── auth-capture-saga.ts         # Admin intake：auth fee partial capture
│   ├── goods-capture-saga.ts        # Admin pass：goods final capture → fully_captured
│   ├── auth-grading-fail-void-saga.ts
│   └── escrow-payment-intent.ts
│
├── admin-payouts/
│   ├── types.ts                     # FpsPayoutRow, MerchantTransferRow…
│   ├── format.ts
│   └── fps-batch-config.ts
│
├── admin-dashboard/
│   ├── types.ts
│   ├── format.ts
│   └── hkt-month-bounds.ts
│
├── stripe/
│   └── platform-balance.ts          # Admin 平台 Stripe balance / today inflow
│
├── profile/
│   ├── validation.ts                #含 validateFpsPayoutDetails（姓名 + ID）
│   ├── avatar.ts
│   ├── client-upload.ts
│   ├── load-profile-snippets.ts     # persona-aware listing seller snippets
│   └── errors.ts
│
├── rewards/
│   └── mapUserRewardCoupon.ts
│
├── titles/
│   ├── member-title-progress.ts
│   └── merchant-title-progress.ts
│
├── wishlist/
│   ├── grading.ts / pricing.ts / sparkline.ts
│
├── constants/
│   ├── commerce.ts
│   ├── rewards.ts
│   └── titles.ts
│
├── cron/
│   └── request.ts                   # Cron route 共用驗證
│
├── storage/
│   └── bunny.ts
│
└── utils.ts
```

---

## 🧩 components/ — shadcn & 共用

```
components/
├── ui/                              # shadcn 基礎元件（含 chart.tsx, badge.tsx, tabs.tsx）
├── reui/                            # badge, stepper
├── auth/PasswordUpdatedToast.tsx
├── errors/NotFoundContent.tsx
├── listings/ListingSubmitOverlay.tsx
├── shared/RelativeDateTime.tsx      # 成交紀錄相對時間
└── examples/
```

---

## 🛠️ scripts/

```
scripts/
├── generate-supabase-md.ts          # `supabase:types` 後自動生成 types/supabase.md
├── dev/
│   └── seed-fps-payout-requests.sql # dev：Admin FPS 表 mixed-status seed（idempotent）
├── test-product-catalog-search.ts   # `bun run test:catalog-search`
├── test-member-order-complete-rpc.ts
├── test-chat-mark-read.ts
└── run-member-auth-mock-flow.ts     # `bun run test:member-auth-mock-flow`
```

---

## 🎭 e2e/ — Playwright

```
e2e/
├── fixtures/
│   ├── auth.setup.ts                # buyer / seller storageState
│   ├── supabase-admin.ts            # service_role 清理與 assert
│   ├── test-data.ts / chat-test-data.ts
│   └── listing-photo.png
├── helpers/
│   ├── member-trading.ts
│   └── collection-asset.ts
├── marketplace-search-offer.spec.ts
├── marketplace-storefront.spec.ts
├── merchant-product-detail.spec.ts
├── global-chat-realtime.spec.ts
├── member-offer-negotiation.spec.ts
├── member-trading-p2p.spec.ts
├── member-trading-smoke.spec.ts
├── member-trading-filters.spec.ts
├── member-order-detail-p2p.spec.ts
├── member-order-detail-auth.spec.ts
├── member-auth-escrow.spec.ts
├── member-auth-inbound.spec.ts
├── member-auth-settings.spec.ts
├── admin-stripe-finance.spec.ts     # Admin payouts / FPS tab smoke
├── member-collection-wishlist.spec.ts
├── member-collection-operations.spec.ts
├── member-inventory.spec.ts
├── member-dashboard.spec.ts
├── member-rewards-redeem.spec.ts
├── member-rating-page.spec.ts
├── member-merchant-trading.spec.ts
├── public-profile-page.spec.ts
└── user-report.spec.ts
```

**Run:** `bun run test:e2e` · 詳見 [`docs/dev/e2e.md`](./dev/e2e.md)

---

## 🐘 supabase/

```
supabase/
├── config.toml
└── migrations/                      # 143 檔，按時間戳排序；`bunx supabase db push`
    ├── 20260702100000_product_catalog_public_read.sql
    ├── …                            # auth, marketplace, offers, chat, orders, escrow…
    ├── 20260729190000_admin_grading_workbench.sql
    ├── 20260731100000_escrow_p1_goods_capture_fail_void.sql
    ├── 20260801120000_member_fps_payout.sql          # payout_requests, profiles.fps_id
    ├── 20260802120000_member_fps_payout_pipeline.sql # T+3 hold + cron RPCs
    └── 20260803120200_profiles_fps_name.sql           # profiles.fps_name + fps_name_snapshot
```

**Regenerate types:** `bun run supabase:types` → `types/supabase.ts` + `types/supabase.md`

---

## 📖 docs/dev/ — 整合 handoff

```
docs/dev/
├── INTEGRATION_QUEUE.md             # ⭐ 前後端整合狀態總表
├── api.md                           # Server Actions 契約
├── database.md
├── server.md                        # 含 Cron routes §9（member-fps-payout-ready）
├── escrow-payment-policy.md         # 託管 / capture / FPS T+3 SSOT
├── e2e.md                           # Playwright 環境變數與測試矩陣
├── reports/                         # 實作報告（跨 workflow）
│   └── 2026-07-18-persona-orders-and-chat-report.md
└── follow-up/                       # 每個 workflow 一 packet
    ├── auth-login-register/
    ├── auth-password-recovery/
    ├── marketplace-search/
    ├── marketplace-product-detail/
    ├── marketplace-performance/
    ├── market-pricing-cron/
    ├── product-catalog-search/
    ├── user-profile-settings/
    ├── role-based-routing/
    ├── offers-negotiation/
    ├── buy-now-chat/
    ├── chat-offers-inbox/
    ├── dual-persona-trading/
    ├── persona-reputation-split/
    ├── merchant-trading/
    ├── merchant-checkout/
    ├── merchant-kyc/
    ├── merchant-dashboard/
    ├── merchant-settings/
    ├── merchant-performance/
    ├── merchant-product-analytics/
    ├── member-auth-checkout/
    ├── member-auth-escrow/
    ├── member-fps-payout/           # 1A–1C pipeline + e2e-checklist.md
    ├── admin-grading/
    ├── admin-payouts/
    ├── admin-dashboard/
    ├── marketplace-storefront/
    ├── home-sections/
    ├── public-profile-page/
    ├── profile-rating-list/
    ├── user-trading-orders/
    ├── user-inventory/
    ├── user-collection/
    ├── member-dashboard/
    ├── member-rewards-gamification/
    ├── transaction-reviews/
    ├── wishlist/
    └── lucky-bag-listings-v2/
```

---

## 📋 路由架構

### 三層級檔案系統

```
/profile/user              → 你的個人中心 (第一人稱)
/profile/merchant          → 你的商家儀表板 (第一人稱)
/profile/[id]              → 查看他人檔案 (第三人稱)
```

### 關鍵路由

| 路由 | 用途 | 資料來源 |
|------|------|----------|
| `/auth` | 登入 / 註冊 | Supabase Auth |
| `/auth/forgot-password` | 忘記密碼 | Supabase Auth |
| `/auth/forgot-password/complete` | 郵件連結後重設 | Supabase Auth |
| `/auth/reset-password` | 已登入改密碼 | Supabase Auth |
| `/marketplace` | 大盤搜尋 | `search_marketplace_products` RPC |
| `/marketplace/product/[id]` | 商品詳情 | catalog + 掛單 RPC + 成交紀錄 + 市場價 + 買家出價（全域 `ExecutionSlideOver`） |
| `/marketplace/[id]` | 商戶櫥窗 | `search_marketplace_seller_listings` RPC |
| `/marketplace/[id]/product/[productId]` | 店鋪單品詳情 | `getMarketplaceSellerListingDetail` + BuyButton |
| `/profile/user` | 用戶總覽 dashboard | `member-dashboard.ts` + SSR streaming |
| `/profile/user/collection` | 收藏 portfolio | `getCollectionPageBootstrap` |
| `/profile/user/inventory` | 賣家庫存 | `inventory.ts` + accordion RPC |
| `/profile/user/trading` | 我的買賣訂單（含 B2C 買入 merchant_orders 合併） | `searchUserTradingOrders` + `loadBuyerMerchantTradingOrders` |
| `/profile/merchant/trading` | 商戶賣出訂單 | `searchMerchantTradingOrders` RPC |
| `/profile/merchant/orderDetail/[id]` | 商戶 B2C 訂單詳情 | `getMerchantOrderDetail` |
| `/profile/user/orderDetail/[id]` | 訂單詳情 | P2P + 鑑定託管（`MemberOrderDetailView`） |
| `/profile/user/rewards` | 折價券中心 | `rewards.ts` |
| `/profile/user/settings` | 用戶設定（含 FPS 姓名 + ID） | `getUserSettings` / `updateUserProfile` |
| `/profile/[id]` | 公開檔案 | `getPublicProfilePageBootstrap` |
| `/profile/[id]/rating` | 公開評價列表 | `getPublicProfileReviews` |
| `/checkout/[id]` | B2C / Member auth Stripe 結帳 | `merchant-checkout.ts` / `member-auth-checkout.ts` |
| `/admin/dashboard` | 管理員數據總覽 | `admin-dashboard.ts` |
| `/admin/grading` | 鑑定工作台 | `admin-grading.ts` + capture sagas |
| `/admin/payouts` | 財務與結算（Connect + Member FPS） | `admin-payouts.ts` |
| `/api/cron/ingest-platform-trades` | 平台成交快照 cron | `platform_trade_snapshots` |
| `/api/cron/aggregate-prices` | 市場價聚合 cron | `product_price_snapshots` → `product_grading_market_prices` |
| `/api/cron/expire-merchant-pending-payment` | B2C 未付款逾時 | `merchant_orders` + Stripe PI cancel |
| `/api/cron/member-fps-payout-ready` | Member FPS T+3 → `payout_requests` | `rpc_finalize_member_fps_payout_ready` |
| `/api/stripe/webhook` | Stripe 非同步事件 | merchant + member_auth capture |

---

## 🎯 核心模組狀態

| 模組 | 位置 | 狀態 |
|------|------|------|
| **Auth 登入 / 註冊** | `app/actions/auth.ts`, `app/auth/` | ✅ Supabase |
| **密碼重設** | `app/auth/forgot-password/`, `reset-password/` | ✅ Supabase |
| **大盤搜尋** | `app/marketplace/`, RPC v2 + keyword + trend | ✅ Wired |
| **商品詳情** | `app/marketplace/product/[id]/` | ✅ 掛單簿 + 成交紀錄 + 市場價 + 圖表 |
| **商戶櫥窗** | `app/marketplace/[id]/` | ✅ Wired |
| **市場價聚合 (Cron)** | `app/api/cron/*`, `lib/marketplace/market-price.ts` | ✅ Wired（ingest + aggregate） |
| **首頁三區塊** | `app/home/`, `app/actions/home.ts` | ✅ SSR + BuyButton |
| **用戶設定 / 頭像** | `app/profile/user/settings/`, `profiles.fps_id` + `fps_name` | ✅ Wired |
| **卡牌上架** | `AddAssetModal`, `listings.ts`, Bunny | ✅ Backend ready |
| **收藏 portfolio** | `collection.ts`, `UserCollectionClient` | ✅ Wired |
| **賣家庫存** | `inventory.ts`, `InventoryAccordion` | ✅ Wired（user）；⏳ merchant page |
| **願望清單** | `wishlist.ts`, `WishlistButton` / `WishlistTable` | ✅ Wired |
| **會員獎勵** | `rewards.ts`, `/profile/user/rewards` | 🟡 簽到 + 折價券中心已接；部分 UI 待 polish |
| **用戶總覽** | `member-dashboard.ts`, `UserOverviewClient` | ✅ Wired |
| **出價協商** | `offers.ts`, `ExecutionSlideOver` | 🟡 P2P 已接；merchant 掛單 accept → `merchant_orders`（`20260718100000`） |
| **聊天收件匣** | `chat.ts`, `GlobalChatConsole`, `partnerRoomKey.ts` | 🟡 DB inbox + persona 分房 + Realtime；mock 房間保留 |
| **用戶訂單** | `orders.ts`, `UserTradingClient`, `MemberOrderDetailView` | 🟡 列表 + P2C 買家合併 + 詳情 + 完結/評價已接 |
| **商戶訂單** | `orders.ts`, `MerchantTradingClient`, `MerchantOrderDetailView` | ✅ B2C 列表 + 詳情 + `rpc_complete_merchant_order` |
| **鑑定託管** | `member-auth-checkout`, `admin-grading`, `MemberAuthStripePaymentPanel` | 🟡 Single capture（新單）；legacy multicapture 在途；gate：`test:integration:fps-payout` |
| **Member FPS payout** | `member-fps-payout` pipeline, `FpsIdCollectDialog`, cron | ✅ 1A–1C wired；E2E 待 Stripe 開通（見 e2e-checklist） |
| **Admin 財務** | `/admin/payouts`, `admin-payouts.ts` | 🟡 Connect ledger + FPS ledger MVP ✅ |
| **Admin 鑑定** | `/admin/grading`, capture sagas | ✅ P1 wired |
| **交易評價** | `reviews.ts`, `ReviewModal` | ✅ 雙盲 + member/merchant order persona（交易頁 + 聊天） |
| **公開檔案** | `app/profile/[id]/` | ✅ Wired |
| **結帳 / Stripe B2C** | `merchant-checkout.ts`, `/checkout/[id]` | 🟡 Milestone 1–2 wired；樣式待精修 |
| **商戶 dashboard** | `merchant-dashboard.ts`, analytics | ✅ 總覽 + 績效 + SKU analytics |
| **E2E** | `e2e/`, `playwright.config.ts` | ✅ 20+ specs（含 `admin-stripe-finance`） |

---

## ⚙️ CI & 本地驗證

GitHub Actions（`.github/workflows/ci.yml`）**不含** `.env`：

```bash
bun ci                    # frozen lockfile
bunx tsc --noEmit
bun run lint
bun run build             # CI 等同此步
bun run build:ci          # 本地模擬 CI（空 Supabase env）
bun run test:catalog-search
bun run test:member-order-complete-rpc
bun run test:chat-mark-read
bun test app/lib/chat/partnerRoomKey.test.ts
bun run test:e2e          # Playwright（需 .env fixture；見 docs/dev/e2e.md）
```

**Prerender 守則**（`.cursorrules` §8）：

- `app/**/page.tsx` 不可無 guard 呼叫 `createClient()`
- 使用 `isSupabaseConfigured()`、`getOptionalAuthUser()`
- Server Actions 讀取（被 page SSR 呼叫）需 guard；mutation 可於 runtime 直接 `createClient()`

---

## ✅ 開發檢查清單

提交前確認:

- [ ] 新 `page.tsx` 若讀 Supabase → `isSupabaseConfigured()` / `getOptionalAuthUser()`
- [ ] 新 Server Action → `{ success, data \| error }` 信封
- [ ] DB 型別只從 `types/supabase.ts` import
- [ ] 新 migration → `docs/dev/INTEGRATION_QUEUE.md` + `follow-up/*/backend.md`
- [ ] `bunx tsc --noEmit` · `bun run lint` · `bun run build:ci`
- [ ] 僅用 Bun（勿 npm / yarn / pnpm）
- [ ] 設計遵循 `.stitch/designs/DESIGN.md`

---

## 🚀 快速導航

| 需求 | 位置 |
|------|------|
| 新增頁面 | `app/[route]/page.tsx` |
| Server Action | `app/actions/` |
| API Route | `app/api/` |
| Cron / 背景任務 | `app/api/cron/` |
| Domain helper | `lib/[domain]/` |
| 客戶端 hook | `app/lib/hooks/` |
| Supabase 型別 | `types/supabase.ts` |
| Migration | `supabase/migrations/` |
| 出價 slide-over mapper | `lib/marketplace/map-listing-to-execution.ts` |
| 全域出價 UI host | `app/components/transactions/ExecutionSlideOverHost.tsx` |
| 整合狀態 | `docs/dev/INTEGRATION_QUEUE.md` |
| E2E 測試 | `e2e/`, `docs/dev/e2e.md` |
| 訂單詳情 UI | `app/components/user/MemberOrderDetailView.tsx` |
| FPS 收集 dialog | `app/components/user/FpsIdCollectDialog.tsx` |
| Member FPS E2E 測試清單 | `docs/dev/follow-up/member-fps-payout/e2e-checklist.md` |
| Admin 財務 handoff | `docs/dev/follow-up/admin-payouts/` |
| 託管 / capture 政策 | `docs/dev/escrow-payment-policy.md` |
| 收藏 / 庫存 / 願望清單 | `docs/dev/follow-up/user-collection/`, `user-inventory/`, `wishlist/` |
| 出價協商 handoff | `docs/dev/follow-up/offers-negotiation/` |
| Persona 實作報告 | `docs/dev/reports/2026-07-18-persona-orders-and-chat-report.md` |
| 雙身分聊天 / 訂單 | `app/lib/chat/partnerRoomKey.ts`, `lib/merchant-order/` |
| 聊天收件匣 handoff | `docs/dev/follow-up/chat-offers-inbox/` |
| 商戶訂單 handoff | `docs/dev/follow-up/merchant-trading/` |
| 用戶訂單 handoff | `docs/dev/follow-up/user-trading-orders/` |
| 交易評價 handoff | `docs/dev/follow-up/transaction-reviews/` |
| 會員獎勵 handoff | `docs/dev/follow-up/member-rewards-gamification/` |
| API 契約 | `docs/dev/api.md` |
| 開發守則 | `.cursorrules` |
| CI 配置 | `.github/workflows/ci.yml` |
| 設計規範 | `.stitch/designs/DESIGN.md` |

---

**最後更新**: 2026-07-31  
**版本**: Full-Depth v5.2  
**維護者**: HKCardVault 開發團隊
