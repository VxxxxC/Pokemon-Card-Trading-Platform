# Member FPS Payout Pipeline — Frontend

> **Status:** ✅ Wired (Phase 1C) · 🟡 Partner QA（M6 FPS 後段）  
> **Capture：** [capture-policy.md](../../capture-policy.md) · **Depends on:** [backend.md](./backend.md) · **E2E:** [e2e-checklist.md](./e2e-checklist.md) · **P0 capture:** [admin-grading PARTNER_HANDOFF](../admin-grading/PARTNER_HANDOFF.md)

## Touchpoints

| File | Change |
|------|--------|
| `app/components/user/FpsIdCollectDialog.tsx` | New — FPS input + `updateUserFpsId` |
| `app/components/user/MemberOrderDetailView.tsx` | Dialog + banner + seller payout status block |
| `app/profile/user/settings/UserSettingsClient.tsx` | Existing `fpsId` field — works once backend persists |

## `FpsIdCollectDialog`

Props:

```ts
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFpsId?: string | null;
  initialFpsName?: string | null;
  onSaved?: () => void;
}
```

- 收款人姓名 + FPS ID → `updateUserFpsId(fpsId, fpsName)`
- Copy: 鑑定賣家收款需要；可稍後於設定修改

## `MemberOrderDetailView` wiring

When `persona === 'sell'` && `order.useAuthentication` && (empty `sellerFpsId` **or** empty `sellerFpsName`):

1. **Dialog** on mount (dismissible; `sessionStorage` key `hkcv-fps-collect-dismissed-{sellerId}`)
2. **Banner** until FPS saved — link to `/profile/user/settings`
3. **Soft only** — `handleSubmitInbound` unchanged (no server block)

### Seller payout status block

When `useAuthentication` && seller:

- Show `sellerPayoutStatus` (中文 via `formatSellerPayoutStatusLabel`)
- `buyerConfirmedAt` / `payoutHoldUntil` when relevant

## Acceptance checklist

- [x] Seller with empty FPS opens auth order → dialog + banner
- [x] Save FPS → settings reflects value; banner/dialog clears after refresh
- [x] Dismiss dialog → sessionStorage prevents nag on same session navigation
- [x] Inbound tracking still works without FPS (soft remind)
- [x] Seller sees payout status labels after buyer confirms
