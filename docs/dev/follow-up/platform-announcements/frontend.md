# Platform Announcements — Frontend

> **Status:** ✅ Wired

## Touchpoints

| Surface | Files |
|---------|--------|
| Homepage banner | `app/page.tsx` → `getHomeBannersForDisplay()` → `HomePageShell` → `HomeBanner.tsx` |
| Homepage modal | `app/page.tsx` → `app/HomePageShell.tsx` → `app/components/announcements/AnnouncementModal.tsx` |
| Public list | `app/announcements/page.tsx` (SSR) + `AnnouncementsPageClient.tsx` (tabs) |
| Admin CRUD | `app/admin/announcements/page.tsx` |
| Nav badge | `TopNav.tsx`, `MobileHeader.tsx` via `useHasActiveAnnouncements()` |
| linkUrl CTA | `lib/announcements/announcement-detail-link.tsx` |

## Admin wire-up checklist

- [x] `useEffect` loads `getAnnouncementsForAdmin()` on mount
- [x] Create/update calls `createPlatformAnnouncement` / `updatePlatformAnnouncement`
- [x] Pending file uploads via `uploadAnnouncementPosterImage()` before save
- [x] `pendingAnnouncementId` = `crypto.randomUUID()` on new form; existing `id` on edit
- [x] Never persist `blob:` preview URLs — Bunny CDN, manual https, or `DEFAULT_ANNOUNCEMENT_POSTER_URL`
- [x] Display surface toggles: 首頁 Banner / 公告渠道
- [x] Toggle/delete wired to server actions
- [x] Loading/saving states + existing `feedbackMessage` toast

## Public visibility (Scheme A)

- **Homepage modal:** server `getActiveAnnouncementsForDisplay()` — `is_active` + HKT date window
- **`/announcements` active tab:** client `getAnnouncementStatus` — same HKT window semantics
- Expired rows may remain `is_active=true` in DB; admin badge shows「已過期」; manual toggle shows「已下架」

## Acceptance

1. Admin can create, edit, toggle, and delete announcements; poster upload persists after reload.
2. Homepage modal shows server-fetched active announcements (HKT window + `priority` sort).
3. `/announcements` lists all rows; client tabs use `getAnnouncementStatus`.
4. Nav megaphone dot appears when at least one active announcement exists.
5. When `linkUrl` is set,「查看詳情」appears on homepage modal slides and public list cards (`/` internal, `https://` opens new tab).

## Optional v2

- Rich-text editor
- Per-announcement dismiss in `sessionStorage`
- Hide CTA on past-tab expired cards (`status.code !== 'active'`)
