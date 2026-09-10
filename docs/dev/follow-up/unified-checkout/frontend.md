# Unified Checkout Wizard — Frontend

> Backend contract: [backend.md](./backend.md) · `app/actions/checkout.ts` (`loadCheckoutSession`, `getCheckoutPaymentStatus`).  
> Payment intents: `lib/checkout/prepare-payment.ts` → existing merchant / member auth actions.  
> **Payout (post-confirm):** Member 鑑定 → FPS + T+3 提現單；Merchant → Connect + T+7（見 backend § Payout）。

## Variant matrix

| Variant | Order table | Step 1 | Step 2 |
|---------|-------------|--------|--------|
| `merchant_direct` | `merchant_orders` | 商品確認 + 交收 + 聯絡資料 + 可選鑑定 toggle | Stripe Payment Element |
| `merchant_auth` | `merchant_orders`, `requires_authentication=true` | 商品確認 + 鑑定流程說明（無交收） | Stripe |
| `member_auth` | `member_orders`, `use_authentication=true` | 商品確認 + 鑑定流程說明（無交收） | Stripe（dev 無 key → mock panel） |

P2P member orders → checkout rejects with「此訂單不支援線上結帳付款」.

## Stripe routes (sync with plan)

| Checkout | Inbound (checkout) | Outbound (after buyer confirm) |
|----------|-------------------|----------------------------------|
| `merchant_direct` no auth | Automatic capture ✅ | T+7 → **Stripe Connect** |
| `merchant_auth` / direct + auth toggle | Single capture（新單）🟡 Partner QA | T+7 → **Stripe Connect** |
| `member_auth` | Single capture（新單）🟡 Partner QA | T+3 → **FPS `payout_requests`** (not Connect) |

Auth E2E: [capture-policy.md](../../capture-policy.md) · [admin-grading PARTNER_HANDOFF](../admin-grading/PARTNER_HANDOFF.md). FPS gate: `bun run test:integration:fps-payout`.

## Component map

```
app/checkout/[id]/
  page.tsx                 → thin entry → CheckoutClient
  CheckoutClient.tsx       → wizard state, loadCheckoutSession, step 1/2
  components/
    CheckoutWizardStepper.tsx
    CheckoutOrderSummary.tsx
    CheckoutPaymentStep.tsx
    steps/
      CheckoutReviewStep.tsx
      MerchantDirectReview.tsx
      AuthEscrowReview.tsx
  success/page.tsx         → loadCheckoutSession + poll getCheckoutPaymentStatus
```

## Entry points (all non-P2P → `/checkout/{orderId}`)

| File | Change |
|------|--------|
| `app/actions/offers.ts` | Member auth `paymentHref` → `/checkout/{id}` |
| `app/actions/buy-now.ts` | `resolvePaymentHref` member auth → `/checkout/{id}` |
| `app/components/user/UserOrderRow.tsx` | `canPayAuthOrder` → `/checkout/{id}` |
| `app/components/user/MemberOrderDetailView.tsx` | Removed embedded Stripe/mock panels; CTA「前往付款」→ checkout |
| `app/components/chat/OfferCard.tsx` | Uses `paymentHref` from context (no change) |

## Acceptance checklist

- [ ] Merchant direct SF — Step 1 填電話/地址 → Step 2 pay → success
- [ ] Merchant direct meetup — phone only
- [ ] Merchant auth — Step 1 無交收選項 → Step 2 pay
- [ ] Member auth — offer accept → checkout wizard → custody
- [ ] P2P — no checkout link
- [ ] Member auth toggle on merchant direct listing still works
- [ ] Success page polls until paid; CTA「查看訂單」→ order detail

## E2E

`e2e/member-auth-escrow.spec.ts` Step 5: pay on `/checkout/{id}` via `mockPayAuthOrderOnCheckout`.
