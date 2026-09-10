# System Feature Registry — Staging 終極 Checklist

> **角色：** Member · Merchant · Admin · System — **in-scope 全部上線功能**（除 [v3-deferred.md](./v3-deferred.md)）。  
> **North star：** 本表 **每一行 `進度` = ☑** + [staging-certification.md](./staging-certification.md) `test:staging:certify` 綠 = **Staging 可俾人用**。  
> **主 SSOT：** [test-coverage-ssot.md](./test-coverage-ssot.md) v2.5（旅程 TC/J/SEC 與本表對照）  
> **Partner UI：** [partner-regression.md](./partner-regression.md)（P-* 進度 · 補 T2 顯示層缺口）  
> **Email 通知（規劃）：** [email-notifications-ssot.md](./email-notifications-ssot.md)  
> **Push 通知（規劃）：** [push-notifications-ssot.md](./push-notifications-ssot.md)

---

## 0. 點樣試（深度約定）

| 代號 | 名稱 | 做咩 | 組合 |
|------|------|------|------|
| **T0** | Smoke | 頁面開到、無 500、關鍵按鈕存在 | 1 條 happy path |
| **T1** | Logic | Integration / unit / FSM / 矩陣 negative | 按域：金流/券 **要** negative |
| **T2** | Journey | Partner UI 全鏈 E2E | 每功能 ≥1 主旅程 |
| **T3** | Matrix | 多參數組合 soak | 僅 P0 金流/券/eligibility |
| **P** | Partner UI | UI-first · 顯示/assert · bugs_finding | 見 [partner-regression.md](./partner-regression.md) P-* |
| **M** | Manual | Partner 肉眼 spot | **唔可**作唯一證明；SC-P0 綠後 M0 ~5min |

**人手安排（認證後日常）：**

| 時機 | 做咩 | 時間 |
|------|------|------|
| 每次 staging deploy | **M0** — 登入 + 4 admin 頁 + rewards 頁 + legal | ~5 min |
| 首次新模組上線 | 該模組 **M1** spot（UI/文案） | ~10 min |
| 其餘 | **唔做** — 靠 T0–T3 |

---

## 1. Member（會員）

| ID | 功能 | 目標深度 | Artifact | CI | 進度 |
|----|------|----------|----------|-----|------|
| **F-M-01** | 登入／登出 | T2 | 各 E2E setup | Gate | ☑ |
| **F-M-02** | 忘記／重設密碼 | T0 | `member-auth-password` | Gate | ☑ |
| **F-M-03** | 停權帳號 → `/auth/suspended` | T1 | `admin-moderation` AB5 | Gate | ☑ |
| **F-M-04** | 首頁 | T0 | `home-p0-smoke` | Gate | ☑ |
| **F-M-05** | 市集／賣家 storefront | T2 | `marketplace-storefront` | Nightly L6 | ☑ |
| **F-M-06** | 搜尋＋出價／議價（`makeOffer`，**唔係 Auction mock**） | T2 | `marketplace-search-offer` | Nightly L6 | ☑ |
| **F-M-07** | 商品詳情＋Buy-now | T2 | `merchant-product-detail` | Nightly L6 | ☑ |
| **F-M-08** | 公開 profile＋評價頁 | T2 | `public-profile-page` · `member-rating-page` | Nightly L6 | ☑ |
| **F-M-09** | 會員 dashboard | T0 | `member-dashboard` | Nightly† | ☑ |
| **F-M-10** | Collection／wishlist | T2 | `member-collection-wishlist` · `member-collection-operations` | Nightly L6 | ☑ |
| **F-M-11** | Inventory／持有卡 | T2 | `member-inventory` | Nightly L6 | ☑ |
| **F-M-12** | 會員設定 | T0 | `member-auth-settings` | Manual† | ☑ |
| **F-M-13** | 即時對話 | T2 | `global-chat-realtime` | Nightly | ☑ |
| **F-M-14** | C2P 面交全鏈（含評價步） | T2 | `member-trading-p2p` | Nightly | ☑ |
| **F-M-15** | 議價 offer 往返 | T2 | `member-offer-negotiation` | Nightly | ☑ |
| **F-M-16** | C2C 鑑定 escrow 全鏈 | T2 | `member-auth-escrow` · inbound | Nightly† | ☑ |
| **F-M-17** | 訂單詳情（P2P／鑑定） | T2 | `member-order-detail-p2p` · `member-order-detail-auth` | Nightly† | ☑ |
| **F-M-18** | 交易列表／篩選 smoke | T1 | `member-trading-smoke` · `member-trading-filters` | Nightly L6 | ☑ |
| **F-M-19** | B2C checkout＋券 | T2+T3 | `platform-rewards-phase2` · `rewards-checkout-coupon` · matrix | Rewards | ☑ |
| **F-M-20** | C2C 鑑定 checkout＋Admin 券 | T2 | `member-auth-coupon-admin` | Rewards | ☑ |
| **F-M-21** | 積分／獎勵錢包兌換 | T2 | `member-rewards-redeem` · phase4 | Rewards | ☑ |
| **F-M-22** | 舉報用戶 | T2 | `user-report` | Gate | ☑ |
| **F-M-23** | 舉報結果通知 | T2 | `report-outcome-notification` | Gate | ☑ |
| **F-M-24** | 公告列表（公開） | T0 | `platform-announcements` integration · `public-announcements-page` | Nightly L6 | ☑ |
| **F-M-25** | 條款／私隱 | T0 | `legal-pages-smoke` | Gate | ☑ |
| **F-M-26** | 賣家視角交易（member 做 seller） | T2 | `member-merchant-trading` | Nightly L6 | ☑ |

† **Nightly†** = 要接入 `test:nightly:coverage` 或 gate 先可標 ☑（spec 已有未入 CI 仍 ☐）。

---

## 2. Merchant（商戶）

| ID | 功能 | 目標深度 | Artifact | CI | 進度 |
|----|------|----------|----------|-----|------|
| **F-C-01** | 商戶 dashboard | T0 | `member-merchant-trading`（`/profile/merchant`） | Nightly† | ☑ |
| **F-C-02** | 商戶 trading 收件 | T2 | `member-merchant-trading` | Nightly L6 | ☑ |
| **F-C-03** | 庫存／listing 管理 | T2 | `member-inventory` + listing actions | Nightly L6 | ☑ |
| **F-C-04** | 上架／商品詳情（賣家） | T2 | `merchant-product-detail` + upload | Nightly L6 | ☑ |
| **F-C-05** | 商戶設定 | T0 | `merchant-settings-smoke` | Nightly L6 | ☑ |
| **F-C-06** | 商戶財務 | T0 | `merchant-finance-smoke` | Nightly L6 | ☑ |
| **F-C-07** | Analytics／Performance | T0 | `merchant-analytics-performance-smoke` | Nightly L6 | ☑ |
| **F-C-08** | 商戶申請／KYC | T2 | `merchant-kyc` integration · TC-M11 | Gate partial | ☑ |
| **F-C-09** | Stripe Connect 入驻 | T1 | `connect-routes` · `merchant-finance-smoke` | Gate partial | ☑ |
| **F-C-10** | B2C 鑑定 checkout（買家側已測） | T2 | `merchant-auth-baseline-checkout` | Rewards | ☑ |
| **F-C-11** | 商戶訂單詳情 | T2 | `merchant-order-detail` | Nightly L6 | ☑ |
| **F-C-12** | 圖片上傳（listing／banner／avatar） | T1 | `tc-m30` · `tc-m31` upload routes | Nightly | ☑ |
| **F-C-13** | 商戶鑑定 grading E2E | T2 | `verify:merchant-grading-e2e` · `test:integration:grading` | Signoff | ☑ |

---

## 3. Admin（營運）

| ID | 功能 | 目標深度 | Artifact | CI | 進度 |
|----|------|----------|----------|-----|------|
| **F-A-01** | Admin dashboard | T0 | `admin-stripe-finance` · `/admin/dashboard` | Gate partial | ☑ |
| **F-A-02** | 平台設定（費用／佣金／legal） | T2 | `admin-settings` + CC-PLAT | Gate partial | ☑ |
| **F-A-03** | 券／活動／wizard | T2+T1 | phase2/3/4 · `admin-publish-defaults` | Rewards | ☑ |
| **F-A-04** | 簽到計劃 | T1 | `admin-check-in-program` · `TC-M41` · matrix M-A2 | Nightly L6 | ☑ |
| **F-A-05** | 爭議／moderation | T2+T1 | `admin-moderation` · `moderation-matrix` | Gate | ☑ |
| **F-A-05b** | **Merchant 非鑑定售後退款**（`merchant_direct` · Phase H S3） | T1+T2 | `phase-h-refund` I-H1 · I-H14 E2E | Gate | ☑ |
| **F-A-06** | 鑑定 grading 操作 | T2 | `admin-grading` · grading integration | Gate | ☑ |
| **F-A-07** | 商戶／KYC 審核 | T2 | `admin-merchants-kyc` · `admin-kyc-list` | Nightly L6 | ☑ |
| **F-A-08** | 用戶目錄 user control | T0 | `admin-user-control` | Nightly L6 | ☑ |
| **F-A-09** | 商品目錄 catalog | T0 | `admin-catalog` | Nightly L6 | ☑ |
| **F-A-10** | 出款／FPS／Stripe 財務 | T2 | `admin-stripe-finance` · fps pipeline | Gate partial | ☑ |
| **F-A-11** | 公告管理 | T2 | `admin-announcements` | Nightly L6 | ☑ |
| **F-A-12** | 會員訂單 admin | T1 | `admin-member-orders` · `TC-M40` | Gate partial | ☑ |
| **F-A-13** | 爭議凍結出款 | T1 | `admin-dispute-freeze` | Nightly L6 | ☑ |
| **F-A-14** | Admin 建 C2C 券 parity | T2 | `member-auth-coupon-admin` | Rewards | ☑ |

---

## 4. System（平台／API／安全）

| ID | 功能 | 目標深度 | Artifact | CI | 進度 |
|----|------|----------|----------|-----|------|
| **F-S-01** | Stripe webhook | T1 | `webhook-route` · `coupon-webhook` | Gate partial | ☑ |
| **F-S-02** | Cron HTTP（6 條） | T1 | `cron-routes` · `TC-M01`–`M06` | Nightly | ☑ |
| **F-S-03** | 鑑定費／佣金 DB 邏輯 | T1 | `auth-fee` · `commission-rate` | Nightly | ☑ |
| **F-S-04** | FPS／Connect 出款 pipeline | T1 | fps + connect integration | Signoff | ☑ |
| **F-S-05** | P2P AML 限額 | T1 | `p2p-aml-limits` | Nightly | ☑ |
| **F-S-06** | 券 FSM／安全／PBT | T1+T3 | coupon FSM · security · pbt · matrix | Gate | ☑ |
| **F-S-07** | Moderation 退款 FSM | T1+T2 | `phase-h-refund` · I-H14 E2E | Gate | ☑ |
| **F-S-08** | Auth grading FSM | T1+T3 | `auth-grading-*` · stripe smoke | Gate | ☑ |
| **F-S-09** | Config Contract parity | T1+T2 | CC 三件套 · registry | Rewards | ☑ |
| **F-S-10** | Mutation 存活 | T1 | `rewards:mutation` · `moderation:mutation` | Certify | ☑ |
| **F-S-11** | Platform legal SSR | T1 | `platform-legal` | Nightly | ☑ |
| **F-S-12** | 商戶未付款過期 | T1 | `merchant-pending-payment-expiry` | Gate | ☑ |
| **F-S-13** | **P2P 面交永不平台退款**（政策） | T1 | `p2p-dispute-no-refund` | Gate | ☑ |

---

## 5. 匯總 — Staging 認證條件

| 匯總 ID | 條件 | 進度 |
|---------|------|------|
| **SC-FX-M** | §1 Member **全 ☑** | ☑ |
| **SC-FX-C** | §2 Merchant **全 ☑** | ☑ |
| **SC-FX-A** | §3 Admin **全 ☑** | ☑ |
| **SC-FX-S** | §4 System **全 ☑** | ☑ |
| **SC-FX-ALL** | 上列四項全 ☑ + `test:staging:certify` 綠 + **SC-P0** + Partner M0 | ☑（2026-08-22） |

**統計（2026-08-22）：** Member **26/26 ☑** · Merchant **13/13 ☑** · Admin **15/15 ☑** · System **13/13 ☑** — **67/67 功能 T0–T3 ☑** · **SC-FX-ALL ☑**（`test:staging:certify` PASS · Partner M0 2026-08-22）。

---

## 6. 與舊 TC/J ID 對照

| 本表 | 舊 SSOT |
|------|---------|
| F-M-13 | TC-E03 |
| F-M-14/15 | J-TRD-01/02 · TC-E01/02 |
| F-M-19/20 | J-CPN-01–05 · TC-E13 |
| F-M-22/23 | J-MOD-01 |
| F-A-05b | merchant_direct Phase H I-H1 |
| F-S-13 | p2p-dispute-no-refund |
| F-C-08/09 | TC-M10–M11 |
| F-S-02 | TC-M01–M06 |
| 本表 F-* | [partner-regression.md](./partner-regression.md) P-* |

---

## Changelog

| 日期 | 變更 |
|------|------|
| 2026-08-18 | v2.5：深度 **P** · SC-FX-ALL 加 SC-P0 · 連結 partner-regression.md |
| 2026-08-17 | P5 Merchant **+7 ☑**（F-C-05–12）· **SC-FX-C** · merchant smoke E2E + `merchant-order-detail` + upload TC-M30/31 + connect/KYC integration |
| 2026-08-17 | P4 System **+3 ☑**（F-S-01/02/10）· **SC-FX-S** · `cron-routes` TC-M01–M06 · mutation 91.67%/95.24% |
| 2026-08-17 | P3 System **+3 ☑**（F-S-03/04/09）· `auth-fee`+`commission-rate`+fps/connect INT 綠 · CC-INT `admin-publish-defaults`（`getRewardTemplateRowByTitle` 改 admin RPC） |
| 2026-08-17 | P2 merchant grading **+2 ☑**（F-C-13 · F-S-08）· `test:integration:grading` 57/57 |
| 2026-08-17 | Admin L6 **13/13 pass** · +5 ☑（F-A-08/09/10/11/13）· `auth-fee` merchant listing fallback（`E2E_LISTING_ID`=member 時自動用 seller merchant listing） |
| 2026-08-17 | Admin L6 **8/13 pass** · `e2e/helpers/admin-auth` · `test:e2e:nightly:admin` · +5 ☑（F-A-01/02/06 · F-S-05/11） |
| 2026-08-17 | L6 member **73 pass 0 fail** · Merchant L6 **42 pass** · +4 ☑（F-M-09/21 · F-C-01/03）· `test:e2e:nightly:merchant` |
| 2026-08-16 | L6 run #3：65 pass · `chat_rooms`/`product_watchlists` service_role GRANT · `/profile/user_*` guest route fix · +3 ☑（F-M-06/08/18）· F-M-09 ◐ |
| 2026-08-16 | L6 再跑：+6 ☑（F-M-05/07/11/26 · F-C-02/04）· +5 ◐ |
| 2026-08-16 | 初版：Member/Merchant/Admin/System 全功能登記 · 深度 T0–T3 · SC-FX 匯總 |
