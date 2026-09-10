import type { Tables } from "@/types/supabase";

export type HomeBannerItem = {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  altText?: string;
};

export type HomeListingCard = {
  listingId: string;
  productId: string;
  displayId: string | null;
  cardCode: string;
  name: string;
  setCode: string;
  rarity: Tables<"product_catalog">["rarity"];
  gradingCompany: string;
  gradingScore: string | null;
  gradeLabel: string;
  price: number;
  imageUrl: string;
  catalogImageUrl: string | null;
  sellerId: string;
  sellerName: string;
  sellerBadge: string;
  photoCount: number;
  createdAt: string;
  useAuthentication: boolean;
};

export type HomeListingsResult =
  | { success: true; data: HomeListingCard[] }
  | { success: false; error: string };
