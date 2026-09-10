# Admin user control — backend

> **Status:** ✅ Ready  
> **Route:** `/admin/user_control` (platform user directory; read-only KYC status)

## Files

| Path | Purpose |
|------|---------|
| `supabase/migrations/20260805120000_admin_platform_users_search_perf.sql` | `pg_trgm` indexes + `search_admin_platform_users` RPC |
| `lib/admin-user-control/types.ts` | `PlatformUserRow`, filters, pagination contract |
| `lib/admin-user-control/format.ts` | Date / handle / KYC label helpers |
| `lib/admin-user-control/derive-kyc-status.ts` | KYC derivation reference (mirrored in RPC SQL) |
| `lib/admin-user-control/platform-users-rpc.ts` | Parse RPC JSON → `PlatformUserPage` |
| `app/actions/admin-user-control.ts` | `listAdminPlatformUsers()` |

## Migrations / env

- Push: `bunx supabase db push`
- Regenerate types: `bun run supabase:types`

## Action contract

```typescript
listAdminPlatformUsers(input?: {
  page?: number;        // default 1
  pageSize?: number;    // default 10, max 50
  search?: string;      // non-empty after trim (1+ chars)
  userTypes?: ("member" | "merchant")[];  // default both
  kycFilter?: "all" | "pending" | "verified" | "rejected";
}): Promise<{ success: true; data: PlatformUserPage } | { success: false; error: string }>
```

### RPC: `search_admin_platform_users`

Single round-trip returns rows + `total` + `kyc_counts` + `type_counts`.

| Arg | Notes |
|-----|-------|
| `p_keyword` | `NULL` if empty after trim; single-character search allowed |
| `p_user_types` | `TEXT[]`, default both |
| `p_kyc_filter` | `all \| pending \| verified \| rejected` |
| `p_page`, `p_page_size` | max page size 50 |

Admin guard: `_grading_require_admin()` inside RPC; action also checks `isCurrentUserAdmin()` before call.

Email enrichment (action layer only): `rep_email` from RPC first; `auth.admin.getUserById` fallback for current page rows missing rep email.

### Search indexes (`pg_trgm`)

- `profiles.display_name`, `profiles.username`
- `merchant_shops.shop_name`, `merchant_shops.shop_handle`
- `kyc_applications.rep_email`
- `kyc_records.stripe_account_id` (`text_pattern_ops` for `acct_` prefix)

Also speeds up payouts merchant tab `shop_name ILIKE` search.

### Frontend perf

Client debounces search input **400ms** and sends `search` when debounced value is non-empty (min 1 character).

## Verify (backend)

1. Non-admin → `{ success: false, error }`
2. Default SSR: `kycFilter: "pending"`, page 1
3. Search + type checkbox + KYC pill AND together
4. Pill counts update when user type checkboxes change
5. Pending row with `applicationId` returned for deep link
6. `bunx tsc --noEmit`, `bun run lint`, `bun run build:ci`
