-- fn_compute_platform_subsidy is STABLE (read-only preview for coupon list).
-- FOR UPDATE is not allowed in STABLE functions; row locking belongs in prepare.

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
