-- Web push subscriptions (OneSignal) per authenticated user/device.

CREATE TABLE public.user_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    onesignal_subscription_id TEXT NOT NULL,
    onesignal_user_id TEXT NULL,
    opted_in BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_push_subscriptions_user_subscription
        UNIQUE (user_id, onesignal_subscription_id),
    CONSTRAINT chk_user_push_subscriptions_subscription_id_nonempty
        CHECK (length(trim(onesignal_subscription_id)) > 0)
);

CREATE INDEX idx_user_push_subscriptions_user_opted_in
    ON public.user_push_subscriptions (user_id)
    WHERE opted_in = TRUE;

CREATE INDEX idx_user_push_subscriptions_subscription_id
    ON public.user_push_subscriptions (onesignal_subscription_id);

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_subscriptions TO service_role;

DROP POLICY IF EXISTS user_push_subscriptions_select_own ON public.user_push_subscriptions;
DROP POLICY IF EXISTS user_push_subscriptions_insert_own ON public.user_push_subscriptions;
DROP POLICY IF EXISTS user_push_subscriptions_update_own ON public.user_push_subscriptions;
DROP POLICY IF EXISTS user_push_subscriptions_delete_own ON public.user_push_subscriptions;

CREATE POLICY user_push_subscriptions_select_own
    ON public.user_push_subscriptions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY user_push_subscriptions_insert_own
    ON public.user_push_subscriptions
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_push_subscriptions_update_own
    ON public.user_push_subscriptions
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_push_subscriptions_delete_own
    ON public.user_push_subscriptions
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_push_subscriptions IS
    'OneSignal web push subscription ids keyed by auth user; used for targeted push sends.';
