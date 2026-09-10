-- Admin manual retry for failed merchant Connect payouts (reset failed -> held).

CREATE OR REPLACE FUNCTION public.rpc_admin_reset_merchant_connect_payout_retry(
    p_order_id UUID,
    p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.merchant_orders%ROWTYPE;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    IF p_admin_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = p_admin_id
          AND p.role = 'admin'
    ) THEN
        RAISE EXCEPTION '無管理員權限';
    END IF;

    SELECT mo.*
    INTO v_order
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id
    FOR UPDATE OF mo;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF v_order.payout_status = 'frozen' THEN
        RAISE EXCEPTION '訂單撥款已凍結，無法重試。';
    END IF;

    IF v_order.payout_status IS DISTINCT FROM 'failed' THEN
        RAISE EXCEPTION '僅失敗狀態的訂單可重試撥款。';
    END IF;

    IF v_order.stripe_transfer_id IS NOT NULL THEN
        RAISE EXCEPTION '訂單已綁定 Stripe Transfer，無法重試。';
    END IF;

    IF v_order.buyer_confirmed_at IS NULL THEN
        RAISE EXCEPTION '買家尚未確認收貨。';
    END IF;

    IF NOT public.fn_merchant_order_is_open(v_order.escrow_status) THEN
        RAISE EXCEPTION '訂單已結案，無法重試撥款。';
    END IF;

    IF v_order.refund_status IS NOT NULL
       AND btrim(v_order.refund_status) <> ''
       AND lower(btrim(v_order.refund_status)) <> 'none' THEN
        IF lower(btrim(v_order.refund_status)) = 'failed'
           AND v_order.payout_hold_until IS NOT NULL
           AND now() <= v_order.payout_hold_until THEN
            RAISE EXCEPTION '退款失敗保留期內，暫不可重試撥款。';
        ELSIF lower(btrim(v_order.refund_status)) <> 'failed' THEN
            RAISE EXCEPTION '訂單退款處理中，無法重試撥款。';
        END IF;
    END IF;

    IF v_order.payout_hold_until IS NULL OR v_order.payout_hold_until > now() THEN
        RAISE EXCEPTION '撥款保留期尚未屆滿。';
    END IF;

    IF v_order.stripe_payment_intent_id IS NULL
       OR btrim(v_order.stripe_payment_intent_id) = '' THEN
        RAISE EXCEPTION '訂單缺少有效付款憑證，無法重試撥款。';
    END IF;

    IF v_order.merchant_payout_amount IS NULL
       OR v_order.merchant_payout_amount <= 0 THEN
        RAISE EXCEPTION '商戶撥款金額異常，無法重試撥款。';
    END IF;

    UPDATE public.merchant_orders
    SET
        payout_status = 'held',
        payout_error = NULL,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'retried_by_admin', p_admin_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_reset_merchant_connect_payout_retry(UUID, UUID)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_reset_merchant_connect_payout_retry(UUID, UUID)
    TO service_role;
