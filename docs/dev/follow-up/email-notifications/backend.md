# Email notifications — backend (Phase 0–3 P0+P1)

> **Status:** Phase 3 P0+P1 wired — refunds, KYC, sanctions, grading P1, B2C orders, FPS/Connect payout edges.  
> **SSOT:** [email-notifications-ssot.md](../../email-notifications-ssot.md)（含 [§12 Production-safe wiring](../../email-notifications-ssot.md#12-production-safe-wiring-protocol唔搞亂-production-ready-code)）  
> **Manual test:** [manual-test.md](./manual-test.md)

## Production-safe wiring（必讀）

Phase 3+ 接線前讀 SSOT **§12**：只加法 enqueue、slice 驗證、禁改 RPC/UI。唔搞亂已 ship 嘅 Phase 1/2 flow。

## Shared layout

All App + Supabase Auth templates use `lib/email/layout.ts` (`buildBrandedEmailHtml`).

Regenerate Supabase paste files:

```bash
bun run email:generate-auth-templates
```

See [supabase-auth-templates.md](../../email/supabase-auth-templates.md).

| Variable | Required | Notes |
|----------|----------|-------|
| `RESEND_API_KEY` | Yes (worker) | Resend API key (app transactional) |
| `RESEND_FROM_EMAIL` | No | Default `Cardvault HK <noreply@notify.cardvaulthk.com>` |
| `CRON_SECRET` | Yes (cron) | Bearer for `/api/cron/process-email-outbox` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Outbox read/write + auth email lookup |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Absolute links in offer emails |

**Supabase Auth SMTP** (dashboard): `noreply@notify.cardvaulthk.com` via Resend — handles `E-ACC-01`, `E-ACC-03`.

## Wired events

| Event | Trigger | File |
|-------|---------|------|
| `E-ACC-04` | Password changed | `app/actions/auth.ts` |
| `E-OFF-01` | `makeOffer` success | `app/actions/offers.ts` |
| `E-OFF-02` | `modifyOffer` success | `app/actions/offers.ts` |
| `E-OFF-03` | `acceptOffer` success | `app/actions/offers.ts` |
| `E-OFF-04` | `rejectOffer` success | `app/actions/offers.ts` |
| `E-OFF-06` | `buyNowListing` success | `app/actions/buy-now.ts` |
| `E-ORD-01` | Stripe webhook payment confirmed | `app/api/stripe/webhook/route.ts` |
| `E-ORD-02` | Cron pending payment expiry | `app/api/cron/expire-merchant-pending-payment/route.ts` |
| `E-ORD-03` | Order cancel RPCs | `app/actions/orders.ts` (`cancelMemberOrder`, `cancelMerchantAuthOrder`) |
| `E-ORD-04` | Merchant direct fulfillment | `app/actions/orders.ts` (`submitMerchantDirectFulfillment`) |
| `E-ORD-05` | Buyer confirm receipt | `app/actions/orders.ts` (`completeMerchantOrder`, `confirmBuyerReceived`) |
| `E-MOD-02` | Moderation case resolved | `app/actions/admin-moderation.ts` (`resolveAdminModerationCase`) |
| `E-PAY-02` | Connect payout success | `lib/merchant-order/execute-connect-payout.ts` |
| `E-GRD-C2C-01` | Member auth paid → custody | `app/api/stripe/webhook/route.ts` |
| `E-GRD-C2C-05/06` | Grading pass outbound / fail | `app/actions/admin-grading.ts` |
| `E-GRD-C2C-07` | Grading fail refund finalize | `auth-grading-fail-void-saga.ts`, stripe webhook |
| `E-GRD-B2C-02` | Merchant auth payment held | `app/api/stripe/webhook/route.ts` |
| `E-GRD-B2C-05/06` | Merchant grading outbound / fail | `app/actions/admin-grading.ts` |
| `E-OFF-05` | Offer expired (listing inactive / other buyer) | `offers.ts`, `buy-now.ts`, `listings.ts` |
| `E-REF-01/02` | Moderation refund approved / Stripe refund | `admin-moderation.ts`, `stripe/webhook` |
| `E-MCH-01/02/03/05` | KYC submit / approve / reject / Connect enabled | `merchant-kyc.ts`, `admin-kyc.ts`, `stripe/webhook` |
| `E-ACC-06/07` | Suspend / ban sanctions | `admin-moderation.ts` (`enqueueModerationResolveFollowUpEmails`) |
| `E-MOD-01/03/04` | Report received / upheld / payout frozen | `reports.ts`, `admin-moderation.ts` |
| `E-PAY-03/04/05` | Connect fail / member FPS ready / merchant recovery | `execute-connect-payout.ts`, `member-fps-payout-ready` cron, `admin-grading.ts` |
| `E-GRD-C2C-02/03/08/09/10` | C2C grading P1 lifecycle | `orders.ts`, `admin-grading.ts` |
| `E-GRD-B2C-03/04/07/08` | B2C grading P1 + fail settlement | `orders.ts`, `admin-grading.ts`, `stripe/webhook` |
| `E-ORD-06` | Order completed (buyer) | `orders.ts` (`completeMerchantOrder`, `confirmBuyerReceived`, `completeMemberOrder`) |
| `E-ORD-B2C-01/02/03` | B2C merchant action / shipped / completed | `stripe/webhook`, `orders.ts`, `payout-emails.ts` |

## Files

| Path | Role |
|------|------|
| `lib/email/constants.ts` | From address + site name |
| `lib/notifications/offer-emails.ts` | Offer enqueue helpers |
| `lib/notifications/order-emails.ts` | Order payment enqueue (`E-ORD-01`) |
| `lib/notifications/resolve-auth-user-email.ts` | Auth user email lookup |
| `lib/notifications/grading-emails.ts` | Grading enqueue helpers |
| `lib/notifications/moderation-emails.ts` | Moderation enqueue helpers |
| `lib/notifications/payout-emails.ts` | Payout enqueue helpers |
| `lib/notifications/email-phase2-registry.ts` | Phase 2 gate catalog |
| `lib/notifications/refund-emails.ts` | Refund enqueue helpers |
| `lib/notifications/merchant-onboarding-emails.ts` | KYC / Connect enqueue |
| `lib/notifications/account-emails.ts` | Suspend / ban enqueue |
| `lib/notifications/email-phase3-registry.ts` | Phase 3 gate catalog |

## Verify offer email

Run automated gate before manual smoke:

```bash
bun run test:email:phase1
bun run test:email:phase2
bun run test:email:phase3
```

### Minimal manual smoke (optional — 1 flow)

1. Trigger **one** real flow (e.g. make offer → outbox `E-OFF-01`)
2. `GET /api/cron/process-email-outbox` with `CRON_SECRET`
3. Confirm Resend dashboard or outbox `status = sent`

Automated gate covers all 11 Phase 1 templates + outbox insert; manual only validates live trigger + Resend delivery.

1. Buyer makes offer → seller outbox row `E-OFF-01`
2. Seller accepts → buyer outbox row `E-OFF-03`
3. Run cron worker or wait 5 min Vercel cron
4. Check Resend dashboard for `notify.cardvaulthk.com` sends

## Verify payment expiry email

1. Seed or wait for 48h `pending_payment` merchant order
2. Run `GET /api/cron/expire-merchant-pending-payment` (with `CRON_SECRET`)
3. Buyer + seller outbox rows `E-ORD-02`

## Phase 2 next

Offer expired cron (if DB cancels stale pending), `E-GRD-B2C-07`, `E-MOD-03`–`06`, `E-PAY-03`–`05`, `E-MCH-02/03`, `E-REF-02` per SSOT.
