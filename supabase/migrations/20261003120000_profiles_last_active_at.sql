-- P-CHT-01 optional: skip digest when user was recently active in the app.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at
    ON public.profiles (last_active_at DESC)
    WHERE last_active_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.last_active_at IS
    'Last client heartbeat while logged in; used to skip P-CHT-01 digest when user is likely online.';
