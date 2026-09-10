# Variable appraisal fee — frontend

## UI touchpoints

| Route / component | Change |
|-------------------|--------|
| `/admin/settings` | Load/save `appraisalFeeHkd` with commission |
| Checkout (`compute-pricing`, session maps) | `platformAuthFeeHkd` on session |
| `OfferCard` / `getOfferCardContext` | `authServiceFeeHkd` |
| `AddAssetModal`, `ExecutionSlideOver` | `usePlatformAuthFee()` |
| `MemberAuthOrderInvoice`, `MerchantOrderDetailView` | Order snapshot or live settings |
| Admin dashboard | `appraisalFeePerCard` fallback from settings |

## Acceptance checklist

- [ ] `/admin/settings` loads/saves appraisal fee to `auth_escrow_config`
- [ ] Merchant/member auth checkout prepare uses new fee for new orders
- [ ] Offer card / listing copy shows configured fee
- [ ] Dashboard label reflects settings when no captured auth fees
