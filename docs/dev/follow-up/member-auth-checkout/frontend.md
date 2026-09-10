# Member Auth Checkout — Frontend

## Payment UI

**Unified checkout wizard:** `/checkout/[orderId]` (Step 1 鑑定說明 → Step 2 Stripe / dev mock)

Order detail (`MemberOrderDetailView`) shows CTA「前往付款」→ checkout only (no embedded panels).

| Condition | Step 2 panel |
|-----------|----------------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` set | `CheckoutPaymentStep` (Stripe Elements) |
| Otherwise (dev) | `MemberAuthMockPaymentPanel` in `CheckoutClient` |

Files:

- `app/checkout/[id]/CheckoutClient.tsx` — wizard + mock fallback
- `app/checkout/[id]/components/CheckoutPaymentStep.tsx` — Payment Element + poll `getCheckoutPaymentStatus`
- `MemberOrderDetailView.tsx` — CTA to checkout when `escrowStatus=payment && canPay`

OfferCard / buy-now `paymentHref` → `/checkout/{id}`.

## Checklist

- [ ] Auth order at `payment` → checkout Step 1 → Step 2 Stripe (or mock when no key)
- [ ] `4242…` test card → webhook → `custody` + timeline「待寄平台」
- [ ] P2P order (no auth) has no checkout link
- [ ] Production: mock pay only when publishable key missing

See also [unified-checkout/frontend.md](../unified-checkout/frontend.md).
