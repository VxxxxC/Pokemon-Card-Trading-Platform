# Merchant Connect T+7 Hold — Backend

> 買家確認後平台保留 7 日，cron 到期再 `transfers.create`。對齊 Member T+3 FPS hold。

## Files

| 路徑 | 說明 |
|------|------|
| `supabase/migrations/20260804120000_merchant_connect_payout_t7_hold.sql` | Schema + RPCs |
| `app/actions/orders.ts` | `completeMerchantOrder` → `rpc_confirm_merchant_buyer_receipt` |
| `lib/merchant-order/execute-connect-payout.ts` | prepare → Stripe transfer → finalize |
| `lib/merchant-order/parse-merchant-payout-preparation.ts` | Shared prepare parser |
| `lib/merchant-order/merchant-order-rpc.ts` | `rpcConfirmMerchantBuyerReceipt` |
| `app/api/cron/merchant-connect-payout-ready/route.ts` | Hourly batch payout |
| `vercel.json` | Cron schedule |
| `lib/merchant-order/buyer-actions.ts` | `buyerConfirmedAt` blocks re-confirm |
| `app/lib/merchant-order/merchant-seller-actions.ts` | `canReviewBuyer` after confirm |
| `app/actions/reviews.ts` | Merchant review eligibility |

## Action contract

### `completeMerchantOrder(orderId)`

```ts
{ success: true } | { success: false, error: string }
```

- Calls `rpc_confirm_merchant_buyer_receipt`
- No Stripe on confirm
- Idempotent when `buyer_confirmed_at` already set

### `executeMerchantConnectPayout(orderId)` (internal / cron)

```ts
{ success: true, orderId, transferId?, alreadyApplied? }
| { success: false, orderId, error }
```

## DB state after buyer confirm

| Field | Value |
|-------|-------|
| `buyer_confirmed_at` | `now()` |
| `payout_hold_until` | `now() + 7 days` |
| `payout_status` | `held` |
| `stripe_transfer_id` | `NULL` |
| `escrow_status` | unchanged (`shipped` / `authenticated` / meetup `payment_held`) |

## Cron verify

```bash
bunx supabase db push
# Backdate payout_hold_until for a held test order, then:
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/merchant-connect-payout-ready" | jq
```

## E2E checklist

- [ ] Meetup / courier / auth: buyer confirm → `held`, `payout_hold_until ≈ +7d`, no `stripe_transfer_id`
- [ ] Backdate hold → cron → `transferred_at`, `completed_and_transferred`
- [ ] Buyer cannot double-confirm; can leave review after confirm
- [ ] Member T+3 FPS unchanged
- [ ] Legacy orders with existing transfer unchanged
