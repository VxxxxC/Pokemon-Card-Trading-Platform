-- Restore per-buyer per-listing pending offer guard (lost in later rpc_make_offer rewrites).
-- Also cancel duplicate pending rows before adding a partial unique index.

WITH ranked AS (
  SELECT
    o.id,
    ROW_NUMBER() OVER (
      PARTITION BY o.buyer_id, o.listing_id
      ORDER BY o.created_at DESC NULLS LAST, o.id DESC
    ) AS rn
  FROM public.offers o
  WHERE o.status = 'pending'
    AND o.listing_id IS NOT NULL
)
UPDATE public.offers o
SET
  status = 'cancelled',
  updated_at = now()
FROM ranked r
WHERE o.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_one_pending_per_buyer_listing
  ON public.offers (buyer_id, listing_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.rpc_make_offer(
    p_listing_id UUID,
    p_buyer_id UUID,
    p_offer_price NUMERIC,
    p_content TEXT,
    p_use_authentication BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_seller_persona public.seller_persona_type;
    v_listing_status TEXT;
    v_listing_accepts_auth BOOLEAN;
    v_room_id UUID;
    v_offer_id UUID;
    v_message_id UUID;
    v_message_content TEXT;
    v_room_row RECORD;
    v_offer_row RECORD;
    v_message_row RECORD;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_buyer_id THEN
        RAISE EXCEPTION '請先登入後再出價';
    END IF;

    SELECT
        l.seller_id,
        l.seller_persona,
        l.status,
        l.use_authentication
    INTO
        v_seller_id,
        v_seller_persona,
        v_listing_status,
        v_listing_accepts_auth
    FROM public.listings l
    WHERE l.id = p_listing_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到該卡牌商品。';
    END IF;

    IF v_listing_status <> 'active' THEN
        RAISE EXCEPTION '商品非 active 狀態，無法出價。';
    END IF;

    PERFORM public.fn_assert_offer_not_self_dealing(p_buyer_id, v_seller_id);

    IF COALESCE(p_use_authentication, false) AND NOT COALESCE(v_listing_accepts_auth, false) THEN
        RAISE EXCEPTION '此賣家不接受平台鑑定加購服務，請關閉鑑定選項後再出價。';
    END IF;

    PERFORM public.fn_assert_p2p_offer_aml_limits(
        p_buyer_id,
        p_offer_price,
        p_listing_id,
        COALESCE(p_use_authentication, false)
    );

    IF EXISTS (
        SELECT 1
        FROM public.offers o
        WHERE o.listing_id = p_listing_id
          AND o.buyer_id = p_buyer_id
          AND o.status = 'pending'
    ) THEN
        RAISE EXCEPTION '您已有進行中的出價，請等待賣家回應或被拒絕後再出價。';
    END IF;

    v_message_content := p_content;
    IF COALESCE(p_use_authentication, false) THEN
        v_message_content := '[AUTH_REQUEST] ' || v_message_content;
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
      COALESCE(v_seller_persona, 'member'),
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
        p_offer_price,
        'pending',
        COALESCE(p_use_authentication, false)
    )
    RETURNING id INTO v_offer_id;

    INSERT INTO public.chat_messages (room_id, sender_id, content, offer_id, is_system_warning)
    VALUES (v_room_id, p_buyer_id, v_message_content, v_offer_id, false)
    RETURNING id INTO v_message_id;

    SELECT * INTO v_room_row FROM public.chat_rooms WHERE id = v_room_id;
    SELECT * INTO v_offer_row FROM public.offers WHERE id = v_offer_id;
    SELECT * INTO v_message_row FROM public.chat_messages WHERE id = v_message_id;

    RETURN jsonb_build_object(
        'room', to_jsonb(v_room_row),
        'offer', to_jsonb(v_offer_row),
        'message', to_jsonb(v_message_row)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_make_offer(UUID, UUID, NUMERIC, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_make_offer(UUID, UUID, NUMERIC, TEXT, BOOLEAN) TO authenticated, service_role;
