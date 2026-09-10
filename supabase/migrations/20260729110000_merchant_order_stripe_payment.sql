-- Payment Milestone 1：B2C 商戶訂單真實 Stripe 收款（資金 100% 入平台託管）。
--
-- 1. merchant_orders 補金額明細欄位（商品 / 運費 / 鑑定費 / 總額 / 付款時間）
-- 2. rpc_accept_offer：merchant 分支改為 pending_payment（待買家付款）
-- 3. rpc_buy_now_merchant_listing：立即購買 = 以開價出價並即時代為接受
-- 4. rpc_mark_merchant_order_paid：webhook 確認收款後 pending_payment → payment_held

-- ---------------------------------------------------------------------------
-- 1. merchant_orders 金額明細
-- ---------------------------------------------------------------------------

ALTER TABLE public.merchant_orders
  ADD COLUMN IF NOT EXISTS item_subtotal NUMERIC,
  ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auth_fee NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_method TEXT,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 既有訂單（accept offer 直接入 payment_held 的舊資料）以成交價回填明細。
UPDATE public.merchant_orders
SET item_subtotal = COALESCE(item_subtotal, final_price),
    total_amount = COALESCE(total_amount, final_price)
WHERE item_subtotal IS NULL
   OR total_amount IS NULL;

CREATE INDEX IF NOT EXISTS idx_merchant_orders_stripe_payment_intent_id
  ON public.merchant_orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. rpc_accept_offer：merchant 訂單改為待付款
-- ---------------------------------------------------------------------------

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
    IF auth.uid() IS DISTINCT FROM p_seller_id THEN
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

        -- B2C：訂單先入待付款，買家於 /checkout/[orderId] 完成 Stripe 付款
        -- 後由 webhook 轉 payment_held。運費 / 鑑定費於建立 PaymentIntent 時寫入。
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

-- ---------------------------------------------------------------------------
-- 3. rpc_buy_now_merchant_listing：立即購買（以開價出價 + 代為接受）
-- ---------------------------------------------------------------------------

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
    v_seller_id UUID;
    v_seller_persona public.seller_persona_type;
    v_listing_status public.listing_status;
    v_listing_accepts_auth BOOLEAN;
    v_listing_price NUMERIC;
    v_room_id UUID;
    v_offer_id UUID;
    v_order_id UUID;
    v_message_id UUID;
    v_generated_order_number TEXT;
    v_order_row RECORD;
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

    IF v_seller_persona <> 'merchant' THEN
        RAISE EXCEPTION '此商品非認證商戶掛售，請改用出價流程。';
    END IF;

    IF v_listing_status <> 'active'::public.listing_status THEN
        RAISE EXCEPTION '商品非 active 狀態，無法購買。';
    END IF;

    PERFORM public.fn_assert_offer_not_self_dealing(p_buyer_id, v_seller_id);

    IF COALESCE(p_use_auth, false) AND NOT COALESCE(v_listing_accepts_auth, false) THEN
        RAISE EXCEPTION '此賣家不接受平台鑑定加購服務，請關閉鑑定選項後再購買。';
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
        'merchant',
        now()
    )
    ON CONFLICT (buyer_id, buyer_persona, seller_id, seller_persona) DO UPDATE
      SET updated_at = EXCLUDED.updated_at
    RETURNING id INTO v_room_id;

    -- 立即購買本質上仍是「以賣家開價出價並即時成交」，保留 offers 留痕。
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

    UPDATE public.listings
    SET status = 'inactive'
    WHERE id = p_listing_id;

    v_generated_order_number := 'ORD-2026-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

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
    RETURNING id INTO v_message_id;

    SELECT * INTO v_order_row FROM public.merchant_orders WHERE id = v_order_id;

    RETURN jsonb_build_object(
        'order', to_jsonb(v_order_row),
        'order_kind', 'merchant',
        'offer_id', v_offer_id,
        'message_id', v_message_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_buy_now_merchant_listing(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_buy_now_merchant_listing(UUID, UUID, BOOLEAN)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. rpc_mark_merchant_order_paid：Stripe webhook 確認收款
-- ---------------------------------------------------------------------------
--
-- 只允許 pending_payment → payment_held；重放（同一 PaymentIntent 重複送達）
-- 回傳 already_applied = true 而不報錯。撥款給商戶（transfer + 佣金）留待
-- 訂單完成階段處理，本函數只記錄 escrow_payment 入帳流水。

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
    v_total_amount NUMERIC;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    SELECT merchant_id, escrow_status, stripe_payment_intent_id
    INTO v_merchant_id, v_escrow_status, v_existing_pi
    FROM public.merchant_orders
    WHERE id = p_order_id
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

    UPDATE public.merchant_orders
    SET
        escrow_status = 'payment_held'::public.escrow_state,
        stripe_payment_intent_id = p_payment_intent_id,
        item_subtotal = COALESCE((p_amounts ->> 'item_subtotal')::NUMERIC, item_subtotal, final_price),
        shipping_fee = COALESCE((p_amounts ->> 'shipping_fee')::NUMERIC, shipping_fee, 0),
        auth_fee = COALESCE((p_amounts ->> 'auth_fee')::NUMERIC, auth_fee, 0),
        shipping_method = COALESCE(p_amounts ->> 'shipping_method', shipping_method),
        total_amount = COALESCE((p_amounts ->> 'total_amount')::NUMERIC, total_amount, final_price),
        paid_at = now(),
        updated_at = now()
    WHERE id = p_order_id
    RETURNING total_amount INTO v_total_amount;

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
            v_total_amount,
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
