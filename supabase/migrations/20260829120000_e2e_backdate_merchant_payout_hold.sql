-- E2E / cron helpers: backdate merchant payout hold (service_role only).

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
        payout_hold_until = now() - interval '1 hour',
        updated_at = now()
    WHERE id = p_order_id
      AND payout_status = 'held'
      AND buyer_confirmed_at IS NOT NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到符合條件的 held 訂單。';
    END IF;

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_e2e_backdate_merchant_payout_hold(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_backdate_merchant_payout_hold(UUID) TO service_role;
