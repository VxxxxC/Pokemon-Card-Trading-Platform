-- 統一立即購買 RPC：商戶 B2C + 會員 P2P 一口價即時成交。
-- 補 offer 主訊息供 chat OfferCard 渲染；rpc_buy_now_merchant_listing 改為 thin wrapper。

CREATE OR REPLACE FUNCTION public.rpc_buy_now_listing(
    p_listing_id UUID,
    p_buyer_id UUID,
    p_use_auth BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_seller_persona public.seller_persona_type;
    v_listing_status public.listing_status;
    v_listing_accepts_auth BOOLEAN;
    v_listing_price NUMERIC;
    v_room_id UUID;
    v_offer_id UUID;
    v_order_id UUID;
    v_offer_message_id UUID;
    v_accepted_message_id UUID;
    v_generated_order_number TEXT;
    v_order_row RECORD;
    v_order_kind TEXT;
    v_escrow_status public.member_escrow_status;
    v_offer_message_content TEXT;
    v_room_row RECORD;
    v_offer_row RECORD;
    v_offer_message_row RECORD;
    v_accepted_message_row RECORD;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_buyer_id THEN
        RAISE EXCEPTION '請先登入後再購買';
    END IF;

    SELECT
        l.seller_id,
        COALESCE(l.seller_persona, 'member'::public.seller_persona_type),
        l.status,
        l.use_authentication,
        l.price
    INTO
        v_seller_id,
        v_seller_persona,
        v_listing_status,
        v_listing_accepts_auth,
        v_listing_price
    FROM public.listings l
    WHERE l.id = p_listing_id
    FOR UPDATE OF l;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到該卡牌商品。';
    END IF;

    IF v_listing_status <> 'active'::public.listing_status THEN
        RAISE EXCEPTION '商品非 active 狀態，無法購買。';
    END IF;

    PERFORM public.fn_assert_offer_not_self_dealing(p_buyer_id, v_seller_id);

    IF COALESCE(p_use_auth, false) AND NOT COALESCE(v_listing_accepts_auth, false) THEN
        RAISE EXCEPTION '此賣家不接受平台鑑定加購服務，請關閉鑑定選項後再購買。';
    END IF;

    IF v_seller_persona = 'member' THEN
        PERFORM public.fn_assert_p2p_offer_aml_limits(
            p_buyer_id,
            v_listing_price,
            p_listing_id,
            COALESCE(p_use_auth, false)
        );
    END IF;

    INSERT INTO public.chat_rooms (
        buyer_id,
        buyer_persona,
        seller_id,
        seller_persona,
        updated_at
    )
    VALUES (
        p_buyer_id,
        'member',
        v_seller_id,
        v_seller_persona,
        now()
    )
    ON CONFLICT (buyer_id, buyer_persona, seller_id, seller_persona) DO UPDATE
      SET updated_at = EXCLUDED.updated_at
    RETURNING id INTO v_room_id;

    INSERT INTO public.offers (
        room_id,
        buyer_id,
        listing_id,
        offer_price,
        status,
        use_authentication
    )
    VALUES (
        v_room_id,
        p_buyer_id,
        p_listing_id,
        v_listing_price,
        'accepted',
        COALESCE(p_use_auth, false)
    )
    RETURNING id INTO v_offer_id;

    v_offer_message_content :=
        '⚡【立即購買】以開價 HK$ ' || TRIM(TO_CHAR(v_listing_price, 'FM999,999,999')) || ' 一口價購入';
    IF COALESCE(p_use_auth, false) THEN
        v_offer_message_content := '[AUTH_REQUEST] ' || v_offer_message_content;
    END IF;

    INSERT INTO public.chat_messages (
        room_id,
        sender_id,
        content,
        offer_id,
        is_system_warning
    )
    VALUES (
        v_room_id,
        p_buyer_id,
        v_offer_message_content,
        v_offer_id,
        false
    )
    RETURNING id INTO v_offer_message_id;

    UPDATE public.listings
    SET status = 'inactive'
    WHERE id = p_listing_id;

    v_generated_order_number := 'ORD-2026-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

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
            p_buyer_id,
            v_seller_id,
            p_listing_id,
            v_listing_price,
            v_listing_price,
            v_listing_price,
            'pending_payment'::public.escrow_state,
            COALESCE(p_use_auth, false),
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
            p_buyer_id,
            'SYSTEM_OFFER_ACCEPTED',
            v_offer_id,
            v_order_id,
            false
        )
        RETURNING id INTO v_accepted_message_id;

        SELECT * INTO v_order_row FROM public.merchant_orders WHERE id = v_order_id;
    ELSE
        v_order_kind := 'member';
        v_escrow_status := CASE
            WHEN COALESCE(p_use_auth, false) THEN 'payment'::public.member_escrow_status
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
            p_buyer_id,
            v_seller_id,
            p_listing_id,
            v_listing_price,
            'pending',
            (now() + INTERVAL '14 days'),
            0,
            v_generated_order_number,
            COALESCE(p_use_auth, false),
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
            p_buyer_id,
            'SYSTEM_OFFER_ACCEPTED',
            v_offer_id,
            v_order_id,
            false
        )
        RETURNING id INTO v_accepted_message_id;

        SELECT * INTO v_order_row FROM public.member_orders WHERE id = v_order_id;
    END IF;

    SELECT * INTO v_room_row FROM public.chat_rooms WHERE id = v_room_id;
    SELECT * INTO v_offer_row FROM public.offers WHERE id = v_offer_id;
    SELECT * INTO v_offer_message_row FROM public.chat_messages WHERE id = v_offer_message_id;
    SELECT * INTO v_accepted_message_row FROM public.chat_messages WHERE id = v_accepted_message_id;

    RETURN jsonb_build_object(
        'room', to_jsonb(v_room_row),
        'offer', to_jsonb(v_offer_row),
        'offer_message', to_jsonb(v_offer_message_row),
        'accepted_message', to_jsonb(v_accepted_message_row),
        'order', to_jsonb(v_order_row),
        'order_kind', v_order_kind,
        'offer_id', v_offer_id,
        'message_id', v_accepted_message_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_buy_now_listing(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_buy_now_listing(UUID, UUID, BOOLEAN)
  TO authenticated, service_role;

-- 向後相容：商戶專用 wrapper
CREATE OR REPLACE FUNCTION public.rpc_buy_now_merchant_listing(
    p_listing_id UUID,
    p_buyer_id UUID,
    p_use_auth BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_seller_persona public.seller_persona_type;
BEGIN
    SELECT COALESCE(l.seller_persona, 'member'::public.seller_persona_type)
    INTO v_seller_persona
    FROM public.listings l
    WHERE l.id = p_listing_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到該卡牌商品。';
    END IF;

    IF v_seller_persona <> 'merchant' THEN
        RAISE EXCEPTION '此商品非認證商戶掛售，請改用出價流程。';
    END IF;

    v_result := public.rpc_buy_now_listing(p_listing_id, p_buyer_id, p_use_auth);

    IF v_result ->> 'order_kind' IS DISTINCT FROM 'merchant' THEN
        RAISE EXCEPTION '立即購買回傳訂單類型異常。';
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_buy_now_merchant_listing(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_buy_now_merchant_listing(UUID, UUID, BOOLEAN)
  TO authenticated, service_role;
