-- E2E / Vitest helper: backdate merchant order created_at for pending_payment expiry tests (service_role only).

CREATE OR REPLACE FUNCTION public.rpc_e2e_backdate_merchant_order_created_at(
    p_order_id UUID,
    p_hours_ago INTEGER DEFAULT 49
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.merchant_orders
    SET
        created_at = now() - (GREATEST(COALESCE(p_hours_ago, 49), 1) || ' hours')::interval,
        updated_at = now()
    WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_e2e_backdate_merchant_order_created_at(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_backdate_merchant_order_created_at(UUID, INTEGER) TO service_role;
