/**
 * Control test: HK company Express account with identity distinct from
 * "Sing Sing Chow / Star Limited" (avoids repeated `listed` screening pattern).
 *
 * Usage: bun run scripts/stripe/create-control-test-merchant.ts
 */
import { stripe } from "../../lib/stripe";

const SUFFIX = Date.now();

const IDENTITY = {
  companyName: `Harbour Peak Trading ${SUFFIX}`,
  brNumber: `BR${String(SUFFIX).slice(-8)}`,
  companyPhone: "+852 68881234",
  companyAddress: {
    line1: "88 Queensway Tower 12F",
    line2: "Admiralty",
    city: "Hong Kong",
  },
  repEmail: `control.merchant.${SUFFIX}@hkcv-control-test.example`,
  repFirstName: "Marcus",
  repLastName: "Leung",
  repDob: { day: 15, month: 6, year: 1988 },
  repHkid: "K1234567",
  repPhone: "+852 61112233",
  repTitle: "Managing Director",
  repAddress: {
    line1: "Flat 9B, 200 Nathan Road",
    line2: "Yau Ma Tei",
    city: "Hong Kong",
  },
};

async function main() {
  console.log("⏳ Creating control-test HK company Express account...\n");
  console.log(JSON.stringify(IDENTITY, null, 2));
  console.log();

  const account = await stripe.accounts.create({
    type: "express",
    country: "HK",
    email: IDENTITY.repEmail,
    business_type: "company",
    company: {
      name: IDENTITY.companyName,
      phone: IDENTITY.companyPhone,
      address: {
        ...IDENTITY.companyAddress,
        country: "HK",
      },
      registration_number: IDENTITY.brNumber,
      owners_provided: true,
    },
    business_profile: {
      mcc: "5947",
      product_description: "Control test — trading cards marketplace",
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      hkcv_control_test: "true",
      hkcv_control_suffix: String(SUFFIX),
    },
  });

  console.log(`✅ Account: ${account.id}`);

  const person = await stripe.accounts.createPerson(account.id, {
    first_name: IDENTITY.repFirstName,
    last_name: IDENTITY.repLastName,
    dob: IDENTITY.repDob,
    id_number: IDENTITY.repHkid,
    email: IDENTITY.repEmail,
    phone: IDENTITY.repPhone,
    address: {
      ...IDENTITY.repAddress,
      country: "HK",
    },
    relationship: {
      representative: true,
      director: true,
      executive: true,
      owner: true,
      percent_ownership: 100,
      title: IDENTITY.repTitle,
    },
  });

  console.log(`✅ Person: ${person.id} (${IDENTITY.repFirstName} ${IDENTITY.repLastName}, owner 100%)`);

  const link = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: "https://example.com/reauth",
    return_url: "https://example.com/return",
    type: "account_onboarding",
  });

  const snapshot = await stripe.accounts.retrieve(account.id);

  console.log("\n--- Pre-onboarding snapshot ---");
  console.log(`charges_enabled: ${snapshot.charges_enabled}`);
  console.log(`payouts_enabled: ${snapshot.payouts_enabled}`);
  console.log(
    `disabled_reason: ${snapshot.requirements?.disabled_reason ?? "(none)"}`,
  );
  console.log(
    `currently_due: ${JSON.stringify(snapshot.requirements?.currently_due ?? [])}`,
  );

  console.log("\n================================================================");
  console.log("👉 Open in incognito → Fill with test data → complete bank step:");
  console.log(link.url);
  console.log("================================================================\n");
  console.log(`After onboarding, run:`);
  console.log(
    `  bunx stripe get /v1/accounts/${account.id} -d "expand[]=requirements"`,
  );
}

main().catch((error) => {
  console.error("❌ Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
