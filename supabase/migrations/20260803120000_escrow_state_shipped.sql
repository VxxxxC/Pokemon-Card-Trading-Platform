-- Merchant B2C direct (non-auth): add shipped escrow state.
-- PostgreSQL: enum value must be committed before use in a later migration.

ALTER TYPE public.escrow_state ADD VALUE IF NOT EXISTS 'shipped' AFTER 'payment_held';
