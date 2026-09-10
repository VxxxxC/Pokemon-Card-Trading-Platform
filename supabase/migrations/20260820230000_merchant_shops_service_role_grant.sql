-- E2E/integration admin client uses service_role; merchant_shops only had anon/authenticated SELECT grants.

GRANT SELECT ON public.merchant_shops TO service_role;
