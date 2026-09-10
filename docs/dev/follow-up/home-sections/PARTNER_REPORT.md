# Partner Report — Home Page Sections (`/`)

> **Partner 人手清單：** [PARTNER_QA.md § M5](../../PARTNER_QA.md#m5--首頁-p015-min)（本頁為技術報告，唔再維護獨立 QA checklist）

**Date:** 2026-07-08 (updated)  
**Flow:** Homepage wishlist strip + merchant carousel + C2C arrivals + auth-gated check-in  
**Backend owner:** Backend track  
**Frontend owner:** Partner (polish + smoke-test)  
**Remote DB:** No new migrations — uses existing `listings`, `product_watchlists`, `product_catalog`, `profiles` RLS

---

## Executive summary

| Area | Status |
|------|--------|
| SSR home page (`app/page.tsx`) | ✅ Shipped |
| Section-level Suspense + skeletons | ✅ Shipped |
| 心水情報 — `getHomeWishlistPreview(9)` | ✅ Shipped |
| 認證商家 — `getHomeMerchantListings()` | ✅ Shipped |
| C2C 上架 — `getHomeMemberListings()` | ✅ Shipped |
| Guest hides wishlist + check-in | ✅ Shipped |
| Wishlist 3-step price (SNKRDUNK → 平台 → 入手價) | ✅ Shipped |
| Wishlist「± 自追蹤」副標（平台價時） | ✅ Shipped |
| Public listings `unstable_cache` (60s) | ✅ Shipped |
| `favoredKeys` SSR on home listing stars | ✅ `getWishlistFavoredKeysForUser` in `page.tsx` |
| Server + client perf instrumentation | ✅ `lib/home/perf-log.ts` + `app/lib/home/perf-log-client.ts` |
| `BuyButton` on C2C strip | ✅ Wired — `NewArrivals` → global `ExecutionSlideOver` → `makeOffer` |
| Merchant storefront deep links | ⏳ Product → `/marketplace/product/[id]`; seller → `/profile/[id]` |

**Partner action:** Smoke-test `/` as guest and logged-in member; verify section data, empty states, wishlist price fallback, and pre-hydrated wishlist stars on merchant/C2C cards.

---

## Changelog (2026-07-08)

| Change | Detail |
|--------|--------|
| C2C **立即購買** | `NewArrivals` `BuyButton` → `useUIStore.openExecutionSlideOver` (same host as marketplace grid + product detail) |

## Changelog (2026-07-07 follow-up)

| Change | Detail |
|--------|--------|
| `favoredKeys` SSR | `app/page.tsx` fetches `getWishlistFavoredKeysForUser(user.id)` when logged in; passed to `PremiumMarket` / `NewArrivals` for `WishlistButton initialIsFavored` |
| Client perf log | `app/lib/home/perf-log-client.ts`; `HomePageShell` calls `markHomeClientMount()` on mount |
| Wishlist ticker diff | When display source is **platform**, shows `±HK$ … 自追蹤` vs `trackedPrice` (aligned with collection table subtitle) |

---

## Three homepage sections

| # | Section | Component | Query contract | Limit |
|---|---------|-----------|----------------|-------|
| 1 | 心水情報 | `WishlistTicker` | `product_watchlists` for `auth.uid()`, `ORDER BY created_at DESC` | 9 |
| 2 | 認證商家 | `PremiumMarket` | `listings` where `seller_persona = merchant` AND `status = active`, `ORDER BY created_at DESC` | 9 |
| 3 | C2C 上架 | `NewArrivals` | `listings` where `seller_persona = member` AND `status = active`, `ORDER BY created_at DESC` | 9 |

### Auth-gated UI (not a fourth data section)

| UI | Rule |
|----|------|
| `WishlistTicker` | Rendered only when `getOptionalAuthUser()` returns a user **and** preview has rows |
| `CheckInCard` in `HeroSearch` | `showCheckIn={!!currentUserId}`; `deferStatsLoad` so hero search is not blocked |

Guest visitors still see hero search, trust banner, merchant strip, and C2C strip.

---

## Architecture (performance)

```
GET /
  ├─ getOptionalAuthUser()
  ├─ getWishlistFavoredKeysForUser(user.id)   (logged-in only, sync with page)
  │
  ├─ HomePageShell (sync) — nav, hero, trust, footer
  │    └─ markHomeClientMount() on client
  │
  ├─ Suspense: HomeWishlistSectionData     (logged-in only)
  │    └─ getHomeWishlistPreview(9)       — NOT cached
  │
  ├─ Suspense: HomeMerchantSectionData     ║ parallel stream
  │    └─ getHomeMerchantListings()        — unstable_cache 60s
  │    └─ favoredKeys → PremiumMarket
  │
  └─ Suspense: HomeC2cSectionData
       └─ getHomeMemberListings()          — unstable_cache 60s
       └─ favoredKeys → NewArrivals
```

**Design intent:** No single mega-bootstrap blocking all sections. Guest never hits `product_watchlists` or `favoredKeys`. Public strips use `createPublicClient()` inside cache (no `cookies()`).

**Perf logs** (`HOME_PERF_LOG=1` / `NEXT_PUBLIC_HOME_PERF_LOG=1` or development):

| Layer | File | Examples |
|-------|------|----------|
| Server | `lib/home/perf-log.ts` | `listings.merchant=…ms`, `wishlist=…ms` |
| Client | `app/lib/home/perf-log-client.ts` | `clientMount` |

---

## Wishlist price contract (home ticker)

Display price uses [`lib/wishlist/pricing.ts`](../../../../lib/wishlist/pricing.ts) `resolveWishlistDisplayValue()`:

| Priority | Source | `WishlistEntry` field |
|----------|--------|------------------------|
| 1 | SNKRDUNK | `currentMarketPrice` |
| 2 | 平台最低現貨 | `lowestListingPrice` |
| 3 | 入手價（加入時 snapshot） | `trackedPrice` |

| UI element | Rule |
|------------|------|
| Main price | `resolveWishlistDisplayValue().value` or **暫無報價** |
| 30D trend % + sparkline | SNKRDUNK only (`trend30d` + `chartPoints`); `—` when missing |
| ± 自追蹤副標 | When source is `platform` and `trackedPrice` set |
| `alertTag` | `targetPrice` met → **降價通知** |

Collection table (`WishlistTable`) still shows **平台現價** column only — home ticker is intentionally richer.

---

## Server actions & loaders

| Function | File | Notes |
|----------|------|-------|
| `getHomeMerchantListings()` | `app/actions/home.ts` | Cached public query |
| `getHomeMemberListings()` | `app/actions/home.ts` | Cached public query |
| `getHomeWishlistPreview(9)` | `app/actions/wishlist.ts` | Auth-only; `.limit(9)` before joins |
| `getWishlistFavoredKeysForUser(userId)` | `app/actions/wishlist.ts` | Page-level SSR for star hydration |
| `fetchHomeListingsByPersona()` | `lib/home/load-home-listings.ts` | Listings + `profiles` + `product_catalog` |

### DTO

`HomeListingCard` — [`app/lib/home/types.ts`](../../../../app/lib/home/types.ts)

Used by `PremiumMarket` and `NewArrivals`. Product link: `/marketplace/product/{productId}`. Seller CTA: `/profile/{sellerId}`.

---

## Files touched

### Backend / lib

| File | Purpose |
|------|---------|
| `app/actions/home.ts` | Merchant + member home listing actions |
| `app/actions/wishlist.ts` | `getHomeWishlistPreview`, `buildWishlistEntriesForUser(userId, limit?)` |
| `lib/home/load-home-listings.ts` | Persona-filtered listing fetch + map |
| `lib/home/constants.ts` | `HOME_LISTING_LIMIT`, `HOME_WISHLIST_LIMIT`, cache TTL |
| `lib/home/perf-log.ts` | Server perf diagnostics |
| `lib/wishlist/pricing.ts` | 3-step wishlist display price + alert tag |
| `lib/wishlist/sparkline.ts` | Shared sparkline helpers (`WishlistTable` + `WishlistTicker`) |

### Frontend

| File | Purpose |
|------|---------|
| `app/page.tsx` | Auth + `favoredKeys` fetch; Suspense orchestration |
| `app/HomePageShell.tsx` | Static chrome; `showCheckIn`; client perf mount |
| `app/lib/home/perf-log-client.ts` | Client perf diagnostics |
| `app/home/HomeWishlistSectionData.tsx` | Auth-only wishlist stream |
| `app/home/HomeMerchantSectionData.tsx` | Merchant carousel + `favoredKeys` |
| `app/home/HomeC2cSectionData.tsx` | C2C strip + `favoredKeys` |
| `app/home/HomeSectionSkeletons.tsx` | Per-section fallbacks |
| `app/components/shared/WishlistTicker.tsx` | Live wishlist cards + 3-step price |
| `app/components/home/PremiumMarket.tsx` | Live merchant listings + star hydration |
| `app/components/home/NewArrivals.tsx` | Live C2C listings + star hydration |
| `app/components/home/HeroSearch.tsx` | `showCheckIn` prop; `CheckInCard deferStatsLoad` |

### Database

No new migrations. Relies on:

- `listings_public_read_active` RLS
- `idx_listings_active_seller_persona`
- `product_watchlists` owner RLS (wishlist)

---

## Data flow (reference)

```
Guest /
  → merchant + C2C strips (cached)
  → no wishlist query, no favoredKeys, no check-in card

Logged-in /
  → page.tsx: getOptionalAuthUser + getWishlistFavoredKeysForUser (sync)
  → parallel Suspense: wishlist preview (≤9) + merchant strip + C2C strip
  → WishlistTicker hidden when preview returns []
  → CheckInCard loads stats on idle (deferStatsLoad)

WishlistButton on merchant/C2C cards
  → productId + gradingCompany + gradingScore + trackedPrice
  → currentUserId + initialIsFavored from favoredKeys (SSR)
  → no useCurrentUserId() waterfall
```

---

## Partner backlog

### P0 — Verify wired flows

- [ ] **Guest** `/` — no 心水情報 section, no check-in; merchant + C2C show real data or empty state
- [ ] **Logged-in** `/` — check-in visible; wishlist strip when `product_watchlists` has rows (≤9)
- [ ] Merchant cards: only `seller_persona = merchant`, newest first
- [ ] C2C cards: only `seller_persona = member`, newest first
- [ ] Wishlist card price: SNKRDUNK when available, else platform min, else tracked price
- [ ] Wishlist platform price shows ± 自追蹤 when `trackedPrice` exists
- [ ] Wishlist trend: sparkline + 30D% when SNKRDUNK chart exists; `—` otherwise
- [ ] Pre-favorited cards show filled star on merchant/C2C strips (SSR `favoredKeys`)
- [ ] Product links open `/marketplace/product/{productId}`
- [ ] C2C **立即購買** opens global offer slide-over; logged-in submit reaches chat (`makeOffer`)
- [ ] Section skeletons appear briefly (not full-page white screen)
- [ ] `bun run build:ci` passes

### P1 — Polish (partner-owned)

- [ ] Empty-state copy / illustration for wishlist strip when logged in but no entries (section currently hidden — confirm product preference)
- [ ] Merchant seller CTA: confirm `/profile/[sellerId]` vs future storefront route
- [ ] C2C relative time label (`formatRelativeDateTime`) — verify zh-Hant copy

### P2 — Out of scope (existing backlog)

- [x] `BuyButton` — wired to global `ExecutionSlideOver` (`GlobalTxButtons.tsx`, 2026-07-08)
- [ ] `PortfolioRewards` home widget — still commented out on shell
- [ ] OneSignal wishlist price alerts (Phase 3)

---

## Acceptance checklist

- [ ] Guest: hero search works immediately (check-in not shown)
- [ ] Member: star on home listing card → row in `product_watchlists`; star pre-filled on revisit when already favored
- [ ] Wishlist ticker links to `/marketplace/product/{productId}`
- [ ] Second page load within 60s: merchant/C2C may serve from cache (check `[home:perf]` server logs)
- [ ] Client mount logged in dev (`[home:perf] clientMount`)
- [ ] No `product_watchlists` / `favoredKeys` fetch for guest
- [x] `bunx tsc --noEmit`
- [x] `bun run build:ci`

---

## Related docs

- [backend.md](./backend.md) — action contracts
- [frontend.md](./frontend.md) — UI touchpoints
- [PERF_REPORT.md](./PERF_REPORT.md) — performance notes
- [wishlist/frontend.md](../wishlist/frontend.md) — star + collection table
- [INTEGRATION_QUEUE.md](../../INTEGRATION_QUEUE.md) — queue row
