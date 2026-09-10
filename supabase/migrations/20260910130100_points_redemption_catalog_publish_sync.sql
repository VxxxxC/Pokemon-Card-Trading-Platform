-- Phase 4 follow-up: allow catalog upsert on draft; activate on template publish

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
        updated_at = now()
    WHERE id = p_template_id
      AND COALESCE(is_infinite, false) IS NOT TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public._sync_catalog_active_for_template_status(
    p_template_id UUID,
    p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_template_id IS NULL THEN
        RETURN;
    END IF;

    IF lower(trim(COALESCE(p_status, ''))) = 'active' THEN
        UPDATE public.reward_redemption_catalog
        SET is_active = true, updated_at = now()
        WHERE template_id = p_template_id
          AND stock > 0;
        RETURN;
    END IF;

    IF lower(trim(COALESCE(p_status, ''))) IN ('draft', 'archived', 'paused', 'ended') THEN
        UPDATE public.reward_redemption_catalog
        SET is_active = false, updated_at = now()
        WHERE template_id = p_template_id;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._sync_catalog_active_for_template_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._sync_catalog_active_for_template_status(UUID, TEXT) TO service_role;

-- Patch status RPC: activate catalog when template goes active
CREATE OR REPLACE FUNCTION public.rpc_admin_set_reward_activity_status(
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
    v_template public.reward_templates%ROWTYPE;
    v_campaign public.reward_campaigns%ROWTYPE;
    v_status TEXT;
    v_template_result JSONB;
BEGIN
    v_admin_id := public._grading_require_admin();
    v_status := lower(trim(COALESCE(p_status, '')));

    SELECT * INTO v_template
    FROM public.reward_templates
    WHERE id = p_template_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到獎勵活動';
    END IF;

    SELECT * INTO v_campaign
    FROM public.reward_campaigns
    WHERE template_id = p_template_id
    LIMIT 1;

    IF v_template.distribution_mode = 'flash_only'::public.reward_distribution_mode THEN
        IF v_status IN ('paused', 'active', 'ended', 'draft') THEN
            IF v_campaign.id IS NULL AND v_status <> 'draft' THEN
                RAISE EXCEPTION '搶券活動尚未設定檔期';
            END IF;

            IF v_status = 'active' THEN
                v_template_result := public.rpc_admin_set_reward_template_status(
                    p_template_id,
                    'active'
                );
                IF v_campaign.id IS NOT NULL THEN
                    UPDATE public.reward_campaigns
                    SET status = 'active'::public.reward_campaign_status, updated_at = now()
                    WHERE id = v_campaign.id
                    RETURNING * INTO v_campaign;
                END IF;
            ELSIF v_status = 'paused' THEN
                IF v_campaign.id IS NULL THEN
                    RAISE EXCEPTION '找不到活動檔期';
                END IF;
                UPDATE public.reward_campaigns
                SET status = 'paused'::public.reward_campaign_status, updated_at = now()
                WHERE id = v_campaign.id
                RETURNING * INTO v_campaign;
            ELSIF v_status = 'ended' THEN
                IF v_campaign.id IS NOT NULL THEN
                    UPDATE public.reward_campaigns
                    SET status = 'ended'::public.reward_campaign_status, updated_at = now()
                    WHERE id = v_campaign.id
                    RETURNING * INTO v_campaign;
                END IF;
            ELSIF v_status = 'draft' THEN
                v_template_result := public.rpc_admin_set_reward_template_status(
                    p_template_id,
                    'draft'
                );
                IF v_campaign.id IS NOT NULL THEN
                    UPDATE public.reward_campaigns
                    SET status = 'draft'::public.reward_campaign_status, updated_at = now()
                    WHERE id = v_campaign.id
                    RETURNING * INTO v_campaign;
                END IF;
            END IF;

            PERFORM public._sync_catalog_active_for_template_status(p_template_id, v_status);

            SELECT * INTO v_template FROM public.reward_templates WHERE id = p_template_id;

            RETURN jsonb_build_object(
                'success', true,
                'activity_id', p_template_id,
                'status', v_status,
                'row', public._reward_activity_row_to_json(v_template, v_campaign)
            );
        ELSIF v_status = 'archived' THEN
            v_template_result := public.rpc_admin_set_reward_template_status(
                p_template_id,
                'archived'
            );
            IF v_campaign.id IS NOT NULL THEN
                UPDATE public.reward_campaigns
                SET status = 'ended'::public.reward_campaign_status, updated_at = now()
                WHERE id = v_campaign.id
                RETURNING * INTO v_campaign;
            END IF;
            PERFORM public._sync_catalog_active_for_template_status(p_template_id, v_status);
            SELECT * INTO v_template FROM public.reward_templates WHERE id = p_template_id;
            RETURN jsonb_build_object(
                'success', true,
                'activity_id', p_template_id,
                'status', 'archived',
                'row', public._reward_activity_row_to_json(v_template, v_campaign)
            );
        ELSE
            RAISE EXCEPTION '無效的活動狀態';
        END IF;
    END IF;

    IF v_status NOT IN ('draft', 'active', 'archived') THEN
        RAISE EXCEPTION '無效的活動狀態';
    END IF;

    v_template_result := public.rpc_admin_set_reward_template_status(
        p_template_id,
        v_status
    );

    IF v_campaign.id IS NOT NULL THEN
        IF v_status = 'active' THEN
            UPDATE public.reward_campaigns
            SET status = 'active'::public.reward_campaign_status, updated_at = now()
            WHERE id = v_campaign.id
            RETURNING * INTO v_campaign;
        ELSIF v_status = 'archived' THEN
            UPDATE public.reward_campaigns
            SET status = 'ended'::public.reward_campaign_status, updated_at = now()
            WHERE id = v_campaign.id
            RETURNING * INTO v_campaign;
        ELSIF v_status = 'draft' THEN
            UPDATE public.reward_campaigns
            SET status = 'draft'::public.reward_campaign_status, updated_at = now()
            WHERE id = v_campaign.id
            RETURNING * INTO v_campaign;
        END IF;
    END IF;

    PERFORM public._sync_catalog_active_for_template_status(p_template_id, v_status);

    SELECT * INTO v_template FROM public.reward_templates WHERE id = p_template_id;

    RETURN jsonb_build_object(
        'success', true,
        'activity_id', p_template_id,
        'status', v_status,
        'row', public._reward_activity_row_to_json(v_template, v_campaign)
    );
END;
$$;
