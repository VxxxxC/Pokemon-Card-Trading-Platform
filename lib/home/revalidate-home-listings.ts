import { revalidatePath, updateTag } from "next/cache";

export const HOME_LISTINGS_CACHE_TAG = "home-listings";

/** Invalidate cached home C2C / merchant strips after listing visibility changes. */
export function revalidateHomeListingsCache() {
  updateTag(HOME_LISTINGS_CACHE_TAG);
  revalidatePath("/");
}
