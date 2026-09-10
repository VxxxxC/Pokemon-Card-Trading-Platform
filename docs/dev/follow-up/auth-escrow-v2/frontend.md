# Auth Escrow v2 — Frontend

> **Status:** 🟢 Phase B + **Phase C** wired (checkout + admin 待追償)  
> **Backend:** [backend.md](./backend.md) · **Plan:** [plan.md](./plan.md)

## Touchpoints

| Route / component | Change |
|-------------------|--------|
| [`app/checkout/[id]/CheckoutClient.tsx`](../../../app/checkout/[id]/CheckoutClient.tsx) | Auth variants pass `inboundShippingFee` / `outboundShippingFee`; `showAuthEscrowShippingRows` |
| [`app/checkout/[id]/components/CheckoutOrderSummary.tsx`](../../../app/checkout/[id]/components/CheckoutOrderSummary.tsx) | Two SF leg rows for auth escrow |
| [`lib/checkout/compute-pricing.ts`](../../../lib/checkout/compute-pricing.ts) | `member_auth` / `merchant_auth` / direct+auth toggle |
| [`lib/checkout/map-member-session.ts`](../../../lib/checkout/map-member-session.ts) | Maps inbound/outbound from order snapshot |
| [`lib/checkout/map-merchant-session.ts`](../../../lib/checkout/map-merchant-session.ts) | Same for merchant auth |

## Acceptance checklist (Partner QA)

Use a **new** auth order after Phase B migration (`db push`).

Example: HK$100 card → total **HK$310** (auth $150 + inbound $30 + outbound $30).

- [ ] Member `/checkout/{orderId}` shows **four** amount lines: 卡價、鑑定費、運費（賣家→平台）、運費（平台→買家）
- [ ] Merchant `merchant_auth` checkout shows the same four lines
- [ ] `merchant_direct` with **鑑定開關 ON** preview matches v2 amounts before pay
- [ ] Stripe PI authorize = **buyer total** (e.g. $310)
- [ ] Admin intake capture = **$180** ($150 + $30 inbound)
- [ ] Admin pass capture = **$130** ($100 + $30 outbound)
- [ ] No single「運費 HK$0」row on auth-only checkout (replaced by two leg rows)

## Phase C — Fail settlement UI ✅

| Route / component | Change |
|-------------------|--------|
| [`app/admin/grading/AdminGradingClient.tsx`](../../../app/admin/grading/AdminGradingClient.tsx) | Tab **待追償**；確認賣方收款 + 寄回賣家物流 |
| [`app/actions/admin-grading.ts`](../../../app/actions/admin-grading.ts) | `adminClearSellerSettlement`, `adminSubmitSellerReturnTracking` |
| [`app/components/user/MemberOrderDetailView.tsx`](../../../app/components/user/MemberOrderDetailView.tsx) | Seller banner when `seller_settlement_status = pending` |
| [`app/components/merchant/MerchantOrderDetailView.tsx`](../../../app/components/merchant/MerchantOrderDetailView.tsx) | Read-only `grading_fail_recovery` line in Stripe section |

### Phase C acceptance (Partner QA)

1. Fail with `fault_party = seller` on **single** capture order → DB `seller_receivables` pending, `amount_hkd = buyer_total`
2. Admin **待追償** → 確認收款 → `seller_settlement_status = cleared`, receivable `paid`
3. Submit **寄回賣家** tracking → `outbound_tracking_no` on cancelled order
4. Seller order detail shows pending settlement banner

## Out of scope (Phase B)

- Auth checkout coupons / picker subsidy (Phase D — E2E B2b unskipped; preview via RPC)

## Verify

```bash
bun run dev
# Manual: open checkout for new member_auth or merchant_auth order
```
