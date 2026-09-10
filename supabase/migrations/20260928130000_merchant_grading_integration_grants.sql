-- Integration tests: service_role reads merchant_ledgers; G-BF5M race simulates void via UPDATE.

GRANT SELECT ON public.merchant_ledgers TO service_role;

GRANT UPDATE ON public.merchant_orders TO service_role;
