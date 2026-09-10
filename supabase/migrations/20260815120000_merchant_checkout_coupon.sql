-- Platform Rewards Phase 2: merchant_direct checkout coupons (non-auth only).

ALTER TABLE public.merchant_orders
    ADD COLUMN IF NOT EXISTS coupon_user_reward_id UUID REFERENCES public.user_rewards (id),
    ADD COLUMN IF NOT EXISTS coupon_type public.reward_type,
    ADD COLUMN IF NOT EXISTS platform_subsidy_amount NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS buyer_total_amount NUMERIC;

ALTER TABLE public.user_rewards
    ADD COLUMN IF NOT EXISTS reserved_merchant_order_id UUID REFERENCES public.merchant_orders (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_rewards_reserved_merchant_order
    ON public.user_rewards (reserved_merchant_order_id)
    WHERE reserved_merchant_order_id IS NOT NULL;


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
    SET reserved_merchant_order_id = NULL
    WHERE ur.reserved_merchant_order_id = p_order_id
      AND ur.used_at IS NULL
      AND COALESCE(ur.is_used, false) = false;

    IF v_coupon_id IS NOT NULL THEN
        UPDATE public.user_rewards ur
        SET reserved_merchant_order_id = NULL
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

REVOKE ALL ON FUNCTION public.fn_release_merchant_order_coupon(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_release_merchant_order_coupon(UUID)
    TO authenticated, service_role;


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

    IF COALESCE(p_use_auth, false) THEN
        RAISE EXCEPTION '鑑定訂單暫不支援優惠券，請關閉鑑定加購';
    END IF;

    SELECT ur.*
    INTO v_row
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

    IF v_auth_restriction = 'true' THEN
        RAISE EXCEPTION '此優惠券僅適用於鑑定訂單（Phase 2b）';
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

REVOKE ALL ON FUNCTION public.fn_compute_platform_subsidy(UUID, UUID, NUMERIC, NUMERIC, TEXT, BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_compute_platform_subsidy(UUID, UUID, NUMERIC, NUMERIC, TEXT, BOOLEAN, UUID)
    TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.rpc_list_checkout_eligible_coupons(
    p_order_id UUID,
    p_shipping_method TEXT DEFAULT 'sf'
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

    IF COALESCE(v_requires_auth, false) THEN
        RETURN '[]'::jsonb;
    END IF;

    v_shipping_method := COALESCE(NULLIF(btrim(p_shipping_method), ''), 'sf');
    v_shipping_fee := public.fn_merchant_checkout_shipping_fee(
        v_shipping_method,
        v_merchant_id,
        v_listing_id
    );

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
                    false,
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

REVOKE ALL ON FUNCTION public.rpc_list_checkout_eligible_coupons(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_list_checkout_eligible_coupons(UUID, TEXT)
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
    v_shipping_fee NUMERIC;
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
BEGIN
    IF COALESCE(p_use_auth, false) AND p_user_reward_id IS NOT NULL THEN
        RAISE EXCEPTION '鑑定訂單暫不支援優惠券，請關閉鑑定加購';
    END IF;

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
        v_shipping_fee := 0;
    ELSE
        v_shipping_fee := public.fn_merchant_checkout_shipping_fee(
            v_shipping_method,
            v_merchant_id,
            v_listing_id
        );
    END IF;

    v_auth_fee := public.fn_merchant_checkout_auth_fee(p_use_auth);
    v_total := v_final_price + v_shipping_fee + v_auth_fee;
    v_coupon_type := NULL;
    v_subsidy := 0;

    IF p_user_reward_id IS NOT NULL AND NOT COALESCE(p_use_auth, false) THEN
        SELECT s.subsidy_amount, s.coupon_type
        INTO v_subsidy, v_coupon_type
        FROM public.fn_compute_platform_subsidy(
            p_user_reward_id,
            v_buyer_id,
            v_final_price,
            v_shipping_fee,
            v_shipping_method,
            false,
            p_order_id
        ) AS s;

        UPDATE public.user_rewards ur
        SET reserved_merchant_order_id = p_order_id
        WHERE ur.id = p_user_reward_id
          AND ur.user_id = v_buyer_id
          AND COALESCE(ur.is_used, false) = false;
    ELSE
        PERFORM public.fn_release_merchant_order_coupon(p_order_id);
    END IF;

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
            reserved_merchant_order_id = NULL
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

REVOKE ALL ON FUNCTION public.rpc_mark_merchant_order_paid(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_merchant_order_paid(UUID, TEXT, JSONB) TO service_role;


CREATE OR REPLACE FUNCTION public.rpc_finalize_merchant_pending_payment_expiry(
    p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_escrow_status public.escrow_state;
    v_listing_id uuid;
BEGIN
    SELECT mo.escrow_status, mo.listing_id
    INTO v_escrow_status, v_listing_id
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF v_escrow_status IS DISTINCT FROM 'pending_payment'::public.escrow_state THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'escrow_status', v_escrow_status
        );
    END IF;

    PERFORM public.fn_release_merchant_order_coupon(p_order_id);

    UPDATE public.merchant_orders
    SET
        escrow_status = 'refunded'::public.escrow_state,
        updated_at = now()
    WHERE id = p_order_id;

    UPDATE public.listings
    SET status = 'active'::public.listing_status
    WHERE id = v_listing_id
      AND status = 'inactive'::public.listing_status;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'escrow_status', 'refunded'
    );
END;
$$;


-- Patch payout guards: allow merchant_payout > buyer_total (subsidy orders).

CREATE OR REPLACE FUNCTION public.rpc_confirm_merchant_buyer_receipt(
    p_order_id UUID
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
    v_escrow_status public.escrow_state;
    v_requires_auth BOOLEAN;
    v_auth_result TEXT;
    v_outbound_tracking TEXT;
    v_payment_capture_status public.payment_capture_status;
    v_shipping_method TEXT;
    v_payout_status TEXT;
    v_item_subtotal NUMERIC;
    v_shipping_fee NUMERIC;
    v_auth_fee NUMERIC;
    v_total_amount NUMERIC;
    v_buyer_total NUMERIC;
    v_platform_subsidy NUMERIC;
    v_payment_intent_id TEXT;
    v_existing_transfer_id TEXT;
    v_buyer_confirmed_at TIMESTAMPTZ;
    v_kyc_status public.kyc_state;
    v_charges_enabled BOOLEAN;
    v_payouts_enabled BOOLEAN;
    v_destination TEXT;
    v_commission_rate CONSTANT NUMERIC := 0.08;
    v_commission NUMERIC;
    v_payout NUMERIC;
BEGIN
    SELECT
        mo.buyer_id,
        mo.merchant_id,
        mo.listing_id,
        mo.escrow_status,
        COALESCE(mo.requires_authentication, false),
        mo.auth_result,
        mo.outbound_tracking_no,
        mo.payment_capture_status,
        mo.shipping_method,
        mo.payout_status,
        mo.item_subtotal,
        mo.shipping_fee,
        mo.auth_fee,
        mo.total_amount,
        COALESCE(mo.buyer_total_amount, mo.total_amount),
        COALESCE(mo.platform_subsidy_amount, 0),
        mo.stripe_payment_intent_id,
        mo.stripe_transfer_id,
        mo.buyer_confirmed_at
    INTO
        v_buyer_id,
        v_merchant_id,
        v_listing_id,
        v_escrow_status,
        v_requires_auth,
        v_auth_result,
        v_outbound_tracking,
        v_payment_capture_status,
        v_shipping_method,
        v_payout_status,
        v_item_subtotal,
        v_shipping_fee,
        v_auth_fee,
        v_total_amount,
        v_buyer_total,
        v_platform_subsidy,
        v_payment_intent_id,
        v_existing_transfer_id,
        v_buyer_confirmed_at
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id
    FOR UPDATE OF mo;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF auth.uid() IS DISTINCT FROM v_buyer_id THEN
        RAISE EXCEPTION '操作失敗：僅買家可確認完成交易。';
    END IF;

    IF v_existing_transfer_id IS NOT NULL
       OR v_escrow_status = 'completed_and_transferred'::public.escrow_state THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'order_id', p_order_id,
            'stripe_transfer_id', v_existing_transfer_id
        );
    END IF;

    IF v_buyer_confirmed_at IS NOT NULL
       AND v_payout_status IN ('held', 'processing', 'paid', 'frozen') THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'order_id', p_order_id
        );
    END IF;

    IF v_escrow_status = 'completed_and_transferred'::public.escrow_state THEN
        RAISE EXCEPTION '此訂單已由舊流程完成，需由管理員核對撥款。';
    END IF;

    IF v_requires_auth THEN
        IF v_escrow_status IS DISTINCT FROM 'authenticated'::public.escrow_state
           OR v_auth_result IS DISTINCT FROM 'passed'
           OR v_outbound_tracking IS NULL
           OR btrim(v_outbound_tracking) = ''
           OR v_payment_capture_status IS DISTINCT FROM 'fully_captured'::public.payment_capture_status THEN
            RAISE EXCEPTION '鑑定訂單尚未通過鑑定、款項未全額扣款或尚未出庫，無法確認收貨。';
        END IF;
    ELSIF COALESCE(v_shipping_method, 'sf') = 'meetup'
          AND v_escrow_status = 'payment_held'::public.escrow_state THEN
        NULL;
    ELSIF v_escrow_status IS DISTINCT FROM 'shipped'::public.escrow_state THEN
        RAISE EXCEPTION '商戶尚未發貨或訂單狀態不允許撥款。';
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
    v_auth_fee := COALESCE(v_auth_fee, 0);

    IF v_total_amount IS DISTINCT FROM
       (v_item_subtotal + v_shipping_fee + v_auth_fee) THEN
        RAISE EXCEPTION '訂單金額明細不一致，已攔截撥款。';
    END IF;

    IF v_buyer_total IS DISTINCT FROM (v_total_amount - v_platform_subsidy) THEN
        RAISE EXCEPTION '買家實付金額與補貼記錄不一致，已攔截撥款。';
    END IF;

    v_commission := round(v_item_subtotal * v_commission_rate, 2);
    v_payout := round(v_item_subtotal - v_commission + v_shipping_fee, 2);

    IF v_payout <= 0 THEN
        RAISE EXCEPTION '商戶撥款金額異常，已攔截撥款。';
    END IF;

    UPDATE public.merchant_orders
    SET
        commission_rate_applied = v_commission_rate,
        commission_amount = v_commission,
        merchant_payout_amount = v_payout,
        stripe_destination_account_id = v_destination,
        buyer_confirmed_at = now(),
        payout_hold_until = now() + interval '7 days',
        payout_status = 'held',
        payout_error = NULL,
        updated_at = now()
    WHERE id = p_order_id;

    UPDATE public.listings
    SET status = 'sold'
    WHERE id = v_listing_id;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_id', p_order_id,
        'payout_hold_until', (now() + interval '7 days')
    );
END;
$$;


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
    v_item_subtotal NUMERIC;
    v_shipping_fee NUMERIC;
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
        mo.item_subtotal,
        mo.shipping_fee,
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
        v_item_subtotal,
        v_shipping_fee,
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
    v_auth_fee := COALESCE(v_auth_fee, 0);

    IF v_total_amount IS DISTINCT FROM
       (v_item_subtotal + v_shipping_fee + v_auth_fee) THEN
        RAISE EXCEPTION '訂單金額明細不一致，已攔截撥款。';
    END IF;

    IF v_buyer_total IS DISTINCT FROM (v_total_amount - v_platform_subsidy) THEN
        RAISE EXCEPTION '買家實付金額與補貼記錄不一致，已攔截撥款。';
    END IF;

    v_commission := round(v_item_subtotal * v_commission_rate, 2);
    v_payout := round(v_item_subtotal - v_commission + v_shipping_fee, 2);

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

REVOKE ALL ON FUNCTION public.rpc_prepare_merchant_order_payout(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_prepare_merchant_order_payout(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_merchant_order_payout(UUID)
    TO service_role;
