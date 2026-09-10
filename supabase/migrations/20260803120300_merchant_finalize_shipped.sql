-- Non-auth B2C: buyer confirms at escrow_status = shipped; finalize must accept shipped.

CREATE OR REPLACE FUNCTION public.rpc_finalize_merchant_order_payout(
    p_order_id UUID,
    p_transfer_id TEXT,
    p_transfer_amount_cents BIGINT,
    p_destination_account_id TEXT
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
    v_escrow_status public.escrow_state;
    v_commission NUMERIC;
    v_payout NUMERIC;
    v_existing_transfer_id TEXT;
    v_destination TEXT;
    v_room_id UUID;
    v_message_id UUID;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    IF p_transfer_id IS NULL OR btrim(p_transfer_id) = '' THEN
        RAISE EXCEPTION '缺少 Stripe Transfer 識別碼。';
    END IF;

    SELECT
        mo.buyer_id,
        mo.merchant_id,
        mo.listing_id,
        mo.escrow_status,
        mo.commission_amount,
        mo.merchant_payout_amount,
        mo.stripe_transfer_id,
        mo.stripe_destination_account_id
    INTO
        v_buyer_id,
        v_merchant_id,
        v_listing_id,
        v_escrow_status,
        v_commission,
        v_payout,
        v_existing_transfer_id,
        v_destination
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id
    FOR UPDATE OF mo;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF v_payout IS NULL
       OR round(v_payout * 100)::BIGINT <> p_transfer_amount_cents
       OR v_destination IS DISTINCT FROM p_destination_account_id THEN
        RAISE EXCEPTION 'Stripe Transfer 與訂單撥款快照不符。';
    END IF;

    IF v_existing_transfer_id IS NOT NULL THEN
        IF v_existing_transfer_id <> p_transfer_id THEN
            RAISE EXCEPTION '訂單已綁定另一筆 Stripe Transfer。';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'stripe_transfer_id', v_existing_transfer_id
        );
    END IF;

    IF v_escrow_status NOT IN (
        'payment_held'::public.escrow_state,
        'shipped'::public.escrow_state,
        'authenticating'::public.escrow_state,
        'authenticated'::public.escrow_state
    ) THEN
        RAISE EXCEPTION '訂單狀態不允許完成撥款。';
    END IF;

    UPDATE public.merchant_orders
    SET
        stripe_transfer_id = p_transfer_id,
        payout_status = 'paid',
        payout_error = NULL,
        transferred_at = now(),
        escrow_status = 'completed_and_transferred'::public.escrow_state,
        updated_at = now()
    WHERE id = p_order_id;

    UPDATE public.listings
    SET status = 'sold'
    WHERE id = v_listing_id;

    INSERT INTO public.merchant_ledgers (
        merchant_id,
        order_id,
        amount,
        transaction_type
    )
    VALUES (
        v_merchant_id,
        p_order_id,
        v_commission,
        'commission_deduction'::public.transaction_type
    )
    ON CONFLICT (order_id, transaction_type)
        WHERE order_id IS NOT NULL
        DO NOTHING;

    INSERT INTO public.merchant_ledgers (
        merchant_id,
        order_id,
        amount,
        transaction_type,
        stripe_transfer_id
    )
    VALUES (
        v_merchant_id,
        p_order_id,
        v_payout,
        'payout'::public.transaction_type,
        p_transfer_id
    )
    ON CONFLICT (order_id, transaction_type)
        WHERE order_id IS NOT NULL
        DO NOTHING;

    SELECT cr.id
    INTO v_room_id
    FROM public.chat_rooms cr
    WHERE cr.buyer_id = v_buyer_id
      AND cr.seller_id = v_merchant_id
      AND cr.buyer_persona = 'member'::public.seller_persona_type
      AND cr.seller_persona = 'merchant'::public.seller_persona_type
    ORDER BY cr.updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_room_id IS NULL THEN
        SELECT cr.id
        INTO v_room_id
        FROM public.chat_rooms cr
        WHERE cr.buyer_id = v_buyer_id
          AND cr.seller_id = v_merchant_id
        ORDER BY cr.updated_at DESC NULLS LAST
        LIMIT 1;
    END IF;

    IF v_room_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM public.chat_messages cm
           WHERE cm.merchant_order_id = p_order_id
             AND cm.content = 'SYSTEM_ORDER_COMPLETED'
       ) THEN
        INSERT INTO public.chat_messages (
            room_id,
            sender_id,
            content,
            merchant_order_id,
            is_system_warning
        )
        VALUES (
            v_room_id,
            v_buyer_id,
            'SYSTEM_ORDER_COMPLETED',
            p_order_id,
            false
        )
        RETURNING id INTO v_message_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'stripe_transfer_id', p_transfer_id,
        'message_id', v_message_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_finalize_merchant_order_payout(UUID, TEXT, BIGINT, TEXT)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_merchant_order_payout(UUID, TEXT, BIGINT, TEXT)
    TO service_role;
