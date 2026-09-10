# Merchant Trading Orders — Backend Handoff

## Status

- **Backend:** ✅ Ready (list RPC + `getMerchantOrderDetail` + auth inbound + **non-auth courier fulfillment**)
- **Frontend:** ✅ Wired — type-aware timelines (auth vs direct) + SF fulfillment UI; **meetup aligned with P2P buyer confirm**
- **Stripe:** ✅ Payment + payout via [merchant-checkout](../merchant-checkout/backend.md); auth grading via [admin-grading](../admin-grading/backend.md)

## Seller actions

| Action | Scope | RPC / action |
|--------|-------|----------------|
| Submit inbound tracking | Auth orders at `payment_held` | `submitMerchantLogistics` → `rpc_submit_merchant_auth_inbound_tracking` |
| Submit direct fulfillment | Non-auth **courier** at `payment_held` | `submitMerchantDirectFulfillment` → `rpc_submit_merchant_direct_fulfillment` |
| Wait for buyer confirm | Non-auth **meetup** at `payment_held`; courier at `shipped` | Read-only — buyer `completeMerchantOrder` |
| Wait for admin grading | `authenticating` / `authenticated` | Read-only; outbound by admin |
| Review buyer | `completed_and_transferred` | `ReviewModal` |

`getMerchantSellerActionFlags()`:

- `canSubmitLogistics` = `payment_held` **and** `requires_authentication` (auth inbound only)
- `canSubmitDirectFulfillment` = `payment_held` **and** `!requires_authentication` **and** `shipping_method !== 'meetup'`

`fn_merchant_order_needs_seller_action` (migration `20260803120100`):

- Auth: `payment_held` + no `inbound_tracking_no`
- Non-auth: `payment_held` (awaiting merchant ship — **meetup excluded at UI level**; seller has no CTA)

## `escrow_state` → seller UX

| Status | Auth order | Non-auth courier | Non-auth meetup |
|--------|------------|------------------|-----------------|
| `pending_payment` | Wait for buyer checkout | Same | Same |
| `payment_held` | Submit inbound tracking | **Submit SF tracking** | Read-only — wait for buyer confirm |
| `shipped` | N/A | Read-only — show outbound tracking; wait for buyer | N/A (buyer confirms at `payment_held`) |
| `authenticating` | Read-only — grading | N/A | N/A |
| `authenticated` | Read-only — show `outbound_tracking_no` if set | N/A | N/A |
| `completed_and_transferred` | Review buyer | Same | Same |

## Direct fulfillment RPC

`rpc_submit_merchant_direct_fulfillment(p_order_id, p_merchant_id, p_tracking_no?, p_courier_name?)`

- Guards: `auth.uid() = merchant_id`, `requires_authentication = false`, `escrow_status = payment_held`, `stripe_payment_intent_id IS NOT NULL`
- `shipping_method = 'sf'`: tracking required → writes `outbound_tracking_no` → `shipped`
- `shipping_method = 'meetup'`: RPC still exists for legacy/manual use; **UI no longer triggers** — buyer confirms at `payment_held`

`rpc_prepare_merchant_order_payout` non-auth branch (migration `20260803120800`):

- **Meetup:** allows `payment_held` (P2P-aligned buyer confirm)
- **Courier:** requires `shipped` (unchanged)
- Auth branch unchanged

## Migrations

| File | Content |
|------|---------|
| `20260803120000_escrow_state_shipped.sql` | `ALTER TYPE escrow_state ADD VALUE 'shipped'` |
| `20260803120100_merchant_direct_shipped.sql` | `rpc_submit_merchant_direct_fulfillment`; patch payout prepare + `fn_merchant_order_is_open` / `fn_merchant_order_needs_seller_action`; rebuild `search_merchant_trading_orders` |
| `20260803120300_merchant_finalize_shipped.sql` | `rpc_finalize_merchant_order_payout` accepts `shipped` (non-auth buyer confirm) |
| `20260803120700_merchant_direct_fulfillment_single_overload.sql` | Single 4-arg `rpc_submit_merchant_direct_fulfillment` overload |
| **`20260803120800_merchant_meetup_buyer_confirm.sql`** | Meetup: `rpc_prepare_merchant_order_payout` allows `payment_held` |

## Server action: `getMerchantOrderDetail`

Returns `outboundTrackingNo`, `itemSubtotal`, `shippingFee`, `shippingMethod`, `totalAmount`, `canSubmitDirectFulfillment` for receipt + fulfillment UI.

## Dev note — existing `payment_held` non-auth orders

- **Courier** orders at `payment_held`: merchant must call `submitMerchantDirectFulfillment` to reach `shipped` before buyer confirm.
- **Meetup** orders at `payment_held`: buyer can confirm immediately after migration `20260803120800` is applied (no merchant confirm step).

## Pending payment expiry

48h unpaid merchant orders: `rpc_finalize_merchant_pending_payment_expiry` + cron `/api/cron/expire-merchant-pending-payment` (see merchant-checkout backend §10).

## How to verify

```bash
bunx supabase db push
bun run supabase:types
bunx tsc --noEmit && bun run lint && bun run build:ci
```

1. Non-auth SF: buyer pays → seller submits tracking → `shipped` → buyer confirms → `completed_and_transferred`
2. Non-auth meetup: buyer pays → **buyer confirms at `payment_held`** → `completed_and_transferred` (no merchant「確認已面交」)
3. Auth: seller submits inbound → read-only until admin intake
4. Regression: Member P2P meetup / auth orders unchanged
