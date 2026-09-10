# Buy Now → Chat — Frontend

## Flow

1. `BuyButton` → `BuyNowConfirmDialog`（guest → `BuyNowGuestLockDialog`）
2. 確認 → `buyNowListing` → `completeBuyNowFlow`（hydrate chat + 商戶單自動 `/checkout`）
3. Offer 卡 `accepted` + 買家 CTA「前往付款」/「查看訂單」（checkout 離開後的 fallback）

「改為議價出價」→ 開 `ExecutionSlideOver`。

## Files

| File | Change |
|------|--------|
| `BuyNowConfirmDialog.tsx` | 確認對話框 + guest lock；商戶單 redirect checkout |
| `GlobalTxButtons.tsx` | Buy 不再預設開 slide-over |
| `ExecutionSlideOver.tsx` | 立即購買 → `completeBuyNowFlow` |
| `lib/chat/complete-buy-now-flow.ts` | Chat hydrate + merchant checkout redirect |
| `lib/chat/open-buy-now-session.ts` | Chat hydrate（由 completeBuyNowFlow 調用） |
| `OfferCard.tsx` | Accepted 買家 CTA |
| `NewArrivals.tsx` / `PremiumMarket.tsx` | 卡片連結 → `/marketplace/[sellerId]/product/[listingId]` |
| `lib/marketplace/listing-detail-href.ts` | URL helper |

## Checklist

- [ ] 登入買家點「立即購買」→ 確認框 → chat hydrate + Offer 卡已接受
- [ ] **商戶訂單**：確認後自動跳 `/checkout/[orderId]`（同時 hydrate chat）
- [ ] 商戶訂單：Offer 卡「前往付款」→ `/checkout/[orderId]`（fallback）
- [ ] 會員 auth：「前往付款」→ order detail Stripe / mock pay
- [ ] 會員 P2P：「查看訂單 / 交收指引」；總覽 badge「待處理」非「已付款」
- [ ] Homepage 卡片點擊進入私域 listing 頁
