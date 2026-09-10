-- Phase 4b: per-user lifetime redemption limit on points catalog SKUs

ALTER TABLE public.reward_redemption_catalog
    ADD COLUMN IF NOT EXISTS max_redemptions_per_user INTEGER NULL;

ALTER TABLE public.reward_redemption_catalog
    DROP CONSTRAINT IF EXISTS reward_redemption_catalog_max_redemptions_per_user_check;

ALTER TABLE public.reward_redemption_catalog
    ADD CONSTRAINT reward_redemption_catalog_max_redemptions_per_user_check
    CHECK (max_redemptions_per_user IS NULL OR max_redemptions_per_user > 0);

CREATE OR REPLACE FUNCTION public._reward_activity_row_to_json(
    p_template public.reward_templates,
    p_campaign public.reward_campaigns DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT public._reward_template_row_to_json(p_template)
        || jsonb_build_object(
            'activity_id', p_template.id,
            'campaign_id', p_campaign.id,
            'campaign_name', p_campaign.name,
            'campaign_status', p_campaign.status,
            'starts_at', p_campaign.starts_at,
            'ends_at', p_campaign.ends_at,
            'campaign_max_claims', p_campaign.max_claims,
            'campaign_claimed_count', p_campaign.claimed_count,
            'max_claims_per_user', p_campaign.max_claims_per_user,
            'override_valid_days', p_campaign.override_valid_days,
            'display_status', CASE
                WHEN p_template.distribution_mode = 'flash_only'::public.reward_distribution_mode
                     AND p_campaign.id IS NOT NULL THEN p_campaign.status::text
                ELSE p_template.status::text
            END,
            'redemption_catalog', (
                SELECT jsonb_build_object(
                    'enabled', rrc.is_active,
                    'points_cost', rrc.points_cost,
                    'stock', rrc.stock,
                    'initial_stock', rrc.initial_stock,
                    'is_active', rrc.is_active,
                    'display_order', rrc.display_order,
                    'max_redemptions_per_user', rrc.max_redemptions_per_user
                )
                FROM public.reward_redemption_catalog rrc
                WHERE rrc.template_id = p_template.id
            )
        );
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
    v_max_per_user INTEGER;
    v_existing public.reward_redemption_catalog%ROWTYPE;
    v_redeemed INTEGER;
    v_initial_stock INTEGER;
    v_peak_user_claims INTEGER;
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

    v_max_per_user := NULLIF(
        trim(COALESCE(v_catalog ->> 'max_redemptions_per_user', '')),
        ''
    )::integer;
    IF v_max_per_user IS NOT NULL AND v_max_per_user <= 0 THEN
        RAISE EXCEPTION '每人限兌次數必須大於 0';
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

        IF v_max_per_user IS NOT NULL THEN
            SELECT COALESCE(MAX(claim_count), 0)
            INTO v_peak_user_claims
            FROM (
                SELECT COUNT(*)::integer AS claim_count
                FROM public.reward_redemption_claims rcl
                WHERE rcl.catalog_id = v_existing.id
                GROUP BY rcl.user_id
            ) counts;

            IF v_peak_user_claims >= v_max_per_user THEN
                RAISE EXCEPTION '每人限兌次數不可低於已有用戶的兌換次數';
            END IF;
        END IF;

        UPDATE public.reward_redemption_catalog
        SET
            points_cost = v_points_cost,
            stock = v_stock,
            is_active = v_is_active,
            display_order = v_display_order,
            max_redemptions_per_user = v_max_per_user,
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
            display_order,
            max_redemptions_per_user
        )
        VALUES (
            p_template_id,
            v_points_cost,
            v_stock,
            v_initial_stock,
            v_is_active,
            v_display_order,
            v_max_per_user
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

CREATE OR REPLACE FUNCTION public.rpc_list_points_redemption_catalog()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_points_balance INTEGER;
    v_items JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '請先登入';
    END IF;

    SELECT COALESCE(gs.points_balance, 0)
    INTO v_points_balance
    FROM public.gamification_stats gs
    WHERE gs.user_id = v_user_id;

    IF NOT FOUND THEN
        v_points_balance := 0;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'catalog_id', rrc.id,
                'points_cost', rrc.points_cost,
                'stock', rrc.stock,
                'user_redemption_count', COALESCE(claims.claim_count, 0),
                'max_redemptions_per_user', rrc.max_redemptions_per_user,
                'can_redeem', (
                    rrc.stock > 0
                    AND v_points_balance >= rrc.points_cost
                    AND (
                        rrc.max_redemptions_per_user IS NULL
                        OR COALESCE(claims.claim_count, 0) < rrc.max_redemptions_per_user
                    )
                ),
                'user_points_balance', v_points_balance,
                'template', jsonb_build_object(
                    'id', rt.id,
                    'title', rt.title,
                    'description', rt.description,
                    'type', rt.type::text,
                    'reward_value', rt.reward_value,
                    'restrictions', rt.restrictions
                )
            )
            ORDER BY rrc.display_order, rrc.points_cost, rt.title
        ),
        '[]'::jsonb
    )
    INTO v_items
    FROM public.reward_redemption_catalog rrc
    INNER JOIN public.reward_templates rt ON rt.id = rrc.template_id
    LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer AS claim_count
        FROM public.reward_redemption_claims rcl
        WHERE rcl.catalog_id = rrc.id
          AND rcl.user_id = v_user_id
    ) claims ON true
    WHERE rrc.is_active = true
      AND rt.status = 'active'::public.reward_template_status
      AND rt.is_active = true
      AND rt.type IN (
          'discount_coupon'::public.reward_type,
          'free_shipping'::public.reward_type
      );

    RETURN v_items;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_redeem_points_catalog_item(p_catalog_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_catalog public.reward_redemption_catalog%ROWTYPE;
    v_template public.reward_templates%ROWTYPE;
    v_points_balance INTEGER;
    v_redeem_result JSONB;
    v_new_balance INTEGER;
    v_dedup_key TEXT;
    v_user_reward_id UUID;
    v_user_claims INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '請先登入';
    END IF;

    IF p_catalog_id IS NULL THEN
        RAISE EXCEPTION '商品編號無效';
    END IF;

    SELECT * INTO v_catalog
    FROM public.reward_redemption_catalog
    WHERE id = p_catalog_id
    FOR UPDATE;

    IF NOT FOUND OR v_catalog.is_active IS NOT TRUE THEN
        RAISE EXCEPTION '積分商城商品不存在或已下架';
    END IF;

    IF v_catalog.stock <= 0 THEN
        RAISE EXCEPTION '商品已兌完';
    END IF;

    SELECT * INTO v_template
    FROM public.reward_templates
    WHERE id = v_catalog.template_id;

    IF NOT FOUND
       OR v_template.status IS DISTINCT FROM 'active'::public.reward_template_status
       OR v_template.is_active IS NOT TRUE
       OR v_template.type NOT IN (
           'discount_coupon'::public.reward_type,
           'free_shipping'::public.reward_type
       ) THEN
        RAISE EXCEPTION '獎勵模板不可用';
    END IF;

    IF COALESCE(v_template.is_infinite, false) IS NOT TRUE THEN
        RAISE EXCEPTION '積分商城需無限庫存模板';
    END IF;

    IF v_catalog.max_redemptions_per_user IS NOT NULL THEN
        SELECT COUNT(*)::integer
        INTO v_user_claims
        FROM public.reward_redemption_claims rcl
        WHERE rcl.catalog_id = v_catalog.id
          AND rcl.user_id = v_user_id;

        IF v_user_claims >= v_catalog.max_redemptions_per_user THEN
            RAISE EXCEPTION '你已達此商品的兌換上限';
        END IF;
    END IF;

    SELECT COALESCE(gs.points_balance, 0)
    INTO v_points_balance
    FROM public.gamification_stats gs
    WHERE gs.user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND OR v_points_balance < v_catalog.points_cost THEN
        RAISE EXCEPTION '積分不足';
    END IF;

    v_redeem_result := public.fn_redeem_member_points(
        v_catalog.points_cost,
        format('積分兌換：%s', v_template.title),
        v_catalog.id
    );

    v_new_balance := COALESCE((v_redeem_result ->> 'points_balance')::integer, 0);

    v_dedup_key := 'catalog:' || v_catalog.id::text || ':' || gen_random_uuid()::text;

    v_user_reward_id := public.fn_issue_reward_from_template(
        v_user_id,
        v_template.id,
        v_dedup_key
    );

    IF v_user_reward_id IS NULL THEN
        RAISE EXCEPTION '發券失敗，請稍後再試';
    END IF;

    UPDATE public.reward_redemption_catalog
    SET stock = stock - 1, updated_at = now()
    WHERE id = v_catalog.id
      AND stock > 0;

    IF NOT FOUND THEN
        RAISE EXCEPTION '商品已兌完';
    END IF;

    INSERT INTO public.reward_redemption_claims (
        catalog_id,
        user_id,
        user_reward_id,
        points_spent
    )
    VALUES (
        v_catalog.id,
        v_user_id,
        v_user_reward_id,
        v_catalog.points_cost
    );

    RETURN jsonb_build_object(
        'success', true,
        'catalog_id', v_catalog.id,
        'points_redeemed', v_catalog.points_cost,
        'points_balance', v_new_balance,
        'user_reward_id', v_user_reward_id,
        'template_id', v_template.id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_set_reward_template_status(
    p_template_id UUID,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_row public.reward_templates%ROWTYPE;
    v_target public.reward_template_status;
    v_action public.reward_template_audit_action;
    v_payload JSONB;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_target := lower(trim(COALESCE(p_status, '')))::public.reward_template_status;

    IF v_target NOT IN ('draft'::public.reward_template_status, 'active'::public.reward_template_status, 'archived'::public.reward_template_status) THEN
        RAISE EXCEPTION '無效的模板狀態';
    END IF;

    SELECT * INTO v_row
    FROM public.reward_templates
    WHERE id = p_template_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到獎勵模板';
    END IF;

    IF v_target = 'active'::public.reward_template_status THEN
        v_payload := public._reward_template_row_to_json(v_row);

        IF EXISTS (
            SELECT 1
            FROM public.reward_redemption_catalog rrc
            WHERE rrc.template_id = p_template_id
        ) THEN
            v_payload := v_payload || jsonb_build_object(
                'redemption_catalog', (
                    SELECT jsonb_build_object(
                        'enabled', true,
                        'points_cost', rrc.points_cost,
                        'stock', rrc.stock,
                        'is_active', rrc.is_active,
                        'display_order', rrc.display_order,
                        'max_redemptions_per_user', rrc.max_redemptions_per_user
                    )
                    FROM public.reward_redemption_catalog rrc
                    WHERE rrc.template_id = p_template_id
                )
            );
        END IF;

        PERFORM public.fn_validate_reward_template(v_payload);
        v_action := 'publish'::public.reward_template_audit_action;
    ELSIF v_target = 'archived'::public.reward_template_status THEN
        v_action := 'archive'::public.reward_template_audit_action;
    ELSE
        v_action := 'update'::public.reward_template_audit_action;
    END IF;

    UPDATE public.reward_templates
    SET
        status = v_target,
        is_active = (v_target = 'active'::public.reward_template_status),
        updated_at = NOW()
    WHERE id = p_template_id
    RETURNING * INTO v_row;

    PERFORM public._reward_template_write_audit(
        v_row.id,
        v_admin_id,
        v_action,
        public._reward_template_row_to_json(v_row)
    );

    RETURN jsonb_build_object(
        'success', true,
        'template_id', v_row.id,
        'status', v_row.status,
        'row', public._reward_template_row_to_json(v_row)
    );
END;
$$;
