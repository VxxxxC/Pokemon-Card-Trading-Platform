-- Idempotent prepare: skip no-op UPDATE when checkout amounts already match.
-- Trigger safety net: allow payment-state updates when only updated_at changes.

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
    v_item_subtotal NUMERIC;
    v_existing_auth_fee NUMERIC;
    v_existing_total NUMERIC;
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
        mo.stripe_payment_intent_id,
        mo.item_subtotal,
        mo.auth_fee,
        mo.total_amount
    INTO
        v_buyer_id,
        v_seller_id,
        v_listing_id,
        v_final_price,
        v_escrow_status,
        v_use_auth,
        v_status,
        v_payment_confirmed_at,
        v_payment_intent_id,
        v_item_subtotal,
        v_existing_auth_fee,
        v_existing_total
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

    IF v_item_subtotal IS NOT DISTINCT FROM v_final_price
       AND v_existing_auth_fee IS NOT DISTINCT FROM v_auth_fee
       AND v_existing_total IS NOT DISTINCT FROM v_total THEN
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
    END IF;

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

CREATE OR REPLACE FUNCTION public.fn_enforce_member_order_transitions()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF COALESCE(OLD.use_authentication, false) THEN
        IF auth.uid() = OLD.buyer_id THEN
            -- Stripe prepare / PI attach: pending + payment, checkout columns only
            IF OLD.status = 'pending'
               AND NEW.status = 'pending'
               AND OLD.escrow_status = 'payment'
               AND NEW.escrow_status = 'payment'
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count
               AND NEW.buyer_id = OLD.buyer_id
               AND NEW.seller_id = OLD.seller_id
               AND NEW.final_price = OLD.final_price
               AND COALESCE(NEW.use_authentication, false) = COALESCE(OLD.use_authentication, false)
               AND NEW.inbound_tracking_no IS NOT DISTINCT FROM OLD.inbound_tracking_no
               AND NEW.outbound_tracking_no IS NOT DISTINCT FROM OLD.outbound_tracking_no
               AND (
                   NEW.item_subtotal IS DISTINCT FROM OLD.item_subtotal
                   OR NEW.auth_fee IS DISTINCT FROM OLD.auth_fee
                   OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
                   OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
                   OR (
                       NEW.item_subtotal IS NOT DISTINCT FROM OLD.item_subtotal
                       AND NEW.auth_fee IS NOT DISTINCT FROM OLD.auth_fee
                       AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
                       AND NEW.stripe_payment_intent_id IS NOT DISTINCT FROM OLD.stripe_payment_intent_id
                       AND OLD.item_subtotal IS NOT NULL
                       AND OLD.total_amount IS NOT NULL
                   )
               ) THEN
                RETURN NEW;
            END IF;

            IF OLD.status = 'pending'
               AND NEW.status = 'pending'
               AND OLD.escrow_status = 'payment'
               AND NEW.escrow_status = 'custody'
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count THEN
                RETURN NEW;
            END IF;

            IF OLD.status = 'pending'
               AND NEW.status = 'completed'
               AND OLD.escrow_status = 'shipped'
               AND NEW.escrow_status = 'released'
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count THEN
                RETURN NEW;
            END IF;

            RAISE EXCEPTION '保安攔截：買家操作不合法。';
        END IF;

        IF auth.uid() = OLD.seller_id THEN
            IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
                RETURN NEW;
            END IF;

            IF OLD.status = 'pending'
               AND NEW.status = 'pending'
               AND OLD.escrow_status = 'custody'
               AND NEW.escrow_status = 'custody'
               AND NEW.inbound_tracking_no IS DISTINCT FROM OLD.inbound_tracking_no
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count THEN
                RETURN NEW;
            END IF;

            IF NEW.extended_count = OLD.extended_count + 1
               AND NEW.expires_at > OLD.expires_at
               AND NEW.status = OLD.status THEN
                RETURN NEW;
            END IF;

            RAISE EXCEPTION '保安攔截：賣家操作不合法。';
        END IF;

        IF OLD.status = 'pending'
           AND NEW.status = 'pending'
           AND NEW.expires_at = OLD.expires_at
           AND NEW.extended_count = OLD.extended_count THEN
            IF OLD.escrow_status = 'custody' AND NEW.escrow_status = 'grading' THEN
                RETURN NEW;
            END IF;

            IF OLD.escrow_status = 'grading' AND NEW.escrow_status = 'shipped' THEN
                RETURN NEW;
            END IF;

            IF OLD.escrow_status = 'shipped'
               AND NEW.escrow_status = 'shipped'
               AND NEW.outbound_tracking_no IS DISTINCT FROM OLD.outbound_tracking_no THEN
                RETURN NEW;
            END IF;
        END IF;

        RAISE EXCEPTION '保安攔截：您不屬於此筆訂單的交易關係人。';
    END IF;

    IF auth.uid() = OLD.buyer_id THEN
        IF NEW.status = 'completed'
           AND OLD.status = 'pending'
           AND NEW.expires_at = OLD.expires_at
           AND NEW.extended_count = OLD.extended_count THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION '保安攔截：買家操作不合法。';
    END IF;

    IF auth.uid() = OLD.seller_id THEN
        IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
            RETURN NEW;
        END IF;

        IF NEW.extended_count = OLD.extended_count + 1
           AND NEW.expires_at > OLD.expires_at
           AND NEW.status = OLD.status THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION '保安攔截：賣家操作不合法。';
    END IF;

    RAISE EXCEPTION '保安攔截：您不屬於此筆訂單的交易關係人。';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
