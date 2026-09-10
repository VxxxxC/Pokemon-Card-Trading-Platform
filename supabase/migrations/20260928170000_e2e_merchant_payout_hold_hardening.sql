-- Harden E2E backdate + DB-side hold-elapsed check (avoids client/DB clock skew in tests).

CREATE OR REPLACE FUNCTION public.rpc_e2e_backdate_merchant_payout_hold(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    UPDATE public.merchant_orders
    SET
        payout_hold_until = now() - interval '8 days',
        payout_error = NULL,
        updated_at = now()
    WHERE id = p_order_id
      AND buyer_confirmed_at IS NOT NULL
      AND payout_status IN ('pending', 'held', 'failed', 'processing');

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到符合條件的 held 訂單。';
    END IF;

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_e2e_is_merchant_payout_hold_elapsed(
    p_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.payout_hold_until IS NOT NULL
          AND mo.payout_hold_until <= now()
    );
$$;

REVOKE ALL ON FUNCTION public.rpc_e2e_is_merchant_payout_hold_elapsed(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_is_merchant_payout_hold_elapsed(UUID) TO service_role;
