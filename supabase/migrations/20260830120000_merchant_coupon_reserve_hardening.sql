-- Coupon FSM hardening: atomic reserve (V1), expiry at mark_paid (V2), 15m stale reserve release (V3).

ALTER TABLE public.user_rewards
    ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ;

UPDATE public.user_rewards
SET reserved_at = COALESCE(created_at, now())
WHERE reserved_merchant_order_id IS NOT NULL
  AND reserved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_rewards_stale_reserve
    ON public.user_rewards (reserved_at)
    WHERE reserved_merchant_order_id IS NOT NULL
      AND COALESCE(is_used, false) = false;


CREATE OR REPLACE FUNCTION public.fn_reserve_user_reward_for_merchant_order(
    p_user_reward_id UUID,
    p_buyer_id UUID,
    p_order_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row public.user_rewards%ROWTYPE;
    v_reserved_id UUID;
BEGIN
    IF p_user_reward_id IS NULL OR p_buyer_id IS NULL OR p_order_id IS NULL THEN
        RAISE EXCEPTION '優惠券預留參數無效';
    END IF;

    SELECT * INTO v_row
    FROM public.user_rewards ur
    WHERE ur.id = p_user_reward_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到優惠券';
    END IF;

    IF v_row.user_id IS DISTINCT FROM p_buyer_id THEN
        RAISE EXCEPTION '此優惠券不屬於當前帳戶';
    END IF;

    IF COALESCE(v_row.is_used, false) THEN
        RAISE EXCEPTION '此優惠券已使用';
    END IF;

    IF v_row.calculated_expiry IS NOT NULL AND v_row.calculated_expiry < now() THEN
        RAISE EXCEPTION '此優惠券已過期';
    END IF;

    IF v_row.reserved_merchant_order_id IS NOT NULL
       AND v_row.reserved_merchant_order_id IS DISTINCT FROM p_order_id THEN
        RAISE EXCEPTION '此優惠券已被其他訂單預留';
    END IF;

    UPDATE public.user_rewards ur
    SET
        reserved_merchant_order_id = p_order_id,
        reserved_at = now()
    WHERE ur.id = p_user_reward_id
      AND ur.user_id = p_buyer_id
      AND COALESCE(ur.is_used, false) = false
      AND (ur.calculated_expiry IS NULL OR ur.calculated_expiry >= now())
      AND (
          ur.reserved_merchant_order_id IS NULL
          OR ur.reserved_merchant_order_id = p_order_id
      )
    RETURNING ur.id INTO v_reserved_id;

    IF v_reserved_id IS NULL THEN
        RAISE EXCEPTION '優惠券無法預留（可能已被其他訂單使用或已過期）';
    END IF;

    RETURN v_reserved_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reserve_user_reward_for_merchant_order(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reserve_user_reward_for_merchant_order(UUID, UUID, UUID)
    TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.fn_release_merchant_order_coupon(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coupon_id UUID;
BEGIN
    SELECT mo.coupon_user_reward_id
    INTO v_coupon_id
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id;

    UPDATE public.user_rewards ur
    SET
        reserved_merchant_order_id = NULL,
        reserved_at = NULL
    WHERE ur.reserved_merchant_order_id = p_order_id
      AND ur.used_at IS NULL
      AND COALESCE(ur.is_used, false) = false;

    IF v_coupon_id IS NOT NULL THEN
        UPDATE public.user_rewards ur
        SET
            reserved_merchant_order_id = NULL,
            reserved_at = NULL
        WHERE ur.id = v_coupon_id
          AND ur.reserved_merchant_order_id = p_order_id
          AND ur.used_at IS NULL
          AND COALESCE(ur.is_used, false) = false;
    END IF;

    UPDATE public.merchant_orders mo
    SET
        coupon_user_reward_id = NULL,
        coupon_type = NULL,
        platform_subsidy_amount = 0,
        buyer_total_amount = mo.total_amount,
        updated_at = now()
    WHERE mo.id = p_order_id;
END;
$$;


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
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    SELECT
        mo.merchant_id,
        mo.escrow_status,
        mo.stripe_payment_intent_id,
        COALESCE(mo.buyer_total_amount, mo.total_amount),
        mo.coupon_user_reward_id
    INTO
        v_merchant_id,
        v_escrow_status,
        v_existing_pi,
        v_ledger_amount,
        v_coupon_id
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


CREATE OR REPLACE FUNCTION public.rpc_prepare_merchant_order_payment(
    p_order_id UUID,
    p_shipping_method TEXT,
    p_use_auth BOOLEAN DEFAULT false,
    p_sf_locker_code TEXT DEFAULT NULL,
    p_sf_address TEXT DEFAULT NULL,
    p_buyer_phone TEXT DEFAULT NULL,
    p_meetup_detail TEXT DEFAULT NULL,
    p_buyer_remark TEXT DEFAULT NULL,
    p_user_reward_id UUID DEFAULT NULL
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
    v_shipping_fee NUMERIC := 0;
    v_quoted_sf_fee NUMERIC := 0;
    v_auth_fee NUMERIC;
    v_total NUMERIC;
    v_subsidy NUMERIC := 0;
    v_buyer_total NUMERIC;
    v_coupon_type public.reward_type;
    v_existing_coupon UUID;
    v_payment_intent_id TEXT;
    v_shipping_method TEXT;
    v_sf_locker_code TEXT;
    v_sf_address TEXT;
    v_buyer_phone TEXT;
    v_meetup_detail TEXT;
    v_buyer_remark TEXT;
    v_subsidy_shipping_fee NUMERIC;
    v_subsidy_shipping_method TEXT;
BEGIN
    v_sf_locker_code := NULLIF(BTRIM(p_sf_locker_code), '');
    v_sf_address := NULLIF(BTRIM(p_sf_address), '');
    v_buyer_phone := NULLIF(BTRIM(p_buyer_phone), '');
    v_meetup_detail := NULLIF(BTRIM(p_meetup_detail), '');
    v_buyer_remark := NULLIF(BTRIM(p_buyer_remark), '');

    IF COALESCE(p_use_auth, false) THEN
        v_shipping_method := 'meetup';
    ELSE
        v_shipping_method := p_shipping_method;
        IF v_shipping_method IS NULL OR v_shipping_method NOT IN ('sf', 'meetup') THEN
            RAISE EXCEPTION '請選擇有效的交收方式。';
        END IF;

        IF v_shipping_method = 'sf' THEN
            IF v_buyer_phone IS NULL OR v_sf_address IS NULL THEN
                RAISE EXCEPTION '請填寫聯絡電話及收件地址／自提點。';
            END IF;
        ELSIF v_shipping_method = 'meetup' THEN
            IF v_buyer_phone IS NULL THEN
                RAISE EXCEPTION '請填寫聯絡電話。';
            END IF;
        END IF;
    END IF;

    SELECT
        mo.buyer_id,
        mo.merchant_id,
        mo.listing_id,
        mo.final_price,
        mo.escrow_status,
        mo.stripe_payment_intent_id,
        mo.coupon_user_reward_id,
        COALESCE(l.use_authentication, false)
    INTO
        v_buyer_id,
        v_merchant_id,
        v_listing_id,
        v_final_price,
        v_escrow_status,
        v_payment_intent_id,
        v_existing_coupon,
        v_listing_accepts_auth
    FROM public.merchant_orders mo
    INNER JOIN public.listings l ON l.id = mo.listing_id
    WHERE mo.id = p_order_id
    FOR UPDATE OF mo;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF COALESCE(p_use_auth, false) THEN
        v_quoted_sf_fee := public.fn_merchant_checkout_shipping_fee(
            'sf',
            v_merchant_id,
            v_listing_id
        );
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

    IF v_existing_coupon IS NOT NULL
       AND (p_user_reward_id IS NULL OR v_existing_coupon IS DISTINCT FROM p_user_reward_id) THEN
        PERFORM public.fn_release_merchant_order_coupon(p_order_id);
    END IF;

    IF COALESCE(p_use_auth, false) THEN
        v_shipping_fee := 0;
    ELSE
        v_shipping_fee := public.fn_merchant_checkout_shipping_fee(
            v_shipping_method,
            v_merchant_id,
            v_listing_id
        );
    END IF;

    v_auth_fee := public.fn_merchant_checkout_auth_fee(p_use_auth);
    v_coupon_type := NULL;
    v_subsidy := 0;

    IF p_user_reward_id IS NOT NULL THEN
        IF COALESCE(p_use_auth, false) THEN
            v_subsidy_shipping_fee := v_quoted_sf_fee;
            v_subsidy_shipping_method := 'sf';
        ELSE
            v_subsidy_shipping_fee := v_shipping_fee;
            v_subsidy_shipping_method := v_shipping_method;
        END IF;

        SELECT s.subsidy_amount, s.coupon_type
        INTO v_subsidy, v_coupon_type
        FROM public.fn_compute_platform_subsidy(
            p_user_reward_id,
            v_buyer_id,
            v_final_price,
            v_subsidy_shipping_fee,
            v_subsidy_shipping_method,
            COALESCE(p_use_auth, false),
            p_order_id
        ) AS s;

        IF v_coupon_type = 'free_shipping'::public.reward_type AND COALESCE(p_use_auth, false) THEN
            v_shipping_fee := v_quoted_sf_fee;
        END IF;

        PERFORM public.fn_reserve_user_reward_for_merchant_order(
            p_user_reward_id,
            v_buyer_id,
            p_order_id
        );
    ELSE
        PERFORM public.fn_release_merchant_order_coupon(p_order_id);
    END IF;

    v_total := v_final_price + v_shipping_fee + v_auth_fee;
    v_buyer_total := GREATEST(v_total - COALESCE(v_subsidy, 0), 0);

    IF v_buyer_total <= 0 THEN
        RAISE EXCEPTION '訂單折後金額異常，請聯絡客服';
    END IF;

    UPDATE public.merchant_orders
    SET
        item_subtotal = v_final_price,
        shipping_fee = v_shipping_fee,
        auth_fee = v_auth_fee,
        shipping_method = v_shipping_method,
        total_amount = v_total,
        buyer_total_amount = v_buyer_total,
        platform_subsidy_amount = COALESCE(v_subsidy, 0),
        coupon_user_reward_id = CASE WHEN p_user_reward_id IS NOT NULL THEN p_user_reward_id ELSE NULL END,
        coupon_type = v_coupon_type,
        requires_authentication = COALESCE(p_use_auth, false),
        sf_locker_code = CASE
            WHEN COALESCE(p_use_auth, false) THEN NULL
            WHEN v_shipping_method = 'sf' THEN v_sf_locker_code
            ELSE NULL
        END,
        sf_address = CASE
            WHEN COALESCE(p_use_auth, false) THEN NULL
            WHEN v_shipping_method = 'sf' THEN v_sf_address
            ELSE NULL
        END,
        buyer_phone = CASE
            WHEN COALESCE(p_use_auth, false) THEN NULL
            ELSE v_buyer_phone
        END,
        meetup_detail = CASE
            WHEN COALESCE(p_use_auth, false) THEN NULL
            WHEN v_shipping_method = 'meetup' THEN v_meetup_detail
            ELSE NULL
        END,
        buyer_remark = v_buyer_remark,
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
        'buyer_total_amount', v_buyer_total,
        'platform_subsidy_amount', COALESCE(v_subsidy, 0),
        'coupon_user_reward_id', p_user_reward_id,
        'coupon_type', v_coupon_type,
        'shipping_method', v_shipping_method,
        'requires_authentication', COALESCE(p_use_auth, false),
        'stripe_payment_intent_id', v_payment_intent_id
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.rpc_list_stale_coupon_reserve_candidates(
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    user_reward_id UUID,
    merchant_order_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        ur.id AS user_reward_id,
        ur.reserved_merchant_order_id AS merchant_order_id
    FROM public.user_rewards ur
    WHERE ur.reserved_merchant_order_id IS NOT NULL
      AND COALESCE(ur.is_used, false) = false
      AND ur.reserved_at IS NOT NULL
      AND ur.reserved_at < (now() - interval '15 minutes')
    ORDER BY ur.reserved_at ASC
    LIMIT GREATEST(LEAST(COALESCE(p_limit, 50), 200), 1);
$$;

REVOKE ALL ON FUNCTION public.rpc_list_stale_coupon_reserve_candidates(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_list_stale_coupon_reserve_candidates(INTEGER) TO service_role;


CREATE OR REPLACE FUNCTION public.rpc_finalize_stale_coupon_reserve(
    p_user_reward_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row public.user_rewards%ROWTYPE;
    v_escrow_status public.escrow_state;
BEGIN
    SELECT * INTO v_row
    FROM public.user_rewards ur
    WHERE ur.id = p_user_reward_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到優惠券';
    END IF;

    IF v_row.reserved_merchant_order_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'user_reward_id', p_user_reward_id
        );
    END IF;

    IF COALESCE(v_row.is_used, false) THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'user_reward_id', p_user_reward_id
        );
    END IF;

    IF v_row.reserved_at IS NULL
       OR v_row.reserved_at >= (now() - interval '15 minutes') THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'user_reward_id', p_user_reward_id
        );
    END IF;

    SELECT mo.escrow_status
    INTO v_escrow_status
    FROM public.merchant_orders mo
    WHERE mo.id = v_row.reserved_merchant_order_id;

    IF v_escrow_status = 'pending_payment'::public.escrow_state THEN
        PERFORM public.fn_release_merchant_order_coupon(v_row.reserved_merchant_order_id);
    ELSE
        UPDATE public.user_rewards ur
        SET
            reserved_merchant_order_id = NULL,
            reserved_at = NULL
        WHERE ur.id = p_user_reward_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'user_reward_id', p_user_reward_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_finalize_stale_coupon_reserve(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_stale_coupon_reserve(UUID) TO service_role;


CREATE OR REPLACE FUNCTION public.rpc_e2e_backdate_coupon_reserve(
    p_user_reward_id UUID,
    p_minutes_ago INTEGER DEFAULT 16
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    UPDATE public.user_rewards
    SET reserved_at = now() - make_interval(mins => GREATEST(COALESCE(p_minutes_ago, 16), 1))
    WHERE id = p_user_reward_id
      AND reserved_merchant_order_id IS NOT NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到已預留的優惠券。';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_reward_id', p_user_reward_id,
        'minutes_ago', p_minutes_ago
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_e2e_backdate_coupon_reserve(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_backdate_coupon_reserve(UUID, INTEGER) TO service_role;


CREATE OR REPLACE FUNCTION public.rpc_e2e_seed_merchant_pending_payment_order(
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
        l.price
    INTO
        v_seller_id,
        v_seller_persona,
        v_listing_price
    FROM public.listings l
    WHERE l.id = p_listing_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到該卡牌商品。';
    END IF;

    IF v_seller_persona IS DISTINCT FROM 'merchant'::public.seller_persona_type THEN
        RAISE EXCEPTION 'E2E fixture 僅支援商戶 listing。';
    END IF;

    v_order_number := 'E2E-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || clock_timestamp()::TEXT) FROM 1 FOR 10));

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
        false,
        v_order_number
    )
    RETURNING id INTO v_order_id;

    RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_e2e_seed_merchant_pending_payment_order(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_seed_merchant_pending_payment_order(UUID, UUID) TO service_role;


CREATE OR REPLACE FUNCTION public.fn_restore_merchant_order_coupon_on_void(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coupon_id UUID;
BEGIN
    SELECT mo.coupon_user_reward_id
    INTO v_coupon_id
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id;

    IF v_coupon_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.user_rewards ur
    SET
        is_used = false,
        used_at = NULL,
        reserved_merchant_order_id = NULL,
        reserved_at = NULL
    WHERE ur.id = v_coupon_id;

    UPDATE public.merchant_orders mo
    SET
        coupon_user_reward_id = NULL,
        coupon_type = NULL,
        platform_subsidy_amount = 0,
        buyer_total_amount = mo.total_amount,
        updated_at = now()
    WHERE mo.id = p_order_id;
END;
$$;
