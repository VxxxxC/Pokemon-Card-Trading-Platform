-- PG-S3-11 integration: service_role seeds P2P member_orders for moderation tests.

GRANT INSERT ON public.member_orders TO service_role;
