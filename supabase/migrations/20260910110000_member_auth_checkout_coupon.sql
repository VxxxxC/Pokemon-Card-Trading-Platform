-- Platform Rewards v2 Phase 5: member auth checkout coupons (free_shipping only, outbound leg subsidy).

-- ---------------------------------------------------------------------------
-- 1. Schema — member_orders coupon snapshot + user_rewards member reserve
-- ---------------------------------------------------------------------------

ALTER TABLE public.member_orders
    ADD COLUMN IF NOT EXISTS coupon_user_reward_id UUID REFERENCES public.user_rewards (id),
    ADD COLUMN IF NOT EXISTS coupon_type public.reward_type,
    ADD COLUMN IF NOT EXISTS platform_subsidy_amount NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.user_rewards
    ADD COLUMN IF NOT EXISTS reserved_member_order_id UUID REFERENCES public.member_orders (id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_rewards_single_reserve_chk'
          AND conrelid = 'public.user_rewards'::regclass
    ) THEN
        ALTER TABLE public.user_rewards
            ADD CONSTRAINT user_rewards_single_reserve_chk
            CHECK (
                reserved_merchant_order_id IS NULL
                OR reserved_member_order_id IS NULL
            );
    END IF;
END;
$$;

UPDATE public.user_rewards
SET reserved_at = COALESCE(created_at, now())
WHERE reserved_member_order_id IS NOT NULL
  AND reserved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_rewards_reserved_member_order
    ON public.user_rewards (reserved_member_order_id)
    WHERE reserved_member_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_rewards_stale_reserve_member
    ON public.user_rewards (reserved_at)
    WHERE reserved_member_order_id IS NOT NULL
      AND COALESCE(is_used, false) = false;

ALTER TABLE public.member_orders
    DROP COLUMN IF EXISTS mock_payment_session_id;

DROP FUNCTION IF EXISTS public.rpc_mock_pay_member_auth_order(UUID, UUID, TEXT);

-- ---------------------------------------------------------------------------
-- 2. fn_compute_platform_subsidy — p_order_kind merchant | member
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.fn_compute_platform_subsidy(UUID, UUID, NUMERIC, NUMERIC, TEXT, BOOLEAN, UUID);

CREATE OR REPLACE FUNCTION public.fn_compute_platform_subsidy(
    p_user_reward_id UUID,
    p_buyer_id UUID,
    p_item_subtotal NUMERIC,
    p_shipping_fee NUMERIC,
    p_shipping_method TEXT,
    p_use_auth BOOLEAN,
    p_order_id UUID DEFAULT NULL,
    p_order_kind TEXT DEFAULT 'merchant'
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
    v_order_kind TEXT;
BEGIN
    v_order_kind := COALESCE(NULLIF(btrim(p_order_kind), ''), 'merchant');

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

    IF v_order_kind = 'merchant'
       AND v_row.reserved_merchant_order_id IS NOT NULL
       AND p_order_id IS NOT NULL
       AND v_row.reserved_merchant_order_id IS DISTINCT FROM p_order_id THEN
        RAISE EXCEPTION '此優惠券已被其他訂單預留';
    END IF;

    IF v_order_kind = 'member'
       AND v_row.reserved_member_order_id IS NOT NULL
       AND p_order_id IS NOT NULL
       AND v_row.reserved_member_order_id IS DISTINCT FROM p_order_id THEN
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

    IF v_order_kind = 'member'
       AND v_template.type IS DISTINCT FROM 'free_shipping'::public.reward_type THEN
        RAISE EXCEPTION '會員鑑定訂單僅可使用免運券';
    END IF;

    v_reward_value := COALESCE(v_template.reward_value, '{}'::jsonb);
    v_restrictions := COALESCE(v_template.restrictions, '{}'::jsonb);
    v_order_kinds := COALESCE(v_restrictions -> 'order_kinds', '["merchant"]'::jsonb);
    v_auth_restriction := COALESCE(v_restrictions ->> 'requires_authentication', 'any');
    v_min_item_subtotal := COALESCE((v_restrictions ->> 'min_item_subtotal_hkd')::numeric, 0);

    IF v_order_kind = 'member' AND NOT (v_order_kinds ? 'member') THEN
        RAISE EXCEPTION '此優惠券不適用於會員訂單';
    END IF;

    IF v_order_kind = 'merchant' AND NOT (v_order_kinds ? 'merchant') THEN
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

REVOKE ALL ON FUNCTION public.fn_compute_platform_subsidy(
    UUID, UUID, NUMERIC, NUMERIC, TEXT, BOOLEAN, UUID, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_compute_platform_subsidy(
    UUID, UUID, NUMERIC, NUMERIC, TEXT, BOOLEAN, UUID, TEXT
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Member coupon FSM (R-03: release/restore service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_reserve_user_reward_for_member_order(
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

    IF v_row.reserved_member_order_id IS NOT NULL
       AND v_row.reserved_member_order_id IS DISTINCT FROM p_order_id THEN
        RAISE EXCEPTION '此優惠券已被其他訂單預留';
    END IF;

    IF v_row.reserved_merchant_order_id IS NOT NULL THEN
        RAISE EXCEPTION '此優惠券已被其他訂單預留';
    END IF;

    UPDATE public.user_rewards ur
    SET
        reserved_member_order_id = p_order_id,
        reserved_at = now()
    WHERE ur.id = p_user_reward_id
      AND ur.user_id = p_buyer_id
      AND COALESCE(ur.is_used, false) = false
      AND (ur.calculated_expiry IS NULL OR ur.calculated_expiry >= now())
      AND ur.reserved_merchant_order_id IS NULL
      AND (
          ur.reserved_member_order_id IS NULL
          OR ur.reserved_member_order_id = p_order_id
      )
    RETURNING ur.id INTO v_reserved_id;

    IF v_reserved_id IS NULL THEN
        RAISE EXCEPTION '優惠券無法預留（可能已被其他訂單使用或已過期）';
    END IF;

    RETURN v_reserved_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reserve_user_reward_for_member_order(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reserve_user_reward_for_member_order(UUID, UUID, UUID)
    TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.fn_release_member_order_coupon(p_order_id UUID)
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
    FROM public.member_orders mo
    WHERE mo.id = p_order_id;

    UPDATE public.user_rewards ur
    SET
        reserved_member_order_id = NULL,
        reserved_at = NULL
    WHERE ur.reserved_member_order_id = p_order_id
      AND ur.used_at IS NULL
      AND COALESCE(ur.is_used, false) = false;

    IF v_coupon_id IS NOT NULL THEN
        UPDATE public.user_rewards ur
        SET
            reserved_member_order_id = NULL,
            reserved_at = NULL
        WHERE ur.id = v_coupon_id
          AND ur.reserved_member_order_id = p_order_id
          AND ur.used_at IS NULL
          AND COALESCE(ur.is_used, false) = false;
    END IF;

    UPDATE public.member_orders mo
    SET
        coupon_user_reward_id = NULL,
        coupon_type = NULL,
        platform_subsidy_amount = 0,
        buyer_total_amount = mo.total_amount,
        updated_at = now()
    WHERE mo.id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_release_member_order_coupon(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_release_member_order_coupon(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_release_member_order_coupon(UUID) TO service_role;


CREATE OR REPLACE FUNCTION public.fn_restore_member_order_coupon_on_void(p_order_id UUID)
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
    FROM public.member_orders mo
    WHERE mo.id = p_order_id;

    IF v_coupon_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.user_rewards ur
    SET
        is_used = false,
        used_at = NULL,
        reserved_member_order_id = NULL,
        reserved_at = NULL
    WHERE ur.id = v_coupon_id;

    UPDATE public.member_orders mo
    SET
        coupon_user_reward_id = NULL,
        coupon_type = NULL,
        platform_subsidy_amount = 0,
        buyer_total_amount = mo.total_amount,
        updated_at = now()
    WHERE mo.id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_restore_member_order_coupon_on_void(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_restore_member_order_coupon_on_void(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_restore_member_order_coupon_on_void(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. rpc_list_checkout_eligible_coupons — merchant first, else member auth
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
    v_is_member BOOLEAN := false;
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
        SELECT
            mo.buyer_id,
            COALESCE(mo.item_subtotal, mo.final_price)
        INTO
            v_buyer_id,
            v_item_subtotal
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND COALESCE(mo.use_authentication, false) = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的訂單。';
        END IF;

        v_is_member := true;
    END IF;

    IF auth.uid() IS DISTINCT FROM v_buyer_id THEN
        RAISE EXCEPTION '保安攔截：僅買家本人可查看優惠券。';
    END IF;

    IF v_is_member THEN
        v_effective_auth := true;
        v_shipping_method := 'sf';
        v_shipping_fee := public.fn_platform_auth_sf_leg_fee();
    ELSE
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
    END IF;

    FOR v_row IN
        SELECT ur.id, ur.is_used, ur.calculated_expiry,
               ur.reserved_merchant_order_id, ur.reserved_member_order_id,
               rt.title, rt.type, rt.reward_value, rt.status
        FROM public.user_rewards ur
        INNER JOIN public.reward_templates rt ON rt.id = ur.template_id
        WHERE ur.user_id = v_buyer_id
          AND rt.type IN ('discount_coupon', 'free_shipping')
        ORDER BY ur.created_at DESC
    LOOP
        v_reason := NULL;
        v_subsidy := 0;

        IF v_is_member AND v_row.type = 'discount_coupon'::public.reward_type THEN
            v_reason := '會員鑑定訂單僅可使用免運券';
        ELSIF COALESCE(v_row.is_used, false) THEN
            v_reason := '已使用';
        ELSIF v_row.calculated_expiry IS NOT NULL AND v_row.calculated_expiry < now() THEN
            v_reason := '已過期';
        ELSIF v_is_member
              AND v_row.reserved_member_order_id IS NOT NULL
              AND v_row.reserved_member_order_id IS DISTINCT FROM p_order_id THEN
            v_reason := '已被其他訂單預留';
        ELSIF NOT v_is_member
              AND v_row.reserved_merchant_order_id IS NOT NULL
              AND v_row.reserved_merchant_order_id IS DISTINCT FROM p_order_id THEN
            v_reason := '已被其他訂單預留';
        ELSIF v_row.reserved_member_order_id IS NOT NULL
              AND (NOT v_is_member OR v_row.reserved_member_order_id IS DISTINCT FROM p_order_id) THEN
            v_reason := '已被其他訂單預留';
        ELSIF v_row.reserved_merchant_order_id IS NOT NULL
              AND (v_is_member OR v_row.reserved_merchant_order_id IS DISTINCT FROM p_order_id) THEN
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
                    p_order_id,
                    CASE WHEN v_is_member THEN 'member' ELSE 'merchant' END
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

-- ---------------------------------------------------------------------------
-- 5. rpc_prepare_member_auth_order_payment — coupon + single capture
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_prepare_member_auth_order_payment(UUID);

CREATE OR REPLACE FUNCTION public.rpc_prepare_member_auth_order_payment(
    p_order_id UUID,
    p_user_reward_id UUID DEFAULT NULL
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
    v_existing_coupon UUID;
    v_existing_subsidy NUMERIC;
    v_subsidy NUMERIC := 0;
    v_coupon_type public.reward_type;
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
        mo.buyer_total_amount,
        mo.coupon_user_reward_id,
        mo.platform_subsidy_amount
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
        v_existing_buyer_total,
        v_existing_coupon,
        v_existing_subsidy
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

    IF v_existing_coupon IS NOT NULL
       AND (p_user_reward_id IS NULL OR v_existing_coupon IS DISTINCT FROM p_user_reward_id) THEN
        PERFORM public.fn_release_member_order_coupon(p_order_id);
        v_existing_coupon := NULL;
        v_existing_subsidy := 0;
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

    v_coupon_type := NULL;
    v_subsidy := 0;

    IF p_user_reward_id IS NOT NULL THEN
        SELECT s.subsidy_amount, s.coupon_type
        INTO v_subsidy, v_coupon_type
        FROM public.fn_compute_platform_subsidy(
            p_user_reward_id,
            v_buyer_id,
            v_final_price,
            v_outbound,
            'sf',
            true,
            p_order_id,
            'member'
        ) AS s;

        PERFORM public.fn_reserve_user_reward_for_member_order(
            p_user_reward_id,
            v_buyer_id,
            p_order_id
        );
    ELSE
        PERFORM public.fn_release_member_order_coupon(p_order_id);
    END IF;

    v_buyer_total := GREATEST(v_total - COALESCE(v_subsidy, 0), 0);

    IF v_buyer_total <= 0 THEN
        RAISE EXCEPTION '訂單折後金額異常，請聯絡客服';
    END IF;

    IF v_item_subtotal IS NOT DISTINCT FROM v_final_price
       AND v_existing_auth_fee IS NOT DISTINCT FROM v_auth_fee
       AND v_existing_inbound IS NOT DISTINCT FROM v_inbound
       AND v_existing_outbound IS NOT DISTINCT FROM v_outbound
       AND v_existing_total IS NOT DISTINCT FROM v_total
       AND COALESCE(v_existing_buyer_total, v_existing_total) IS NOT DISTINCT FROM v_buyer_total
       AND v_existing_coupon IS NOT DISTINCT FROM p_user_reward_id
       AND COALESCE(v_existing_subsidy, 0) IS NOT DISTINCT FROM COALESCE(v_subsidy, 0) THEN
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
            'platform_subsidy_amount', COALESCE(v_subsidy, 0),
            'coupon_user_reward_id', p_user_reward_id,
            'coupon_type', v_coupon_type,
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
        platform_subsidy_amount = COALESCE(v_subsidy, 0),
        coupon_user_reward_id = CASE WHEN p_user_reward_id IS NOT NULL THEN p_user_reward_id ELSE NULL END,
        coupon_type = v_coupon_type,
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
        'platform_subsidy_amount', COALESCE(v_subsidy, 0),
        'coupon_user_reward_id', p_user_reward_id,
        'coupon_type', v_coupon_type,
        'stripe_payment_intent_id', v_payment_intent_id,
        'escrow_capture_model', 'single'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_prepare_member_auth_order_payment(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_member_auth_order_payment(UUID, UUID)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Authorize webhook — mark coupon used on successful authorize
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_mark_member_auth_order_authorized(
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
    v_escrow_status public.member_escrow_status;
    v_use_auth BOOLEAN;
    v_capture_status public.payment_capture_status;
    v_existing_pi TEXT;
    v_coupon_id UUID;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    SELECT
        escrow_status,
        use_authentication,
        payment_capture_status,
        stripe_payment_intent_id,
        coupon_user_reward_id
    INTO
        v_escrow_status,
        v_use_auth,
        v_capture_status,
        v_existing_pi,
        v_coupon_id
    FROM public.member_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的會員訂單。';
    END IF;

    IF NOT COALESCE(v_use_auth, false) THEN
        RAISE EXCEPTION '此訂單非鑑定託管流程。';
    END IF;

    IF v_existing_pi IS NOT NULL AND v_existing_pi <> p_payment_intent_id THEN
        RAISE EXCEPTION '付款憑證與訂單不符，已攔截入帳。';
    END IF;

    IF v_capture_status IN (
        'authorized'::public.payment_capture_status,
        'auth_fee_captured'::public.payment_capture_status,
        'fully_captured'::public.payment_capture_status
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'escrow_status', v_escrow_status,
            'payment_capture_status', v_capture_status
        );
    END IF;

    IF v_escrow_status IS DISTINCT FROM 'payment'::public.member_escrow_status THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'escrow_status', v_escrow_status,
            'payment_capture_status', v_capture_status
        );
    END IF;

    UPDATE public.member_orders
    SET
        escrow_status = 'custody'::public.member_escrow_status,
        stripe_payment_intent_id = p_payment_intent_id,
        payment_capture_status = 'authorized'::public.payment_capture_status,
        item_subtotal = COALESCE((p_amounts ->> 'item_subtotal')::NUMERIC, item_subtotal, final_price),
        auth_fee = COALESCE((p_amounts ->> 'auth_fee')::NUMERIC, auth_fee, 0),
        inbound_shipping_fee = COALESCE((p_amounts ->> 'inbound_shipping_fee')::NUMERIC, inbound_shipping_fee, 0),
        outbound_shipping_fee = COALESCE((p_amounts ->> 'outbound_shipping_fee')::NUMERIC, outbound_shipping_fee, 0),
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
        payment_confirmed_at = now(),
        updated_at = now()
    WHERE id = p_order_id;

    IF v_coupon_id IS NOT NULL THEN
        UPDATE public.user_rewards ur
        SET
            is_used = true,
            used_at = now(),
            reserved_member_order_id = NULL,
            reserved_merchant_order_id = NULL,
            reserved_at = NULL
        WHERE ur.id = v_coupon_id
          AND COALESCE(ur.is_used, false) = false;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'escrow_status', 'custody',
        'payment_capture_status', 'authorized'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_member_auth_order_authorized(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_member_auth_order_authorized(UUID, TEXT, JSONB) TO service_role;


CREATE OR REPLACE FUNCTION public.rpc_mark_merchant_order_authorized(
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
    v_escrow_status public.escrow_state;
    v_requires_auth BOOLEAN;
    v_capture_status public.payment_capture_status;
    v_existing_pi TEXT;
    v_coupon_id UUID;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    SELECT
        escrow_status,
        requires_authentication,
        payment_capture_status,
        stripe_payment_intent_id,
        coupon_user_reward_id
    INTO
        v_escrow_status,
        v_requires_auth,
        v_capture_status,
        v_existing_pi,
        v_coupon_id
    FROM public.merchant_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF NOT COALESCE(v_requires_auth, false) THEN
        RAISE EXCEPTION '此訂單非鑑定商戶流程。';
    END IF;

    IF v_existing_pi IS NOT NULL AND v_existing_pi <> p_payment_intent_id THEN
        RAISE EXCEPTION '付款憑證與訂單不符，已攔截入帳。';
    END IF;

    IF v_capture_status IN (
        'authorized'::public.payment_capture_status,
        'auth_fee_captured'::public.payment_capture_status,
        'fully_captured'::public.payment_capture_status
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'escrow_status', v_escrow_status,
            'payment_capture_status', v_capture_status
        );
    END IF;

    IF v_escrow_status IS DISTINCT FROM 'pending_payment'::public.escrow_state THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'escrow_status', v_escrow_status,
            'payment_capture_status', v_capture_status
        );
    END IF;

    UPDATE public.merchant_orders
    SET
        escrow_status = 'payment_held'::public.escrow_state,
        stripe_payment_intent_id = p_payment_intent_id,
        payment_capture_status = 'authorized'::public.payment_capture_status,
        item_subtotal = COALESCE((p_amounts ->> 'item_subtotal')::NUMERIC, item_subtotal, final_price),
        shipping_fee = COALESCE((p_amounts ->> 'shipping_fee')::NUMERIC, shipping_fee, 0),
        auth_fee = COALESCE((p_amounts ->> 'auth_fee')::NUMERIC, auth_fee, 0),
        inbound_shipping_fee = COALESCE((p_amounts ->> 'inbound_shipping_fee')::NUMERIC, inbound_shipping_fee, 0),
        outbound_shipping_fee = COALESCE((p_amounts ->> 'outbound_shipping_fee')::NUMERIC, outbound_shipping_fee, 0),
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
    WHERE id = p_order_id;

    IF v_coupon_id IS NOT NULL THEN
        UPDATE public.user_rewards ur
        SET
            is_used = true,
            used_at = now(),
            reserved_merchant_order_id = NULL,
            reserved_member_order_id = NULL,
            reserved_at = NULL
        WHERE ur.id = v_coupon_id
          AND COALESCE(ur.is_used, false) = false;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'escrow_status', 'payment_held',
        'payment_capture_status', 'authorized'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_merchant_order_authorized(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_merchant_order_authorized(UUID, TEXT, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Void / fail / cancel — restore member coupons
-- ---------------------------------------------------------------------------

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
            payment_capture_status = CASE
                WHEN escrow_capture_model = 'single' THEN 'voided'::public.payment_capture_status
                ELSE payment_capture_status
            END,
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status = 'processing'
          AND (
              (
                  escrow_capture_model = 'single'
                  AND payment_capture_status = 'authorized'::public.payment_capture_status
              )
              OR (
                  escrow_capture_model IS DISTINCT FROM 'single'
                  AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
              )
          )
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗 finalize 失敗：訂單狀態不合法。';
        END IF;

        PERFORM public.fn_restore_member_order_coupon_on_void(p_order_id);
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
            payment_capture_status = CASE
                WHEN escrow_capture_model = 'single' THEN 'voided'::public.payment_capture_status
                ELSE payment_capture_status
            END,
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status = 'processing'
          AND (
              (
                  escrow_capture_model = 'single'
                  AND payment_capture_status = 'authorized'::public.payment_capture_status
              )
              OR (
                  escrow_capture_model IS DISTINCT FROM 'single'
                  AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
              )
          )
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

REVOKE ALL ON FUNCTION public.rpc_finalize_auth_grading_fail(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_auth_grading_fail(TEXT, UUID, TEXT)
    TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.rpc_mark_auth_order_payment_voided(
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
    v_capture_status public.payment_capture_status;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    IF p_order_kind = 'member' THEN
        SELECT payment_capture_status
        INTO v_capture_status
        FROM public.member_orders
        WHERE id = p_order_id
          AND use_authentication = true
          AND stripe_payment_intent_id = p_payment_intent_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', true, 'skipped', true);
        END IF;

        IF v_capture_status IN (
            'auth_fee_captured'::public.payment_capture_status,
            'fully_captured'::public.payment_capture_status,
            'voided'::public.payment_capture_status
        ) THEN
            RETURN jsonb_build_object('success', true, 'already_applied', true);
        END IF;

        IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
            RETURN jsonb_build_object('success', true, 'skipped', true);
        END IF;

        UPDATE public.member_orders
        SET
            payment_capture_status = 'voided'::public.payment_capture_status,
            updated_at = now()
        WHERE id = p_order_id;

        PERFORM public.fn_restore_member_order_coupon_on_void(p_order_id);

        RETURN jsonb_build_object('success', true, 'already_applied', false);
    ELSIF p_order_kind = 'merchant' THEN
        SELECT payment_capture_status
        INTO v_capture_status
        FROM public.merchant_orders
        WHERE id = p_order_id
          AND requires_authentication = true
          AND stripe_payment_intent_id = p_payment_intent_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', true, 'skipped', true);
        END IF;

        IF v_capture_status IN (
            'auth_fee_captured'::public.payment_capture_status,
            'fully_captured'::public.payment_capture_status,
            'voided'::public.payment_capture_status
        ) THEN
            RETURN jsonb_build_object('success', true, 'already_applied', true);
        END IF;

        IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
            RETURN jsonb_build_object('success', true, 'skipped', true);
        END IF;

        UPDATE public.merchant_orders
        SET
            payment_capture_status = 'voided'::public.payment_capture_status,
            updated_at = now()
        WHERE id = p_order_id;

        RETURN jsonb_build_object('success', true, 'already_applied', false);
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_auth_order_payment_voided(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_auth_order_payment_voided(TEXT, UUID, TEXT) TO service_role;


CREATE OR REPLACE FUNCTION public.rpc_cancel_member_order(
    p_order_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_listing_id UUID;
    v_room_id UUID;
    v_message_id UUID;
    v_use_auth BOOLEAN;
    v_escrow_status public.member_escrow_status;
    v_capture_status public.payment_capture_status;
    v_platform_received_at TIMESTAMPTZ;
    v_coupon_id UUID;
BEGIN
    SELECT
        listing_id,
        use_authentication,
        escrow_status,
        payment_capture_status,
        platform_received_at,
        coupon_user_reward_id
    INTO
        v_listing_id,
        v_use_auth,
        v_escrow_status,
        v_capture_status,
        v_platform_received_at,
        v_coupon_id
    FROM public.member_orders
    WHERE id = p_order_id AND seller_id = p_user_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION '取消失敗：訂單狀態不合法，或您非此筆交易的賣家。';
    END IF;

    IF COALESCE(v_use_auth, false) THEN
        IF v_platform_received_at IS NOT NULL
           OR v_escrow_status IN (
               'grading'::public.member_escrow_status,
               'shipped'::public.member_escrow_status
           )
           OR v_capture_status IN (
               'auth_fee_captured'::public.payment_capture_status,
               'fully_captured'::public.payment_capture_status
           ) THEN
            RAISE EXCEPTION '取消失敗：鑑定期間不可取消訂單。';
        END IF;
    END IF;

    UPDATE public.member_orders
    SET
        status = 'cancelled',
        escrow_status = CASE
            WHEN use_authentication AND escrow_status IS NOT NULL THEN 'cancelled'::public.member_escrow_status
            ELSE escrow_status
        END,
        payment_capture_status = CASE
            WHEN use_authentication
                 AND payment_capture_status = 'authorized'::public.payment_capture_status
            THEN 'voided'::public.payment_capture_status
            ELSE payment_capture_status
        END,
        updated_at = now()
    WHERE id = p_order_id;

    IF v_coupon_id IS NOT NULL THEN
        PERFORM public.fn_restore_member_order_coupon_on_void(p_order_id);
    END IF;

    UPDATE public.listings SET status = 'active' WHERE id = v_listing_id;

    SELECT id INTO v_room_id FROM public.chat_rooms
    WHERE buyer_id = (SELECT buyer_id FROM public.member_orders WHERE id = p_order_id)
      AND seller_id = p_user_id;

    IF FOUND THEN
        INSERT INTO public.chat_messages (room_id, sender_id, content, member_order_id, is_system_warning)
        VALUES (v_room_id, p_user_id, 'SYSTEM_ORDER_CANCELLED', p_order_id, true)
        RETURNING id INTO v_message_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message_id', v_message_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_cancel_member_order(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_member_order(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Stale coupon reserve cron — UNION merchant + member
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_list_stale_coupon_reserve_candidates(INTEGER);

CREATE OR REPLACE FUNCTION public.rpc_list_stale_coupon_reserve_candidates(
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    user_reward_id UUID,
    order_kind TEXT,
    order_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        stale.user_reward_id,
        stale.order_kind,
        stale.order_id
    FROM (
        SELECT
            ur.id AS user_reward_id,
            'merchant'::TEXT AS order_kind,
            ur.reserved_merchant_order_id AS order_id,
            ur.reserved_at
        FROM public.user_rewards ur
        WHERE ur.reserved_merchant_order_id IS NOT NULL
          AND COALESCE(ur.is_used, false) = false
          AND ur.reserved_at IS NOT NULL
          AND ur.reserved_at < (now() - interval '15 minutes')
        UNION ALL
        SELECT
            ur.id AS user_reward_id,
            'member'::TEXT AS order_kind,
            ur.reserved_member_order_id AS order_id,
            ur.reserved_at
        FROM public.user_rewards ur
        WHERE ur.reserved_member_order_id IS NOT NULL
          AND COALESCE(ur.is_used, false) = false
          AND ur.reserved_at IS NOT NULL
          AND ur.reserved_at < (now() - interval '15 minutes')
    ) AS stale
    ORDER BY stale.reserved_at ASC
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
    v_member_escrow_status public.member_escrow_status;
BEGIN
    SELECT * INTO v_row
    FROM public.user_rewards ur
    WHERE ur.id = p_user_reward_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到優惠券';
    END IF;

    IF v_row.reserved_merchant_order_id IS NULL
       AND v_row.reserved_member_order_id IS NULL THEN
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

    IF v_row.reserved_merchant_order_id IS NOT NULL THEN
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
    ELSIF v_row.reserved_member_order_id IS NOT NULL THEN
        SELECT mo.escrow_status
        INTO v_member_escrow_status
        FROM public.member_orders mo
        WHERE mo.id = v_row.reserved_member_order_id;

        IF v_member_escrow_status = 'payment'::public.member_escrow_status THEN
            PERFORM public.fn_release_member_order_coupon(v_row.reserved_member_order_id);
        ELSE
            UPDATE public.user_rewards ur
            SET
                reserved_member_order_id = NULL,
                reserved_at = NULL
            WHERE ur.id = p_user_reward_id;
        END IF;
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
