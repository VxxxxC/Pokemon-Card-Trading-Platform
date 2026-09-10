# HKCardVault - Merchant B2C Checkout Architecture Conservation

> ⚠️ **Superseded (Payment Milestone 1).** The mock checkout described below has been wired to real Stripe
> escrow payments. `[id]` is now the **merchant order id / `ORD-*` number**, not a product id, and
> `MOCK_INVENTORY_DATABASE` is gone. See the current handoff packet:
> [merchant-checkout/backend.md](./merchant-checkout/backend.md) ·
> [merchant-checkout/frontend.md](./merchant-checkout/frontend.md).
> This file is kept only as the historical record of the pre-integration mock design.

This follow-up blueprint records the location and configuration of the full-page pre-checkout asset routing system (`app/checkout/[id]/page.tsx`), which is intentionally preserved exclusively for **Merchant (B2C)** Stripe Escrow settlements.

---

## 🏛️ 1. Architecture Registry

- **Route Path**: `app/checkout/[id]/page.tsx`
- **Current Status**: Sealed / Frontend Isolated.
- **Access Rule**: This route must **NEVER** be called by standard C2C / P2P user listings. Standard users transact entirely inside the `SpecialTransactionMessage` chatroom pipeline. It is dedicated to licensed store merchants running large turnover volume channels.

---

## 🔒 2. Functional Asset Sub-systems in Place

The page currently preserves 100% functional mock states for the following sub-components, ready to hook into Supabase relational tables:

1. **Voucher Validation Input Engine**:
   - Mapped to intercept coupons like `SF-FREE-DUANWU` (deducts shipping fee asset lines) and `WELCOME-TCG-50` (cash deduction bounds).
2. **Delivery Topology Selection**:
   - Dual-state switch system configured between standard **SF Express Smart Lockers (順豐智能櫃)** and physical **MTR Station Escrow Handover (當面面交)**.
3. **Stripe Escrow Connect Callers**:
   - The primary call button invokes the mock payment gateway layer, which redirects directly into `/profile/user/orders` post-validation.

---

## 🚀 3. Future Integration Checklist for B2C Milestone

When B2C merchant onboarding launches, the agent must update this workspace by:

- Replacing `MOCK_INVENTORY_DATABASE` with a dynamic RPC call fetching authenticated store inventory items from `merchant_listings` merged with `profiles`.
- Binding the promo code query mechanism to check against active codes inside a real `platform_coupons` table.
- Directing the Stripe response payload to record as an active audited record inside the B2C specific `merchant_orders` entity loop.
