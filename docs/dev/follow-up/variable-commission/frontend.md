# Variable commission — frontend

## UI touchpoints

| Route / component | Change |
|-------------------|--------|
| `/admin/settings` | Load/save commission via `getPlatformFinancialConfig` / `updatePlatformFinancialConfig` |
| `app/profile/merchant/orderDetail/[id]/page.tsx` | Pass `defaultCommissionRate` from `getPlatformCommissionRateForDisplay()` |
| `MerchantOrderDetailView.tsx` | Pre-confirm estimate uses `defaultCommissionRate`; post-confirm uses `commissionRateApplied` / `commissionAmount` |

## Acceptance checklist

- [ ] `/admin/settings` shows DB rate (8% after seed), not mock 5%
- [ ]「儲存財務設定」persists commission + appraisal fee
- [ ] Merchant order detail: estimate before confirm matches current settings; after confirm shows snapshot fields
- [ ] Admin dashboard commission rate label reflects settings when available

## Out of scope (this flow)

- FPS manual transfer fee on settings page — read-only from `lib/platform/fps-payout-config.ts` (see [fps-manual-transfer-fee](../fps-manual-transfer-fee/plan.md)). Appraisal fee: see [variable-appraisal-fee](../variable-appraisal-fee/plan.md).
