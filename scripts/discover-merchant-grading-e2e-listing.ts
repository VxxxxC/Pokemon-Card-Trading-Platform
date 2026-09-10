/**
 * Discover merchant listings for grading E2E env alignment.
 * Run: bun run discover:merchant-grading-e2e
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";

const MIGRATION_PIN = "20260927120000";

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

function createServiceClient() {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function maybeCheckSellerSession(expectedSellerId: string): Promise<{
  sessionSellerId?: string;
  aligned: boolean;
}> {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const email = readEnv("E2E_SELLER_EMAIL");
  const password = readEnv("E2E_SELLER_PASSWORD");
  if (!url || !anonKey || !email || !password) {
    return { aligned: false };
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user?.id) {
    return { aligned: false };
  }

  return {
    sessionSellerId: data.user.id,
    aligned: data.user.id === expectedSellerId,
  };
}

type EnvListingDetail = {
  listingId: string;
  sellerId: string;
  persona: string | null;
  status: string | null;
  useAuthentication: boolean;
};

function buildKycBlockers(
  kyc: {
    kyc_status: string | null;
    stripe_charges_enabled: boolean | null;
    stripe_payouts_enabled: boolean | null;
  } | null,
): string[] {
  const blockers: string[] = [];
  if (!kyc) {
    blockers.push("No kyc_records row for E2E_SELLER_ID");
    return blockers;
  }
  if (kyc.kyc_status !== "verified") {
    blockers.push(`kyc_status is "${kyc.kyc_status ?? "null"}" (need verified)`);
  }
  if (!kyc.stripe_charges_enabled) {
    blockers.push("stripe_charges_enabled is false");
  }
  if (!kyc.stripe_payouts_enabled) {
    blockers.push("stripe_payouts_enabled is false");
  }
  return blockers;
}

function isEnvListingAligned(
  envListing: EnvListingDetail | null,
  sellerId: string,
): boolean {
  if (!envListing) {
    return false;
  }
  return (
    envListing.persona === "merchant" &&
    envListing.sellerId === sellerId &&
    envListing.useAuthentication &&
    envListing.status === "active"
  );
}

function buildNextSteps(input: {
  sellerId: string;
  kycReady: boolean;
  kycBlockers: string[];
  recommendedListingId: string | null;
  envListingId?: string;
  envListing: EnvListingDetail | null;
  envAligned: boolean;
  sellerSessionAligned: boolean;
  sessionSellerId?: string;
}): string[] {
  const steps: string[] = [];

  if (!input.kycReady) {
    steps.push(
      `Complete merchant KYC for ${input.sellerId}: ${input.kycBlockers.join("; ")}`,
    );
  }

  if (!input.recommendedListingId) {
    steps.push(
      `Create an active merchant listing (seller_persona=merchant, use_authentication=true) for ${input.sellerId}`,
    );
  }

  if (input.envListingId && !input.envAligned && input.envListing) {
    if (input.envListing.persona !== "merchant") {
      steps.push(
        `E2E_LISTING_ID ${input.envListingId} has seller_persona=${input.envListing.persona ?? "null"} (need merchant)`,
      );
    }
    if (input.envListing.sellerId !== input.sellerId) {
      steps.push(
        `E2E_LISTING_ID seller_id=${input.envListing.sellerId} does not match E2E_SELLER_ID=${input.sellerId}`,
      );
    }
    if (!input.envListing.useAuthentication) {
      steps.push(`Enable use_authentication=true on listing ${input.envListingId}`);
    }
    if (input.envListing.status !== "active") {
      steps.push(
        `Listing ${input.envListingId} status is "${input.envListing.status ?? "null"}" (need active)`,
      );
    }
  } else if (input.envListingId && !input.envListing) {
    steps.push(`E2E_LISTING_ID ${input.envListingId} not found in listings table`);
  }

  if (input.recommendedListingId && input.envListingId !== input.recommendedListingId) {
    steps.push(`Set E2E_LISTING_ID=${input.recommendedListingId} in .env.local / GitHub secrets`);
  }

  if (!input.sellerSessionAligned) {
    if (input.sessionSellerId) {
      steps.push(
        `E2E_SELLER_EMAIL must sign in as E2E_SELLER_ID (session ${input.sessionSellerId}, expected ${input.sellerId})`,
      );
    } else {
      steps.push(
        `Set E2E_SELLER_EMAIL/PASSWORD so sign-in resolves to E2E_SELLER_ID=${input.sellerId}`,
      );
    }
  }

  steps.push(`bunx supabase db push (through migration ${MIGRATION_PIN})`);
  steps.push("bun run verify:merchant-grading-e2e (must pass before merge)");

  return steps;
}

async function main(): Promise<void> {
  const sellerId = readEnv("E2E_SELLER_ID");
  const envListingId = readEnv("E2E_LISTING_ID");

  if (!sellerId) {
    console.error(JSON.stringify({ ok: false, error: "Missing E2E_SELLER_ID" }));
    process.exit(1);
  }

  const admin = createServiceClient();

  const { data: kyc, error: kycError } = await admin
    .from("kyc_records")
    .select("kyc_status, stripe_charges_enabled, stripe_payouts_enabled")
    .eq("merchant_id", sellerId)
    .maybeSingle();

  if (kycError) {
    console.error(JSON.stringify({ ok: false, error: kycError.message }));
    process.exit(1);
  }

  const kycBlockers = buildKycBlockers(kyc);
  const kycReady = kycBlockers.length === 0;

  const { data: listings, error: listingError } = await admin
    .from("listings")
    .select("id, seller_id, status, use_authentication, seller_persona, created_at")
    .eq("seller_id", sellerId)
    .eq("seller_persona", "merchant")
    .order("created_at", { ascending: false })
    .limit(10);

  if (listingError) {
    console.error(JSON.stringify({ ok: false, error: listingError.message }));
    process.exit(1);
  }

  const candidates = (listings ?? []).map((row) => ({
    listingId: row.id,
    status: row.status,
    useAuthentication: row.use_authentication ?? false,
  }));

  const authCandidates = candidates.filter(
    (row) => row.status === "active" && row.useAuthentication,
  );
  const activeCandidates = candidates.filter((row) => row.status === "active");

  const recommendedListingId =
    authCandidates[0]?.listingId ??
    activeCandidates[0]?.listingId ??
    candidates[0]?.listingId ??
    null;

  let envListing: EnvListingDetail | null = null;
  if (envListingId) {
    const { data: envRow, error: envError } = await admin
      .from("listings")
      .select("id, seller_id, status, use_authentication, seller_persona")
      .eq("id", envListingId)
      .maybeSingle();

    if (envError) {
      console.error(JSON.stringify({ ok: false, error: envError.message }));
      process.exit(1);
    }

    if (envRow) {
      envListing = {
        listingId: envRow.id,
        sellerId: envRow.seller_id,
        persona: envRow.seller_persona,
        status: envRow.status,
        useAuthentication: envRow.use_authentication ?? false,
      };
    }
  }

  const envAligned = envListingId ? isEnvListingAligned(envListing, sellerId) : true;

  const sessionCheck = await maybeCheckSellerSession(sellerId);

  const nextSteps = buildNextSteps({
    sellerId,
    kycReady,
    kycBlockers,
    recommendedListingId,
    envListingId,
    envListing,
    envAligned,
    sellerSessionAligned: sessionCheck.aligned,
    sessionSellerId: sessionCheck.sessionSellerId,
  });

  const ok = Boolean(kycReady && recommendedListingId && envAligned);

  console.log(
    JSON.stringify(
      {
        ok,
        sellerId,
        kycReady,
        kycBlockers,
        recommendedListingId,
        envListingId: envListingId ?? null,
        envListing,
        envAligned,
        sellerSession: sessionCheck.sessionSellerId
          ? {
              userId: sessionCheck.sessionSellerId,
              alignedWithSellerId: sessionCheck.aligned,
            }
          : null,
        candidates,
        nextSteps,
        hint: recommendedListingId
          ? `Set E2E_LISTING_ID=${recommendedListingId} and ensure E2E_SELLER_EMAIL signs in as ${sellerId}`
          : "Create an active merchant listing for this seller with use_authentication=true",
      },
      null,
      2,
    ),
  );

  if (!ok) {
    process.exit(1);
  }
}

main();
