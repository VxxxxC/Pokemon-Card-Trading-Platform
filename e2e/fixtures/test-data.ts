import type { TestType } from "@playwright/test";

const DEFAULT_INVALID_SELLER_ID = "00000000-0000-0000-0000-000000000000";

function readEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

export type MerchantProductDetailFixtures = {
  sellerId: string;
  sellerUsername: string;
  listingId: string;
  listingDisplayId: string | null;
  listingProductId: string | null;
  buyerEmail: string;
  buyerPassword: string;
  invalidSellerId: string;
  wrongSellerId: string | null;
};

export function getMerchantProductDetailFixtures(): Partial<MerchantProductDetailFixtures> {
  return {
    sellerId: readEnv("E2E_SELLER_ID"),
    sellerUsername: readEnv("E2E_SELLER_USERNAME"),
    listingId: readEnv("E2E_LISTING_ID"),
    listingDisplayId: readEnv("E2E_LISTING_DISPLAY_ID") ?? null,
    listingProductId: readEnv("E2E_LISTING_PRODUCT_ID") ?? null,
    buyerEmail: readEnv("E2E_BUYER_EMAIL"),
    buyerPassword: readEnv("E2E_BUYER_PASSWORD"),
    invalidSellerId:
      readEnv("E2E_INVALID_SELLER_ID") ?? DEFAULT_INVALID_SELLER_ID,
    wrongSellerId: readEnv("E2E_WRONG_SELLER_ID") ?? null,
  };
}

export function hasCoreMerchantFixtures(): boolean {
  const fixtures = getMerchantProductDetailFixtures();
  return Boolean(fixtures.sellerId && fixtures.listingId);
}

export function hasSellerUsernameFixture(): boolean {
  const fixtures = getMerchantProductDetailFixtures();
  return Boolean(fixtures.sellerUsername && fixtures.listingId);
}

export function hasListingDisplayIdFixture(): boolean {
  const fixtures = getMerchantProductDetailFixtures();
  return Boolean(fixtures.sellerId && fixtures.listingDisplayId);
}

export function hasListingProductIdFixture(): boolean {
  const fixtures = getMerchantProductDetailFixtures();
  return Boolean(fixtures.sellerId && fixtures.listingProductId);
}

export function hasBuyerAuthFixtures(): boolean {
  const fixtures = getMerchantProductDetailFixtures();
  return Boolean(fixtures.buyerEmail && fixtures.buyerPassword);
}

export function hasAdminAuthFixtures(): boolean {
  return Boolean(readEnv("E2E_ADMIN_EMAIL") && readEnv("E2E_ADMIN_PASSWORD"));
}

export function hasWrongSellerFixture(): boolean {
  const fixtures = getMerchantProductDetailFixtures();
  return Boolean(fixtures.wrongSellerId && fixtures.listingId);
}

export function requireCoreMerchantFixtures(
  test: TestType<object, object>,
  reason = "Missing E2E_SELLER_ID or E2E_LISTING_ID in environment",
): asserts test is TestType<object, object> {
  if (!hasCoreMerchantFixtures()) {
    test.skip(true, reason);
  }
}

export function requireBuyerAuthFixtures(
  test: TestType<object, object>,
  reason = "Missing E2E_BUYER_EMAIL or E2E_BUYER_PASSWORD in environment",
): asserts test is TestType<object, object> {
  if (!hasBuyerAuthFixtures()) {
    test.skip(true, reason);
  }
}

export function buildMerchantProductDetailPath(
  sellerKey: string,
  productKey: string,
): string {
  return `/marketplace/${encodeURIComponent(sellerKey)}/product/${encodeURIComponent(productKey)}`;
}

export function buildPublicProfilePath(profileKey: string): string {
  return `/profile/${encodeURIComponent(profileKey)}`;
}

export function hasPublicProfileFixtures(): boolean {
  return hasCoreMerchantFixtures();
}

export function hasBunnyStorageFixtures(): boolean {
  return Boolean(
    readEnv("BUNNY_STORAGE_ZONE_NAME") &&
      readEnv("BUNNY_STORAGE_ACCESS_KEY") &&
      readEnv("BUNNY_CDN_HOSTNAME"),
  );
}

export { hasChatRealtimeFixtures as hasMemberTradingFixtures } from "./chat-test-data";
