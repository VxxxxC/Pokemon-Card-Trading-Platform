# Member Auth Escrow — Backend Handoff

## Status

- **Backend:** ✅ Ready (mock payment + escrow RPCs + AML guards)
- **Frontend:** 🟡 Partial — detail/list/chat/listing wired per [frontend.md](./frontend.md)
- **Stripe:** ✅ Milestone 1.5 — `app/actions/member-auth-checkout.ts` + webhook `order_kind=member_auth`（見 [member-auth-checkout/backend.md](./follow-up/member-auth-checkout/backend.md)）

## Overview

Member C2C orders with `member_orders.use_authentication = true` follow a five-step escrow:

`payment` → `custody` (seller → platform) → `grading` → `shipped` (platform → buyer) → `released` / `completed`

P2P meetup orders (`use_authentication = false`) are unchanged.

## Migrations

| Migration | Purpose |
|-----------|---------|
| `20260708100000_member_auth_escrow_status.sql` | `member_escrow_status` enum; dual tracking columns; auth RPCs; `rpc_accept_offer` sets `escrow_status='payment'`; `rpc_make_offer` listing policy check + `[AUTH_REQUEST]` message prefix |
| `20260708110000_member_auth_trading_search.sql` | MEMBER marketplace filter fix; `search_user_trading_orders` returns `escrow_status`; auth-aware pending filters; cancel sets `escrow_status='cancelled'` |
| `20260708120000_member_auth_aml_guards.sql` | P2P limits in `rpc_make_offer` (14-day HK$300 cap; no market price > HK$800 must use auth) |
| `20260715210000_offer_aml_shared_guard.sql` | `fn_assert_p2p_offer_aml_limits` shared helper; enforced in `rpc_make_offer`, `rpc_modify_offer`, `rpc_accept_offer` |
| `20260920120000_p2p_aml_limits_ssot.sql` | Code SSOT mirrors + `fn_assert_p2p_offer_aml_limits` reads mirror fns (see [p2p-aml-limits plan](../p2p-aml-limits/plan.md)) |

Apply: `bunx supabase db push` then regenerate `types/supabase.ts`.

## `listings.use_authentication` semantics

| Layer | Meaning |
|-------|---------|
| `listings.use_authentication` | **Seller policy** — accepts buyer auth add-on (default `true` from app on create) |
| `offers.use_authentication` | **Buyer choice** at offer time |
| `member_orders.use_authentication` | Snapshot from offer on accept |

`rpc_make_offer` rejects `p_use_authentication=true` when listing policy is `false`.

## Server actions (`app/actions/orders.ts`)

| Action | Role | RPC |
|--------|------|-----|
| `mockPayMemberAuthOrder(orderId)` | buyer | `rpc_mock_pay_member_auth_order` |
| `submitInboundTracking(orderId, trackingNo)` | seller | `rpc_submit_inbound_tracking` |
| `confirmBuyerReceived(orderId)` | buyer | `rpc_confirm_buyer_received` |
| `getMemberOrderDetail(orderId)` | participant | direct select + `getMemberAuthOrderActions` |

### Dev-only platform actions (`app/actions/admin-member-orders.ts`)

Blocked when `NODE_ENV === 'production'`. Uses service role.

| Action | RPC |
|--------|-----|
| `confirmPlatformReceived` | `rpc_confirm_platform_received` |
| `completeAuthGrading` | `rpc_complete_member_auth_grading` |
| `submitOutboundTracking` | `rpc_submit_outbound_tracking` |
| `failMemberAuthOrder` | `rpc_fail_member_auth_order` |

## `getMemberOrderDetail` extensions

Returns: `escrowStatus`, `inboundTrackingNo`, `outboundTrackingNo`, `paymentAmount`, `canPay`, `canSubmitInbound`, `canConfirmReceipt`, `listingAcceptsBuyerAuth`, `canCancel`.

Auth orders must **not** use `completeMemberOrder` (P2P only).

## Mock payment

`lib/payments/member-auth-payment.ts` — `createMockMemberAuthPaymentSession()` returns a session id stored on `member_orders.mock_payment_session_id`.

## Listings

`createCardListing` reads form field `useAuthentication` (default `true`). See `app/actions/listings.ts`.

## Verify (backend)

1. Seller creates listing with `use_authentication=true` (default).
2. Buyer offers with auth → offer row + chat message `[AUTH_REQUEST]`.
3. Seller accepts → `member_orders.escrow_status = 'payment'`.
4. `mockPayMemberAuthOrder` → `custody`.
5. Seller `submitInboundTracking` → admin `confirmPlatformReceived` → `grading`.
6. Admin `completeAuthGrading` → `shipped`; `submitOutboundTracking`.
7. Buyer `confirmBuyerReceived` → `released`, `status=completed`.
8. Admin `failMemberAuthOrder` → `cancelled`, listing back to `active`.
