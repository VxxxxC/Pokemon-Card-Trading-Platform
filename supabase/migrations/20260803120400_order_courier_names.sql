-- Courier company name alongside tracking numbers (merchant + member auth inbound).

ALTER TABLE public.merchant_orders
    ADD COLUMN IF NOT EXISTS inbound_courier_name TEXT,
    ADD COLUMN IF NOT EXISTS outbound_courier_name TEXT;

ALTER TABLE public.member_orders
    ADD COLUMN IF NOT EXISTS inbound_courier_name TEXT;

-- ---------------------------------------------------------------------------
-- Merchant auth inbound
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_submit_merchant_auth_inbound_tracking(
    p_order_id UUID,
    p_merchant_id UUID,
    p_tracking_no TEXT,
    p_courier_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated RECORD;
    v_tracking TEXT;
    v_courier TEXT;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_merchant_id THEN
        RAISE EXCEPTION '請先登入後再操作';
    END IF;

    v_tracking := NULLIF(trim(COALESCE(p_tracking_no, '')), '');
    v_courier := NULLIF(trim(COALESCE(p_courier_name, '')), '');

    IF v_tracking IS NULL THEN
        RAISE EXCEPTION '請輸入有效的物流單號。';
    END IF;

    IF v_courier IS NULL THEN
        RAISE EXCEPTION '請輸入快遞公司名稱。';
    END IF;

    UPDATE public.merchant_orders
    SET
        inbound_tracking_no = v_tracking,
        inbound_courier_name = v_courier,
        updated_at = now()
    WHERE id = p_order_id
      AND merchant_id = p_merchant_id
      AND requires_authentication = true
      AND escrow_status = 'payment_held'::public.escrow_state
      AND stripe_payment_intent_id IS NOT NULL
    RETURNING * INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION '上載失敗：訂單狀態不合法或您非此筆交易的商戶。';
    END IF;

    RETURN jsonb_build_object('order', to_jsonb(v_updated));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_submit_merchant_auth_inbound_tracking(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_submit_merchant_auth_inbound_tracking(UUID, UUID, TEXT, TEXT)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Merchant non-auth direct fulfillment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_submit_merchant_direct_fulfillment(
    p_order_id UUID,
    p_merchant_id UUID,
    p_tracking_no TEXT DEFAULT NULL,
    p_courier_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated RECORD;
    v_tracking TEXT;
    v_courier TEXT;
    v_shipping_method TEXT;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_merchant_id THEN
        RAISE EXCEPTION '請先登入後再操作';
    END IF;

    v_tracking := NULLIF(trim(COALESCE(p_tracking_no, '')), '');
    v_courier := NULLIF(trim(COALESCE(p_courier_name, '')), '');

    SELECT shipping_method
    INTO v_shipping_method
    FROM public.merchant_orders
    WHERE id = p_order_id
      AND merchant_id = p_merchant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF COALESCE(v_shipping_method, 'sf') <> 'meetup' THEN
        IF v_tracking IS NULL THEN
            RAISE EXCEPTION '請輸入有效的物流單號。';
        END IF;
        IF v_courier IS NULL THEN
            RAISE EXCEPTION '請輸入快遞公司名稱。';
        END IF;
    END IF;

    UPDATE public.merchant_orders
    SET
        outbound_tracking_no = CASE
            WHEN COALESCE(shipping_method, 'sf') = 'meetup' THEN NULL
            ELSE v_tracking
        END,
        outbound_courier_name = CASE
            WHEN COALESCE(shipping_method, 'sf') = 'meetup' THEN NULL
            ELSE v_courier
        END,
        escrow_status = 'shipped'::public.escrow_state,
        updated_at = now()
    WHERE id = p_order_id
      AND merchant_id = p_merchant_id
      AND COALESCE(requires_authentication, false) = false
      AND escrow_status = 'payment_held'::public.escrow_state
      AND stripe_payment_intent_id IS NOT NULL
    RETURNING * INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION '發貨失敗：訂單狀態不合法或您非此筆交易的商戶。';
    END IF;

    RETURN jsonb_build_object('order', to_jsonb(v_updated));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_submit_merchant_direct_fulfillment(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_submit_merchant_direct_fulfillment(UUID, UUID, TEXT, TEXT)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Member auth inbound
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_submit_inbound_tracking(
    p_order_id UUID,
    p_seller_id UUID,
    p_tracking_no TEXT,
    p_courier_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated RECORD;
    v_tracking TEXT;
    v_courier TEXT;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_seller_id THEN
        RAISE EXCEPTION '請先登入後再操作';
    END IF;

    v_tracking := NULLIF(trim(COALESCE(p_tracking_no, '')), '');
    v_courier := NULLIF(trim(COALESCE(p_courier_name, '')), '');

    IF v_tracking IS NULL THEN
        RAISE EXCEPTION '請輸入有效的物流單號。';
    END IF;

    IF v_courier IS NULL THEN
        RAISE EXCEPTION '請輸入快遞公司名稱。';
    END IF;

    UPDATE public.member_orders
    SET
        inbound_tracking_no = v_tracking,
        inbound_courier_name = v_courier,
        updated_at = now()
    WHERE id = p_order_id
      AND seller_id = p_seller_id
      AND use_authentication = true
      AND escrow_status = 'custody'
      AND status = 'pending'
    RETURNING * INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION '上載失敗：訂單狀態不合法或您非此筆交易的賣家。';
    END IF;

    RETURN jsonb_build_object('order', to_jsonb(v_updated));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_submit_inbound_tracking(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_submit_inbound_tracking(UUID, UUID, TEXT, TEXT)
    TO authenticated, service_role;
