-- Fix e2e bound_transfer scenario: unique stripe_transfer_id per order.

CREATE OR REPLACE FUNCTION public.rpc_e2e_set_merchant_order_payout_retry_test_state(
    p_order_id UUID,
    p_scenario TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rows INTEGER;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    IF p_scenario = 'frozen' THEN
        UPDATE public.merchant_orders
        SET payout_status = 'frozen', payout_error = 'e2e_frozen', updated_at = now()
        WHERE id = p_order_id;
    ELSIF p_scenario = 'bound_transfer' THEN
        UPDATE public.merchant_orders
        SET
            payout_status = 'failed',
            payout_error = 'e2e_bound_transfer',
            stripe_transfer_id = 'tr_e2e_' || left(replace(p_order_id::TEXT, '-', ''), 20),
            updated_at = now()
        WHERE id = p_order_id;
    ELSIF p_scenario = 'refund_failed_in_window' THEN
        UPDATE public.merchant_orders
        SET
            payout_status = 'failed',
            payout_error = 'e2e_refund_failed_window',
            refund_status = 'failed',
            payout_hold_until = now() + interval '7 days',
            updated_at = now()
        WHERE id = p_order_id;
    ELSE
        RAISE EXCEPTION '未知測試場景: %', p_scenario;
    END IF;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'scenario', p_scenario);
END;
$$;
