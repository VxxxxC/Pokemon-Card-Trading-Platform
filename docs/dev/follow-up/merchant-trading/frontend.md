# Merchant Trading Orders — Frontend Handoff

## Status

- **List page:** ✅ Wired (`/profile/merchant/trading`)
- **Order detail:** ✅ Wired (`/profile/merchant/orderDetail/[id]`)
- **Buyer confirm (B2C):** ✅ Meetup at `payment_held`; courier at `shipped`; auth rules unchanged
- **Timelines:** ✅ Type-aware (`merchant_auth_seller` / `merchant_direct`); meetup fulfillment step copy
- **Photo gallery:** ✅ `OrderListingPhotoGrid` — 2-col mobile / 3-col desktop

## Files wired

| File | Role |
|------|------|
| `MerchantOrderDetailView.tsx` | Auth inbound form; **non-auth SF tracking only**; meetup read-only at `payment_held`; type-aware timelines |
| `MerchantB2cDirectTimeline.tsx` | Non-auth B2C timeline; meetup fulfillment step label |
| `MerchantAuthSellerTimeline.tsx` | Auth B2C seller timeline |
| `MerchantOrderRow.tsx` | List row + `statusLabelOverride` (待面交 / 待發貨 / 運送中 / 鑑定中) |
| `MemberOrderDetailView.tsx` | Merchant B2C buyer timeline + meetup confirm at `payment_held` |
| `UserTradingClient.tsx` | Merchant non-auth buyer badges (待發貨 / 運送中) |
| `UserOrderRow.tsx` | List-row confirm gated by `canCompleteMerchantPurchase` |
| `OrderListingPhotoGrid.tsx` | Shared 2/3-col listing photo grid + `ImageViewer` zoom |
| `lib/merchant-order/order-timeline-steps.ts` | Shared step definitions + meetup fulfillment copy |
| `lib/merchant-order/buyer-actions.ts` | `canCompleteMerchantPurchase` — meetup @ `payment_held` |
| `app/lib/merchant-order/merchant-seller-actions.ts` | `canSubmitDirectFulfillment` — courier only |

## Buyer confirm gates (`canCompleteMerchantPurchase`)

| Order type | When buyer can confirm |
|------------|------------------------|
| Merchant B2C non-auth **meetup** | `escrow_status = payment_held` |
| Merchant B2C non-auth **courier** | `escrow_status = shipped` |
| Merchant B2C auth | `authenticated` + `auth_result = passed` + outbound tracking + `payment_capture_status = fully_captured` |
| Member P2P meetup | Unchanged — `status = pending`, non-auth |
| Member P2P auth | Unchanged — detail page `canConfirmReceipt` at `shipped` + fully captured |

## Seller fulfillment UI (non-auth)

| `shipping_method` | At `payment_held` |
|-------------------|-------------------|
| `sf` | Tracking + courier inputs +「提交物流單號」→ `submitMerchantDirectFulfillment` |
| `meetup` | Read-only「款項已託管，待買家面交／自取後確認收貨」— **no merchant confirm button** |

At `shipped` (courier only): show outbound tracking; wait for buyer confirm.

## Acceptance checklist

- [x] Trading list loads from DB with label overrides
- [x] Auth `payment_held` — inbound tracking form calls `submitMerchantLogistics`
- [x] Non-auth `payment_held` — SF fulfillment CTA only (meetup is read-only)
- [x] Non-auth meetup `payment_held` — buyer sees confirm CTA (P2P-aligned copy)
- [x] Non-auth `shipped` — read-only seller view; buyer can confirm (courier)
- [x] `authenticating` / `authenticated` — read-only (no mock grading buttons)
- [x] `completed_and_transferred` — review CTA when eligible
- [x] Detail badge: `payment_held` + meetup →「待面交」
- [x] Buyer list/detail: merchant auth orders do **not** show confirm until outbound + authenticated
- [x] Order detail photo grid: 2 columns mobile, 3 columns desktop; click opens `ImageViewer`

## Manual E2E

1. **Non-auth B2C (SF):** buyer pays → merchant submits tracking → buyer confirms at `shipped` → seller page shows transfer ID + commission
2. **Non-auth B2C (meetup):** buyer pays → buyer confirms at `payment_held` (no merchant「確認已面交」)
3. **Auth B2C:** buyer list/detail no confirm until `authenticated` + outbound; auth timeline visible
4. **Member P2P auth / meetup:** unchanged
5. Apply migration `20260803120800` before meetup buyer confirm E2E

## Out of scope

- Merchant dashboard overview mock strip
- Admin grading workbench (auth outbound)

See [backend.md](./backend.md).
