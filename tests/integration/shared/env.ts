function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

export function hasBaseIntegrationEnv(): boolean {
  return Boolean(
    readEnv("NEXT_PUBLIC_SUPABASE_URL") &&
      readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
      readEnv("SUPABASE_SERVICE_ROLE_KEY") &&
      readEnv("E2E_ADMIN_EMAIL") &&
      readEnv("E2E_ADMIN_PASSWORD") &&
      readEnv("E2E_BUYER_EMAIL") &&
      readEnv("E2E_BUYER_PASSWORD"),
  );
}

export function hasGradingStripeSmokeEnv(): boolean {
  return hasBaseIntegrationEnv() && Boolean(readEnv("STRIPE_SECRET_KEY"));
}

export function hasMerchantGradingStripeSmokeEnv(): boolean {
  return (
    hasGradingStripeSmokeEnv() &&
    Boolean(readEnv("E2E_SELLER_ID")) &&
    Boolean(readEnv("E2E_LISTING_ID")) &&
    Boolean(readEnv("E2E_SELLER_EMAIL")) &&
    Boolean(readEnv("E2E_SELLER_PASSWORD"))
  );
}

export function hasStripeWebhookRouteEnv(): boolean {
  return hasGradingStripeSmokeEnv();
}

export function hasBunnyIntegrationEnv(): boolean {
  return (
    hasBaseIntegrationEnv() &&
    Boolean(readEnv("BUNNY_STORAGE_ZONE_NAME")) &&
    Boolean(readEnv("BUNNY_STORAGE_ACCESS_KEY")) &&
    Boolean(readEnv("BUNNY_CDN_HOSTNAME"))
  );
}

export function getIntegrationEnv() {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const adminEmail = readEnv("E2E_ADMIN_EMAIL");
  const adminPassword = readEnv("E2E_ADMIN_PASSWORD");
  const buyerEmail = readEnv("E2E_BUYER_EMAIL");
  const buyerPassword = readEnv("E2E_BUYER_PASSWORD");

  if (
    !url ||
    !anonKey ||
    !serviceRoleKey ||
    !adminEmail ||
    !adminPassword ||
    !buyerEmail ||
    !buyerPassword
  ) {
    throw new Error("Missing integration test env vars");
  }

  return {
    url,
    anonKey,
    serviceRoleKey,
    adminEmail,
    adminPassword,
    buyerEmail,
    buyerPassword,
  };
}
