import { MARKETPLACE_SEARCH_CACHE_SECONDS } from "@/lib/marketplace/constants";

export const HOME_WISHLIST_LIMIT = 9;
export const HOME_LISTING_LIMIT = 9;

/** Reuse marketplace browse TTL for public home listing strips. */
export const HOME_LISTING_CACHE_SECONDS = MARKETPLACE_SEARCH_CACHE_SECONDS;

/** Public homepage trade marquee TTL. */
export const HOME_TICKER_CACHE_SECONDS = MARKETPLACE_SEARCH_CACHE_SECONDS;
export const HOME_TICKER_LIMIT = 12;
