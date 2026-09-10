-- Deprecate check_in_streak / check_in_cycle_day reward-activity triggers.
-- All check-in rewards are managed via check_in_program + execute_daily_check_in.

UPDATE public.reward_templates
SET
    is_active = false,
    status = 'archived'::public.reward_template_status,
    updated_at = NOW()
WHERE id IN (
    'a1000001-0001-4001-8001-000000000001'::uuid,
    'a1000001-0001-4001-8001-000000000003'::uuid
);

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

CREATE OR REPLACE FUNCTION public.fn_try_auto_grant_rewards(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_template public.reward_templates%ROWTYPE;
    v_eligible BOOLEAN;
    v_dedup_key TEXT;
    v_user_reward_id UUID;
    v_grants JSONB := '[]'::jsonb;
    v_points INT;
BEGIN
    FOR v_template IN
        SELECT *
        FROM public.reward_templates
        WHERE is_active = true
          AND status = 'active'::public.reward_template_status
          AND type <> 'lucky_draw_ticket'
          AND COALESCE(distribution_mode, 'auto_grant'::public.reward_distribution_mode) = 'auto_grant'::public.reward_distribution_mode
          AND COALESCE(trigger_conditions ->> 'kind', '') NOT IN (
              'check_in_program_internal',
              'check_in_streak',
              'check_in_cycle_day'
          )
        ORDER BY created_at ASC NULLS LAST
    LOOP
        SELECT t.eligible, t.grant_dedup_key
        INTO v_eligible, v_dedup_key
        FROM public.fn_template_is_eligible(p_user_id, v_template) AS t;

        IF NOT COALESCE(v_eligible, false) THEN
            CONTINUE;
        END IF;

        IF COALESCE((v_template.trigger_conditions ->> 'once_per_user')::boolean, false)
           OR v_template.trigger_conditions ->> 'kind' IN ('trade_count', 'event_once') THEN
            IF EXISTS (
                SELECT 1
                FROM public.user_rewards ur
                WHERE ur.user_id = p_user_id
                  AND ur.template_id = v_template.id
                  AND ur.grant_dedup_key = 'lifetime'
            ) THEN
                CONTINUE;
            END IF;
        END IF;

        v_user_reward_id := public.fn_issue_reward_from_template(
            p_user_id,
            v_template.id,
            v_dedup_key
        );

        IF v_user_reward_id IS NULL THEN
            CONTINUE;
        END IF;

        v_points := NULL;
        IF v_template.type = 'points' THEN
            v_points := COALESCE((v_template.reward_value ->> 'points')::int, 0);
        END IF;

        v_grants := v_grants || jsonb_build_array(
            jsonb_build_object(
                'user_reward_id', v_user_reward_id,
                'template_id', v_template.id,
                'title', v_template.title,
                'description', v_template.description,
                'type', v_template.type,
                'reward_value', v_template.reward_value,
                'points_granted', v_points
            )
        );
    END LOOP;

    RETURN v_grants;
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
          AND COALESCE(rt.trigger_conditions ->> 'kind', '') NOT IN (
              'none',
              'check_in_program_internal',
              'check_in_streak',
              'check_in_cycle_day'
          )
          AND public.fn_reward_template_has_stock(rt)
          AND NOT EXISTS (
              SELECT 1
              FROM public.reward_campaigns rc
              WHERE rc.template_id = rt.id
                AND NOW() > rc.ends_at
          )
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
          AND COALESCE(rt.trigger_conditions ->> 'kind', '') NOT IN (
              'check_in_program_internal',
              'check_in_streak',
              'check_in_cycle_day'
          )
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

    IF p_template_id = 'b1000001-0001-4001-8001-000000000020'::uuid THEN
        RAISE EXCEPTION '找不到獎勵活動';
    END IF;

    SELECT * INTO v_template
    FROM public.reward_templates
    WHERE id = p_template_id
      AND COALESCE(trigger_conditions ->> 'kind', '') NOT IN (
          'check_in_program_internal',
          'check_in_streak',
          'check_in_cycle_day'
      );

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

CREATE OR REPLACE FUNCTION public.rpc_admin_list_reward_templates(
    p_status TEXT DEFAULT 'all',
    p_type TEXT DEFAULT NULL,
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
    v_offset INTEGER;
    v_limit INTEGER;
    v_status TEXT;
    v_type TEXT;
    v_rows JSONB;
    v_total BIGINT;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_limit := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 50);
    v_offset := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_limit;
    v_status := lower(trim(COALESCE(p_status, 'all')));
    v_type := NULLIF(trim(COALESCE(p_type, '')), '');

    WITH filtered AS (
        SELECT rt.*
        FROM public.reward_templates rt
        WHERE
            CASE
                WHEN v_status IN ('draft', 'active', 'archived') THEN rt.status::TEXT = v_status
                ELSE TRUE
            END
            AND (v_type IS NULL OR rt.type::TEXT = v_type)
            AND COALESCE(rt.trigger_conditions ->> 'kind', '') NOT IN (
                'check_in_program_internal',
                'check_in_streak',
                'check_in_cycle_day'
            )
    ),
    counted AS (
        SELECT COUNT(*)::BIGINT AS total FROM filtered
    )
    SELECT
        COALESCE(
            (
                SELECT jsonb_agg(public._reward_template_row_to_json(f) ORDER BY f.updated_at DESC NULLS LAST, f.created_at DESC)
                FROM (
                    SELECT * FROM filtered
                    ORDER BY updated_at DESC NULLS LAST, created_at DESC
                    LIMIT v_limit OFFSET v_offset
                ) f
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
