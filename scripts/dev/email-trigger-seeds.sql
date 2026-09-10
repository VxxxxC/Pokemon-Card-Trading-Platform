-- Email trigger seeds (staging / local) — backdate rows so cron producers enqueue outbox.
-- Replace placeholders before running. Run crons via:
--   bun scripts/dev/verify-email-triggers.ts --run-crons batch-a-cron
-- Then assert:
--   bun scripts/dev/verify-email-triggers.ts --assert E-ORD-07,E-ORD-08,E-MCH-04,E-ACC-08

-- ── E-ORD-02: pending_payment expiry (48h) ───────────────────────────────────
-- Pick a merchant_orders.id in pending_payment; ensure RPC lists it.
-- UPDATE merchant_orders
-- SET created_at = now() - interval '49 hours',
--     updated_at = now() - interval '49 hours'
-- WHERE id = '<merchant_order_uuid>' AND escrow_status = 'pending_payment';

-- ── E-ORD-07: buyer confirm reminder (shipped, unconfirmed, >3d) ─────────────
-- merchant_orders.updated_at is overwritten by triggers — use psql:
-- BEGIN; SET LOCAL session_replication_role = replica;
-- UPDATE merchant_orders
-- SET updated_at = now() - interval '4 days'
-- WHERE id = '<merchant_order_uuid>' AND escrow_status = 'shipped' AND buyer_confirmed_at IS NULL;
-- COMMIT;

-- ── E-ORD-08: seller ship reminder (paid, payment_held, >3d) ───────────────
-- UPDATE merchant_orders
-- SET escrow_status = 'payment_held',
--     paid_at = now() - interval '4 days',
--     updated_at = now()
-- WHERE id = '<merchant_order_uuid>';

-- ── E-MCH-04: Connect onboarding reminder (KYC verified 48h+, Connect incomplete)
-- UPDATE kyc_records
-- SET kyc_status = 'verified',
--     verified_at = now() - interval '49 hours',
--     stripe_charges_enabled = false,
--     stripe_payouts_enabled = false
-- WHERE merchant_id = '<merchant_user_uuid>'
--   AND stripe_account_id IS NOT NULL;

-- ── E-ACC-08: sanction lifted (ends_at within last 25h, not ban) ────────────
-- UPDATE account_sanctions
-- SET ends_at = now() - interval '1 hour',
--     revoked_at = NULL,
--     type = 'restrict_listing'
-- WHERE id = '<sanction_uuid>';

-- Batch B / C (action & payout) — run flows in UI or partner scripts, then assert:
--   E-MOD-05, E-RWD-01, E-ACC-09, E-REF-03, E-PAY-01, E-PAY-02, E-GRD-B2C-09

-- Verify outbox:
-- SELECT event_id, to_email, status, idempotency_key, created_at
-- FROM notification_email_outbox
-- WHERE event_id IN (
--   'E-ORD-02','E-ORD-07','E-ORD-08','E-MCH-04','E-MOD-05','E-RWD-01',
--   'E-ACC-08','E-ACC-09','E-REF-03','E-GRD-B2C-09','E-PAY-01','E-PAY-02'
-- )
-- ORDER BY created_at DESC;
