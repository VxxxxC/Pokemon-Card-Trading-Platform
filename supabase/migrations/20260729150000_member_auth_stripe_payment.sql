-- Member C2C auth escrow — platform Stripe collection (Payment Milestone 1.5)
-- Card price + auth fee (HK$150); no shipping. Funds 100% to platform account.

ALTER TABLE public.member_orders
    ADD COLUMN IF NOT EXISTS item_subtotal NUMERIC,
    ADD COLUMN IF NOT EXISTS auth_fee NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_member_orders_stripe_payment_intent_id
    ON public.member_orders (stripe_payment_intent_id)
    WHERE stripe_payment_intent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- rpc_prepare_member_auth_order_payment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_prepare_member_auth_order_payment(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id UUID;
    v_seller_id UUID;
    v_listing_id UUID;
    v_final_price NUMERIC;
    v_escrow_status public.member_escrow_status;
    v_use_auth BOOLEAN;
    v_status public.member_order_state;
    v_payment_confirmed_at TIMESTAMPTZ;
    v_auth_fee NUMERIC;
    v_total NUMERIC;
    v_payment_intent_id TEXT;
BEGIN
    SELECT
        mo.buyer_id,
        mo.seller_id,
        mo.listing_id,
        mo.final_price,
        mo.escrow_status,
        mo.use_authentication,
        mo.status,
        mo.payment_confirmed_at,
        mo.stripe_payment_intent_id
    INTO
        v_buyer_id,
        v_seller_id,
        v_listing_id,
        v_final_price,
        v_escrow_status,
        v_use_auth,
        v_status,
        v_payment_confirmed_at,
        v_payment_intent_id
    FROM public.member_orders mo
    WHERE mo.id = p_order_id
    FOR UPDATE OF mo;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的會員訂單。';
    END IF;

    IF auth.uid() IS DISTINCT FROM v_buyer_id THEN
        RAISE EXCEPTION '保安攔截：僅買家本人可付款此訂單。';
    END IF;

    IF NOT COALESCE(v_use_auth, false) THEN
        RAISE EXCEPTION '此訂單非鑑定託管流程，無需平台付款。';
    END IF;

    IF v_status IS DISTINCT FROM 'pending'::public.member_order_state THEN
        RAISE EXCEPTION '此訂單狀態不允許付款。';
    END IF;

    IF v_escrow_status IS DISTINCT FROM 'payment'::public.member_escrow_status THEN
        RAISE EXCEPTION '此訂單並非待付款狀態，無法重複付款。';
    END IF;

    IF v_payment_confirmed_at IS NOT NULL THEN
        RAISE EXCEPTION '此訂單已完成付款。';
    END IF;

    v_auth_fee := public.fn_merchant_checkout_auth_fee(true);
    v_total := v_final_price + v_auth_fee;

    UPDATE public.member_orders
    SET
        item_subtotal = v_final_price,
        auth_fee = v_auth_fee,
        total_amount = v_total,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'order_id', p_order_id,
        'buyer_id', v_buyer_id,
        'seller_id', v_seller_id,
        'listing_id', v_listing_id,
        'item_subtotal', v_final_price,
        'auth_fee', v_auth_fee,
        'total_amount', v_total,
        'stripe_payment_intent_id', v_payment_intent_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_prepare_member_auth_order_payment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_member_auth_order_payment(UUID)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- rpc_attach_member_auth_order_payment_intent
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_attach_member_auth_order_payment_intent(
    p_order_id UUID,
    p_payment_intent_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id UUID;
    v_escrow_status public.member_escrow_status;
    v_use_auth BOOLEAN;
    v_existing_pi TEXT;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    SELECT buyer_id, escrow_status, use_authentication, stripe_payment_intent_id
    INTO v_buyer_id, v_escrow_status, v_use_auth, v_existing_pi
    FROM public.member_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的會員訂單。';
    END IF;

    IF auth.uid() IS DISTINCT FROM v_buyer_id THEN
        RAISE EXCEPTION '保安攔截：僅買家本人可付款此訂單。';
    END IF;

    IF NOT COALESCE(v_use_auth, false) THEN
        RAISE EXCEPTION '此訂單非鑑定託管流程，無法綁定付款憑證。';
    END IF;

    IF v_escrow_status IS DISTINCT FROM 'payment'::public.member_escrow_status THEN
        RAISE EXCEPTION '此訂單並非待付款狀態，無法綁定付款憑證。';
    END IF;

    UPDATE public.member_orders
    SET stripe_payment_intent_id = p_payment_intent_id,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'stripe_payment_intent_id', p_payment_intent_id,
        'replaced_payment_intent_id',
        CASE WHEN v_existing_pi IS DISTINCT FROM p_payment_intent_id THEN v_existing_pi ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_attach_member_auth_order_payment_intent(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_attach_member_auth_order_payment_intent(UUID, TEXT)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- rpc_mark_member_auth_order_paid — webhook only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_mark_member_auth_order_paid(
    p_order_id UUID,
    p_payment_intent_id TEXT,
    p_amounts JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_escrow_status public.member_escrow_status;
    v_use_auth BOOLEAN;
    v_existing_pi TEXT;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    SELECT escrow_status, use_authentication, stripe_payment_intent_id
    INTO v_escrow_status, v_use_auth, v_existing_pi
    FROM public.member_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的會員訂單。';
    END IF;

    IF NOT COALESCE(v_use_auth, false) THEN
        RAISE EXCEPTION '此訂單非鑑定託管流程。';
    END IF;

    IF v_existing_pi IS NOT NULL AND v_existing_pi <> p_payment_intent_id THEN
        RAISE EXCEPTION '付款憑證與訂單不符，已攔截入帳。';
    END IF;

    IF v_escrow_status IS DISTINCT FROM 'payment'::public.member_escrow_status THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'escrow_status', v_escrow_status
        );
    END IF;

    UPDATE public.member_orders
    SET
        escrow_status = 'custody'::public.member_escrow_status,
        stripe_payment_intent_id = p_payment_intent_id,
        item_subtotal = COALESCE((p_amounts ->> 'item_subtotal')::NUMERIC, item_subtotal, final_price),
        auth_fee = COALESCE((p_amounts ->> 'auth_fee')::NUMERIC, auth_fee, 0),
        total_amount = COALESCE((p_amounts ->> 'total_amount')::NUMERIC, total_amount, final_price),
        payment_confirmed_at = now(),
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'escrow_status', 'custody'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_member_auth_order_paid(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_member_auth_order_paid(UUID, TEXT, JSONB) TO service_role;
