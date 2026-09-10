-- Admin reward activity workflow: trigger kind none, 1:1 template:campaign, unified activity RPCs.

-- Remove duplicate campaigns per template (keep newest) before unique index.
DELETE FROM public.reward_campaigns rc
WHERE rc.id NOT IN (
    SELECT DISTINCT ON (template_id) id
    FROM public.reward_campaigns
    ORDER BY template_id, created_at DESC NULLS LAST, id DESC
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reward_campaigns_template_id
    ON public.reward_campaigns (template_id);


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
    v_min_streak INT;
    v_day INT;
    v_count INT;
    v_role TEXT;
    v_distribution_mode public.reward_distribution_mode;
BEGIN
    v_type := NULLIF(trim(COALESCE(p_payload ->> 'type', '')), '');
    v_reward_value := COALESCE(p_payload -> 'reward_value', '{}'::jsonb);
    v_trigger := COALESCE(p_payload -> 'trigger_conditions', '{}'::jsonb);
    v_kind := NULLIF(trim(COALESCE(v_trigger ->> 'kind', '')), '');

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
    ELSE
        IF v_kind IS NULL THEN
            RAISE EXCEPTION '請設定觸發條件';
        END IF;

        IF v_kind NOT IN ('event_once', 'trade_count', 'check_in_streak', 'check_in_cycle_day') THEN
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
        IF v_event NOT IN ('profile_complete', 'first_listing', 'first_chat') THEN
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
    ELSIF v_kind = 'check_in_streak' THEN
        v_min_streak := COALESCE((v_trigger ->> 'min_streak')::int, 0);
        IF v_min_streak <= 0 THEN
            RAISE EXCEPTION '連續簽到天數必須大於 0';
        END IF;
    ELSIF v_kind = 'check_in_cycle_day' THEN
        v_day := COALESCE((v_trigger ->> 'day')::int, 0);
        IF v_day < 1 OR v_day > 7 THEN
            RAISE EXCEPTION '簽到週期日必須為 1 至 7';
        END IF;
    END IF;
END;
$$;


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
            END
        );
$$;


CREATE OR REPLACE FUNCTION public.rpc_admin_list_reward_activities(
    p_status TEXT DEFAULT 'all',
    p_page INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_limit INTEGER;
    v_offset INTEGER;
    v_rows JSONB;
    v_total BIGINT;
    v_status TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_limit := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
    v_offset := (GREATEST(COALESCE(p_page, 1), 1) - 1) * v_limit;
    v_status := lower(trim(COALESCE(p_status, 'all')));

    WITH base AS (
        SELECT
            rt.*,
            rc.id AS campaign_id,
            rc.name AS campaign_name,
            rc.status AS campaign_status,
            rc.starts_at,
            rc.ends_at,
            rc.max_claims AS campaign_max_claims,
            rc.claimed_count AS campaign_claimed_count,
            rc.max_claims_per_user,
            rc.override_valid_days,
            CASE
                WHEN rt.distribution_mode = 'flash_only'::public.reward_distribution_mode
                     AND rc.id IS NOT NULL THEN rc.status::text
                ELSE rt.status::text
            END AS display_status
        FROM public.reward_templates rt
        LEFT JOIN public.reward_campaigns rc ON rc.template_id = rt.id
        WHERE rt.type <> 'lucky_draw_ticket'
    ),
    filtered AS (
        SELECT *
        FROM base
        WHERE v_status = 'all'
           OR display_status = v_status
           OR (v_status = 'draft' AND status = 'draft'::public.reward_template_status)
           OR (v_status = 'archived' AND status = 'archived'::public.reward_template_status)
    ),
    counted AS (
        SELECT COUNT(*)::BIGINT AS total FROM filtered
    ),
    paged AS (
        SELECT id
        FROM filtered
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
        LIMIT v_limit OFFSET v_offset
    )
    SELECT
        COALESCE(
            (
                SELECT jsonb_agg(
                    public._reward_activity_row_to_json(rt, rc)
                    ORDER BY rt.updated_at DESC NULLS LAST, rt.created_at DESC
                )
                FROM paged p
                INNER JOIN public.reward_templates rt ON rt.id = p.id
                LEFT JOIN public.reward_campaigns rc ON rc.template_id = p.id
            ),
            '[]'::jsonb
        ),
        (SELECT total FROM counted)
    INTO v_rows, v_total;

    RETURN jsonb_build_object(
        'rows', COALESCE(v_rows, '[]'::jsonb),
        'total', COALESCE(v_total, 0),
        'page', GREATEST(COALESCE(p_page, 1), 1),
        'page_size', v_limit
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.rpc_admin_get_reward_activity(p_template_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_template public.reward_templates%ROWTYPE;
    v_campaign public.reward_campaigns%ROWTYPE;
BEGIN
    v_admin_id := public._grading_require_admin();

    SELECT * INTO v_template
    FROM public.reward_templates
    WHERE id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到獎勵活動';
    END IF;

    SELECT * INTO v_campaign
    FROM public.reward_campaigns
    WHERE template_id = p_template_id
    LIMIT 1;

    RETURN jsonb_build_object(
        'success', true,
        'row', public._reward_activity_row_to_json(v_template, v_campaign)
    );
END;
$$;


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

    v_distribution_mode := v_row.distribution_mode;

    IF v_distribution_mode = 'auto_grant'::public.reward_distribution_mode THEN
        DELETE FROM public.reward_campaigns
        WHERE template_id = v_template_id;

        RETURN jsonb_build_object(
            'success', true,
            'activity_id', v_template_id,
            'template_id', v_template_id,
            'row', public._reward_activity_row_to_json(v_row, NULL)
        );
    END IF;

    v_schedule := COALESCE(p_payload -> 'schedule', p_payload -> 'flash_schedule', '{}'::jsonb);

    v_campaign_name := NULLIF(trim(COALESCE(v_schedule ->> 'name', v_schedule ->> 'campaign_name', '')), '');
    IF v_campaign_name IS NULL THEN
        v_campaign_name := v_row.title;
    END IF;

    v_starts_at := NULLIF(trim(COALESCE(v_schedule ->> 'starts_at', '')), '')::timestamptz;
    v_ends_at := NULLIF(trim(COALESCE(v_schedule ->> 'ends_at', '')), '')::timestamptz;
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
    v_template_status public.reward_template_status;
    v_campaign_status public.reward_campaign_status;
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

    SELECT * INTO v_template FROM public.reward_templates WHERE id = p_template_id;

    RETURN jsonb_build_object(
        'success', true,
        'activity_id', p_template_id,
        'status', v_status,
        'row', public._reward_activity_row_to_json(v_template, NULL)
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_reward_coupon_center(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_wallet JSONB;
    v_locked JSONB;
BEGIN
    v_user_id := COALESCE(p_user_id, auth.uid());
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '請先登入';
    END IF;

    PERFORM public.fn_try_auto_grant_rewards(v_user_id);

    v_wallet := COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', ur.id,
                'is_used', ur.is_used,
                'calculated_expiry', ur.calculated_expiry,
                'used_at', ur.used_at,
                'template', jsonb_build_object(
                    'title', rt.title,
                    'description', rt.description,
                    'type', rt.type,
                    'reward_value', rt.reward_value
                )
            )
            ORDER BY ur.created_at DESC
        )
        FROM public.user_rewards ur
        INNER JOIN public.reward_templates rt ON rt.id = ur.template_id
        WHERE ur.user_id = v_user_id
          AND rt.type IN ('discount_coupon', 'free_shipping')
    ), '[]'::jsonb);

    v_locked := COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object(
                'template_id', rt.id,
                'title', rt.title,
                'description', rt.description,
                'type', rt.type,
                'reward_value', rt.reward_value,
                'progress', public.fn_reward_template_progress_detail(v_user_id, rt)
            )
            ORDER BY rt.created_at ASC NULLS LAST
        )
        FROM public.reward_templates rt
        WHERE rt.is_active IS TRUE
          AND rt.type IN ('discount_coupon', 'free_shipping')
          AND COALESCE(rt.distribution_mode, 'auto_grant'::public.reward_distribution_mode)
              = 'auto_grant'::public.reward_distribution_mode
          AND COALESCE(rt.trigger_conditions ->> 'kind', '') <> 'none'
          AND public.fn_reward_template_has_stock(rt)
          AND NOT EXISTS (
              SELECT 1
              FROM public.fn_template_is_eligible(v_user_id, rt) AS elig
              WHERE COALESCE(elig.eligible, false)
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.user_rewards ur
              WHERE ur.user_id = v_user_id
                AND ur.template_id = rt.id
                AND ur.grant_dedup_key = 'lifetime'
          )
    ), '[]'::jsonb);

    RETURN jsonb_build_object(
        'wallet', v_wallet,
        'locked', v_locked
    );
END;
$$;


REVOKE ALL ON FUNCTION public.rpc_admin_list_reward_activities(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_reward_activities(TEXT, INTEGER, INTEGER)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_admin_get_reward_activity(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_get_reward_activity(UUID)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_admin_upsert_reward_activity(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_upsert_reward_activity(JSONB)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_admin_set_reward_activity_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_set_reward_activity_status(UUID, TEXT)
    TO authenticated, service_role;
