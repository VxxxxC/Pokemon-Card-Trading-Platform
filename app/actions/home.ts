"use server";

import { unstable_cache } from "next/cache";
import type { HomeListingsResult } from "@/app/lib/home/types";
import {
  HOME_LISTING_CACHE_SECONDS,
  HOME_LISTING_LIMIT,
} from "@/lib/home/constants";
import { fetchHomeListingsByPersona } from "@/lib/home/load-home-listings";
import { HOME_LISTINGS_CACHE_TAG } from "@/lib/home/revalidate-home-listings";
import { homePerfLog } from "@/lib/home/perf-log";
import { isSupabaseConfigured } from "@/lib/supabase/env";

function getCachedHomeListings(
  persona: "merchant" | "member",
): Promise<HomeListingsResult> {
  return unstable_cache(
    async () => {
      const data = await fetchHomeListingsByPersona(persona, HOME_LISTING_LIMIT);
      return { success: true as const, data };
    },
    ["home-listings", persona, String(HOME_LISTING_LIMIT)],
    {
      revalidate: HOME_LISTING_CACHE_SECONDS,
      tags: [HOME_LISTINGS_CACHE_TAG],
    },
  )().catch(async (error) => {
    console.error(`[getHome${persona}Listings] cache`, error);
    try {
      const data = await fetchHomeListingsByPersona(persona, HOME_LISTING_LIMIT);
      return { success: true as const, data };
    } catch (fetchError) {
      console.error(`[getHome${persona}Listings]`, fetchError);
      return { success: false as const, error: "無法載入首頁掛單" };
    }
  });
}

export async function getHomeMerchantListings(): Promise<HomeListingsResult> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  homePerfLog("merchant.cache=miss");
  return getCachedHomeListings("merchant");
}

export async function getHomeMemberListings(): Promise<HomeListingsResult> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  homePerfLog("member.cache=miss");
  return getCachedHomeListings("member");
}
