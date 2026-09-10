-- Service-role access for server actions (admin-settings, admin-dashboard reads).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO service_role;
