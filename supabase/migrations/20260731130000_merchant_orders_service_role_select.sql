-- Admin dashboard (and other service-role server actions) read merchant_orders via
-- createAdminClient(). Table had GRANT SELECT for authenticated only
-- (20260717180000); member_orders already has service_role SELECT
-- (20260709210000). Without this grant, PostgREST returns:
--   permission denied for table merchant_orders

GRANT SELECT ON public.merchant_orders TO service_role;
