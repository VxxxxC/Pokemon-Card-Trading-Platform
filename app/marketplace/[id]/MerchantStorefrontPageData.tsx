import { notFound } from "next/navigation";
import {
  getMarketplaceSellerProfile,
  searchMarketplaceSellerListings,
} from "@/app/actions/marketplace";
import type { ReviewPersona } from "@/app/lib/reviews/types";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { MARKETPLACE_STOREFRONT_PAGE_SIZE } from "@/lib/marketplace/constants";
import { parseSellerViewPersona } from "@/lib/marketplace/seller-identity";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MerchantStorefrontPageClient } from "./MerchantStorefrontPageClient";

interface MerchantStorefrontPageDataProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ persona?: string }>;
}

export async function MerchantStorefrontPageData({
  params,
  searchParams,
}: MerchantStorefrontPageDataProps) {
  const { id } = await params;
  const { persona: personaParam } = await searchParams;
  const requestedPersona = parseSellerViewPersona(personaParam);

  if (!isSupabaseConfigured()) {
    return (
      <MerchantStorefrontPageClient
        seller={null}
        bootstrapError="無法連線至商戶櫥窗"
      />
    );
  }

  const profileResult = await getMarketplaceSellerProfile(id, {
    persona: requestedPersona,
  });
  if (!profileResult.success) {
    notFound();
  }

  const seller = profileResult.data;
  const storefrontPersona: ReviewPersona =
    requestedPersona ?? (seller.role === "merchant" ? "merchant" : "member");

  const [listingsResult, user] = await Promise.all([
    searchMarketplaceSellerListings({
      sellerId: seller.id,
      sellerPersona: storefrontPersona,
      page: 1,
      pageSize: MARKETPLACE_STOREFRONT_PAGE_SIZE,
      sortKey: "最新",
    }),
    getOptionalAuthUser(),
  ]);

  const initialListings = listingsResult.success
    ? {
        listings: listingsResult.data.listings,
        meta: listingsResult.data.meta,
        priceBounds: listingsResult.data.priceBounds,
      }
    : undefined;

  return (
    <MerchantStorefrontPageClient
      seller={seller}
      storefrontPersona={storefrontPersona}
      initialListings={initialListings}
      currentUserId={user?.id ?? null}
      bootstrapError={listingsResult.success ? undefined : listingsResult.error}
    />
  );
}
