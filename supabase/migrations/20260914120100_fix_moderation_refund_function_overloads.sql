-- PR3B fix: drop legacy overloads so PostgREST resolves single rpc_prepare / fn_compute signatures.

DROP FUNCTION IF EXISTS public.fn_compute_moderation_order_refund(UUID, public.grading_fault_party, TEXT);
DROP FUNCTION IF EXISTS public.rpc_prepare_moderation_order_refund(UUID, UUID, public.grading_fault_party, TEXT, TEXT);
