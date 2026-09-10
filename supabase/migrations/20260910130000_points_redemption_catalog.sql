-- Phase 4: Points redemption catalog (積分商城 MVP — coupon types only)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reward_redemption_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.reward_templates(id) ON DELETE RESTRICT,
    points_cost INTEGER NOT NULL CHECK (points_cost > 0),
    stock INTEGER NOT NULL CHECK (stock >= 0),
    initial_stock INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reward_redemption_catalog_template_id_key UNIQUE (template_id)
);

CREATE INDEX IF NOT EXISTS idx_redemption_catalog_active
    ON public.reward_redemption_catalog (is_active, display_order)
    WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.reward_redemption_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_id UUID NOT NULL REFERENCES public.reward_redemption_catalog(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_reward_id UUID REFERENCES public.user_rewards(id) ON DELETE SET NULL,
    points_spent INTEGER NOT NULL CHECK (points_spent > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redemption_claims_catalog_user
    ON public.reward_redemption_claims (catalog_id, user_id, created_at DESC);

ALTER TABLE public.reward_redemption_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemption_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reward_redemption_catalog FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reward_redemption_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.reward_redemption_catalog TO service_role;
GRANT ALL ON TABLE public.reward_redemption_claims TO service_role;

CREATE OR REPLACE FUNCTION public._touch_redemption_catalog_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_redemption_catalog_updated_at ON public.reward_redemption_catalog;
CREATE TRIGGER trg_redemption_catalog_updated_at
    BEFORE UPDATE ON public.reward_redemption_catalog
    FOR EACH ROW
    EXECUTE FUNCTION public._touch_redemption_catalog_updated_at();

-- ---------------------------------------------------------------------------
-- Admin catalog sync (called from rpc_admin_upsert_reward_activity)
-- ---------------------------------------------------------------------------

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
    IF v_is_active AND v_template.status IS DISTINCT FROM 'active'::public.reward_template_status THEN
        RAISE EXCEPTION '獎勵模板未發布，不可上架積分商城';
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

    -- Catalog stock is sole cap; bypass template max_claims for points redemption
    UPDATE public.reward_templates
    SET
        is_infinite = true,
        updated_at = now()
    WHERE id = p_template_id
      AND COALESCE(is_infinite, false) IS NOT TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public._admin_sync_redemption_catalog(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._admin_sync_redemption_catalog(UUID, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- Activity row JSON includes catalog
-- ---------------------------------------------------------------------------

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
                    'display_order', rrc.display_order
                )
                FROM public.reward_redemption_catalog rrc
                WHERE rrc.template_id = p_template.id
            )
        );
$$;

-- ---------------------------------------------------------------------------
-- Patch admin upsert: sync catalog after template upsert (all return paths)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_admin_upsert_reward_activity(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_template_id UUID;
    v_existing public.reward_templates%ROWTYPE;
    v_template_payload JSONB;
    v_template_result JSONB;
    v_row public.reward_templates%ROWTYPE;
    v_campaign public.reward_campaigns%ROWTYPE;
    v_distribution_mode public.reward_distribution_mode;
    v_new_distribution_mode public.reward_distribution_mode;
    v_schedule JSONB;
    v_campaign_id UUID;
    v_campaign_name TEXT;
    v_starts_at TIMESTAMPTZ;
    v_ends_at TIMESTAMPTZ;
    v_max_claims INTEGER;
    v_max_per_user INTEGER;
    v_override_days INTEGER;
    v_campaign_status public.reward_campaign_status;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_template_id := NULLIF(trim(COALESCE(p_payload ->> 'id', '')), '')::uuid;

    IF v_template_id IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.reward_templates
        WHERE id = v_template_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到獎勵活動';
        END IF;
    END IF;

    v_new_distribution_mode := COALESCE(
        NULLIF(trim(COALESCE(p_payload ->> 'distribution_mode', '')), '')::public.reward_distribution_mode,
        COALESCE(v_existing.distribution_mode, 'auto_grant'::public.reward_distribution_mode)
    );

    IF v_existing.id IS NOT NULL
       AND v_existing.status = 'active'::public.reward_template_status
       AND v_new_distribution_mode IS DISTINCT FROM v_existing.distribution_mode THEN
        RAISE EXCEPTION '已發布活動不可更改發放方式';
    END IF;

    IF v_new_distribution_mode = 'flash_only'::public.reward_distribution_mode THEN
        v_template_payload := p_payload
            || jsonb_build_object(
                'trigger_conditions', jsonb_build_object('kind', 'none')
            );
    ELSE
        v_template_payload := p_payload;
    END IF;

    v_template_result := public.rpc_admin_upsert_reward_template(v_template_payload);
    v_template_id := (v_template_result ->> 'template_id')::uuid;

    SELECT * INTO v_row
    FROM public.reward_templates
    WHERE id = v_template_id;

    PERFORM public._admin_sync_redemption_catalog(v_template_id, p_payload);

    SELECT * INTO v_row
    FROM public.reward_templates
    WHERE id = v_template_id;

    v_distribution_mode := v_row.distribution_mode;
    v_schedule := COALESCE(p_payload -> 'schedule', p_payload -> 'flash_schedule', '{}'::jsonb);
    v_starts_at := NULLIF(trim(COALESCE(v_schedule ->> 'starts_at', '')), '')::timestamptz;
    v_ends_at := NULLIF(trim(COALESCE(v_schedule ->> 'ends_at', '')), '')::timestamptz;

    IF v_distribution_mode = 'auto_grant'::public.reward_distribution_mode THEN
        IF v_starts_at IS NULL AND v_ends_at IS NULL THEN
            DELETE FROM public.reward_campaigns
            WHERE template_id = v_template_id;

            RETURN jsonb_build_object(
                'success', true,
                'activity_id', v_template_id,
                'template_id', v_template_id,
                'row', public._reward_activity_row_to_json(v_row, NULL)
            );
        END IF;

        IF v_starts_at IS NULL OR v_ends_at IS NULL THEN
            RAISE EXCEPTION '請同時設定活動開始與結束時間，或留空表示不限期';
        END IF;

        IF v_ends_at <= v_starts_at THEN
            RAISE EXCEPTION '活動結束時間必須晚於開始時間';
        END IF;

        v_campaign_name := NULLIF(trim(COALESCE(v_schedule ->> 'name', v_schedule ->> 'campaign_name', '')), '');
        IF v_campaign_name IS NULL THEN
            v_campaign_name := v_row.title;
        END IF;

        IF COALESCE(v_row.is_infinite, false) THEN
            v_max_claims := 2147483647;
        ELSE
            v_max_claims := GREATEST(COALESCE(v_row.max_claims, 1), 1);
        END IF;

        v_max_per_user := 1;
        v_override_days := NULL;

        v_campaign_status := COALESCE(
            NULLIF(trim(COALESCE(v_schedule ->> 'status', '')), '')::public.reward_campaign_status,
            CASE
                WHEN v_row.status = 'active'::public.reward_template_status
                    THEN 'active'::public.reward_campaign_status
                ELSE 'draft'::public.reward_campaign_status
            END
        );

        SELECT * INTO v_campaign
        FROM public.reward_campaigns
        WHERE template_id = v_template_id
        FOR UPDATE;

        IF FOUND THEN
            UPDATE public.reward_campaigns
            SET
                name = v_campaign_name,
                starts_at = v_starts_at,
                ends_at = v_ends_at,
                max_claims = v_max_claims,
                max_claims_per_user = v_max_per_user,
                override_valid_days = v_override_days,
                updated_at = now()
            WHERE template_id = v_template_id
            RETURNING * INTO v_campaign;
        ELSE
            INSERT INTO public.reward_campaigns (
                template_id,
                name,
                status,
                starts_at,
                ends_at,
                max_claims,
                max_claims_per_user,
                override_valid_days,
                created_by
            )
            VALUES (
                v_template_id,
                v_campaign_name,
                v_campaign_status,
                v_starts_at,
                v_ends_at,
                v_max_claims,
                v_max_per_user,
                v_override_days,
                v_admin_id
            )
            RETURNING * INTO v_campaign;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'activity_id', v_template_id,
            'template_id', v_template_id,
            'campaign_id', v_campaign.id,
            'row', public._reward_activity_row_to_json(v_row, v_campaign)
        );
    END IF;

    v_campaign_name := NULLIF(trim(COALESCE(v_schedule ->> 'name', v_schedule ->> 'campaign_name', '')), '');
    IF v_campaign_name IS NULL THEN
        v_campaign_name := v_row.title;
    END IF;

    IF v_starts_at IS NULL OR v_ends_at IS NULL THEN
        RAISE EXCEPTION '請設定活動開始與結束時間';
    END IF;
    IF v_ends_at <= v_starts_at THEN
        RAISE EXCEPTION '活動結束時間必須晚於開始時間';
    END IF;

    v_max_claims := NULLIF(trim(COALESCE(v_schedule ->> 'max_claims', '')), '')::integer;
    v_max_per_user := COALESCE(
        NULLIF(trim(COALESCE(v_schedule ->> 'max_claims_per_user', '')), '')::integer,
        1
    );
    IF v_max_claims IS NULL OR v_max_claims <= 0 THEN
        RAISE EXCEPTION '場次庫存必須大於 0';
    END IF;
    IF v_max_per_user <= 0 THEN
        RAISE EXCEPTION '每人限搶必須大於 0';
    END IF;

    v_override_days := NULLIF(trim(COALESCE(v_schedule ->> 'override_valid_days', '')), '')::integer;
    v_campaign_id := NULLIF(trim(COALESCE(v_schedule ->> 'campaign_id', v_schedule ->> 'id', '')), '')::uuid;

    v_campaign_status := COALESCE(
        NULLIF(trim(COALESCE(v_schedule ->> 'status', '')), '')::public.reward_campaign_status,
        CASE
            WHEN v_row.status = 'active'::public.reward_template_status
                THEN 'active'::public.reward_campaign_status
            ELSE 'draft'::public.reward_campaign_status
        END
    );

    SELECT * INTO v_campaign
    FROM public.reward_campaigns
    WHERE template_id = v_template_id
    FOR UPDATE;

    IF FOUND THEN
        IF v_max_claims < v_campaign.claimed_count THEN
            RAISE EXCEPTION '場次庫存不可少於已領取數量';
        END IF;

        UPDATE public.reward_campaigns
        SET
            name = v_campaign_name,
            starts_at = v_starts_at,
            ends_at = v_ends_at,
            max_claims = v_max_claims,
            max_claims_per_user = v_max_per_user,
            override_valid_days = v_override_days,
            updated_at = now()
        WHERE template_id = v_template_id
        RETURNING * INTO v_campaign;
    ELSE
        INSERT INTO public.reward_campaigns (
            template_id,
            name,
            status,
            starts_at,
            ends_at,
            max_claims,
            max_claims_per_user,
            override_valid_days,
            created_by
        )
        VALUES (
            v_template_id,
            v_campaign_name,
            v_campaign_status,
            v_starts_at,
            v_ends_at,
            v_max_claims,
            v_max_per_user,
            v_override_days,
            v_admin_id
        )
        RETURNING * INTO v_campaign;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'activity_id', v_template_id,
        'template_id', v_template_id,
        'campaign_id', v_campaign.id,
        'row', public._reward_activity_row_to_json(v_row, v_campaign)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- Member list + redeem RPCs
-- ---------------------------------------------------------------------------

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
                'can_redeem', (
                    rrc.stock > 0
                    AND v_points_balance >= rrc.points_cost
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
        RAISE EXCEPTION '獎勵模板設定無效（積分商城需無限庫存模板）';
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

REVOKE ALL ON FUNCTION public.rpc_list_points_redemption_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_redeem_points_catalog_item(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_list_points_redemption_catalog() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_redeem_points_catalog_item(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Auto-disable catalog when template archived
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._deactivate_catalog_on_template_archived()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'archived'::public.reward_template_status
       AND OLD.status IS DISTINCT FROM NEW.status THEN
        UPDATE public.reward_redemption_catalog
        SET is_active = false, updated_at = now()
        WHERE template_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deactivate_catalog_on_template_archived ON public.reward_templates;
CREATE TRIGGER trg_deactivate_catalog_on_template_archived
    AFTER UPDATE OF status ON public.reward_templates
    FOR EACH ROW
    EXECUTE FUNCTION public._deactivate_catalog_on_template_archived();
