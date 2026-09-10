# Admin user control — frontend

> **Status:** ✅ Wired (directory + KYC deep link)  
> **Route:** `/admin/user_control`  
> KYC review workbench remains **`/admin/merchants`** (not merged).

## File layout

```
app/admin/user_control/
  page.tsx                    # SSR admin guard + initial list
  AdminUserControlClient.tsx  # filters, table, client refetch
```

## Props (`AdminUserControlClient`)

| Prop | Source |
|------|--------|
| `initialPage` | `listAdminPlatformUsers({ page: 1, kycFilter: "pending" })` |
| `loadError` | action error string or `null` |

## Client behaviour

- Filters / search call `listAdminPlatformUsers` via `useTransition` (same pattern as admin payouts tabs).
- Default KYC pill: **待審核** (`pending`), matching SSR.
- User type checkboxes: both checked by default; uncheck both → empty state copy unchanged.
- **操作** column: when `kycStatus === "pending"` and `applicationId` → link **審核 KYC** → `/admin/merchants?applicationId={id}`.
- Privilege override panel: still mock / deferred (out of scope).

## Navigation (related)

| Touchpoint | Behaviour |
|------------|-----------|
| `/admin/dashboard` → **前往審核商戶** | `router.push("/admin/merchants")` |
| `/admin/merchants?applicationId=` | `highlightApplicationId` → filter/page + scroll + row highlight |

## Acceptance checklist

- [ ] `/admin/user_control` loads live users (no mock arrays)
- [ ] Table columns: 名稱 / Handle / 電郵 / Stripe ID / Stripe KYC 狀態 / Last Update / 操作
- [ ] Pending filter, search, pagination, type + KYC AND filters work
- [ ] Pending row → **審核 KYC** opens merchants with highlighted row
- [ ] Dashboard **前往審核商戶** → `/admin/merchants` (200, not 404)
- [ ] `/admin/merchants` approve/reject flow unchanged
- [ ] `bun run build:ci` passes
