-- Platform Rewards Phase 2b: merchant_auth checkout coupons (discount + free-shipping).

DROP FUNCTION IF EXISTS public.rpc_list_checkout_eligible_coupons(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.fn_compute_platform_subsidy(
    p_user_reward_id UUID,
    p_buyer_id UUID,
    p_item_subtotal NUMERIC,
    p_shipping_fee NUMERIC,
    p_shipping_method TEXT,
    p_use_auth BOOLEAN,
    p_order_id UUID DEFAULT NULL
)
RETURNS TABLE (
    subsidy_amount NUMERIC,
    coupon_type public.reward_type
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_row public.user_rewards%ROWTYPE;
    v_template public.reward_templates%ROWTYPE;
    v_reward_value JSONB;
    v_restrictions JSONB;
    v_amount NUMERIC;
    v_min_spend NUMERIC;
    v_max_subsidy NUMERIC;
    v_auth_restriction TEXT;
    v_order_kinds JSONB;
    v_shipping_methods JSONB;
    v_min_item_subtotal NUMERIC;
BEGIN
    IF p_user_reward_id IS NULL THEN
        RETURN QUERY SELECT 0::NUMERIC, NULL::public.reward_type;
        RETURN;
    END IF;

    SELECT ur.*
    INTO v_row
    FROM public.user_rewards ur
    WHERE ur.id = p_user_reward_id;

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
       AND p_order_id IS NOT NULL
       AND v_row.reserved_merchant_order_id IS DISTINCT FROM p_order_id THEN
        RAISE EXCEPTION '此優惠券已被其他訂單預留';
    END IF;

    SELECT rt.*
    INTO v_template
    FROM public.reward_templates rt
    WHERE rt.id = v_row.template_id;

    IF NOT FOUND
       OR v_template.status IS DISTINCT FROM 'active'::public.reward_template_status
       OR COALESCE(v_template.is_active, false) = false THEN
        RAISE EXCEPTION '優惠券模板不可用';
    END IF;

    IF v_template.type NOT IN ('discount_coupon', 'free_shipping') THEN
        RAISE EXCEPTION '此獎勵不可用於結帳';
    END IF;

    v_reward_value := COALESCE(v_template.reward_value, '{}'::jsonb);
    v_restrictions := COALESCE(v_template.restrictions, '{}'::jsonb);
    v_order_kinds := COALESCE(v_restrictions -> 'order_kinds', '["merchant"]'::jsonb);
    v_auth_restriction := COALESCE(v_restrictions ->> 'requires_authentication', 'any');
    v_min_item_subtotal := COALESCE((v_restrictions ->> 'min_item_subtotal_hkd')::numeric, 0);

    IF NOT (v_order_kinds ? 'merchant') THEN
        RAISE EXCEPTION '此優惠券不適用於商戶訂單';
    END IF;

    IF v_auth_restriction = 'false' AND COALESCE(p_use_auth, false) THEN
        RAISE EXCEPTION '此優惠券不適用於鑑定訂單';
    END IF;

    IF v_auth_restriction = 'true' AND NOT COALESCE(p_use_auth, false) THEN
        RAISE EXCEPTION '此優惠券僅適用於鑑定訂單';
    END IF;

    IF p_item_subtotal < v_min_item_subtotal THEN
        RAISE EXCEPTION '未達優惠券最低消費門檻';
    END IF;

    IF v_template.type = 'discount_coupon'::public.reward_type THEN
        v_amount := COALESCE((v_reward_value ->> 'amount_hkd')::numeric, 0);
        v_min_spend := COALESCE((v_reward_value ->> 'min_spend_hkd')::numeric, 0);
        IF v_amount <= 0 THEN
            RAISE EXCEPTION '優惠券面額無效';
        END IF;
        IF p_item_subtotal < v_min_spend THEN
            RAISE EXCEPTION '未達優惠券最低消費門檻';
        END IF;
        RETURN QUERY SELECT LEAST(v_amount, p_item_subtotal), v_template.type;
        RETURN;
    END IF;

    -- free_shipping
    v_shipping_methods := COALESCE(v_restrictions -> 'shipping_methods', '["sf"]'::jsonb);
    IF NOT (v_shipping_methods ? 'sf') OR p_shipping_method IS DISTINCT FROM 'sf' THEN
        RAISE EXCEPTION '此免運券僅適用順豐配送';
    END IF;
    IF COALESCE(p_shipping_fee, 0) <= 0 THEN
        RAISE EXCEPTION '此訂單結帳無運費可抵扣';
    END IF;
    v_max_subsidy := COALESCE((v_reward_value ->> 'max_subsidy_hkd')::numeric, 0);
    v_min_spend := COALESCE((v_reward_value ->> 'min_spend_hkd')::numeric, 0);
    IF v_max_subsidy <= 0 THEN
        RAISE EXCEPTION '免運補貼上限無效';
    END IF;
    IF p_item_subtotal < v_min_spend THEN
        RAISE EXCEPTION '未達免運券最低消費門檻';
    END IF;
    RETURN QUERY SELECT LEAST(p_shipping_fee, v_max_subsidy), v_template.type;
END;
$$;


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
        reserved_merchant_order_id = NULL
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

REVOKE ALL ON FUNCTION public.fn_restore_merchant_order_coupon_on_void(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_restore_merchant_order_coupon_on_void(UUID)
    TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.rpc_list_checkout_eligible_coupons(
    p_order_id UUID,
    p_shipping_method TEXT DEFAULT 'sf',
    p_use_auth BOOLEAN DEFAULT false
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
    v_item_subtotal NUMERIC;
    v_shipping_fee NUMERIC;
    v_requires_auth BOOLEAN;
    v_effective_auth BOOLEAN;
    v_shipping_method TEXT;
    v_result JSONB := '[]'::jsonb;
    v_row RECORD;
    v_reason TEXT;
    v_subsidy NUMERIC;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '請先登入';
    END IF;

    SELECT
        mo.buyer_id,
        mo.merchant_id,
        mo.listing_id,
        COALESCE(mo.item_subtotal, mo.final_price),
        COALESCE(mo.requires_authentication, false)
    INTO
        v_buyer_id,
        v_merchant_id,
        v_listing_id,
        v_item_subtotal,
        v_requires_auth
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF auth.uid() IS DISTINCT FROM v_buyer_id THEN
        RAISE EXCEPTION '保安攔截：僅買家本人可查看優惠券。';
    END IF;

    v_effective_auth := COALESCE(p_use_auth, false) OR COALESCE(v_requires_auth, false);

    IF v_effective_auth THEN
        v_shipping_method := 'sf';
        v_shipping_fee := public.fn_merchant_checkout_shipping_fee(
            v_shipping_method,
            v_merchant_id,
            v_listing_id
        );
    ELSE
        v_shipping_method := COALESCE(NULLIF(btrim(p_shipping_method), ''), 'sf');
        v_shipping_fee := public.fn_merchant_checkout_shipping_fee(
            v_shipping_method,
            v_merchant_id,
            v_listing_id
        );
    END IF;

    FOR v_row IN
        SELECT ur.id, ur.is_used, ur.calculated_expiry, ur.reserved_merchant_order_id,
               rt.title, rt.type, rt.reward_value, rt.status
        FROM public.user_rewards ur
        INNER JOIN public.reward_templates rt ON rt.id = ur.template_id
        WHERE ur.user_id = v_buyer_id
          AND rt.type IN ('discount_coupon', 'free_shipping')
        ORDER BY ur.created_at DESC
    LOOP
        v_reason := NULL;
        v_subsidy := 0;

        IF COALESCE(v_row.is_used, false) THEN
            v_reason := '已使用';
        ELSIF v_row.calculated_expiry IS NOT NULL AND v_row.calculated_expiry < now() THEN
            v_reason := '已過期';
        ELSIF v_row.reserved_merchant_order_id IS NOT NULL
              AND v_row.reserved_merchant_order_id IS DISTINCT FROM p_order_id THEN
            v_reason := '已被其他訂單預留';
        ELSIF v_row.status IS DISTINCT FROM 'active'::public.reward_template_status THEN
            v_reason := '模板未發布';
        ELSE
            BEGIN
                SELECT s.subsidy_amount
                INTO v_subsidy
                FROM public.fn_compute_platform_subsidy(
                    v_row.id,
                    v_buyer_id,
                    v_item_subtotal,
                    v_shipping_fee,
                    v_shipping_method,
                    v_effective_auth,
                    p_order_id
                ) AS s;
            EXCEPTION
                WHEN OTHERS THEN
                    v_reason := SQLERRM;
                    v_subsidy := 0;
            END;
        END IF;

        v_result := v_result || jsonb_build_array(
            jsonb_build_object(
                'id', v_row.id,
                'title', v_row.title,
                'type', v_row.type,
                'reward_value', v_row.reward_value,
                'eligible', (v_reason IS NULL),
                'ineligible_reason', v_reason,
                'preview_subsidy', COALESCE(v_subsidy, 0)
            )
        );
    END LOOP;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_list_checkout_eligible_coupons(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_list_checkout_eligible_coupons(UUID, TEXT, BOOLEAN)
    TO authenticated, service_role;


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
        PERFORM 1
        FROM public.user_rewards ur
        WHERE ur.id = p_user_reward_id
        FOR UPDATE;

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

        UPDATE public.user_rewards ur
        SET reserved_merchant_order_id = p_order_id
        WHERE ur.id = p_user_reward_id
          AND ur.user_id = v_buyer_id
          AND COALESCE(ur.is_used, false) = false;
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

REVOKE ALL ON FUNCTION public.rpc_prepare_merchant_order_payment(
    UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_merchant_order_payment(
    UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO authenticated, service_role;


-- Multicapture: goods amount = buyer_total - auth_fee (subsidy-aware).
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
            COALESCE(mo.item_subtotal, mo.final_price),
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
            COALESCE(mo.buyer_total_amount, mo.total_amount) - COALESCE(mo.auth_fee, 0),
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
            COALESCE(mo.item_subtotal, mo.final_price),
            mo.escrow_status::TEXT
        INTO v_capture_status, v_auth_fee, v_goods_amount, v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        v_expected_total_cents := ROUND(
            (COALESCE(v_auth_fee, 0) + COALESCE(v_goods_amount, 0)) * 100
        )::INTEGER;

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
            COALESCE(mo.buyer_total_amount, mo.total_amount) - COALESCE(mo.auth_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount),
            mo.escrow_status::TEXT
        INTO v_capture_status, v_auth_fee, v_goods_amount, v_buyer_total, v_from_status
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

        IF COALESCE(v_auth_fee, 0) + COALESCE(v_goods_amount, 0)
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


CREATE OR REPLACE FUNCTION public.rpc_finalize_auth_grading_fail(
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
    v_listing_id UUID;
    v_from_status TEXT;
    v_fault_party public.grading_fault_party;
    v_updated RECORD;
    v_admin_id UUID;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    IF p_order_kind = 'member' THEN
        SELECT
            mo.escrow_status::TEXT,
            mo.listing_id,
            mo.fault_party
        INTO v_from_status, v_listing_id, v_fault_party
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
          AND mo.stripe_payment_intent_id = p_payment_intent_id
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.member_orders mo
            WHERE mo.id = p_order_id
              AND mo.auth_result = 'failed'
              AND mo.escrow_status = 'cancelled'::public.member_escrow_status
        ) THEN
            RETURN jsonb_build_object('success', true, 'already_applied', true);
        END IF;

        UPDATE public.member_orders
        SET
            escrow_status = 'cancelled'::public.member_escrow_status,
            status = 'cancelled',
            auth_result = 'failed',
            auth_graded_at = now(),
            refund_status = 'none',
            refund_error = NULL,
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status = 'processing'
          AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗 finalize 失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.escrow_status::TEXT,
            mo.listing_id,
            mo.fault_party
        INTO v_from_status, v_listing_id, v_fault_party
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
          AND mo.stripe_payment_intent_id = p_payment_intent_id
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.merchant_orders mo
            WHERE mo.id = p_order_id
              AND mo.auth_result = 'failed'
              AND mo.escrow_status = 'refunded'::public.escrow_state
        ) THEN
            RETURN jsonb_build_object('success', true, 'already_applied', true);
        END IF;

        UPDATE public.merchant_orders
        SET
            escrow_status = 'refunded'::public.escrow_state,
            auth_result = 'failed',
            auth_graded_at = now(),
            refund_status = 'none',
            refund_error = NULL,
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status = 'processing'
          AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗 finalize 失敗：訂單狀態不合法。';
        END IF;

        PERFORM public.fn_restore_merchant_order_coupon_on_void(p_order_id);
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    UPDATE public.listings
    SET status = 'active'
    WHERE id = v_listing_id
      AND status = 'sold';

    SELECT gal.admin_id
    INTO v_admin_id
    FROM public.grading_audit_logs gal
    WHERE gal.order_kind = p_order_kind
      AND gal.order_id = p_order_id
      AND gal.action = 'prepare_fail_void'
    ORDER BY gal.created_at DESC
    LIMIT 1;

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        COALESCE(v_admin_id, auth.uid()),
        'fail_grading_void',
        v_from_status,
        CASE WHEN p_order_kind = 'member' THEN 'cancelled' ELSE 'refunded' END,
        COALESCE(v_fault_party::TEXT, '')
    );

    RETURN jsonb_build_object('success', true, 'order', to_jsonb(v_updated));
END;
$$;
