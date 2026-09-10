# Partner regression E2E

UI-first specs driven by [docs/dev/partner-regression.md](../../docs/dev/partner-regression.md).

## Layout

```text
e2e/partner/
  member/    # F-M-* journeys
  merchant/  # F-C-*
  admin/     # F-A-* (smoke + critical ops)
  system/    # F-S-* · chat · cron UI effects
```

## Conventions

- File prefix: `p-a01-`, `p-b01-`, `p-c01-` matching Partner SSOT IDs.
- Header comment: `@partner-id`, `@features`, `@path Partner`.
- Prefer real UI flows over `createE2eAdminClient` mutations for the scenario under test.
- Assert visible UI: stepper step count, dialog, badge, URL, invoice rows.

## Run

```bash
bun run test:e2e:partner
```
