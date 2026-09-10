import type { ReviewPersona } from "@/app/lib/reviews/types";

export function parseSellerViewPersona(
  value: string | null | undefined,
): ReviewPersona | undefined {
  if (value === "merchant" || value === "member") {
    return value;
  }
  return undefined;
}

export function resolveSellerStorefrontPath(
  sellerId: string,
  persona: ReviewPersona,
): string {
  return `/marketplace/${sellerId}?persona=${persona}`;
}

export function formatSellerIdentityLabel(
  displayName: string | null | undefined,
  username: string | null | undefined,
): string {
  const name = displayName?.trim() || "賣家";
  const handle = username?.trim();
  return handle ? `${name} (${handle})` : name;
}

export function resolveSellerProfilePath(input: {
  sellerId: string;
  sellerUsername?: string | null;
  sellerPersona?: "member" | "merchant" | null;
}): string {
  const username = input.sellerUsername?.trim();
  const base = `/profile/${username || input.sellerId}`;
  if (input.sellerPersona === "member" || input.sellerPersona === "merchant") {
    return `${base}?persona=${input.sellerPersona}`;
  }
  return base;
}
