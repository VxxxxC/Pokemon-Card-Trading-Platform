# Role-Based Routing & Session — Backend Handoff

## Status

- **Backend:** ✅ Ready (DB role resolution, middleware guards, logout)
- **Frontend:** ✅ Wired (baseline — `RoleProvider`, `LogoutModal`, existing `mockRole` UI conditionals)
- **Partner:** Polish nav links, rename `mockRole` → `userRole` when convenient, merchant KYC `PENDING_MERCHANT` state — see [frontend.md](./frontend.md)

## Scope (this PR)

| In scope | Out of scope (future) |
|----------|----------------------|
| Read `profiles.role` for authenticated users | `PENDING_MERCHANT` DB enum / KYC approval flow |
| Map DB roles → UI `DemoRole` (`member`→`USER`, etc.) | Server-side layout guards per route segment |
| Middleware route protection (`/profile/*`, `/admin/*`) | OAuth / magic-link session handling |
| Profile gateway redirect (`/profile`) | Profile settings `updateProfile` action |
| Role-aware post-login/register redirect | Rename `useUIStore.mockRole` across codebase |
| `logout` server action (`signOut` + redirect) | Password reset |

## Files created / modified (backend track)

| File | Purpose |
|------|---------|
| `lib/auth/roles.ts` | DB↔UI role mapping, home paths, path guard rules |
| `lib/auth/session.ts` | `resolveCurrentDemoRole()` — server-side profile role lookup |
| `lib/supabase/middleware.ts` | Supabase cookie session refresh for middleware |
| `middleware.ts` | Session refresh on all routes; auth + role guards on `/profile` and `/admin` |
| `app/actions/profile.ts` | `getCurrentUserRole()` server action (client refresh) |
| `app/actions/auth.ts` | Role-aware `login`/`registerMember` redirect; **`logout`** action |
| `app/profile/page.tsx` | Server gateway — redirect by session role |
| `app/layout.tsx` | Async root layout; passes `initialRole` to `RoleProvider` |
| `lib/supabase/server.ts` | Cookie client (typed `setAll` — no behaviour change) |

**Removed:** `app/components/shared/DemoRoleSwitcher.tsx` (sandbox role toggle bar)

## Role mapping

| `profiles.role` (DB) | UI `DemoRole` | Default landing after login |
|----------------------|---------------|-----------------------------|
| — (no session) | `GUEST` | `/auth` |
| `member` | `USER` | `/profile/user/collection` |
| `merchant` | `MERCHANT` | `/profile/merchant` |
| `admin` | `ADMIN` | `/admin` |

Source of truth: `types/supabase.ts` → `Database["public"]["Enums"]["user_role"]`.

## Action contracts

### `getCurrentUserRole()` — `app/actions/profile.ts`

```ts
import { getCurrentUserRole } from "@/app/actions/profile";

// Returns
{ success: true, data: DemoRole }   // "GUEST" | "USER" | "MERCHANT" | "ADMIN"
| { success: false, error: string }
```

Used by `RoleProvider` on window focus to refresh client store after external login/logout.

### `logout()` — `app/actions/auth.ts`

```ts
import { logout } from "@/app/actions/auth";

// Success → redirect("/auth") — throws NEXT_REDIRECT
// Failure → throws Error("登出失敗，請稍後再試")
```

No FormData. Called from client via `startTransition(() => logout())`.

### `login` / `registerMember` redirect (updated)

**On success:** `redirect(getRoleDefaultLandingPath(role))` where `role` is resolved from `profiles` after auth.

| Role | Redirect |
|------|----------|
| `USER` | `/profile/user/collection` |
| `MERCHANT` | `/profile/merchant` |
| `ADMIN` | `/admin` |

## Middleware rules (`isPathAllowedForRole`)

| Path prefix | Allowed roles |
|-------------|---------------|
| `/profile/user/*`, `/profile` | `USER`, `MERCHANT` |
| `/profile/merchant/*` | `MERCHANT` |
| `/admin/*` | `ADMIN` only |
| `ADMIN` on any other app route | → redirect `/admin` (whitelist: `/admin/*`, `/auth/*`, `/api/*`) |
| Guest on any row above | → redirect `/auth?redirect=<pathname>` |
| Wrong role | → redirect role home (`getRoleHomePath`) |

**Not guarded by middleware (role redirects):** `/profile/[id]` public profile pages, marketplace, home, `/auth`.

**Session refresh:** middleware runs on **all** non-static routes so Supabase cookies stay fresh for server actions (e.g. create listing from marketplace / home via `AddAssetModal`).

Matcher:

```ts
"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
```

Role redirect logic unchanged — only paths under `/profile` and `/admin` are blocked or redirected by role.

## Database dependency

Requires `public.profiles.role` populated by signup trigger:

- Migration: `supabase/migrations/20260702110000_auth_profiles_registration.sql`
- Authenticated users must be able to `SELECT` their own profile row (RLS) for role resolution to work in production.

## Env required

Same as auth flow:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # auth admin + trusted listing insert — not used for role routing reads
```

## How to verify

### 1. Apply migration (if not already)

```bash
bunx supabase db push
```

### 2. Role routing

```bash
bun run dev
```

1. **Guest** — visit `/profile/user` → redirected to `/auth`
2. **Member** — login → lands on `/profile/user/collection`; visit `/admin` → redirected to `/profile/user`
3. **Merchant** — set `profiles.role = 'merchant'` in dashboard → login → lands on `/profile/merchant`; can still access `/profile/user/*`
4. **Admin** — set `profiles.role = 'admin'` → login → lands on `/admin`; can access all profile routes
5. Visit `/profile` while logged in → redirects to role home

### 3. Logout

1. Go to `/profile/user/settings` (or merchant/admin settings)
2. Tap **登出** → **確認登出**
3. Expect redirect to `/auth`; home page shows guest UI (no wishlist ticker, etc.)
4. Visit `/profile/user` → redirected to `/auth`

### 4. UI role sync

1. Log in as member — home shows member-only sections (wishlist ticker, check-in)
2. Log out — sections hide without manual refresh
3. No sandbox role toggle bar at top of page

## Do not change without backend sync

- `lib/auth/roles.ts` mapping and guard rules
- `middleware.ts` matcher and redirect logic
- `resolveCurrentDemoRole()` query shape
- `logout()` redirect target (`/auth`)
- Post-auth redirect paths in `app/actions/auth.ts`

UI components may continue reading `useUIStore.mockRole` — backend only guarantees the store is hydrated from DB via `RoleProvider`.
