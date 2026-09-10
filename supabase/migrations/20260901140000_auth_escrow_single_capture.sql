-- Auth Escrow v2: single capture at pass (no multicapture intake partial capture).
-- New orders: escrow_capture_model = 'single'. Legacy in-flight: NULL (staged multicapture).

-- ---------------------------------------------------------------------------
-- 1. Order marker
-- ---------------------------------------------------------------------------

ALTER TABLE public.member_orders
    ADD COLUMN IF NOT EXISTS escrow_capture_model TEXT;

ALTER TABLE public.merchant_orders
    ADD COLUMN IF NOT EXISTS escrow_capture_model TEXT;

COMMENT ON COLUMN public.member_orders.escrow_capture_model IS
    'Auth escrow capture model: single = full capture at pass; NULL = legacy staged multicapture.';
COMMENT ON COLUMN public.merchant_orders.escrow_capture_model IS
    'Auth escrow capture model: single = full capture at pass; NULL = legacy staged multicapture.';

-- ---------------------------------------------------------------------------
-- 2. Member auth prepare: stamp single capture model
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
            'stripe_payment_intent_id', v_payment_intent_id,
            'escrow_capture_model', 'single'
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
        escrow_capture_model = 'single',
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
        'stripe_payment_intent_id', v_payment_intent_id,
        'escrow_capture_model', 'single'
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Merchant auth prepare (v2 no-coupon): stamp single capture model
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
    v_escrow_capture_model TEXT;
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
    v_escrow_capture_model := CASE
        WHEN v_use_v2_auth_amounts THEN 'single'
        ELSE NULL
    END;

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
        escrow_capture_model = v_escrow_capture_model,
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
        'stripe_payment_intent_id', v_payment_intent_id,
        'escrow_capture_model', v_escrow_capture_model
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Staged intake capture: reject single-model orders
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
    v_capture_model TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_order_kind = 'member' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.auth_fee,
            mo.inbound_shipping_fee,
            mo.payment_capture_status,
            mo.escrow_status::TEXT,
            mo.escrow_capture_model
        INTO v_pi, v_auth_fee, v_inbound, v_capture_status, v_from_status, v_capture_model
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF v_capture_model = 'single' THEN
            RAISE EXCEPTION '此訂單使用單次扣款流程，請使用入庫確認（不扣款）。';
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
            mo.escrow_status::TEXT,
            mo.escrow_capture_model
        INTO v_pi, v_auth_fee, v_inbound, v_capture_status, v_from_status, v_capture_model
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF v_capture_model = 'single' THEN
            RAISE EXCEPTION '此訂單使用單次扣款流程，請使用入庫確認（不扣款）。';
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

-- ---------------------------------------------------------------------------
-- 5. Single-model intake confirm (no Stripe capture)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_prepare_auth_intake_confirm(
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
    v_buyer_total NUMERIC;
    v_buyer_total_cents INTEGER;
    v_capture_status public.payment_capture_status;
    v_from_status TEXT;
    v_capture_model TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_order_kind = 'member' THEN
        SELECT
            mo.stripe_payment_intent_id,
            COALESCE(mo.buyer_total_amount, mo.total_amount),
            mo.payment_capture_status,
            mo.escrow_status::TEXT,
            mo.escrow_capture_model
        INTO v_pi, v_buyer_total, v_capture_status, v_from_status, v_capture_model
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF v_capture_model IS DISTINCT FROM 'single' THEN
            RAISE EXCEPTION '此訂單非單次扣款流程，請使用舊版入庫扣款。';
        END IF;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RAISE EXCEPTION '訂單已完成全額扣款。';
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.member_orders mo
            WHERE mo.id = p_order_id AND mo.platform_received_at IS NOT NULL
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'order_kind', p_order_kind,
                'order_id', p_order_id,
                'payment_intent_id', v_pi,
                'buyer_total_cents', ROUND(COALESCE(v_buyer_total, 0) * 100)::INTEGER,
                'admin_id', v_admin_id,
                'escrow_capture_model', 'single'
            );
        END IF;

        IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
            RAISE EXCEPTION '入庫確認失敗：訂單尚未完成授權付款。';
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
              AND mo.payment_capture_status = 'authorized'::public.payment_capture_status
        ) THEN
            RAISE EXCEPTION '入庫確認失敗：訂單狀態不合法或尚未提交入庫物流。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.stripe_payment_intent_id,
            COALESCE(mo.buyer_total_amount, mo.total_amount),
            mo.payment_capture_status,
            mo.escrow_status::TEXT,
            mo.escrow_capture_model
        INTO v_pi, v_buyer_total, v_capture_status, v_from_status, v_capture_model
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF v_capture_model IS DISTINCT FROM 'single' THEN
            RAISE EXCEPTION '此訂單非單次扣款流程，請使用舊版入庫扣款。';
        END IF;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RAISE EXCEPTION '訂單已完成全額扣款。';
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.merchant_orders mo
            WHERE mo.id = p_order_id AND mo.platform_received_at IS NOT NULL
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'order_kind', p_order_kind,
                'order_id', p_order_id,
                'payment_intent_id', v_pi,
                'buyer_total_cents', ROUND(COALESCE(v_buyer_total, 0) * 100)::INTEGER,
                'admin_id', v_admin_id,
                'escrow_capture_model', 'single'
            );
        END IF;

        IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
            RAISE EXCEPTION '入庫確認失敗：訂單尚未完成授權付款。';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.merchant_orders mo
            WHERE mo.id = p_order_id
              AND mo.inbound_tracking_no IS NOT NULL
              AND btrim(mo.inbound_tracking_no) <> ''
              AND mo.platform_received_at IS NULL
              AND mo.escrow_status = 'payment_held'::public.escrow_state
              AND mo.payment_capture_status = 'authorized'::public.payment_capture_status
        ) THEN
            RAISE EXCEPTION '入庫確認失敗：訂單狀態不合法或尚未提交入庫物流。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_pi IS NULL OR btrim(v_pi) = '' THEN
        RAISE EXCEPTION '入庫確認失敗：找不到 Stripe PaymentIntent。';
    END IF;

    v_buyer_total_cents := ROUND(COALESCE(v_buyer_total, 0) * 100)::INTEGER;
    IF v_buyer_total_cents <= 0 THEN
        RAISE EXCEPTION '入庫確認失敗：買家實付金額異常。';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_kind', p_order_kind,
        'order_id', p_order_id,
        'payment_intent_id', v_pi,
        'buyer_total_cents', v_buyer_total_cents,
        'admin_id', v_admin_id,
        'from_status', v_from_status,
        'escrow_capture_model', 'single'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_finalize_auth_intake_confirm(
    p_order_kind TEXT,
    p_order_id UUID,
    p_payment_intent_id TEXT,
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capture_status public.payment_capture_status;
    v_from_status TEXT;
    v_admin_id UUID;
    v_updated RECORD;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    v_admin_id := p_admin_id;

    IF p_order_kind = 'member' THEN
        SELECT mo.payment_capture_status, mo.escrow_status::TEXT
        INTO v_capture_status, v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
          AND mo.escrow_capture_model = 'single'
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.member_orders mo
            WHERE mo.id = p_order_id AND mo.platform_received_at IS NOT NULL
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        UPDATE public.member_orders
        SET
            escrow_status = 'grading'::public.member_escrow_status,
            platform_received_at = now(),
            auth_fee_captured_at = now(),
            payment_capture_status = 'authorized'::public.payment_capture_status,
            updated_at = now()
        WHERE id = p_order_id
          AND use_authentication = true
          AND escrow_capture_model = 'single'
          AND escrow_status = 'custody'::public.member_escrow_status
          AND payment_capture_status = 'authorized'::public.payment_capture_status
          AND platform_received_at IS NULL
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '入庫確認失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT mo.payment_capture_status, mo.escrow_status::TEXT
        INTO v_capture_status, v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
          AND mo.escrow_capture_model = 'single'
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.merchant_orders mo
            WHERE mo.id = p_order_id AND mo.platform_received_at IS NOT NULL
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        UPDATE public.merchant_orders
        SET
            escrow_status = 'authenticating'::public.escrow_state,
            platform_received_at = now(),
            auth_fee_captured_at = now(),
            payment_capture_status = 'authorized'::public.payment_capture_status,
            updated_at = now()
        WHERE id = p_order_id
          AND requires_authentication = true
          AND escrow_capture_model = 'single'
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
        'payment_capture_status', 'authorized',
        'order', to_jsonb(v_updated)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_prepare_auth_intake_confirm(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_auth_intake_confirm(TEXT, UUID)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_finalize_auth_intake_confirm(TEXT, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_auth_intake_confirm(TEXT, UUID, TEXT, UUID)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Admin refresh PI during intake (re-auth)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_refresh_auth_escrow_payment_intent(
    p_order_kind TEXT,
    p_order_id UUID,
    p_payment_intent_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    IF p_order_kind = 'member' THEN
        UPDATE public.member_orders
        SET
            stripe_payment_intent_id = p_payment_intent_id,
            updated_at = now()
        WHERE id = p_order_id
          AND use_authentication = true
          AND escrow_capture_model = 'single'
          AND payment_capture_status = 'authorized'::public.payment_capture_status
          AND escrow_status IN (
              'custody'::public.member_escrow_status,
              'grading'::public.member_escrow_status
          );

        IF NOT FOUND THEN
            RAISE EXCEPTION '無法更新付款憑證：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        UPDATE public.merchant_orders
        SET
            stripe_payment_intent_id = p_payment_intent_id,
            updated_at = now()
        WHERE id = p_order_id
          AND requires_authentication = true
          AND escrow_capture_model = 'single'
          AND payment_capture_status = 'authorized'::public.payment_capture_status
          AND escrow_status IN (
              'payment_held'::public.escrow_state,
              'authenticating'::public.escrow_state
          );

        IF NOT FOUND THEN
            RAISE EXCEPTION '無法更新付款憑證：訂單狀態不合法。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_kind', p_order_kind,
        'order_id', p_order_id,
        'stripe_payment_intent_id', p_payment_intent_id,
        'admin_id', v_admin_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_refresh_auth_escrow_payment_intent(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_refresh_auth_escrow_payment_intent(TEXT, UUID, TEXT)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Pass capture: single full amount vs staged goods leg
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
    v_capture_amount NUMERIC;
    v_buyer_total NUMERIC;
    v_from_status TEXT;
    v_capture_model TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_order_kind = 'member' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            mo.escrow_capture_model,
            COALESCE(mo.buyer_total_amount, mo.total_amount),
            CASE
                WHEN mo.escrow_capture_model = 'single' THEN
                    COALESCE(mo.buyer_total_amount, mo.total_amount)
                ELSE
                    COALESCE(mo.buyer_total_amount, mo.total_amount)
                        - COALESCE(mo.auth_fee, 0)
                        - COALESCE(mo.inbound_shipping_fee, 0)
            END,
            mo.escrow_status::TEXT
        INTO v_pi, v_capture_status, v_capture_model, v_buyer_total, v_capture_amount, v_from_status
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
                'goods_cents', ROUND(COALESCE(v_capture_amount, 0) * 100)::INTEGER,
                'capture_cents', ROUND(COALESCE(v_capture_amount, 0) * 100)::INTEGER,
                'admin_id', v_admin_id,
                'escrow_capture_model', v_capture_model
            );
        END IF;

        IF v_capture_model = 'single' THEN
            IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
                RAISE EXCEPTION '鑑定通過扣款失敗：訂單尚未完成授權付款。';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.member_orders mo
                WHERE mo.id = p_order_id
                  AND mo.platform_received_at IS NOT NULL
                  AND mo.escrow_status = 'grading'::public.member_escrow_status
                  AND mo.status = 'pending'
                  AND mo.auth_result IS NULL
            ) THEN
                RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
            END IF;
        ELSE
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
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            mo.escrow_capture_model,
            COALESCE(mo.buyer_total_amount, mo.total_amount),
            CASE
                WHEN mo.escrow_capture_model = 'single' THEN
                    COALESCE(mo.buyer_total_amount, mo.total_amount)
                ELSE
                    COALESCE(mo.buyer_total_amount, mo.total_amount)
                        - COALESCE(mo.auth_fee, 0)
                        - COALESCE(mo.inbound_shipping_fee, 0)
            END,
            mo.escrow_status::TEXT
        INTO v_pi, v_capture_status, v_capture_model, v_buyer_total, v_capture_amount, v_from_status
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
                'goods_cents', ROUND(COALESCE(v_capture_amount, 0) * 100)::INTEGER,
                'capture_cents', ROUND(COALESCE(v_capture_amount, 0) * 100)::INTEGER,
                'admin_id', v_admin_id,
                'escrow_capture_model', v_capture_model
            );
        END IF;

        IF v_capture_model = 'single' THEN
            IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
                RAISE EXCEPTION '鑑定通過扣款失敗：訂單尚未完成授權付款。';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.merchant_orders mo
                WHERE mo.id = p_order_id
                  AND mo.platform_received_at IS NOT NULL
                  AND mo.escrow_status = 'authenticating'::public.escrow_state
                  AND mo.auth_result IS NULL
            ) THEN
                RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
            END IF;
        ELSE
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
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_pi IS NULL OR btrim(v_pi) = '' THEN
        RAISE EXCEPTION '鑑定通過扣款失敗：找不到 Stripe PaymentIntent。';
    END IF;

    IF COALESCE(v_capture_amount, 0) <= 0 THEN
        RAISE EXCEPTION '鑑定通過扣款失敗：扣款金額異常。';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_kind', p_order_kind,
        'order_id', p_order_id,
        'payment_intent_id', v_pi,
        'goods_cents', ROUND(v_capture_amount * 100)::INTEGER,
        'capture_cents', ROUND(v_capture_amount * 100)::INTEGER,
        'admin_id', v_admin_id,
        'from_status', v_from_status,
        'notes', NULLIF(trim(COALESCE(p_notes, '')), ''),
        'escrow_capture_model', v_capture_model
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
    v_expected_cents INTEGER;
    v_from_status TEXT;
    v_admin_id UUID;
    v_capture_model TEXT;
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
            mo.escrow_capture_model,
            COALESCE(mo.buyer_total_amount, mo.total_amount)
                - COALESCE(mo.auth_fee, 0)
                - COALESCE(mo.inbound_shipping_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount),
            mo.escrow_status::TEXT
        INTO v_capture_status, v_auth_fee, v_inbound, v_capture_model, v_goods_amount, v_buyer_total, v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        v_expected_cents := ROUND(COALESCE(v_buyer_total, 0) * 100)::INTEGER;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        IF p_captured_amount_cents <> v_expected_cents THEN
            RAISE EXCEPTION '鑑定通過扣款金額與訂單總額不符。';
        END IF;

        IF v_capture_model IS DISTINCT FROM 'single' THEN
            IF COALESCE(v_auth_fee, 0) + COALESCE(v_inbound, 0) + COALESCE(v_goods_amount, 0)
               IS DISTINCT FROM COALESCE(v_buyer_total, 0) THEN
                RAISE EXCEPTION '鑑定通過扣款金額與買家實付不符。';
            END IF;
        END IF;

        IF v_capture_model = 'single' THEN
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
              AND escrow_capture_model = 'single'
              AND escrow_status = 'grading'::public.member_escrow_status
              AND payment_capture_status = 'authorized'::public.payment_capture_status
              AND status = 'pending'
            RETURNING * INTO v_updated;
        ELSE
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
        END IF;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.payment_capture_status,
            mo.auth_fee,
            mo.inbound_shipping_fee,
            mo.escrow_capture_model,
            COALESCE(mo.buyer_total_amount, mo.total_amount)
                - COALESCE(mo.auth_fee, 0)
                - COALESCE(mo.inbound_shipping_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount),
            mo.escrow_status::TEXT
        INTO v_capture_status, v_auth_fee, v_inbound, v_capture_model, v_goods_amount, v_buyer_total, v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        v_expected_cents := ROUND(COALESCE(v_buyer_total, 0) * 100)::INTEGER;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        IF p_captured_amount_cents <> v_expected_cents THEN
            RAISE EXCEPTION '鑑定通過扣款金額與訂單總額不符。';
        END IF;

        IF v_capture_model IS DISTINCT FROM 'single' THEN
            IF COALESCE(v_auth_fee, 0) + COALESCE(v_inbound, 0) + COALESCE(v_goods_amount, 0)
               IS DISTINCT FROM COALESCE(v_buyer_total, 0) THEN
                RAISE EXCEPTION '鑑定通過扣款金額與買家實付不符。';
            END IF;
        END IF;

        IF v_capture_model = 'single' THEN
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
              AND escrow_capture_model = 'single'
              AND escrow_status = 'authenticating'::public.escrow_state
              AND payment_capture_status = 'authorized'::public.payment_capture_status
            RETURNING * INTO v_updated;
        ELSE
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
        END IF;

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
-- 8. Grading fail: allow single-model authorized orders after intake
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_prepare_auth_grading_fail(
    p_order_kind TEXT,
    p_order_id UUID,
    p_fault_party public.grading_fault_party,
    p_reason TEXT DEFAULT NULL
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
    v_from_status TEXT;
    v_capture_model TEXT;
    v_void_mode TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_fault_party IS NULL THEN
        RAISE EXCEPTION '請選擇責任方（fault_party）。';
    END IF;

    IF p_order_kind = 'member' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            mo.escrow_status::TEXT,
            mo.escrow_capture_model
        INTO v_pi, v_capture_status, v_from_status, v_capture_model
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF v_capture_model = 'single' THEN
            IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
                RAISE EXCEPTION '鑑定失敗處理失敗：訂單付款狀態不合法。';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.member_orders mo
                WHERE mo.id = p_order_id
                  AND mo.platform_received_at IS NOT NULL
                  AND mo.escrow_status = 'grading'::public.member_escrow_status
                  AND mo.status = 'pending'
                  AND mo.auth_result IS NULL
            ) THEN
                RAISE EXCEPTION '僅鑑定中的訂單可標記失敗。';
            END IF;

            v_void_mode := 'cancel';
        ELSE
            IF v_capture_status IS DISTINCT FROM 'auth_fee_captured'::public.payment_capture_status THEN
                RAISE EXCEPTION '鑑定失敗處理失敗：訂單付款狀態不合法。';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.member_orders mo
                WHERE mo.id = p_order_id
                  AND mo.escrow_status = 'grading'::public.member_escrow_status
                  AND mo.status = 'pending'
                  AND mo.auth_result IS NULL
            ) THEN
                RAISE EXCEPTION '僅鑑定中的訂單可標記失敗。';
            END IF;

            v_void_mode := 'capture_zero';
        END IF;

        UPDATE public.member_orders
        SET
            refund_status = 'processing',
            fault_party = p_fault_party,
            auth_notes = COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), auth_notes),
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status IN ('none', 'failed');

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗處理已在進行中或已完成。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            mo.escrow_status::TEXT,
            mo.escrow_capture_model
        INTO v_pi, v_capture_status, v_from_status, v_capture_model
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF v_capture_model = 'single' THEN
            IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
                RAISE EXCEPTION '鑑定失敗處理失敗：訂單付款狀態不合法。';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.merchant_orders mo
                WHERE mo.id = p_order_id
                  AND mo.platform_received_at IS NOT NULL
                  AND mo.escrow_status = 'authenticating'::public.escrow_state
                  AND mo.auth_result IS NULL
            ) THEN
                RAISE EXCEPTION '僅鑑定中的訂單可標記失敗。';
            END IF;

            v_void_mode := 'cancel';
        ELSE
            IF v_capture_status IS DISTINCT FROM 'auth_fee_captured'::public.payment_capture_status THEN
                RAISE EXCEPTION '鑑定失敗處理失敗：訂單付款狀態不合法。';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.merchant_orders mo
                WHERE mo.id = p_order_id
                  AND mo.escrow_status = 'authenticating'::public.escrow_state
                  AND mo.auth_result IS NULL
            ) THEN
                RAISE EXCEPTION '僅鑑定中的訂單可標記失敗。';
            END IF;

            v_void_mode := 'capture_zero';
        END IF;

        UPDATE public.merchant_orders
        SET
            refund_status = 'processing',
            fault_party = p_fault_party,
            auth_notes = COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), auth_notes),
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status IN ('none', 'failed');

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗處理已在進行中或已完成。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_pi IS NULL OR btrim(v_pi) = '' THEN
        RAISE EXCEPTION '訂單缺少有效付款憑證，無法釋放餘額。';
    END IF;

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        v_admin_id,
        'fail_grading',
        v_from_status,
        CASE WHEN p_order_kind = 'member' THEN 'grading' ELSE 'authenticating' END,
        NULLIF(trim(COALESCE(p_reason, '')), '')
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_kind', p_order_kind,
        'order_id', p_order_id,
        'payment_intent_id', v_pi,
        'admin_id', v_admin_id,
        'fault_party', p_fault_party,
        'escrow_capture_model', v_capture_model,
        'void_mode', v_void_mode
    );
END;
$$;
