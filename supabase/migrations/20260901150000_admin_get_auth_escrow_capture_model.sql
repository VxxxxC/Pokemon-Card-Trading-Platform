-- Admin grading: read escrow_capture_model bypassing participant RLS.

CREATE OR REPLACE FUNCTION public.rpc_get_auth_escrow_capture_model(
    p_order_kind TEXT,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_model TEXT;
BEGIN
    PERFORM public._grading_require_admin();

    IF p_order_kind = 'member' THEN
        SELECT mo.escrow_capture_model
        INTO v_model
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT mo.escrow_capture_model
        INTO v_model
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_kind', p_order_kind,
        'order_id', p_order_id,
        'escrow_capture_model', v_model
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_auth_escrow_capture_model(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_auth_escrow_capture_model(TEXT, UUID)
    TO authenticated, service_role;
