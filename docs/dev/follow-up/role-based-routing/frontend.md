# Role-Based Routing & Session — Frontend Handoff

## Status

- **Backend:** ✅ Ready
- **Frontend:** ✅ **Baseline wired** — DB role drives UI; sandbox toggle removed; logout works
- **Your focus:** Nav/profile link polish, optional `mockRole` rename, error toast on logout failure

## What is already done

| Feature | Location |
|---------|----------|
| DB role → Zustand `mockRole` on load | `app/layout.tsx` + `RoleProvider` |
| Role refresh on window focus | `RoleProvider.tsx` |
| Route guards (guest / wrong role) | `middleware.ts` (backend-owned) |
| `/profile` gateway redirect | `app/profile/page.tsx` |
| Logout confirm modal + `signOut` | `LogoutModal.tsx` |
| Role-aware profile link on home | `PortfolioRewards.tsx` → `getRoleHomePath()` |
| Sandbox role toggle **removed** | `DemoRoleSwitcher.tsx` deleted |

## UI touchpoints

| File | Area | Notes |
|------|------|-------|
| `app/components/providers/RoleProvider.tsx` | Hydrates `mockRole` | Do not remove — wires server role to client store |
| `app/components/profile/LogoutModal.tsx` | Logout trigger + modal | Used on user, merchant, admin settings |
| `app/profile/user/settings/page.tsx` | Session Control section | Renders `<LogoutModal />` ~L244 |
| `app/profile/merchant/settings/page.tsx` | Same | Renders `<LogoutModal />` |
| `app/admin/settings/page.tsx` | Same | Renders `<LogoutModal />` |
| `app/components/navigation/TopNav.tsx` | Guest vs logged-in chrome | Reads `mockRole` |
| `app/components/navigation/BottomNav.tsx` | 3 vs 5 tab layout | `mockRole === "GUEST"` |
| `app/page.tsx` | Wishlist ticker visibility | `USER` \| `ADMIN` |
| `app/components/home/*.tsx` | Role-conditional sections | `PortfolioRewards`, `HeroSearch`, `NewArrivals`, `PremiumMarket` |

### Components still using `mockRole` (no changes required)

All existing `useUIStore((s) => s.mockRole)` conditionals work unchanged — the store is now fed from `profiles.role` instead of the demo toggle.

## Server action usage (logout — already integrated)

```ts
import { logout } from "@/app/actions/auth";
import { useUIStore } from "@/app/store/useUIStore";

// In LogoutModal.tsx
const setMockRole = useUIStore((state) => state.setMockRole);

const handleLogout = () => {
  startTransition(async () => {
    setMockRole("GUEST");   // immediate UI feedback
    setIsOpen(false);
    await logout();          // server signOut + redirect("/auth")
  });
};
```

Optional: wrap in try/catch + `sonner` toast if `logout` throws.

## Role → navigation helpers

```ts
import { getRoleHomePath, getRoleDefaultLandingPath } from "@/lib/auth/roles";

getRoleHomePath("USER")      // "/profile/user"
getRoleHomePath("MERCHANT")  // "/profile/merchant"
getRoleHomePath("ADMIN")     // "/admin"
getRoleHomePath("GUEST")     // "/auth"
```

Use these for profile/avatar links instead of string templates like `/profile/${role.toLowerCase()}`.

## Optional polish (partner backlog)

- [ ] Rename `mockRole` / `setMockRole` → `userRole` / `setUserRole` in `useUIStore` (wide refactor)
- [ ] TopNav **會員中心** link: point merchants to `/profile/merchant`, admins to `/admin`
- [ ] Redirect already-authenticated users away from `/auth` to `getRoleDefaultLandingPath(role)`
- [ ] Logout error toast (if `logout()` throws)
- [ ] Loading overlay on settings page during logout (modal already shows `登出中…`)
- [ ] Merchant nav: add dashboard shortcut when `mockRole === "MERCHANT"` (see `docs/Role-Based-Access-Control.md`)
- [x] `PENDING_MERCHANT` banner on merchant dashboard when KYC pending (`MerchantOverviewClient`)

## Acceptance test

1. `bun run dev` — Supabase env + migration applied
2. **Guest UI**
   - Home: no wishlist ticker; portfolio section shows login CTA
   - Bottom nav: 3 tabs (no profile center)
   - No role toggle bar at top
3. **Member login**
   - Login → `/profile/user/collection`
   - Home: wishlist + check-in visible
   - `/profile` → `/profile/user`
   - `/profile/merchant` → redirected to `/profile/user`
4. **Merchant** (set role in Supabase dashboard)
   - Login → `/profile/merchant`
   - Can access `/profile/user/*` and `/profile/merchant/*`
   - Home: merchant UI (e.g. no wishlist on product cards)
5. **Admin** (set role in Supabase dashboard)
   - Login → `/admin`
   - Can access `/admin`, `/profile/merchant`, `/profile/user`
6. **Logout** (`/profile/user/settings`)
   - 登出 → 確認登出 → `/auth`, guest UI restored
   - Back button to `/profile/user` → blocked to `/auth`

## Do not edit (backend track)

- `lib/auth/roles.ts`
- `lib/auth/session.ts`
- `middleware.ts`
- `lib/supabase/middleware.ts`
- `app/actions/profile.ts`
- `app/actions/auth.ts` (`logout`, redirect logic)
- `app/profile/page.tsx`

Coordinate with backend dev before changing guard rules or role mapping.

## Related flows

- [Auth login / register](../auth-login-register/frontend.md) — signup creates `profiles.role = member`
- [Product catalog search](../product-catalog-search/frontend.md) — independent
