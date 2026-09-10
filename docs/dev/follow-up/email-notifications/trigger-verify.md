# Email trigger verify (producer → outbox)

> Resend worker is shared; this pack verifies **business triggers enqueue** `notification_email_outbox`.

## Automated gate (CI)

```bash
bun run test:email:triggers
```

Covers cron processor wiring with mocks: `E-ORD-02`, `E-ORD-07`, `E-ORD-08`, `E-MCH-04`, `E-ACC-08`.

## Staging checklist (12 events + 1 meta sample)

| Batch | Events | How |
|-------|--------|-----|
| **batch-a-cron** | E-ORD-02, E-ORD-07, E-ORD-08, E-MCH-04, E-ACC-08 | SQL seeds → run crons |
| **batch-b-action** | E-MOD-05, E-RWD-01, E-ACC-09, E-REF-03 | `bun scripts/dev/run-email-trigger-batch-b.ts` |
| **batch-c-payout** | E-PAY-01, E-PAY-02, E-GRD-B2C-09 | `bun scripts/dev/run-email-trigger-batch-c.ts` |

Meta: pick 2–3 rows from above and optionally run `process-email-outbox` to confirm `sent`.

## Steps

1. Seed DB — edit placeholders in `scripts/dev/email-trigger-seeds.sql`, run against staging.
2. Run cron batch (A) or action producers (B):

```bash
bun scripts/dev/verify-email-triggers.ts --run-crons batch-a-cron
bun scripts/dev/run-email-trigger-batch-b.ts
bun scripts/dev/run-email-trigger-batch-c.ts
```

3. Assert outbox (default: all 12 pending event ids, last 180 minutes):

```bash
bun scripts/dev/verify-email-triggers.ts --assert E-ORD-07,E-MCH-04 --since-minutes 240
```

4. List trigger catalog:

```bash
bun scripts/dev/verify-email-triggers.ts --list
```

5. Optional — drain worker (Resend already verified):

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "$NEXT_PUBLIC_SITE_URL/api/cron/process-email-outbox"
```

## Pass criteria

- `notification_email_outbox` has row with expected `event_id`
- `status` in (`pending`, `sent`) — **enqueue proven**
- Tick `manual-test.md` when all 12 + meta sample done
