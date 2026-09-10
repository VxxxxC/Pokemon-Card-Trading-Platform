-- C3: Merchant auth pre-intake cancel (symmetric to rpc_cancel_member_order G-CAN1–3M).

CREATE OR REPLACE FUNCTION public.rpc_cancel_merchant_auth_order(
    p_order_id UUID,
    p_merchant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_listing_id UUID;
    v_requires_auth BOOLEAN;
    v_escrow_status public.escrow_state;
    v_capture_status public.payment_capture_status;
    v_platform_received_at TIMESTAMPTZ;
    v_coupon_id UUID;
BEGIN
    SELECT
        listing_id,
        requires_authentication,
        escrow_status,
        payment_capture_status,
        platform_received_at,
        coupon_user_reward_id
    INTO
        v_listing_id,
        v_requires_auth,
        v_escrow_status,
        v_capture_status,
        v_platform_received_at,
        v_coupon_id
    FROM public.merchant_orders
    WHERE id = p_order_id
      AND merchant_id = p_merchant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '取消失敗：訂單狀態不合法，或您非此筆交易的商戶。';
    END IF;

    IF NOT COALESCE(v_requires_auth, false) THEN
        RAISE EXCEPTION '取消失敗：此訂單非鑑定商戶流程。';
    END IF;

    IF v_platform_received_at IS NOT NULL
       OR v_escrow_status IN (
           'authenticating'::public.escrow_state,
           'authenticated'::public.escrow_state,
           'shipped'::public.escrow_state,
           'completed_and_transferred'::public.escrow_state,
           'refunded'::public.escrow_state
       )
       OR v_capture_status IN (
           'auth_fee_captured'::public.payment_capture_status,
           'fully_captured'::public.payment_capture_status,
           'voided'::public.payment_capture_status
       )
       OR v_escrow_status IS DISTINCT FROM 'payment_held'::public.escrow_state
       OR v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
        RAISE EXCEPTION '取消失敗：鑑定期間不可取消訂單。';
    END IF;

    UPDATE public.merchant_orders
    SET
        escrow_status = 'refunded'::public.escrow_state,
        payment_capture_status = 'voided'::public.payment_capture_status,
        updated_at = now()
    WHERE id = p_order_id;

    IF v_coupon_id IS NOT NULL THEN
        PERFORM public.fn_restore_merchant_order_coupon_on_void(p_order_id);
    END IF;

    UPDATE public.listings
    SET status = 'active'
    WHERE id = v_listing_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_cancel_merchant_auth_order(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_merchant_auth_order(UUID, UUID) TO authenticated, service_role;
