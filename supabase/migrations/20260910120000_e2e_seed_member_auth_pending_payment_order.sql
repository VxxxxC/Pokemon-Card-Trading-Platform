-- E2E / Vitest: seed member auth escrow orders at payment step (service_role only).

CREATE OR REPLACE FUNCTION public.rpc_e2e_seed_member_auth_pending_payment_order(
    p_listing_id UUID,
    p_buyer_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_seller_persona public.seller_persona_type;
    v_listing_status public.listing_status;
    v_listing_price NUMERIC;
    v_order_id UUID;
    v_order_number TEXT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    SELECT
        l.seller_id,
        COALESCE(l.seller_persona, 'member'::public.seller_persona_type),
        l.status,
        l.price
    INTO
        v_seller_id,
        v_seller_persona,
        v_listing_status,
        v_listing_price
    FROM public.listings l
    WHERE l.id = p_listing_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到該卡牌商品。';
    END IF;

    IF v_seller_persona IS DISTINCT FROM 'member'::public.seller_persona_type THEN
        RAISE EXCEPTION 'E2E fixture 僅支援會員 listing。';
    END IF;

    IF v_listing_status IS DISTINCT FROM 'active'::public.listing_status THEN
        RAISE EXCEPTION 'E2E fixture 需要 active listing。';
    END IF;

    IF v_seller_id IS NULL THEN
        RAISE EXCEPTION 'E2E fixture listing 缺少 seller_id。';
    END IF;

    v_order_number := 'E2E-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || clock_timestamp()::TEXT) FROM 1 FOR 10));

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
        v_order_number,
        true,
        'payment'::public.member_escrow_status
    )
    RETURNING id INTO v_order_id;

    RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_e2e_seed_member_auth_pending_payment_order(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_seed_member_auth_pending_payment_order(UUID, UUID) TO service_role;
