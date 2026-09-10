# Member Auth Checkout — Backend

> **Status:** ✅ P0 Ready · 🟡 Partner QA（single capture E2E）  
> **Capture SSOT:** [capture-policy.md](../../capture-policy.md)  
> **Partner handoff:** [admin-grading PARTNER_HANDOFF](../admin-grading/PARTNER_HANDOFF.md)

## Scope

Member C2C orders with `use_authentication=true` only. P2P without auth has no Stripe flow.

## Migrations

- `20260729150000_member_auth_stripe_payment.sql` — columns, prepare/attach/mark paid
- `20260730100000_escrow_p0_manual_capture.sql` — `payment_capture_status`, manual capture RPCs

## Server actions — `app/actions/member-auth-checkout.ts`

| Action | Role |
|--------|------|
| `loadMemberAuthCheckoutOrder` | buyer/seller read snapshot |
| `createMemberAuthPaymentIntent` | buyer — PI `capture_method: manual`（新單 single capture at pass；legacy 仍設 `request_multicapture: if_available`） |
| `getMemberAuthPaymentStatus` | poll after pay → `custody` + `authorized` |
| `isMemberAuthStripePaymentAvailable` | publishable key guard |

## Webhook (`app/api/stripe/webhook/route.ts`)

| Event | Handler |
|-------|---------|
| `payment_intent.amount_capturable_updated` | `metadata.order_kind=member_auth` → `rpc_mark_member_auth_order_authorized` |
| `payment_intent.succeeded` | partial auth_fee → `rpc_finalize_auth_fee_capture` (admin intake) |
| `payment_intent.canceled` | `rpc_mark_auth_order_payment_voided` |

## Env

Same as merchant: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## Verify

```bash
bunx supabase db push
bun run supabase:types
```

Manual (Stripe test mode): checkout → PI `requires_capture` → order `custody` + `payment_capture_status=authorized`.
