# Unified Checkout Wizard — Backend

> Frontend handoff: [frontend.md](./frontend.md).  
> Policy SSOT: [escrow-payment-policy.md](../../escrow-payment-policy.md) · Capture 模型: [capture-policy.md](../../capture-policy.md).

## Checkout entry

| Action | Contract |
|--------|----------|
| `loadCheckoutSession(orderIdOrNumber)` | Merchant first, else member auth; P2P → error |
| `getCheckoutPaymentStatus(orderIdOrNumber)` | Poll success page; merchant `escrow !== pending_payment`, member `custody` + `paymentConfirmedAt` |
| `prepareCheckoutPayment(session, form?)` | Thin wrapper → `createMerchantOrderPaymentIntent` or `createMemberAuthPaymentIntent` |

Files: `app/actions/checkout.ts`, `lib/checkout/*`.

---

## Two Stripe **inbound** routes (checkout only)

Checkout 只負責**入款**；出款見下方 § Payout。

| Route | Variants | PI | Status |
|-------|----------|-----|--------|
| **A — Normal automatic** | `merchant_direct`（`useAuth=false`） | `capture_method: automatic` | ✅ **Ready to test** — 付款即 capture 入平台 |
| **B — Auth manual** | `merchant_auth`, `merchant_direct` + 鑑定 toggle, `member_auth` | 新單：**single capture at pass**；legacy：`manual` + `request_multicapture` | 🟡 **Partner QA** — 見 [capture-policy](../../capture-policy.md) · [PARTNER_HANDOFF](../admin-grading/PARTNER_HANDOFF.md) |

Branch in `createMerchantOrderPaymentIntent`:

```ts
const captureMethod = options.useAuth ? "manual" : "automatic";
```

`prepareCheckoutPayment` sets `useAuth` from `merchant_auth` or `form.authServiceEnabled`.

Webhook:

- Route A → `payment_intent.succeeded` → merchant `payment_held` / member custody flow
- Route B → `amount_capturable_updated` → `authorized`; staged partial capture via admin grading sagas

**Route B E2E:** 新鑑定單 `escrow_capture_model = 'single'` — [capture-policy](../../capture-policy.md) · [PARTNER_HANDOFF](../admin-grading/PARTNER_HANDOFF.md). Legacy multicapture 在途單仍支援。Route A (non-auth merchant) remains independently validated.

---

## Two **outbound** routes (after buyer confirm — not checkout)

| Order type | Trigger | Hold | After hold | Channel |
|------------|---------|------|------------|---------|
| **Member 鑑定** (`member_orders`, `use_authentication=true`) | `confirmBuyerReceived` | **T+3** (`payout_hold_until`) | Hourly cron `member-fps-payout-ready` | **FPS** — insert `payout_requests`；Admin `/admin/payouts` 人手 mark paid。**Not Connect.** |
| **Merchant B2C** (`merchant_orders`) | `completeMerchantOrder` → `rpc_confirm_merchant_buyer_receipt` | **T+7** (`payout_hold_until`) | Hourly cron `merchant-connect-payout-ready` | **Stripe Connect** — `transfers.create` → `completed_and_transferred` |

### Member FPS + T+3 (detail)

1. Buyer confirm → `seller_payout_status = held`, `payout_hold_until = now() + 3 days`（**no** immediate payout row）
2. Cron when `fully_captured` + hold expired → `rpc_finalize_member_fps_payout_ready` → **`payout_requests`** (`amount = final_price`, FPS snapshot)
3. Admin marks FPS paid (platform bank transfer, off-Stripe)

See [member-fps-payout/backend.md](../member-fps-payout/backend.md).

### Merchant Connect + T+7 (detail)

1. Buyer confirm → `payout_status = held`, `payout_hold_until = now() + 7 days`, **no** `stripe_transfer_id`
2. Cron → `executeMerchantConnectPayout` → Connect transfer (卡價 − 本單佣金 snapshot + 運費；鑑定費留平台)
3. `payout_status = paid`, `escrow_status = completed_and_transferred`

See [merchant-connect-payout-hold/backend.md](../merchant-connect-payout-hold/backend.md) · [merchant-checkout/backend.md](../merchant-checkout/backend.md).

---

## Verify (non-auth merchant — Route A)

```bash
bunx tsc --noEmit && bun run lint && bun run build:ci
```

Manual:

1. `/checkout/{merchantOrderId}` → merchant_direct, no auth toggle → pay → PI `automatic` → success
2. Buyer confirm → `payout_hold_until ≈ +7d`, `payout_status = held`, no transfer yet
3. After hold (or backdate + cron) → `stripe_transfer_id` set
