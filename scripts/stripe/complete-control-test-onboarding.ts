/**
 * Complete control-test onboarding via API (test mode only).
 * Usage: bun run scripts/stripe/complete-control-test-onboarding.ts <acct_id>
 */
import { stripe } from "../../lib/stripe";

const accountId = process.argv[2];
if (!accountId?.startsWith("acct_")) {
  console.error("Usage: bun run scripts/stripe/complete-control-test-onboarding.ts acct_xxx");
  process.exit(1);
}

async function main() {
  await stripe.accounts.update(accountId, {
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip: "127.0.0.1",
    },
  });
  console.log("✅ tos_acceptance set");

  await stripe.accounts.createExternalAccount(accountId, {
    external_account: {
      object: "bank_account",
      country: "HK",
      currency: "hkd",
      account_holder_name: "Marcus Leung",
      account_holder_type: "company",
      routing_number: "110-000",
      account_number: "000123456",
    },
  });
  console.log("✅ external bank account added");

  const account = await stripe.accounts.retrieve(accountId, {
    expand: ["requirements", "external_accounts"],
  });

  const persons = await stripe.accounts.listPersons(accountId);

  console.log("\n--- Post-setup snapshot ---");
  console.log(`charges_enabled: ${account.charges_enabled}`);
  console.log(`payouts_enabled: ${account.payouts_enabled}`);
  console.log(`disabled_reason: ${account.requirements?.disabled_reason ?? "(none)"}`);
  console.log(`currently_due: ${JSON.stringify(account.requirements?.currently_due ?? [])}`);
  console.log(`errors: ${JSON.stringify(account.requirements?.errors ?? [])}`);
  console.log(`persons: ${JSON.stringify(persons.data.map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`,
    owner: p.relationship?.owner,
    percent_ownership: p.relationship?.percent_ownership,
  })), null, 2)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
