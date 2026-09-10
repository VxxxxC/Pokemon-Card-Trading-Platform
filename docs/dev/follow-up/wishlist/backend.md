# Wishlist — Backend Handoff

## Status

- **Backend:** ✅ Phase 1 + Phase 2 (grade / target price mutations) · 🚧 Phase 3 OneSignal ([push-notifications-ssot.md](../../push-notifications-ssot.md) PR3)
- **Frontend:** ✅ Marketplace star · ✅ Collection `WishlistTable` live · 🟡 Home mock cards still default `RAW`/`A`
- **Migration:** ✅ `20260706100000_product_watchlists_wishlist_extend.sql` (pushed to remote)

## Changelog (2026-07-19) — Box/set sealed grades

| Change | Detail |
|--------|--------|
| **`coerceLegacyWishlistGrading`** | Runtime normalize: `密封` / `已開封` / legacy `SEALED` company → `OTHER` + `SEALED`/`UNSEALED` |
| **`toggleWishlist` guard** | Rejects card grade on sealed catalog and seal grade on single-card catalog |
| **`WishlistEntry.catalogType`** | From `product_catalog.type` for box-aware UI |
| **Migration `20260719140000`** | Optional DB cleanup for legacy `product_watchlists` rows |
| **Product detail** | `resolveProductDetailWishlistGrade` + `WishlistButton` on `ProductDetailClient` |

## Changelog (2026-07-06)

| Change | Detail |
|--------|--------|
| **`product_watchlists` extended** | `grading_company`, `grading_score`, `tracked_price`, `target_price`, `alert_enabled`, `last_alerted_at`, `created_at` |
| **UNIQUE** | `(user_id, product_id, grading_company, grading_score)` — one row per grade |
| **RLS** | Owner-only `SELECT` / `INSERT` / `UPDATE` / `DELETE` for `authenticated` |
| **`app/actions/wishlist.ts`** | Toggle, remove, get entries, favored keys, update target, update grade |
| **`lib/wishlist/grading.ts`** | Grade normalization, favored key, `listingMatchesWishlistGrade` |
| **Price contract** | UI shows **platform listing** price only; SNKRDUNK used for 30D trend reference only |
| **Phase 3** | `target_price` + `last_alerted_at` reserved; no OneSignal / cron |

---

## Architecture

```
Marketplace star click
  → toggleWishlist({ productId, gradingCompany, gradingScore, trackedPrice? })
  → INSERT/DELETE product_watchlists

Collection page mount / after edit
  → getWishlistEntries()
  → JOIN product_catalog (name, image_url, rarity)
  → JOIN product_grading_market_prices (matching grade) → trend30d, chartPoints
  → MIN(listings.price) WHERE status='active' AND grade match → lowestListingPrice

Grade change
  → updateWishlistGrade({ productId, old grade, next grade })
  → client refreshEntries() → new lowestListingPrice + SNKRDUNK trend for new grade
```

### Two price domains (do not merge in UI)

| Purpose | Source | Column / field |
|---------|--------|----------------|
| **Buyable price** | `listings` (`status = 'active'`, same grade) | `WishlistEntry.lowestListingPrice` |
| **Market reference (30D)** | `product_grading_market_prices` (same grade) | `trend30d`, `chartPoints` |
| **Add-time snapshot** | Stored on insert | `tracked_price` (diff subtitle only) |
| **Alert (Phase 3)** | `listings.price ≤ target_price` | `target_price`, `alert_enabled`, `last_alerted_at` |

No SNKRDUNK price in buy-price columns — avoids misleading users or off-platform leakage.

---

## Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260706100000_product_watchlists_wishlist_extend.sql` | DDL + RLS |
| `app/actions/wishlist.ts` | All wishlist server actions |
| `app/lib/wishlist/types.ts` | `WishlistEntry`, input DTOs |
| `lib/wishlist/grading.ts` | `normalizeWishlistGrading`, `listingMatchesWishlistGrade`, favored keys |
| `types/supabase.ts` | Generated types (`bun run supabase:types`) |
| `docs/dev/database.md` §2.6 | SSOT: `product_watchlists` (replaces planned `wishlists`) |

---

## Table: `product_watchlists`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | UUID FK → `profiles` | |
| `product_id` | UUID FK → `product_catalog` | |
| `grading_company` | TEXT | Default `RAW` |
| `grading_score` | TEXT | Default `A` |
| `tracked_price` | NUMERIC nullable | Snapshot at star-click (`listing.price`) |
| `target_price` | NUMERIC nullable | User-set; Phase 3 alert threshold |
| `alert_enabled` | BOOLEAN | Default `true` |
| `last_alerted_at` | TIMESTAMPTZ nullable | Phase 3 push dedupe |
| `created_at` | TIMESTAMPTZ | Sort DESC |

---

## Server actions (`app/actions/wishlist.ts`)

All return `{ success: true, data }` or `{ success: false, error: string }`.

| Action | Input | Output |
|--------|-------|--------|
| `toggleWishlist` | `{ productId, gradingCompany, gradingScore?, trackedPrice? }` | `{ isFavored: boolean }` |
| `removeFromWishlist` | `{ productId, gradingCompany, gradingScore }` | `{ ok: true }` |
| `updateWishlistTarget` | `{ productId, gradingCompany, gradingScore, targetPrice, alertEnabled? }` | `{ ok: true }` |
| `updateWishlistGrade` | `{ productId, gradingCompany, gradingScore, nextGradingCompany, nextGradingScore? }` | `{ ok: true }` |
| `getWishlistEntries` | — | `WishlistEntry[]` |
| `getUserWishlistFavoredKeys` | — | `string[]` (`productId::company::score`) |
| `getUserWishlistProductIds` | — | `string[]` (any grade) |

### `WishlistEntry`

```ts
{
  productId: string;
  displayId: string | null;
  name: string;
  cardCode: string;
  rarity: string | null;
  imageUrl: string | null;          // product_catalog.image_url
  gradingCompany: string;
  gradingScore: string;
  gradeLabel: string;
  trackedPrice: number | null;
  targetPrice: number | null;
  lowestListingPrice: number | null; // platform active listings, matched grade
  currentMarketPrice: number | null; // SNKRDUNK avg (not shown in table UI)
  trend30d: number | null;
  chartPoints: { date: string; price: number }[];
}
```

### Grade ↔ listing matching

`listingMatchesWishlistGrade()` normalizes both listing and wishlist grades before compare (fixes RAW / PSA score format mismatches).

### Guest guard

`toggleWishlist` / `getWishlistEntries` / mutations → `{ success: false, error: "請先登入" }` when no session.

`revalidatePath`: `/profile/user/collection`, `/marketplace` after mutations.

---

## Phase 3 (in progress — see [push-notifications-ssot.md](../../push-notifications-ssot.md))

1. Cron: `/api/cron/wishlist-price-alerts` — rows where `target_price IS NOT NULL AND alert_enabled`
2. `MIN(listings.price)` for matching grade ≤ `target_price`
3. Push via OneSignal REST (`P-WIS-01`) → update `last_alerted_at`
4. Subscriptions: `user_push_subscriptions` where `opted_in = true`

---

## Verify (backend)

```bash
bunx supabase db push   # if not already applied
bun run supabase:types
bunx tsc --noEmit
bun run build:ci
```

**SQL smoke test (logged-in user):**

1. Star on marketplace → row in `product_watchlists` with grade + `tracked_price`
2. `SELECT * FROM product_watchlists WHERE user_id = auth.uid()`
3. Change grade via UI → `grading_company` / `grading_score` updated; no duplicate UNIQUE violation
4. Set `target_price` → persists

---

## Partner follow-ups (optional)

| Item | Owner | Notes |
|------|-------|-------|
| OneSignal push cron | Backend | Phase 3 |
| `WishlistTicker` home strip | Frontend | ✅ Wired — `getHomeWishlistPreview`, `resolveWishlistDisplayValue` |
| Home `NewArrivals` / `PremiumMarket` stars | Frontend | ✅ Wired — real `productId` + grade |
| Distance-to-target UI | Frontend | Show `lowestListingPrice` vs `targetPrice` gap |
