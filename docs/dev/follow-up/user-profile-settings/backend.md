# User Profile Settings (Member) — Backend Handoff

## Status

- **Backend:** ✅ Ready (read + update personal profile; default avatar; dashboard avatar upload to Bunny CDN)
- **Frontend:** ✅ Wired (baseline + dashboard avatar edit overlay) — personal info + security read-only email; notifications still mock
- **Partner:** Merchant settings parity, notification prefs (future table)

## Scope

| In scope | Out of scope (future) |
|----------|----------------------|
| `getUserSettings` — profile + auth email | `notification_settings` table / toggles |
| `updateUserProfile` — `display_name`, `username`, `short_description`, **`fps_id`** | Avatar upload on settings page |
| **`updateUserFpsId`** — lightweight FPS-only update (auth seller dialog) | Merchant shop settings (`merchant_shops`) |
| `updateUserAvatar` — persist Bunny CDN URL to `profiles.avatar_path` | Merchant shop settings (`merchant_shops`) |
| `POST /api/profile/upload-avatar` — auth + Bunny PUT (`avatars/{userId}/{uuid}.ext`) | Email change flow (`auth.updateUser` email) |
| Default avatar via `profiles.avatar_path` DB default + `resolveAvatarUrl()` | Remove / relax `display_name` unique index (product decision) |
| RLS: owner can `UPDATE` own `profiles` row | Supabase Storage bucket `avatars` (avatars use Bunny CDN) |
| Username uniqueness (app + DB index) | |

## Files created / modified (backend track)

| File | Purpose |
|------|---------|
| `app/actions/profile.ts` | `getUserSettings`, `updateUserProfile`, `getCurrentUserProfile`, **`updateUserAvatar`** |
| `app/api/profile/upload-avatar/route.ts` | Authenticated avatar image upload → Bunny CDN |
| `lib/profile/client-upload.ts` | Client helper `uploadProfileAvatar(file)` |
| `lib/profile/avatar.ts` | `DEFAULT_AVATAR_URL`, `resolveAvatarUrl()` |
| `lib/storage/bunny.ts` | `buildAvatarObjectKey`, `uploadProfileAvatarToBunny`, `isAllowedBunnyCdnUrl` |
| `lib/profile/validation.ts` | `validateUserProfileFields` (username format, bio length; display name = required non-empty only) |
| `lib/profile/errors.ts` | `mapProfileUpdateError()` — RLS, unique, column errors |
| `supabase/migrations/20260703100000_profiles_default_avatar.sql` | `avatar_path` default `/asset/default-avator.webp` |
| `supabase/migrations/20260703110000_profiles_owner_update.sql` | `profiles_update_own` RLS + `GRANT UPDATE` |
| `supabase/migrations/20260703120000_profiles_settings_columns.sql` | `username`, `short_description` columns + username unique index |

## DB: `profiles` fields used

| Column | Settings UI label | Notes |
|--------|-------------------|-------|
| `display_name` | 顯示名稱 | Required non-empty; **unique** index `profiles_display_name_lower_idx` still enforced at DB |
| `username` | 用戶名 (Handle) | Auto-set on signup (`user_<random>` — see [auth-login-register](../auth-login-register/backend.md)); editable here; 3–24 chars `[A-Za-z0-9_-]`; unique when set |
| `short_description` | 個人簡介 | Optional; max 280 chars |
| `fps_id` | 轉數快 ID / 電話 / 電郵 | Optional; max 100 chars; required for auth seller FPS payout (soft remind) |
| `avatar_path` | Dashboard avatar edit (not on settings page) | Default `/asset/default-avator.webp`; custom uploads stored as full Bunny CDN URL (`https://{BUNNY_CDN_HOSTNAME}/avatars/{userId}/…`) |
| `auth.users.email` | 電郵地址 | Read-only in UI |

## Action contracts

### `getUserSettings()`

```ts
import { getUserSettings } from "@/app/actions/profile";

// Returns:
{ success: true, data: UserSettingsData }
| { success: false, error: string }

type UserSettingsData = {
  id: string;
  displayName: string;
  username: string;
  shortDescription: string;
  email: string;
  avatarUrl: string;  // resolved via resolveAvatarUrl
  role: "member" | "merchant" | "admin";
  fpsId?: string;
};
```

### `updateUserFpsId(fpsId: string)`

```ts
{ success: true } | { success: false; error: string }
```

Validates via `validateFpsId`; revalidates `/profile/user/settings`, `/profile/user`, `/profile/user/trading`.

Called from **Server Component** `app/profile/user/settings/page.tsx` (not from client fetch on mount).

### `updateUserProfile` — `useActionState`

```ts
import { updateUserProfile } from "@/app/actions/profile";
import type { UserProfileFormErrors } from "@/lib/profile/validation";

// Signature
(prev: UserProfileFormErrors | null, formData: FormData) => Promise<UserProfileFormErrors | null>

// Success → null + revalidatePath("/profile/user/settings", "/profile/user")
// Failure → field errors, e.g. { username: "此用戶名稱已被使用" }
```

**FormData fields:**

| Field | `name` attribute | Required |
|-------|------------------|----------|
| 顯示名稱 | `displayName` | Yes |
| Handle | `username` | No (empty → `null` in DB) |
| 個人簡介 | `shortDescription` | No |

### `updateUserAvatar(cdnUrl: string)`

```ts
import { updateUserAvatar } from "@/app/actions/profile";

// Returns:
{ success: true } | { success: false; error: string }

// Validates cdnUrl hostname matches BUNNY_CDN_HOSTNAME
// Success → revalidatePath("/profile/user", "/profile/user/settings", "/profile/{id}")
//           + syncAutoGrantRewards() (profile_complete coupon)
```

Client flow: `uploadProfileAvatar(file)` → `updateUserAvatar(cdnUrl)`.

### `resolveAvatarUrl` (shared lib)

```ts
import { resolveAvatarUrl, DEFAULT_AVATAR_URL } from "@/lib/profile/avatar";

// null / empty avatar_path → "/asset/default-avator.webp"
// "/..." or "http..." → used as-is (Bunny CDN URLs stored as full https URL)
// other → Supabase Storage public URL (bucket `avatars`, legacy path)
```

## Env / migrations

**Required migrations** (run once):

```bash
bunx supabase db push
```

- `20260703100000_profiles_default_avatar.sql`
- `20260703110000_profiles_owner_update.sql`
- `20260703120000_profiles_settings_columns.sql`

**Asset:** `public/asset/default-avator.webp` must exist in repo.

## How to verify (backend)

1. Log in as member → open `/profile/user/settings` — fields match `profiles` row + auth email.
2. Change display name + bio → **儲存更改** → DB updated; toast「個人資料已更新」.
3. Set handle to taken username → error + toast「此用戶名稱已被使用」.
4. New signup → `profiles.avatar_path` defaults to `/asset/default-avator.webp`.
5. Dashboard avatar edit → Bunny upload + `avatar_path` updated to CDN URL; old `avatars/` object best-effort deleted.

**SQL spot-check:**

```sql
SELECT id, display_name, username, short_description, avatar_path
FROM profiles
WHERE id = '<auth-user-uuid>';
```

## Errors returned to UI

| Condition | Field | Message |
|-----------|-------|---------|
| Empty display name | `displayName` | `請輸入顯示名稱` |
| Invalid handle format | `username` | `用戶名稱限 3-24 字元…` |
| Handle taken | `username` | `此用戶名稱已被使用` |
| Bio too long | `shortDescription` | `個人簡介不可超過 280 字元` |
| Duplicate display name (DB) | `displayName` | `此顯示名稱已被使用` |
| RLS / migration missing | `form` | `沒有權限更新資料…` / `資料庫尚未更新…` |
| Not logged in | `form` | `未登入` |

Raw Postgres / Supabase errors are not leaked.

## Do not change without backend sync

- `UserProfileFormErrors` field keys
- `UserSettingsData` shape
- RLS policy `profiles_update_own`
- `resolveAvatarUrl` path conventions
- FormData field names (`displayName`, `username`, `shortDescription`)
