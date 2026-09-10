-- Notification preference columns (push + email by category).

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS push_market_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS push_chat_digest BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS push_rewards BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS email_transactional BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS email_market_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS email_rewards BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.profiles.push_transactional IS
    'When false, skip P-OFF / P-ORD / P-GRD web push for this user.';

COMMENT ON COLUMN public.profiles.push_market_alerts IS
    'When false, skip P-WIS wishlist / market alert push.';

COMMENT ON COLUMN public.profiles.push_chat_digest IS
    'When false, skip P-CHT daily unread digest push.';

COMMENT ON COLUMN public.profiles.push_rewards IS
    'When false, skip P-RWD rewards / check-in push.';

COMMENT ON COLUMN public.profiles.email_transactional IS
    'When false, skip E-OFF / E-ORD / E-GRD / E-REF / E-PAY / E-MCH transactional email.';

COMMENT ON COLUMN public.profiles.email_market_alerts IS
    'When false, skip E-WIS market alert email.';

COMMENT ON COLUMN public.profiles.email_rewards IS
    'When false, skip E-RWD rewards email.';
