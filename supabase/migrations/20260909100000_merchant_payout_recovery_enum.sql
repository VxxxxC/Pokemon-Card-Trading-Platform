-- Must be committed before any SQL references grading_fail_recovery_applied
-- (PostgreSQL disallows new enum values in the same transaction).

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'grading_fail_recovery_applied';
