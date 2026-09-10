-- Merchant-defined courier shipping: shop base + optional listing extra.

ALTER TABLE public.merchant_shops
    ADD COLUMN IF NOT EXISTS base_courier_shipping_fee NUMERIC NOT NULL DEFAULT 30;

ALTER TABLE public.listings
    ADD COLUMN IF NOT EXISTS extra_shipping_fee NUMERIC NOT NULL DEFAULT 0;

-- Replace single-arg platform constant with merchant + listing lookup.
DROP FUNCTION IF EXISTS public.fn_merchant_checkout_shipping_fee(TEXT);

CREATE OR REPLACE FUNCTION public.fn_merchant_checkout_shipping_fee(
    p_shipping_method TEXT,
    p_merchant_id UUID,
    p_listing_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_base NUMERIC;
    v_extra NUMERIC;
    v_total NUMERIC;
BEGIN
    IF p_shipping_method IS DISTINCT FROM 'sf' THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(ms.base_courier_shipping_fee, 30)
    INTO v_base
    FROM public.merchant_shops ms
    WHERE ms.merchant_id = p_merchant_id;

    IF NOT FOUND THEN
        v_base := 30;
    END IF;

    SELECT COALESCE(l.extra_shipping_fee, 0)
    INTO v_extra
    FROM public.listings l
    WHERE l.id = p_listing_id;

    IF NOT FOUND THEN
        v_extra := 0;
    END IF;

    IF v_base < 0 OR v_extra < 0 THEN
        RAISE EXCEPTION '運費不可為負數。';
    END IF;

    IF v_base > 500 OR v_extra > 200 THEN
        RAISE EXCEPTION '運費超出允許範圍。';
    END IF;

    v_total := v_base + v_extra;

    IF v_total > 999 THEN
        RAISE EXCEPTION '運費總額不可超過 999。';
    END IF;

    RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_merchant_checkout_shipping_fee(TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_merchant_checkout_shipping_fee(TEXT, UUID, UUID)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_prepare_merchant_order_payment(
    p_order_id UUID,
    p_shipping_method TEXT,
    p_use_auth BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id UUID;
    v_merchant_id UUID;
    v_listing_id UUID;
    v_final_price NUMERIC;
    v_escrow_status public.escrow_state;
    v_listing_accepts_auth BOOLEAN;
    v_shipping_fee NUMERIC;
    v_auth_fee NUMERIC;
    v_total NUMERIC;
    v_payment_intent_id TEXT;
BEGIN
    IF p_shipping_method IS NULL OR p_shipping_method NOT IN ('sf', 'meetup') THEN
        RAISE EXCEPTION '請選擇有效的配送方式。';
    END IF;

    SELECT
        mo.buyer_id,
        mo.merchant_id,
        mo.listing_id,
        mo.final_price,
        mo.escrow_status,
        mo.stripe_payment_intent_id,
        COALESCE(l.use_authentication, false)
    INTO
        v_buyer_id,
        v_merchant_id,
        v_listing_id,
        v_final_price,
        v_escrow_status,
        v_payment_intent_id,
        v_listing_accepts_auth
    FROM public.merchant_orders mo
    INNER JOIN public.listings l ON l.id = mo.listing_id
    WHERE mo.id = p_order_id
    FOR UPDATE OF mo;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF auth.uid() IS DISTINCT FROM v_buyer_id THEN
        RAISE EXCEPTION '保安攔截：僅買家本人可付款此訂單。';
    END IF;

    IF v_escrow_status IS DISTINCT FROM 'pending_payment'::public.escrow_state THEN
        RAISE EXCEPTION '此訂單並非待付款狀態，無法重複付款。';
    END IF;

    IF COALESCE(p_use_auth, false) AND NOT v_listing_accepts_auth THEN
        RAISE EXCEPTION '此賣家不接受平台鑑定加購服務，請關閉鑑定選項後再付款。';
    END IF;

    v_shipping_fee := public.fn_merchant_checkout_shipping_fee(
        p_shipping_method,
        v_merchant_id,
        v_listing_id
    );
    v_auth_fee := public.fn_merchant_checkout_auth_fee(p_use_auth);
    v_total := v_final_price + v_shipping_fee + v_auth_fee;

    UPDATE public.merchant_orders
    SET
        item_subtotal = v_final_price,
        shipping_fee = v_shipping_fee,
        auth_fee = v_auth_fee,
        shipping_method = p_shipping_method,
        total_amount = v_total,
        requires_authentication = COALESCE(p_use_auth, false),
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'order_id', p_order_id,
        'buyer_id', v_buyer_id,
        'merchant_id', v_merchant_id,
        'listing_id', v_listing_id,
        'item_subtotal', v_final_price,
        'shipping_fee', v_shipping_fee,
        'auth_fee', v_auth_fee,
        'total_amount', v_total,
        'shipping_method', p_shipping_method,
        'requires_authentication', COALESCE(p_use_auth, false),
        'stripe_payment_intent_id', v_payment_intent_id
    );
END;
$$;
