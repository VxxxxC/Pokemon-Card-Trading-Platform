-- I-H14 prerequisite: merchant_direct (automatic capture) must set fully_captured on paid
-- so Phase H fn_moderation_order_refund_eligible passes after real Stripe checkout.

CREATE OR REPLACE FUNCTION public.rpc_mark_merchant_order_paid(
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
    v_merchant_id UUID;
    v_escrow_status public.escrow_state;
    v_existing_pi TEXT;
    v_ledger_amount NUMERIC;
    v_coupon_id UUID;
    v_coupon_row public.user_rewards%ROWTYPE;
    v_requires_auth BOOLEAN;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    SELECT
        mo.merchant_id,
        mo.escrow_status,
        mo.stripe_payment_intent_id,
        COALESCE(mo.buyer_total_amount, mo.total_amount),
        mo.coupon_user_reward_id,
        COALESCE(mo.requires_authentication, false)
    INTO
        v_merchant_id,
        v_escrow_status,
        v_existing_pi,
        v_ledger_amount,
        v_coupon_id,
        v_requires_auth
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF v_existing_pi IS NOT NULL AND v_existing_pi <> p_payment_intent_id THEN
        RAISE EXCEPTION '付款憑證與訂單不符，已攔截入帳。';
    END IF;

    IF v_escrow_status IS DISTINCT FROM 'pending_payment'::public.escrow_state THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'escrow_status', v_escrow_status
        );
    END IF;

    IF v_coupon_id IS NOT NULL THEN
        SELECT * INTO v_coupon_row
        FROM public.user_rewards ur
        WHERE ur.id = v_coupon_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到訂單綁定的優惠券';
        END IF;

        IF COALESCE(v_coupon_row.is_used, false) THEN
            RAISE EXCEPTION '此優惠券已使用';
        END IF;

        IF v_coupon_row.calculated_expiry IS NOT NULL
           AND v_coupon_row.calculated_expiry < now() THEN
            RAISE EXCEPTION '此優惠券已過期，請重新結帳';
        END IF;

        IF v_coupon_row.reserved_merchant_order_id IS NOT NULL
           AND v_coupon_row.reserved_merchant_order_id IS DISTINCT FROM p_order_id THEN
            RAISE EXCEPTION '優惠券預留與訂單不符';
        END IF;
    END IF;

    UPDATE public.merchant_orders
    SET
        escrow_status = 'payment_held'::public.escrow_state,
        stripe_payment_intent_id = p_payment_intent_id,
        payment_capture_status = CASE
            WHEN v_requires_auth THEN payment_capture_status
            ELSE 'fully_captured'::public.payment_capture_status
        END,
        item_subtotal = COALESCE((p_amounts ->> 'item_subtotal')::NUMERIC, item_subtotal, final_price),
        shipping_fee = COALESCE((p_amounts ->> 'shipping_fee')::NUMERIC, shipping_fee, 0),
        auth_fee = COALESCE((p_amounts ->> 'auth_fee')::NUMERIC, auth_fee, 0),
        shipping_method = COALESCE(p_amounts ->> 'shipping_method', shipping_method),
        total_amount = COALESCE((p_amounts ->> 'total_amount')::NUMERIC, total_amount, final_price),
        buyer_total_amount = COALESCE(
            (p_amounts ->> 'buyer_total_amount')::NUMERIC,
            buyer_total_amount,
            total_amount,
            final_price
        ),
        platform_subsidy_amount = COALESCE(
            (p_amounts ->> 'platform_subsidy_amount')::NUMERIC,
            platform_subsidy_amount,
            0
        ),
        paid_at = now(),
        updated_at = now()
    WHERE id = p_order_id
    RETURNING COALESCE(buyer_total_amount, total_amount) INTO v_ledger_amount;

    IF v_coupon_id IS NOT NULL THEN
        UPDATE public.user_rewards ur
        SET
            is_used = true,
            used_at = now(),
            reserved_merchant_order_id = NULL,
            reserved_at = NULL
        WHERE ur.id = v_coupon_id
          AND COALESCE(ur.is_used, false) = false;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.merchant_ledgers
        WHERE order_id = p_order_id
          AND transaction_type = 'escrow_payment'::public.transaction_type
    ) THEN
        INSERT INTO public.merchant_ledgers (
            merchant_id,
            order_id,
            amount,
            transaction_type
        )
        VALUES (
            v_merchant_id,
            p_order_id,
            v_ledger_amount,
            'escrow_payment'::public.transaction_type
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'escrow_status', 'payment_held'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_merchant_order_paid(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_merchant_order_paid(UUID, TEXT, JSONB) TO service_role;
