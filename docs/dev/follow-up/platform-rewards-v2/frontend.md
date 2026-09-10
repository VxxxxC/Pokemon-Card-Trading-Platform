# Platform Rewards v2 — frontend

> **Phase 1:** ✅ Partner verified · **Phase 2:** ✅ Partner verified · **Phase 2b:** ✅ Partner verified · **Phase 3:** ✅ Partner verified · **Phase 4:** ✅ Partner verified

## Admin activity workflow (2026-08 refactor)

| Path | Purpose |
|------|---------|
| `app/admin/campaigns/page.tsx` | SSR list via `listAdminRewardActivities` |
| `app/admin/campaigns/CampaignsPageShell.tsx` | Tabs: 獎勵活動 / 簽到計劃 |
| `app/admin/campaigns/AdminRewardActivitiesClient.tsx` | Unified list (auto-grant + flash) |
| `app/admin/campaigns/new/page.tsx` | Create activity (single page) |
| `app/admin/campaigns/[id]/page.tsx` | Edit activity |
| `app/admin/campaigns/RewardActivityForm.tsx` | Single-page form (no wizard steps) |
| `app/actions/admin-reward-activities.ts` | `list` / `get` / `upsert` / `setStatus` |

**Rules:**

- One mental model: **獎勵活動** (template + optional 1:1 campaign merged in UI)
- `flash_only` → hide trigger conditions (`kind: none`); show schedule fields on same page
- `auto_grant` → show triggers; no campaign row
- **積分商城商品**（`/admin/campaigns/new?flow=points_mall`）→ 隱藏發放方式／觸發條件；僅 coupon 類型 + PTS/庫存
- Publish/save via `rpc_admin_upsert_reward_activity` + `rpc_admin_set_reward_activity_status`

**Removed:** `RewardTemplateWizard`, separate 獎勵模板 / 搶券檔期 tabs.

## Phase 1 — Admin wizard (superseded by activity workflow)

Legacy wizard files under `app/admin/campaigns/wizard/` are retained for reference only; Admin UI uses `RewardActivityForm`.

| Path | Purpose |
|------|---------|
| `app/admin/campaigns/wizard/RewardTemplateDefinitionStep.tsx` | (legacy) template field reference |

## Phase 3 — Flash claim UI

| Path | Purpose |
|------|---------|
| `app/components/rewards/FlashCampaignSection.tsx` | Countdown + claim CTA |
| `app/profile/user/rewards/page.tsx` | Embeds flash section above coupon center |
| `app/actions/reward-flash.ts` | `listActiveFlashCampaigns`, `claimFlashReward` |

**Rules:**

- Load flash list on mount; refresh wallet after claim
- Disable CTA when sold out / daily cap / outside window
- Countdown ticks every second (client-only)

## Phase 2 — Checkout coupons (merchant_direct)

| Path | Purpose |
|------|---------|
| `app/checkout/[id]/components/CheckoutCouponPicker.tsx` | Loads eligible coupons; select one |
| `app/checkout/[id]/components/steps/MerchantDirectReview.tsx` | Embeds picker (non-auth + auth toggle) |
| `app/checkout/[id]/components/CheckoutOrderSummary.tsx` | 「平台優惠」行 + 折後總計 |
| `app/checkout/[id]/CheckoutClient.tsx` | `selectedCouponId`, preview subsidy, prepare wiring |
| `lib/checkout/prepare-payment.ts` | Passes `userRewardId` |
| `lib/checkout/compute-pricing.ts` | Client preview subsidy (non-authoritative) |

**Rules (Phase 2 direct):**

- Picker when `merchant_direct` and SF shipping path
- Shipping method change clears coupon + refreshes eligible list
- Authoritative amounts from `rpc_prepare_merchant_order_payment` / PI

## Phase 2b — Auth checkout coupons

| Path | Purpose |
|------|---------|
| `app/checkout/[id]/components/steps/AuthEscrowReview.tsx` | `CheckoutCouponPicker` for `merchant_auth` |
| `app/checkout/[id]/components/steps/MerchantDirectReview.tsx` | Picker also when `authServiceEnabled` |
| `app/checkout/[id]/CheckoutClient.tsx` | Coupon preview + prepare for auth variants |
| `lib/checkout/compute-pricing.ts` | `merchant_auth` subsidy preview |

**Rules:**

- `merchant_auth` and `merchant_direct` + auth ON → show picker; pass `useAuth: true` to list/prepare
- Free-shipping auth uses quoted SF subsidy (no shipping row in summary)
- Toggling auth off clears coupon (direct path only)

**Out of scope:** `member_auth` checkout pickers (Phase 5).

## Acceptance checklist

Partner QA: **[QA_CHECKLIST.md](./QA_CHECKLIST.md)**

### Phase 1–2

- [x] Partner verified (2026-08)

### Phase 2b

- [x] `merchant_auth` checkout shows coupon picker — PARTNER_QA P1
- [x] Auth + discount reduces buyer total; summary shows 平台優惠
- [x] Auth + free-shipping uses quoted SF subsidy
- [x] `merchant_direct` + auth toggle shows picker with auth-eligible coupons
- [x] `bun run build:ci` passes

### Phase 3

- [x] Admin activity form: `flash_only` + schedule → publish creates campaign (`C3.1`)
- [x] Campaign pause/resume (`C3.8`)
- [x] `/profile/user/rewards` flash section: countdown + claim — Partner 2026-07-29
- [x] Claimed coupon usable at merchant checkout (Part E3.1) — Partner 2026-07-29 · `C3.7`
- [x] E2E `e2e/platform-rewards-phase3.spec.ts` (C3.1–C3.9)

### Phase 4 — Points redemption catalog

| Path | Purpose |
|------|---------|
| `app/admin/campaigns/AdminRewardActivitiesClient.tsx` | **新增一般券** / **新增積分商城商品** entry points |
| `app/admin/campaigns/new/page.tsx` | `?flow=points_mall` for catalog-only form |
| `app/admin/campaigns/RewardActivityForm.tsx` | Top-level **建立類型** toggle (general vs points mall) |
| `app/components/rewards/PointsRedemptionSection.tsx` | Member catalog list + redeem CTA |
| `app/profile/user/rewards/page.tsx` | Flash → Points mall → coupon center tabs |
| `app/actions/rewards.ts` | `listPointsRedemptionCatalog`, `redeemPointsCatalogItem` |

**Rules:**

- Points mall flow: no trigger conditions; `trigger_conditions: { kind: "none" }`
- `points` reward type never shows catalog UI
- Merchant persona: section hidden (`useIsMemberPersonaActive`)

- [x] Admin split flow — Partner 2026-08-09
- [x] Member redeem + wallet — E2E `C4.1`/`C4.2` · Vitest `I-G*`
- [x] Merchant persona guard (G2.5) — Partner 2026-08-09
