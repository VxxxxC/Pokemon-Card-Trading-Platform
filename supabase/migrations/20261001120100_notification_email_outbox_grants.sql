-- Grant service_role access to email outbox (RLS enabled, no anon/authenticated policies).
-- Without GRANT, PostgREST returns "permission denied" even with service_role JWT.

GRANT USAGE ON TYPE public.notification_email_status TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.notification_email_outbox
    TO service_role;

CREATE POLICY notification_email_outbox_service_role_all
    ON public.notification_email_outbox
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
