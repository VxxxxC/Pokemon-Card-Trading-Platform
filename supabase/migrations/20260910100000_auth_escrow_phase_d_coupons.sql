-- Auth Escrow v2 Phase D: merchant auth checkout coupons aligned with v2 four-line amounts + single capture.

-- ---------------------------------------------------------------------------
-- 1. fn_compute_platform_subsidy — auth free_shipping uses outbound leg only
-- ---------------------------------------------------------------------------

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
    v_free_shipping_base NUMERIC;
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

    IF COALESCE(p_use_auth, false) THEN
        IF NOT (v_shipping_methods ? 'sf') THEN
            RAISE EXCEPTION '此免運券僅適用順豐配送';
        END IF;
        v_free_shipping_base := public.fn_platform_auth_sf_leg_fee();
        IF COALESCE(v_free_shipping_base, 0) <= 0 THEN
            RAISE EXCEPTION '此訂單結帳無運費可抵扣';
        END IF;
    ELSE
        IF NOT (v_shipping_methods ? 'sf') OR p_shipping_method IS DISTINCT FROM 'sf' THEN
            RAISE EXCEPTION '此免運券僅適用順豐配送';
        END IF;
        IF COALESCE(p_shipping_fee, 0) <= 0 THEN
            RAISE EXCEPTION '此訂單結帳無運費可抵扣';
        END IF;
        v_free_shipping_base := p_shipping_fee;
    END IF;

    v_max_subsidy := COALESCE((v_reward_value ->> 'max_subsidy_hkd')::numeric, 0);
    v_min_spend := COALESCE((v_reward_value ->> 'min_spend_hkd')::numeric, 0);
    IF v_max_subsidy <= 0 THEN
        RAISE EXCEPTION '免運補貼上限無效';
    END IF;
    IF p_item_subtotal < v_min_spend THEN
        RAISE EXCEPTION '未達免運券最低消費門檻';
    END IF;
    RETURN QUERY SELECT LEAST(v_free_shipping_base, v_max_subsidy), v_template.type;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. rpc_list_checkout_eligible_coupons — auth preview uses outbound leg
-- ---------------------------------------------------------------------------

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
        v_shipping_fee := public.fn_platform_auth_sf_leg_fee();
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

-- ---------------------------------------------------------------------------
-- 3. rpc_prepare_merchant_order_payment — auth always v2 + single (with coupon)
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
        v_escrow_capture_model := 'single';
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
        v_escrow_capture_model := NULL;
        v_shipping_fee := public.fn_merchant_checkout_shipping_fee(
            v_shipping_method,
            v_merchant_id,
            v_listing_id
        );
        v_auth_fee := public.fn_merchant_checkout_auth_fee(false);
        v_inbound_shipping_fee := 0;
        v_outbound_shipping_fee := 0;
        v_total := v_final_price + v_shipping_fee + v_auth_fee;
        v_buyer_total := v_total;
    END IF;

    v_coupon_type := NULL;
    v_subsidy := 0;

    IF p_user_reward_id IS NOT NULL THEN
        IF COALESCE(p_use_auth, false) THEN
            v_subsidy_shipping_fee := v_outbound_shipping_fee;
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

        PERFORM public.fn_reserve_user_reward_for_merchant_order(
            p_user_reward_id,
            v_buyer_id,
            p_order_id
        );
    ELSE
        PERFORM public.fn_release_merchant_order_coupon(p_order_id);
    END IF;

    IF COALESCE(p_use_auth, false) THEN
        v_buyer_total := GREATEST(v_total - COALESCE(v_subsidy, 0), 0);
    ELSE
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
            WHEN COALESCE(p_use_auth, false) THEN v_inbound_shipping_fee
            ELSE inbound_shipping_fee
        END,
        outbound_shipping_fee = CASE
            WHEN COALESCE(p_use_auth, false) THEN v_outbound_shipping_fee
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
