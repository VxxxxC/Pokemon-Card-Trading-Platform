# Merchant Checkout — 前端接駁（Payment Milestone 1–2）

> 後端契約見 [backend.md](./backend.md)。以下為已接駁的 UI 位置與仍需前端精修的項目。

## 1. 前置條件

`.env` 需新增（缺少時 checkout 會回「付款服務尚未設定」）：

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

已安裝：`@stripe/stripe-js`、`@stripe/react-stripe-js`（`bun add`）。

## 2. 已接駁檔案

| 檔案 | 改動 |
|------|------|
| `app/checkout/[id]/page.tsx` | Thin entry → `CheckoutClient`（2-step wizard：訂單確認 → 付款）。`loadCheckoutSession()` 支援 merchant + member auth；Step 2 經 `prepareCheckoutPayment()` → `<Elements>` + poll `getCheckoutPaymentStatus` |
| `app/checkout/[id]/CheckoutClient.tsx` | Wizard state、`CheckoutReviewStep` / `CheckoutPaymentStep` / `CheckoutOrderSummary` |
| `app/checkout/[id]/success/page.tsx` | `loadCheckoutSession` + `getCheckoutPaymentStatus` 輪詢；merchant / member auth 分支文案 |
| `app/components/transactions/ExecutionSlideOver.tsx` | 所有 listing「⚡ 立即購買」→ `buyNowListing()` → **開 chat**（付款由 Offer 卡 CTA 去 checkout） |
| `app/components/transactions/BuyNowConfirmDialog.tsx` | `BuyButton` 預設開確認框；「改為議價出價」才開 slide-over |
| `app/components/chat/OfferCard.tsx` | accepted 買家「前往付款」/「查看訂單」CTA |
| `app/components/user/UserOrderRow.tsx` | `dbOrderContext.pendingPayment` → 顯示「前往付款」CTA（去 `/checkout/[orderId]`）；同時**隱藏**「確認完成」CTA |
| `app/components/user/MemberOrderDetailView.tsx` | `order.pendingPayment` → 頂部待付款提示區塊 + 買家「前往付款」；未付款不顯示 P2P 完成流程 |
| `app/components/merchant/MerchantOrderDetailView.tsx` | `escrowStatus === "pending_payment"` → 「等待買家完成託管付款」提示；原「買家已完成全額付款 + 確認訂單並移交保管」改為只在真正 `payment_held` 且**非鑑定單**顯示；鑑定單 `canSubmitLogistics` 顯示入庫物流 input；**買家交收資料** read-only 區塊 |
| `app/components/marketplace/MarketplaceCard.tsx` | 商戶掛單顯示 `deliverySummary`（`快遞 HK$X 起 · 面交免運`） |
| `app/components/marketplace/AskOrderBookRow.tsx` | order book 列顯示 `deliverySummary` |
| `app/components/transactions/BuyNowConfirmDialog.tsx` | 確認框顯示運費配送摘要 |
| `app/components/shared/AddAssetModal.tsx` | merchant 上架路徑附加運費 input（單卡 + 密封） |
| `app/components/merchant/ListingEditDialog.tsx` | 商戶庫存編輯附加運費（`inventoryContext="merchant"`） |
| `lib/merchant-checkout/pending-payment-expiry.ts` | 48h 待付款 deadline 計算 + 倒數格式化 |
| `app/lib/hooks/usePaymentCountdown.ts` | checkout / trading 倒數 hook |
| `app/components/merchant/MerchantOrderRow.tsx` | `OrderStatusBadge` 新增 `labelOverride`，pending_payment 顯示「待買家付款」 |
| `app/profile/user/(dashboard)/trading/UserTradingClient.tsx` | `order.pendingPayment` → 「待付款」badge；傳 `pendingPayment` 落 `dbOrderContext` |

## 3. 資料契約

`UserTradingOrder` / `MemberOrderDetail` 新增欄位：

```ts
pendingPayment: boolean; // B2C 商戶訂單尚未完成 Stripe 託管付款
```

`SaleOrder` 新增選填欄位：

```ts
statusLabelOverride?: string; // 託管步進器以外的細分狀態文案（例：待買家付款）
```

計價常數（UI 預覽用，**DB 為權威值**）：`lib/merchant-checkout/pricing.ts`
`SF_SHIPPING_FEE = 30`、`MEETUP_SHIPPING_FEE = 0`、`AUTHENTICATION_FEE = 150`。

## 4. 驗收清單

- [ ] `.env` 已加 `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- [ ] 點「立即購買」→ 確認框 → **商戶單**自動跳 `/checkout`（同時 hydrate chat）；**會員 P2P** 開 chat
- [ ] Offer 卡「前往付款」→ `/checkout/[orderId]`，商品資料 / 賣家 / 價格為真實訂單值
- [ ] slide-over 內「立即購買」同樣開 chat（可從確認框「改為議價出價」進入 slide-over 後測）
- [ ] 切換順豐 / 面交、開關鑑定服務，總額同步（運費由 shop base + listing extra 計算；面交 `0`、鑑定 `150 / 0`）
- [ ] 填寫 SF 櫃代碼 / 電話或面交備註後付款，`merchant_orders` 持久化交收欄位；商戶／買家訂單詳情可讀
- [ ] 商戶掛單在大盤卡 / order book / BuyNow 見 `快遞 HK$X 起 · 面交免運`
- [ ] 按「鎖定資產並進入安全託管支付」後出現 Payment Element；`4242…` 測試卡付款成功（含鑑定 manual capture：`requires_capture` 後輪詢至 `payment_held`）
- [ ] 成功頁先顯示「付款處理中」，webhook 到達後自動轉「交易成功設立」
- [ ] `/profile/user/trading` 未付款訂單顯示「待付款」badge + 倒數 + 「前往付款」，**無**「確認完成」
- [ ] 商戶 `/profile/merchant/trading` 見「待買家付款」badge，訂單詳情**無**出貨 CTA
- [ ] 重新進入已付款訂單的 `/checkout/[id]`，顯示「已完成付款或已進入下一階段」且付款鍵 disabled
- [ ] 買家確認完成時由既有 CTA 呼叫 `completeMerchantOrder`；成功後訂單進入 `completed_and_transferred`
- [ ] Stripe 暫時失敗會收到「商戶撥款失敗，請稍後重試」；不應在 client 自行重建 transfer

`completeMerchantOrder` 的 UI contract 無改動，仍回 `{ success: true } | { success: false, error }`。後端會以相同 Stripe idempotency key 重試；如 action 已建立 transfer 但 DB 尚未 finalize，顯示「撥款正在核對中」並重新整理即可。

## 5. 待前端精修（樣式 / UX，後端唔會動）

- 「立即購買」CTA 目前用 outline 佔位樣式，與「發送叫價至聊天室」主鍵的視覺層級待調整
- `<PaymentElement>` 已對齊 brand token（`#D4A574` primary）；完整 design system 仍待精修
- 優惠券區塊在 `AVAILABLE_COUPONS` 為空時已隱藏
- 待付款訂單已顯示 48h 倒數（`created_at + 48h`，與 cron 一致）；過期後引導重新下單
