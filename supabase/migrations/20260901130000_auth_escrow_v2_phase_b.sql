-- Auth Escrow v2 Phase B: checkout amounts, multicapture split, payout inbound reimbursement.

-- ---------------------------------------------------------------------------
-- 1. Shared amount helper (no-coupon auth checkout)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_compute_auth_escrow_amounts(p_item_subtotal NUMERIC)
RETURNS TABLE (
    auth_fee NUMERIC,
    inbound_shipping_fee NUMERIC,
    outbound_shipping_fee NUMERIC,
    total_amount NUMERIC,
    buyer_total_amount NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT
        public.fn_platform_auth_fee_hkd() AS auth_fee,
        public.fn_platform_auth_sf_leg_fee() AS inbound_shipping_fee,
        public.fn_platform_auth_sf_leg_fee() AS outbound_shipping_fee,
        (
            p_item_subtotal
            + public.fn_platform_auth_fee_hkd()
            + public.fn_platform_auth_sf_leg_fee() * 2
        ) AS total_amount,
        (
            p_item_subtotal
            + public.fn_platform_auth_fee_hkd()
            + public.fn_platform_auth_sf_leg_fee() * 2
        ) AS buyer_total_amount;
$$;

REVOKE ALL ON FUNCTION public.fn_compute_auth_escrow_amounts(NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_compute_auth_escrow_amounts(NUMERIC)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Member auth prepare
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
    v_inbound NUMERIC;
    v_outbound NUMERIC;
    v_total NUMERIC;
    v_buyer_total NUMERIC;
    v_payment_intent_id TEXT;
    v_item_subtotal NUMERIC;
    v_existing_auth_fee NUMERIC;
    v_existing_inbound NUMERIC;
    v_existing_outbound NUMERIC;
    v_existing_total NUMERIC;
    v_existing_buyer_total NUMERIC;
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
        mo.inbound_shipping_fee,
        mo.outbound_shipping_fee,
        mo.total_amount,
        mo.buyer_total_amount
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
        v_existing_inbound,
        v_existing_outbound,
        v_existing_total,
        v_existing_buyer_total
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

    SELECT
        a.auth_fee,
        a.inbound_shipping_fee,
        a.outbound_shipping_fee,
        a.total_amount,
        a.buyer_total_amount
    INTO
        v_auth_fee,
        v_inbound,
        v_outbound,
        v_total,
        v_buyer_total
    FROM public.fn_compute_auth_escrow_amounts(v_final_price) AS a;

    IF v_item_subtotal IS NOT DISTINCT FROM v_final_price
       AND v_existing_auth_fee IS NOT DISTINCT FROM v_auth_fee
       AND v_existing_inbound IS NOT DISTINCT FROM v_inbound
       AND v_existing_outbound IS NOT DISTINCT FROM v_outbound
       AND v_existing_total IS NOT DISTINCT FROM v_total
       AND COALESCE(v_existing_buyer_total, v_existing_total) IS NOT DISTINCT FROM v_buyer_total THEN
        RETURN jsonb_build_object(
            'order_id', p_order_id,
            'buyer_id', v_buyer_id,
            'seller_id', v_seller_id,
            'listing_id', v_listing_id,
            'item_subtotal', v_final_price,
            'auth_fee', v_auth_fee,
            'inbound_shipping_fee', v_inbound,
            'outbound_shipping_fee', v_outbound,
            'total_amount', v_total,
            'buyer_total_amount', v_buyer_total,
            'stripe_payment_intent_id', v_payment_intent_id
        );
    END IF;

    UPDATE public.member_orders
    SET
        item_subtotal = v_final_price,
        auth_fee = v_auth_fee,
        inbound_shipping_fee = v_inbound,
        outbound_shipping_fee = v_outbound,
        total_amount = v_total,
        buyer_total_amount = v_buyer_total,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'order_id', p_order_id,
        'buyer_id', v_buyer_id,
        'seller_id', v_seller_id,
        'listing_id', v_listing_id,
        'item_subtotal', v_final_price,
        'auth_fee', v_auth_fee,
        'inbound_shipping_fee', v_inbound,
        'outbound_shipping_fee', v_outbound,
        'total_amount', v_total,
        'buyer_total_amount', v_buyer_total,
        'stripe_payment_intent_id', v_payment_intent_id
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Merchant auth prepare (v2 no-coupon path)
-- ---------------------------------------------------------------------------

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
    v_inbound_shipping_fee NUMERIC := 0;
    v_outbound_shipping_fee NUMERIC := 0;
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
    v_use_v2_auth_amounts BOOLEAN := false;
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

    v_use_v2_auth_amounts := COALESCE(p_use_auth, false) AND p_user_reward_id IS NULL;

    IF v_use_v2_auth_amounts THEN
        SELECT
            a.auth_fee,
            a.inbound_shipping_fee,
            a.outbound_shipping_fee,
            a.total_amount,
            a.buyer_total_amount
        INTO
            v_auth_fee,
            v_inbound_shipping_fee,
            v_outbound_shipping_fee,
            v_total,
            v_buyer_total
        FROM public.fn_compute_auth_escrow_amounts(v_final_price) AS a;
        v_shipping_fee := 0;
    ELSE
        v_total := v_final_price + v_shipping_fee + v_auth_fee;
        v_buyer_total := GREATEST(v_total - COALESCE(v_subsidy, 0), 0);
    END IF;

    IF v_buyer_total <= 0 THEN
        RAISE EXCEPTION '訂單折後金額異常，請聯絡客服';
    END IF;

    UPDATE public.merchant_orders
    SET
        item_subtotal = v_final_price,
        shipping_fee = v_shipping_fee,
        auth_fee = v_auth_fee,
        inbound_shipping_fee = CASE
            WHEN v_use_v2_auth_amounts THEN v_inbound_shipping_fee
            ELSE inbound_shipping_fee
        END,
        outbound_shipping_fee = CASE
            WHEN v_use_v2_auth_amounts THEN v_outbound_shipping_fee
            ELSE outbound_shipping_fee
        END,
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
        'inbound_shipping_fee', v_inbound_shipping_fee,
        'outbound_shipping_fee', v_outbound_shipping_fee,
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

-- ---------------------------------------------------------------------------
-- 4. Multicapture: intake = auth_fee + inbound
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_prepare_auth_fee_capture(
    p_order_kind TEXT,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_pi TEXT;
    v_auth_fee NUMERIC;
    v_inbound NUMERIC;
    v_intake_amount NUMERIC;
    v_intake_cents INTEGER;
    v_capture_status public.payment_capture_status;
    v_from_status TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_order_kind = 'member' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.auth_fee,
            mo.inbound_shipping_fee,
            mo.payment_capture_status,
            mo.escrow_status::TEXT
        INTO v_pi, v_auth_fee, v_inbound, v_capture_status, v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        v_intake_amount := COALESCE(v_auth_fee, 0) + COALESCE(v_inbound, 0);
        v_intake_cents := ROUND(v_intake_amount * 100)::INTEGER;

        IF v_capture_status = 'auth_fee_captured'::public.payment_capture_status
           OR v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'order_kind', p_order_kind,
                'order_id', p_order_id,
                'payment_intent_id', v_pi,
                'auth_fee_cents', v_intake_cents,
                'admin_id', v_admin_id
            );
        END IF;

        IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
            RAISE EXCEPTION '入庫扣款失敗：訂單尚未完成授權付款。';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.member_orders mo
            WHERE mo.id = p_order_id
              AND mo.inbound_tracking_no IS NOT NULL
              AND btrim(mo.inbound_tracking_no) <> ''
              AND mo.platform_received_at IS NULL
              AND mo.escrow_status = 'custody'::public.member_escrow_status
              AND mo.status = 'pending'
        ) THEN
            RAISE EXCEPTION '入庫確認失敗：訂單狀態不合法或尚未提交入庫物流。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.auth_fee,
            mo.inbound_shipping_fee,
            mo.payment_capture_status,
            mo.escrow_status::TEXT
        INTO v_pi, v_auth_fee, v_inbound, v_capture_status, v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        v_intake_amount := COALESCE(v_auth_fee, 0) + COALESCE(v_inbound, 0);
        v_intake_cents := ROUND(v_intake_amount * 100)::INTEGER;

        IF v_capture_status = 'auth_fee_captured'::public.payment_capture_status
           OR v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'order_kind', p_order_kind,
                'order_id', p_order_id,
                'payment_intent_id', v_pi,
                'auth_fee_cents', v_intake_cents,
                'admin_id', v_admin_id
            );
        END IF;

        IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
            RAISE EXCEPTION '入庫扣款失敗：訂單尚未完成授權付款。';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.merchant_orders mo
            WHERE mo.id = p_order_id
              AND mo.inbound_tracking_no IS NOT NULL
              AND btrim(mo.inbound_tracking_no) <> ''
              AND mo.platform_received_at IS NULL
              AND mo.escrow_status = 'payment_held'::public.escrow_state
        ) THEN
            RAISE EXCEPTION '入庫確認失敗：訂單狀態不合法或尚未提交入庫物流。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_pi IS NULL OR btrim(v_pi) = '' THEN
        RAISE EXCEPTION '入庫扣款失敗：找不到 Stripe PaymentIntent。';
    END IF;

    IF COALESCE(v_intake_amount, 0) <= 0 THEN
        RAISE EXCEPTION '入庫扣款失敗：鑑定費金額異常。';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_kind', p_order_kind,
        'order_id', p_order_id,
        'payment_intent_id', v_pi,
        'auth_fee_cents', v_intake_cents,
        'admin_id', v_admin_id,
        'from_status', v_from_status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_finalize_auth_fee_capture(
    p_order_kind TEXT,
    p_order_id UUID,
    p_payment_intent_id TEXT,
    p_captured_amount_cents INTEGER,
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capture_status public.payment_capture_status;
    v_auth_fee NUMERIC;
    v_inbound NUMERIC;
    v_expected_cents INTEGER;
    v_from_status TEXT;
    v_admin_id UUID;
    v_updated RECORD;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    IF p_captured_amount_cents IS NULL OR p_captured_amount_cents <= 0 THEN
        RAISE EXCEPTION '入庫扣款金額異常。';
    END IF;

    v_admin_id := p_admin_id;

    IF p_order_kind = 'member' THEN
        SELECT mo.payment_capture_status, mo.auth_fee, mo.inbound_shipping_fee, mo.escrow_status::TEXT
        INTO v_capture_status, v_auth_fee, v_inbound, v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        v_expected_cents := ROUND(
            (COALESCE(v_auth_fee, 0) + COALESCE(v_inbound, 0)) * 100
        )::INTEGER;

        IF v_capture_status IN (
            'auth_fee_captured'::public.payment_capture_status,
            'fully_captured'::public.payment_capture_status
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        IF p_captured_amount_cents <> v_expected_cents THEN
            RAISE EXCEPTION '入庫扣款金額與鑑定費不符。';
        END IF;

        UPDATE public.member_orders
        SET
            escrow_status = 'grading'::public.member_escrow_status,
            platform_received_at = now(),
            payment_capture_status = 'auth_fee_captured'::public.payment_capture_status,
            auth_fee_captured_at = now(),
            updated_at = now()
        WHERE id = p_order_id
          AND use_authentication = true
          AND escrow_status = 'custody'::public.member_escrow_status
          AND payment_capture_status = 'authorized'::public.payment_capture_status
          AND platform_received_at IS NULL
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '入庫確認失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT mo.payment_capture_status, mo.auth_fee, mo.inbound_shipping_fee, mo.escrow_status::TEXT
        INTO v_capture_status, v_auth_fee, v_inbound, v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        v_expected_cents := ROUND(
            (COALESCE(v_auth_fee, 0) + COALESCE(v_inbound, 0)) * 100
        )::INTEGER;

        IF v_capture_status IN (
            'auth_fee_captured'::public.payment_capture_status,
            'fully_captured'::public.payment_capture_status
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        IF p_captured_amount_cents <> v_expected_cents THEN
            RAISE EXCEPTION '入庫扣款金額與鑑定費不符。';
        END IF;

        UPDATE public.merchant_orders
        SET
            escrow_status = 'authenticating'::public.escrow_state,
            platform_received_at = now(),
            payment_capture_status = 'auth_fee_captured'::public.payment_capture_status,
            auth_fee_captured_at = now(),
            updated_at = now()
        WHERE id = p_order_id
          AND requires_authentication = true
          AND escrow_status = 'payment_held'::public.escrow_state
          AND payment_capture_status = 'authorized'::public.payment_capture_status
          AND platform_received_at IS NULL
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '入庫確認失敗：訂單狀態不合法。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_admin_id IS NOT NULL THEN
        PERFORM public._grading_write_audit_log(
            p_order_kind,
            p_order_id,
            v_admin_id,
            'confirm_intake',
            v_from_status,
            CASE WHEN p_order_kind = 'member' THEN 'grading' ELSE 'authenticating' END,
            NULL
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'payment_capture_status', 'auth_fee_captured',
        'order', to_jsonb(v_updated)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Multicapture: pass = buyer_total - auth - inbound
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_prepare_goods_capture(
    p_order_kind TEXT,
    p_order_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_pi TEXT;
    v_capture_status public.payment_capture_status;
    v_goods_amount NUMERIC;
    v_from_status TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_order_kind = 'member' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            COALESCE(mo.buyer_total_amount, mo.total_amount)
                - COALESCE(mo.auth_fee, 0)
                - COALESCE(mo.inbound_shipping_fee, 0),
            mo.escrow_status::TEXT
        INTO v_pi, v_capture_status, v_goods_amount, v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'order_kind', p_order_kind,
                'order_id', p_order_id,
                'payment_intent_id', v_pi,
                'goods_cents', ROUND(COALESCE(v_goods_amount, 0) * 100)::INTEGER,
                'admin_id', v_admin_id
            );
        END IF;

        IF v_capture_status IS DISTINCT FROM 'auth_fee_captured'::public.payment_capture_status THEN
            RAISE EXCEPTION '鑑定通過扣款失敗：訂單尚未完成入庫鑑定費扣款。';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.member_orders mo
            WHERE mo.id = p_order_id
              AND mo.escrow_status = 'grading'::public.member_escrow_status
              AND mo.status = 'pending'
              AND mo.auth_result IS NULL
        ) THEN
            RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            COALESCE(mo.buyer_total_amount, mo.total_amount)
                - COALESCE(mo.auth_fee, 0)
                - COALESCE(mo.inbound_shipping_fee, 0),
            mo.escrow_status::TEXT
        INTO v_pi, v_capture_status, v_goods_amount, v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'order_kind', p_order_kind,
                'order_id', p_order_id,
                'payment_intent_id', v_pi,
                'goods_cents', ROUND(COALESCE(v_goods_amount, 0) * 100)::INTEGER,
                'admin_id', v_admin_id
            );
        END IF;

        IF v_capture_status IS DISTINCT FROM 'auth_fee_captured'::public.payment_capture_status THEN
            RAISE EXCEPTION '鑑定通過扣款失敗：訂單尚未完成入庫鑑定費扣款。';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.merchant_orders mo
            WHERE mo.id = p_order_id
              AND mo.escrow_status = 'authenticating'::public.escrow_state
              AND mo.auth_result IS NULL
        ) THEN
            RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_pi IS NULL OR btrim(v_pi) = '' THEN
        RAISE EXCEPTION '鑑定通過扣款失敗：找不到 Stripe PaymentIntent。';
    END IF;

    IF COALESCE(v_goods_amount, 0) <= 0 THEN
        RAISE EXCEPTION '鑑定通過扣款失敗：卡價金額異常。';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_kind', p_order_kind,
        'order_id', p_order_id,
        'payment_intent_id', v_pi,
        'goods_cents', ROUND(v_goods_amount * 100)::INTEGER,
        'admin_id', v_admin_id,
        'from_status', v_from_status,
        'notes', NULLIF(trim(COALESCE(p_notes, '')), '')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_finalize_goods_capture(
    p_order_kind TEXT,
    p_order_id UUID,
    p_payment_intent_id TEXT,
    p_captured_amount_cents INTEGER,
    p_admin_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capture_status public.payment_capture_status;
    v_auth_fee NUMERIC;
    v_inbound NUMERIC;
    v_goods_amount NUMERIC;
    v_buyer_total NUMERIC;
    v_expected_total_cents INTEGER;
    v_from_status TEXT;
    v_admin_id UUID;
    v_updated RECORD;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    IF p_captured_amount_cents IS NULL OR p_captured_amount_cents <= 0 THEN
        RAISE EXCEPTION '鑑定通過扣款金額異常。';
    END IF;

    v_admin_id := p_admin_id;

    IF p_order_kind = 'member' THEN
        SELECT
            mo.payment_capture_status,
            mo.auth_fee,
            mo.inbound_shipping_fee,
            COALESCE(mo.buyer_total_amount, mo.total_amount)
                - COALESCE(mo.auth_fee, 0)
                - COALESCE(mo.inbound_shipping_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount),
            mo.escrow_status::TEXT
        INTO v_capture_status, v_auth_fee, v_inbound, v_goods_amount, v_buyer_total, v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        v_expected_total_cents := ROUND(COALESCE(v_buyer_total, 0) * 100)::INTEGER;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        IF p_captured_amount_cents <> v_expected_total_cents THEN
            RAISE EXCEPTION '鑑定通過扣款金額與訂單總額不符。';
        END IF;

        IF COALESCE(v_auth_fee, 0) + COALESCE(v_inbound, 0) + COALESCE(v_goods_amount, 0)
           IS DISTINCT FROM COALESCE(v_buyer_total, 0) THEN
            RAISE EXCEPTION '鑑定通過扣款金額與買家實付不符。';
        END IF;

        UPDATE public.member_orders
        SET
            escrow_status = 'shipped'::public.member_escrow_status,
            auth_result = 'passed',
            auth_graded_at = now(),
            auth_graded_by = v_admin_id,
            auth_notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
            payment_capture_status = 'fully_captured'::public.payment_capture_status,
            updated_at = now()
        WHERE id = p_order_id
          AND use_authentication = true
          AND escrow_status = 'grading'::public.member_escrow_status
          AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
          AND status = 'pending'
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.payment_capture_status,
            mo.auth_fee,
            mo.inbound_shipping_fee,
            COALESCE(mo.buyer_total_amount, mo.total_amount)
                - COALESCE(mo.auth_fee, 0)
                - COALESCE(mo.inbound_shipping_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount),
            mo.escrow_status::TEXT
        INTO v_capture_status, v_auth_fee, v_inbound, v_goods_amount, v_buyer_total, v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        v_expected_total_cents := ROUND(COALESCE(v_buyer_total, 0) * 100)::INTEGER;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        IF p_captured_amount_cents <> v_expected_total_cents THEN
            RAISE EXCEPTION '鑑定通過扣款金額與訂單總額不符。';
        END IF;

        IF COALESCE(v_auth_fee, 0) + COALESCE(v_inbound, 0) + COALESCE(v_goods_amount, 0)
           IS DISTINCT FROM COALESCE(v_buyer_total, 0) THEN
            RAISE EXCEPTION '鑑定通過扣款金額與買家實付不符。';
        END IF;

        UPDATE public.merchant_orders
        SET
            escrow_status = 'authenticated'::public.escrow_state,
            auth_result = 'passed',
            auth_graded_at = now(),
            auth_graded_by = v_admin_id,
            auth_notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
            payment_capture_status = 'fully_captured'::public.payment_capture_status,
            updated_at = now()
        WHERE id = p_order_id
          AND requires_authentication = true
          AND escrow_status = 'authenticating'::public.escrow_state
          AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_admin_id IS NOT NULL THEN
        PERFORM public._grading_write_audit_log(
            p_order_kind,
            p_order_id,
            v_admin_id,
            'pass_grading',
            v_from_status,
            CASE WHEN p_order_kind = 'member' THEN 'shipped' ELSE 'authenticated' END,
            NULLIF(trim(COALESCE(p_notes, '')), '')
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'payment_capture_status', 'fully_captured',
        'order', to_jsonb(v_updated)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Member order trigger: allow v2 checkout column updates
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_enforce_member_order_transitions()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF COALESCE(OLD.use_authentication, false) THEN
        IF auth.uid() = OLD.buyer_id THEN
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
                   OR NEW.inbound_shipping_fee IS DISTINCT FROM OLD.inbound_shipping_fee
                   OR NEW.outbound_shipping_fee IS DISTINCT FROM OLD.outbound_shipping_fee
                   OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
                   OR NEW.buyer_total_amount IS DISTINCT FROM OLD.buyer_total_amount
                   OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
                   OR (
                       NEW.item_subtotal IS NOT DISTINCT FROM OLD.item_subtotal
                       AND NEW.auth_fee IS NOT DISTINCT FROM OLD.auth_fee
                       AND NEW.inbound_shipping_fee IS NOT DISTINCT FROM OLD.inbound_shipping_fee
                       AND NEW.outbound_shipping_fee IS NOT DISTINCT FROM OLD.outbound_shipping_fee
                       AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
                       AND NEW.buyer_total_amount IS NOT DISTINCT FROM OLD.buyer_total_amount
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

-- ---------------------------------------------------------------------------
-- 7. Member FPS payout: include inbound reimbursement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_finalize_member_fps_payout_ready(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_payout_amount NUMERIC;
    v_fps_id TEXT;
    v_fps_name TEXT;
    v_id_snapshot TEXT;
    v_name_snapshot TEXT;
    v_request_status public.payout_request_status;
    v_request_id UUID;
BEGIN
    SELECT
        mo.seller_id,
        COALESCE(mo.item_subtotal, mo.final_price) + COALESCE(mo.inbound_shipping_fee, 0),
        p.fps_id,
        p.fps_name
    INTO v_seller_id, v_payout_amount, v_fps_id, v_fps_name
    FROM public.member_orders mo
    INNER JOIN public.profiles p ON p.id = mo.seller_id
    WHERE mo.id = p_order_id
        AND mo.use_authentication = true
        AND mo.seller_payout_status = 'held'
        AND mo.payout_hold_until IS NOT NULL
        AND mo.payout_hold_until <= now()
        AND mo.buyer_confirmed_at IS NOT NULL
        AND mo.status = 'completed'
        AND mo.escrow_status = 'released'
        AND mo.payment_capture_status = 'fully_captured'
        AND (
            mo.refund_status IS NULL
            OR btrim(mo.refund_status) = ''
            OR lower(btrim(mo.refund_status)) = 'none'
        )
        AND NOT EXISTS (
            SELECT 1
            FROM public.payout_requests pr
            WHERE pr.order_id = mo.id
        );

    IF NOT FOUND THEN
        RAISE EXCEPTION '訂單不符合 FPS 出款條件或已處理';
    END IF;

    v_fps_id := NULLIF(btrim(v_fps_id), '');
    v_fps_name := NULLIF(btrim(v_fps_name), '');
    v_id_snapshot := COALESCE(v_fps_id, 'PENDING_FPS');
    v_name_snapshot := COALESCE(v_fps_name, 'PENDING_FPS_NAME');
    v_request_status := CASE
        WHEN v_fps_id IS NOT NULL AND v_fps_name IS NOT NULL
            THEN 'ready'::public.payout_request_status
        ELSE 'pending'::public.payout_request_status
    END;

    INSERT INTO public.payout_requests (
        order_id,
        seller_id,
        amount,
        fps_id_snapshot,
        fps_name_snapshot,
        status,
        ready_at
    )
    VALUES (
        p_order_id,
        v_seller_id,
        v_payout_amount,
        v_id_snapshot,
        v_name_snapshot,
        v_request_status,
        now()
    )
    ON CONFLICT (order_id) DO NOTHING
    RETURNING id INTO v_request_id;

    IF v_request_id IS NULL THEN
        SELECT pr.id INTO v_request_id
        FROM public.payout_requests pr
        WHERE pr.order_id = p_order_id;
    END IF;

    IF v_request_id IS NULL THEN
        RAISE EXCEPTION '無法建立 FPS 提現單';
    END IF;

    UPDATE public.member_orders
    SET
        seller_payout_status = 'ready',
        updated_at = now()
    WHERE id = p_order_id
        AND seller_payout_status = 'held';

    RETURN jsonb_build_object(
        'request_id', v_request_id,
        'status', v_request_status
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Merchant Connect payout: auth orders use inbound instead of shipping_fee
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_prepare_merchant_order_payout(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_merchant_id UUID;
    v_escrow_status public.escrow_state;
    v_payout_status TEXT;
    v_requires_auth BOOLEAN;
    v_item_subtotal NUMERIC;
    v_shipping_fee NUMERIC;
    v_inbound_shipping_fee NUMERIC;
    v_outbound_shipping_fee NUMERIC;
    v_auth_fee NUMERIC;
    v_total_amount NUMERIC;
    v_buyer_total NUMERIC;
    v_platform_subsidy NUMERIC;
    v_payment_intent_id TEXT;
    v_existing_rate NUMERIC;
    v_existing_commission NUMERIC;
    v_existing_payout NUMERIC;
    v_existing_transfer_id TEXT;
    v_existing_destination TEXT;
    v_buyer_confirmed_at TIMESTAMPTZ;
    v_payout_hold_until TIMESTAMPTZ;
    v_kyc_status public.kyc_state;
    v_charges_enabled BOOLEAN;
    v_payouts_enabled BOOLEAN;
    v_destination TEXT;
    v_commission_rate CONSTANT NUMERIC := 0.08;
    v_commission NUMERIC;
    v_payout NUMERIC;
    v_result_order_id UUID;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    SELECT
        mo.merchant_id,
        mo.escrow_status,
        mo.payout_status,
        COALESCE(mo.requires_authentication, false),
        mo.item_subtotal,
        mo.shipping_fee,
        mo.inbound_shipping_fee,
        mo.outbound_shipping_fee,
        mo.auth_fee,
        mo.total_amount,
        COALESCE(mo.buyer_total_amount, mo.total_amount),
        COALESCE(mo.platform_subsidy_amount, 0),
        mo.stripe_payment_intent_id,
        mo.commission_rate_applied,
        mo.commission_amount,
        mo.merchant_payout_amount,
        mo.stripe_transfer_id,
        mo.stripe_destination_account_id,
        mo.buyer_confirmed_at,
        mo.payout_hold_until
    INTO
        v_merchant_id,
        v_escrow_status,
        v_payout_status,
        v_requires_auth,
        v_item_subtotal,
        v_shipping_fee,
        v_inbound_shipping_fee,
        v_outbound_shipping_fee,
        v_auth_fee,
        v_total_amount,
        v_buyer_total,
        v_platform_subsidy,
        v_payment_intent_id,
        v_existing_rate,
        v_existing_commission,
        v_existing_payout,
        v_existing_transfer_id,
        v_existing_destination,
        v_buyer_confirmed_at,
        v_payout_hold_until
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id
    FOR UPDATE OF mo;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF v_existing_transfer_id IS NOT NULL
       AND v_escrow_status = 'completed_and_transferred'::public.escrow_state THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'order_id', p_order_id,
            'stripe_transfer_id', v_existing_transfer_id
        );
    END IF;

    IF v_escrow_status = 'completed_and_transferred'::public.escrow_state THEN
        RAISE EXCEPTION '此訂單已完成撥款。';
    END IF;

    IF v_payout_status = 'frozen' THEN
        RAISE EXCEPTION '訂單撥款已凍結，無法撥款。';
    END IF;

    IF v_buyer_confirmed_at IS NULL THEN
        RAISE EXCEPTION '買家尚未確認收貨。';
    END IF;

    IF v_payout_status IS DISTINCT FROM 'held' THEN
        RAISE EXCEPTION '訂單狀態不允許撥款。';
    END IF;

    IF v_payout_hold_until IS NULL OR v_payout_hold_until > now() THEN
        RAISE EXCEPTION '撥款保留期尚未屆滿。';
    END IF;

    IF v_existing_transfer_id IS NOT NULL THEN
        RAISE EXCEPTION '訂單已綁定 Stripe Transfer。';
    END IF;

    IF v_existing_destination IS NULL OR btrim(v_existing_destination) = '' THEN
        SELECT kr.stripe_account_id
        INTO v_destination
        FROM public.kyc_records kr
        WHERE kr.merchant_id = v_merchant_id
        LIMIT 1;
    ELSE
        v_destination := v_existing_destination;
    END IF;

    SELECT
        kr.kyc_status,
        kr.stripe_charges_enabled,
        kr.stripe_payouts_enabled,
        kr.stripe_account_id
    INTO
        v_kyc_status,
        v_charges_enabled,
        v_payouts_enabled,
        v_destination
    FROM public.kyc_records kr
    WHERE kr.merchant_id = v_merchant_id
    LIMIT 1;

    IF NOT FOUND
       OR v_kyc_status IS DISTINCT FROM 'verified'::public.kyc_state
       OR NOT COALESCE(v_charges_enabled, false)
       OR NOT COALESCE(v_payouts_enabled, false)
       OR v_destination IS NULL
       OR btrim(v_destination) = '' THEN
        RAISE EXCEPTION '商戶收款帳戶尚未通過驗證，暫時無法撥款。';
    END IF;

    IF v_payment_intent_id IS NULL OR btrim(v_payment_intent_id) = '' THEN
        RAISE EXCEPTION '訂單缺少有效付款憑證，無法撥款。';
    END IF;

    IF v_item_subtotal IS NULL
       OR v_item_subtotal <= 0
       OR v_total_amount IS NULL
       OR v_total_amount <= 0 THEN
        RAISE EXCEPTION '訂單金額資料不完整，無法撥款。';
    END IF;

    v_shipping_fee := COALESCE(v_shipping_fee, 0);
    v_inbound_shipping_fee := COALESCE(v_inbound_shipping_fee, 0);
    v_outbound_shipping_fee := COALESCE(v_outbound_shipping_fee, 0);
    v_auth_fee := COALESCE(v_auth_fee, 0);

    IF v_requires_auth THEN
        IF v_total_amount IS DISTINCT FROM
           (v_item_subtotal + v_auth_fee + v_inbound_shipping_fee + v_outbound_shipping_fee) THEN
            RAISE EXCEPTION '訂單金額明細不一致，已攔截撥款。';
        END IF;

        v_commission := round(v_item_subtotal * v_commission_rate, 2);
        v_payout := round(v_item_subtotal - v_commission + v_inbound_shipping_fee, 2);
    ELSE
        IF v_total_amount IS DISTINCT FROM
           (v_item_subtotal + v_shipping_fee + v_auth_fee) THEN
            RAISE EXCEPTION '訂單金額明細不一致，已攔截撥款。';
        END IF;

        v_commission := round(v_item_subtotal * v_commission_rate, 2);
        v_payout := round(v_item_subtotal - v_commission + v_shipping_fee, 2);
    END IF;

    IF v_buyer_total IS DISTINCT FROM (v_total_amount - v_platform_subsidy) THEN
        RAISE EXCEPTION '買家實付金額與補貼記錄不一致，已攔截撥款。';
    END IF;

    IF v_payout <= 0 THEN
        RAISE EXCEPTION '商戶撥款金額異常，已攔截撥款。';
    END IF;

    IF v_existing_rate IS NOT NULL
       AND (
           v_existing_rate IS DISTINCT FROM v_commission_rate
           OR v_existing_commission IS DISTINCT FROM v_commission
           OR v_existing_payout IS DISTINCT FROM v_payout
           OR v_existing_destination IS DISTINCT FROM v_destination
       ) THEN
        RAISE EXCEPTION '訂單撥款快照不一致，需由管理員處理。';
    END IF;

    UPDATE public.merchant_orders
    SET
        commission_rate_applied = COALESCE(commission_rate_applied, v_commission_rate),
        commission_amount = COALESCE(commission_amount, v_commission),
        merchant_payout_amount = COALESCE(merchant_payout_amount, v_payout),
        stripe_destination_account_id = COALESCE(stripe_destination_account_id, v_destination),
        payout_status = 'processing',
        payout_attempted_at = now(),
        payout_error = NULL,
        updated_at = now()
    WHERE id = p_order_id
    RETURNING
        id,
        stripe_payment_intent_id,
        total_amount,
        COALESCE(buyer_total_amount, total_amount),
        commission_amount,
        merchant_payout_amount,
        stripe_destination_account_id
    INTO
        v_result_order_id,
        v_payment_intent_id,
        v_total_amount,
        v_buyer_total,
        v_commission,
        v_payout,
        v_destination;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_id', v_result_order_id,
        'stripe_payment_intent_id', v_payment_intent_id,
        'total_amount', v_total_amount,
        'buyer_total_amount', v_buyer_total,
        'commission_amount', v_commission,
        'merchant_payout_amount', v_payout,
        'stripe_destination_account_id', v_destination
    );
END;
$$;
