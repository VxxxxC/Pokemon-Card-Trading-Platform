# Buy Now → Chat — Backend

## RPC

| Function | Args | Returns |
|----------|------|---------|
| `rpc_buy_now_listing` | `p_listing_id`, `p_buyer_id`, `p_use_auth` | `{ room, offer, offer_message, accepted_message, order, order_kind }` |

Migration: `20260729140000_rpc_buy_now_listing.sql`

- Merchant → `merchant_orders.pending_payment`
- Member → `member_orders` (+ AML guard)
- Inserts offer card message then `SYSTEM_OFFER_ACCEPTED`
- `rpc_buy_now_merchant_listing` → thin wrapper

## Server action

`app/actions/buy-now.ts` → **`buyNowListing(listingId, useAuth?)`**

Merchant listings: `isMerchantPayoutReady` gate before RPC.

`buyNowMerchantListing` in `merchant-checkout.ts` delegates to `buyNowListing` (compat).

## Verify

```bash
bunx supabase db push
bun run supabase:types
```
