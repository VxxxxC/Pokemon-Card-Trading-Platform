-- Allow anon/authenticated SELECT for public legal pages (/terms, /privacy).
-- RLS policy settings_public_read already permits all rows; table GRANT was missing.

GRANT SELECT ON public.platform_settings TO anon, authenticated;
