-- Allow service_role to accept offers for Playwright E2E (avoids seller password sign-in rate limits).
-- service_role already has full DB access; this only exposes the existing accept pipeline.

CREATE OR REPLACE FUNCTION public.rpc_accept_offer(
    p_offer_id UUID,
    p_seller_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room_id UUID;
    v_listing_id UUID;
    v_buyer_id UUID;
    v_offer_price NUMERIC;
    v_use_auth BOOLEAN;
    v_seller_persona public.seller_persona_type;
    v_order_id UUID;
    v_message_id UUID;
    v_generated_order_number TEXT;
    v_order_row RECORD;
    v_escrow_status public.member_escrow_status;
    v_order_kind TEXT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND auth.uid() IS DISTINCT FROM p_seller_id THEN
        RAISE EXCEPTION '請先登入後再操作';
    END IF;

    SELECT
        o.room_id,
        o.buyer_id,
        o.offer_price,
        o.listing_id,
        o.use_authentication,
        COALESCE(l.seller_persona, 'member'::public.seller_persona_type)
    INTO
        v_room_id,
        v_buyer_id,
        v_offer_price,
        v_listing_id,
        v_use_auth,
        v_seller_persona
    FROM public.offers o
    INNER JOIN public.listings l ON l.id = o.listing_id
    WHERE o.id = p_offer_id
      AND o.status = 'pending'
      AND l.seller_id = p_seller_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '操作失敗：出價狀態不合法，或您非商品擁有者。';
    END IF;

    IF v_seller_persona = 'member' THEN
        PERFORM public.fn_assert_p2p_offer_aml_limits(
            v_buyer_id,
            v_offer_price,
            v_listing_id,
            COALESCE(v_use_auth, false)
        );
    END IF;

    v_generated_order_number := 'ORD-2026-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    UPDATE public.offers
    SET status = 'accepted',
        updated_at = now()
    WHERE id = p_offer_id;

    UPDATE public.listings
    SET status = 'inactive'
    WHERE id = v_listing_id;

    IF v_seller_persona = 'merchant' THEN
        v_order_kind := 'merchant';

        INSERT INTO public.merchant_orders (
            buyer_id,
            merchant_id,
            listing_id,
            final_price,
            item_subtotal,
            total_amount,
            escrow_status,
            requires_authentication,
            order_number
        )
        VALUES (
            v_buyer_id,
            p_seller_id,
            v_listing_id,
            v_offer_price,
            v_offer_price,
            v_offer_price,
            'pending_payment'::public.escrow_state,
            COALESCE(v_use_auth, false),
            v_generated_order_number
        )
        RETURNING id INTO v_order_id;

        INSERT INTO public.chat_messages (
            room_id,
            sender_id,
            content,
            offer_id,
            merchant_order_id,
            is_system_warning
        )
        VALUES (
            v_room_id,
            p_seller_id,
            'SYSTEM_OFFER_ACCEPTED',
            p_offer_id,
            v_order_id,
            false
        )
        RETURNING id INTO v_message_id;

        SELECT * INTO v_order_row FROM public.merchant_orders WHERE id = v_order_id;
    ELSE
        v_order_kind := 'member';
        v_escrow_status := CASE
            WHEN v_use_auth THEN 'payment'::public.member_escrow_status
            ELSE NULL
        END;

        INSERT INTO public.member_orders (
            buyer_id,
            seller_id,
            listing_id,
            final_price,
            status,
            expires_at,
            extended_count,
            order_number,
            use_authentication,
            escrow_status
        )
        VALUES (
            v_buyer_id,
            p_seller_id,
            v_listing_id,
            v_offer_price,
            'pending',
            (now() + INTERVAL '14 days'),
            0,
            v_generated_order_number,
            v_use_auth,
            v_escrow_status
        )
        RETURNING id INTO v_order_id;

        INSERT INTO public.chat_messages (
            room_id,
            sender_id,
            content,
            offer_id,
            member_order_id,
            is_system_warning
        )
        VALUES (
            v_room_id,
            p_seller_id,
            'SYSTEM_OFFER_ACCEPTED',
            p_offer_id,
            v_order_id,
            false
        )
        RETURNING id INTO v_message_id;

        SELECT * INTO v_order_row FROM public.member_orders WHERE id = v_order_id;
    END IF;

    RETURN jsonb_build_object(
        'order', to_jsonb(v_order_row),
        'order_kind', v_order_kind,
        'message_id', v_message_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_accept_offer(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_accept_offer(UUID, UUID) TO authenticated, service_role;
