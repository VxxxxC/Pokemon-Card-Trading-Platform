-- User preference: transactional push (offers, orders). Default on for existing users.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS push_transactional BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.profiles.push_transactional IS
    'When false, skip P-OFF / P-ORD web push sends for this user (browser subscription may remain).';
