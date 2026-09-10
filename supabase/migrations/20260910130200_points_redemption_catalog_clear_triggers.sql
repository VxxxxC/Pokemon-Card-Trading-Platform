-- Phase 4: catalog-listed coupons must not require auto-grant trigger conditions

CREATE OR REPLACE FUNCTION public.fn_validate_reward_template(p_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_type TEXT;
    v_kind TEXT;
    v_event TEXT;
    v_reward_value JSONB;
    v_trigger JSONB;
    v_points INT;
    v_amount NUMERIC;
    v_max_subsidy NUMERIC;
    v_count INT;
    v_role TEXT;
    v_distribution_mode public.reward_distribution_mode;
    v_catalog_enabled BOOLEAN;
BEGIN
    v_type := NULLIF(trim(COALESCE(p_payload ->> 'type', '')), '');
    v_reward_value := COALESCE(p_payload -> 'reward_value', '{}'::jsonb);
    v_trigger := COALESCE(p_payload -> 'trigger_conditions', '{}'::jsonb);
    v_kind := NULLIF(trim(COALESCE(v_trigger ->> 'kind', '')), '');
    v_catalog_enabled := COALESCE(
        (COALESCE(p_payload -> 'redemption_catalog', '{}'::jsonb) ->> 'enabled')::boolean,
        false
    );

    v_distribution_mode := COALESCE(
        NULLIF(trim(COALESCE(p_payload ->> 'distribution_mode', '')), '')::public.reward_distribution_mode,
        'auto_grant'::public.reward_distribution_mode
    );

    IF NULLIF(trim(COALESCE(p_payload ->> 'title', '')), '') IS NULL THEN
        RAISE EXCEPTION '請填寫獎勵標題';
    END IF;

    IF v_type IS NULL THEN
        RAISE EXCEPTION '請選擇獎勵類型';
    END IF;

    IF v_type = 'lucky_draw_ticket' THEN
        RAISE EXCEPTION '抽獎券已封存，無法建立';
    END IF;

    IF v_type NOT IN ('points', 'discount_coupon', 'free_shipping') THEN
        RAISE EXCEPTION '不支援的獎勵類型';
    END IF;

    IF v_distribution_mode = 'flash_only'::public.reward_distribution_mode THEN
        IF v_kind IS NULL THEN
            v_kind := 'none';
        ELSIF v_kind <> 'none' THEN
            RAISE EXCEPTION '限時搶領活動不可設定觸發條件';
        END IF;
    ELSIF v_catalog_enabled THEN
        IF v_kind IS NULL OR v_kind <> 'none' THEN
            RAISE EXCEPTION '上架積分商城的券不可設定觸發條件';
        END IF;
    ELSE
        IF v_kind IS NULL THEN
            RAISE EXCEPTION '請設定觸發條件';
        END IF;

        IF v_kind IN ('check_in_streak', 'check_in_cycle_day') THEN
            RAISE EXCEPTION '簽到相關獎勵請於「簽到計劃」設定';
        END IF;

        IF v_kind NOT IN ('event_once', 'trade_count') THEN
            RAISE EXCEPTION '不支援的觸發條件';
        END IF;
    END IF;

    IF v_type = 'points' THEN
        v_points := COALESCE((v_reward_value ->> 'points')::int, 0);
        IF v_points <= 0 THEN
            RAISE EXCEPTION '積分獎勵必須大於 0';
        END IF;
    ELSIF v_type = 'discount_coupon' THEN
        v_amount := COALESCE((v_reward_value ->> 'amount_hkd')::numeric, 0);
        IF v_amount <= 0 THEN
            RAISE EXCEPTION '折扣金額必須大於 0';
        END IF;
    ELSIF v_type = 'free_shipping' THEN
        v_max_subsidy := COALESCE((v_reward_value ->> 'max_subsidy_hkd')::numeric, 0);
        IF v_max_subsidy <= 0 THEN
            RAISE EXCEPTION '免運補貼上限必須大於 0';
        END IF;
    END IF;

    IF v_kind = 'event_once' THEN
        v_event := NULLIF(trim(COALESCE(v_trigger ->> 'event', '')), '');
        IF v_event NOT IN (
            'profile_complete',
            'first_listing',
            'first_chat',
            'account_registered'
        ) THEN
            RAISE EXCEPTION '不支援的事件類型';
        END IF;
    ELSIF v_kind = 'trade_count' THEN
        v_role := COALESCE(v_trigger ->> 'role', 'buyer');
        v_count := COALESCE((v_trigger ->> 'count')::int, 0);
        IF v_role NOT IN ('buyer', 'merchant') THEN
            RAISE EXCEPTION '成交角色必須為 buyer 或 merchant';
        END IF;
        IF v_count <= 0 THEN
            RAISE EXCEPTION '成交筆數必須大於 0';
        END IF;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._admin_sync_redemption_catalog(
    p_template_id UUID,
    p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_template public.reward_templates%ROWTYPE;
    v_catalog JSONB;
    v_enabled BOOLEAN;
    v_points_cost INTEGER;
    v_stock INTEGER;
    v_is_active BOOLEAN;
    v_display_order INTEGER;
    v_existing public.reward_redemption_catalog%ROWTYPE;
    v_redeemed INTEGER;
    v_initial_stock INTEGER;
BEGIN
    IF p_template_id IS NULL THEN
        RETURN;
    END IF;

    v_catalog := COALESCE(p_payload -> 'redemption_catalog', '{}'::jsonb);

    SELECT * INTO v_template
    FROM public.reward_templates
    WHERE id = p_template_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_enabled := COALESCE((v_catalog ->> 'enabled')::boolean, false);

    IF NOT v_enabled THEN
        UPDATE public.reward_redemption_catalog
        SET is_active = false, updated_at = now()
        WHERE template_id = p_template_id;
        RETURN;
    END IF;

    IF v_template.distribution_mode = 'flash_only'::public.reward_distribution_mode THEN
        RAISE EXCEPTION '搶券活動不可同時上架積分商城';
    END IF;

    IF v_template.type NOT IN (
        'discount_coupon'::public.reward_type,
        'free_shipping'::public.reward_type
    ) THEN
        RAISE EXCEPTION '僅折扣券與免運券可上架積分商城';
    END IF;

    v_points_cost := NULLIF(trim(COALESCE(v_catalog ->> 'points_cost', '')), '')::integer;
    IF v_points_cost IS NULL OR v_points_cost <= 0 THEN
        RAISE EXCEPTION '兌換積分必須大於 0';
    END IF;

    v_stock := COALESCE(
        NULLIF(trim(COALESCE(v_catalog ->> 'stock', '')), '')::integer,
        0
    );
    IF v_stock < 0 THEN
        RAISE EXCEPTION '商城庫存不可為負數';
    END IF;

    v_is_active := COALESCE((v_catalog ->> 'is_active')::boolean, true);
    IF v_template.status IS DISTINCT FROM 'active'::public.reward_template_status THEN
        v_is_active := false;
    END IF;

    v_display_order := COALESCE(
        NULLIF(trim(COALESCE(v_catalog ->> 'display_order', '')), '')::integer,
        0
    );

    SELECT * INTO v_existing
    FROM public.reward_redemption_catalog
    WHERE template_id = p_template_id
    FOR UPDATE;

    IF FOUND THEN
        v_initial_stock := COALESCE(v_existing.initial_stock, v_existing.stock);
        v_redeemed := GREATEST(0, v_initial_stock - v_existing.stock);
        IF v_stock < v_redeemed THEN
            RAISE EXCEPTION '商城庫存不可少於已兌換數量';
        END IF;

        UPDATE public.reward_redemption_catalog
        SET
            points_cost = v_points_cost,
            stock = v_stock,
            is_active = v_is_active,
            display_order = v_display_order,
            updated_at = now()
        WHERE template_id = p_template_id;
    ELSE
        v_initial_stock := v_stock;
        INSERT INTO public.reward_redemption_catalog (
            template_id,
            points_cost,
            stock,
            initial_stock,
            is_active,
            display_order
        )
        VALUES (
            p_template_id,
            v_points_cost,
            v_stock,
            v_initial_stock,
            v_is_active,
            v_display_order
        );
    END IF;

    UPDATE public.reward_templates
    SET
        is_infinite = true,
        trigger_conditions = jsonb_build_object('kind', 'none'),
        updated_at = now()
    WHERE id = p_template_id;
END;
$$;
