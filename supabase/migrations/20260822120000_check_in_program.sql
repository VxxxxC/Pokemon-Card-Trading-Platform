-- Check-in program MVP: DB-backed daily ladder + cycle completion bonus

-- Fixed singleton IDs (mirror lib/constants/rewards.ts)
-- program:     b1000001-0001-4001-8001-000000000001
-- completion:  b1000001-0001-4001-8001-000000000020

CREATE TABLE IF NOT EXISTS public.check_in_program (
    id UUID PRIMARY KEY,
    is_active BOOLEAN NOT NULL DEFAULT true,
    cycle_length_days INT NOT NULL DEFAULT 7,
    daily_rewards JSONB NOT NULL,
    completion_enabled BOOLEAN NOT NULL DEFAULT true,
    completion_type public.reward_type NOT NULL DEFAULT 'points',
    completion_reward_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    completion_title TEXT NOT NULL DEFAULT '',
    completion_description TEXT,
    completion_valid_duration_days INT,
    completion_type_locked BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID,
    CONSTRAINT chk_check_in_program_cycle_length CHECK (cycle_length_days = 7),
    CONSTRAINT chk_check_in_program_completion_type CHECK (
        completion_type IN (
            'points'::public.reward_type,
            'discount_coupon'::public.reward_type,
            'free_shipping'::public.reward_type
        )
    )
);

ALTER TABLE public.check_in_program ENABLE ROW LEVEL SECURITY;

INSERT INTO public.check_in_program (
    id,
    is_active,
    cycle_length_days,
    daily_rewards,
    completion_enabled,
    completion_type,
    completion_reward_value,
    completion_title,
    completion_description,
    completion_valid_duration_days,
    completion_type_locked
)
VALUES (
    'b1000001-0001-4001-8001-000000000001',
    true,
    7,
    '{"1": 10, "2": 15, "3": 20, "4": 25, "5": 30, "6": 40, "7": 100}'::jsonb,
    true,
    'points'::public.reward_type,
    '{"points": 50}'::jsonb,
    '簽滿 7 日加碼',
    '連續簽到週期第 7 日額外積分獎勵',
    NULL,
    false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.reward_templates (
    id,
    title,
    description,
    type,
    reward_value,
    trigger_conditions,
    is_active,
    is_infinite,
    valid_duration_days,
    status,
    distribution_mode,
    restrictions
)
VALUES (
    'b1000001-0001-4001-8001-000000000020',
    '簽滿 7 日加碼',
    '連續簽到週期第 7 日額外積分獎勵',
    'points',
    '{"points": 50}'::jsonb,
    '{"kind": "check_in_program_internal"}'::jsonb,
    true,
    true,
    NULL,
    'active'::public.reward_template_status,
    'auto_grant'::public.reward_distribution_mode,
    '{"order_kinds": ["merchant"], "requires_authentication": "any", "shipping_methods": ["sf"], "min_item_subtotal_hkd": 0}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.reward_templates
SET is_active = false,
    status = 'archived'::public.reward_template_status,
    updated_at = now()
WHERE id = 'a1000001-0001-4001-8001-000000000001';

CREATE OR REPLACE FUNCTION public.fn_get_check_in_daily_points(p_cycle_day INT)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_points INT;
    v_rewards JSONB;
BEGIN
    SELECT cp.daily_rewards
    INTO v_rewards
    FROM public.check_in_program cp
    WHERE cp.id = 'b1000001-0001-4001-8001-000000000001';

    IF v_rewards IS NULL THEN
        RAISE EXCEPTION '簽到計劃尚未設定';
    END IF;

    v_points := (v_rewards ->> p_cycle_day::text)::int;

    IF v_points IS NULL OR v_points <= 0 THEN
        RAISE EXCEPTION '簽到計劃每日積分設定無效（第 % 日）', p_cycle_day;
    END IF;

    RETURN v_points;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_build_grant_json(
    p_user_reward_id UUID,
    p_template public.reward_templates
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_points INT;
BEGIN
    v_points := NULL;
    IF p_template.type = 'points' THEN
        v_points := COALESCE((p_template.reward_value ->> 'points')::int, 0);
    END IF;

    RETURN jsonb_build_object(
        'user_reward_id', p_user_reward_id,
        'template_id', p_template.id,
        'title', p_template.title,
        'description', p_template.description,
        'type', p_template.type,
        'reward_value', p_template.reward_value,
        'points_granted', v_points
    );
END;
$$;

CREATE OR REPLACE FUNCTION public._check_in_program_row_to_json(p_row public.check_in_program)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'id', p_row.id,
        'is_active', p_row.is_active,
        'cycle_length_days', p_row.cycle_length_days,
        'daily_rewards', p_row.daily_rewards,
        'completion_enabled', p_row.completion_enabled,
        'completion_type', p_row.completion_type,
        'completion_reward_value', p_row.completion_reward_value,
        'completion_title', p_row.completion_title,
        'completion_description', p_row.completion_description,
        'completion_valid_duration_days', p_row.completion_valid_duration_days,
        'completion_type_locked', p_row.completion_type_locked,
        'updated_at', p_row.updated_at,
        'updated_by', p_row.updated_by
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_validate_check_in_program_payload(p_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_day INT;
    v_points INT;
    v_type TEXT;
    v_reward_value JSONB;
    v_amount NUMERIC;
    v_max_subsidy NUMERIC;
    v_daily JSONB;
BEGIN
    v_daily := COALESCE(p_payload -> 'daily_rewards', '{}'::jsonb);

    FOR v_day IN 1..7 LOOP
        v_points := COALESCE((v_daily ->> v_day::text)::int, 0);
        IF v_points <= 0 THEN
            RAISE EXCEPTION '每日簽到積分第 % 日必須大於 0', v_day;
        END IF;
    END LOOP;

    IF COALESCE((p_payload ->> 'completion_enabled')::boolean, false) THEN
        v_type := NULLIF(trim(COALESCE(p_payload ->> 'completion_type', '')), '');
        v_reward_value := COALESCE(p_payload -> 'completion_reward_value', '{}'::jsonb);

        IF v_type IS NULL THEN
            RAISE EXCEPTION '請選擇簽滿獎勵類型';
        END IF;

        IF v_type NOT IN ('points', 'discount_coupon', 'free_shipping') THEN
            RAISE EXCEPTION '不支援的簽滿獎勵類型';
        END IF;

        IF NULLIF(trim(COALESCE(p_payload ->> 'completion_title', '')), '') IS NULL THEN
            RAISE EXCEPTION '請填寫簽滿獎勵標題';
        END IF;

        IF v_type = 'points' THEN
            IF COALESCE((v_reward_value ->> 'points')::int, 0) <= 0 THEN
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
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_sync_check_in_program_template(
    p_program public.check_in_program
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.reward_templates (
        id,
        title,
        description,
        type,
        reward_value,
        trigger_conditions,
        is_active,
        is_infinite,
        valid_duration_days,
        status,
        distribution_mode,
        restrictions
    )
    VALUES (
        'b1000001-0001-4001-8001-000000000020',
        p_program.completion_title,
        p_program.completion_description,
        p_program.completion_type,
        p_program.completion_reward_value,
        '{"kind": "check_in_program_internal"}'::jsonb,
        true,
        true,
        p_program.completion_valid_duration_days,
        'active'::public.reward_template_status,
        'auto_grant'::public.reward_distribution_mode,
        '{"order_kinds": ["merchant"], "requires_authentication": "any", "shipping_methods": ["sf"], "min_item_subtotal_hkd": 0}'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        type = EXCLUDED.type,
        reward_value = EXCLUDED.reward_value,
        valid_duration_days = EXCLUDED.valid_duration_days,
        trigger_conditions = EXCLUDED.trigger_conditions,
        distribution_mode = EXCLUDED.distribution_mode,
        status = 'active'::public.reward_template_status,
        is_active = true,
        is_infinite = true,
        restrictions = EXCLUDED.restrictions,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_check_in_program_for_member()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row public.check_in_program%ROWTYPE;
    v_preview JSONB;
BEGIN
    SELECT * INTO v_row
    FROM public.check_in_program
    WHERE id = 'b1000001-0001-4001-8001-000000000001';

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'is_active', false,
            'cycle_length_days', 7,
            'daily_rewards', '{"1":10,"2":15,"3":20,"4":25,"5":30,"6":40,"7":100}'::jsonb,
            'completion_preview', NULL
        );
    END IF;

    v_preview := NULL;
    IF v_row.completion_enabled THEN
        v_preview := jsonb_build_object(
            'enabled', true,
            'type', v_row.completion_type,
            'title', v_row.completion_title,
            'description', v_row.completion_description,
            'reward_value', v_row.completion_reward_value
        );
    ELSE
        v_preview := jsonb_build_object('enabled', false);
    END IF;

    RETURN jsonb_build_object(
        'is_active', v_row.is_active,
        'cycle_length_days', v_row.cycle_length_days,
        'daily_rewards', v_row.daily_rewards,
        'completion_preview', v_preview
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_get_check_in_program()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_row public.check_in_program%ROWTYPE;
BEGIN
    v_admin_id := public._grading_require_admin();

    SELECT * INTO v_row
    FROM public.check_in_program
    WHERE id = 'b1000001-0001-4001-8001-000000000001';

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到簽到計劃';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'row', public._check_in_program_row_to_json(v_row)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_upsert_check_in_program(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_row public.check_in_program%ROWTYPE;
    v_existing public.check_in_program%ROWTYPE;
    v_new_type public.reward_type;
    v_completion_enabled BOOLEAN;
BEGIN
    v_admin_id := public._grading_require_admin();

    PERFORM public.fn_validate_check_in_program_payload(p_payload);

    SELECT * INTO v_existing
    FROM public.check_in_program
    WHERE id = 'b1000001-0001-4001-8001-000000000001'
    FOR UPDATE;

    v_completion_enabled := COALESCE((p_payload ->> 'completion_enabled')::boolean, false);
    v_new_type := NULLIF(trim(COALESCE(p_payload ->> 'completion_type', '')), '')::public.reward_type;

    IF v_existing.completion_type_locked
       AND v_new_type IS NOT NULL
       AND v_new_type IS DISTINCT FROM v_existing.completion_type THEN
        RAISE EXCEPTION '簽滿獎勵類型已鎖定，不可更改';
    END IF;

    UPDATE public.check_in_program
    SET is_active = COALESCE((p_payload ->> 'is_active')::boolean, is_active),
        daily_rewards = COALESCE(p_payload -> 'daily_rewards', daily_rewards),
        completion_enabled = v_completion_enabled,
        completion_type = COALESCE(v_new_type, completion_type),
        completion_reward_value = COALESCE(
            p_payload -> 'completion_reward_value',
            completion_reward_value
        ),
        completion_title = COALESCE(
            NULLIF(trim(COALESCE(p_payload ->> 'completion_title', '')), ''),
            completion_title
        ),
        completion_description = COALESCE(
            NULLIF(trim(COALESCE(p_payload ->> 'completion_description', '')), ''),
            completion_description
        ),
        completion_valid_duration_days = CASE
            WHEN p_payload ? 'completion_valid_duration_days' THEN
                NULLIF(trim(COALESCE(p_payload ->> 'completion_valid_duration_days', '')), '')::int
            ELSE completion_valid_duration_days
        END,
        completion_type_locked = completion_type_locked
            OR v_completion_enabled,
        updated_at = now(),
        updated_by = v_admin_id
    WHERE id = 'b1000001-0001-4001-8001-000000000001'
    RETURNING * INTO v_row;

    PERFORM public.fn_sync_check_in_program_template(v_row);

    RETURN jsonb_build_object(
        'success', true,
        'row', public._check_in_program_row_to_json(v_row)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_daily_check_in()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_today_hk DATE := (NOW() AT TIME ZONE 'Asia/Hong_Kong')::date;
    v_last_hk DATE;
    v_streak INT := 1;
    v_longest INT := 0;
    v_cycle_day INT;
    v_points INT;
    v_new_balance INT;
    v_stats public.gamification_stats%ROWTYPE;
    v_program public.check_in_program%ROWTYPE;
    v_completion_template public.reward_templates%ROWTYPE;
    v_completion_id UUID;
    v_dedup TEXT;
    v_completion_grant JSONB := '[]'::jsonb;
    v_auto_grants JSONB;
    v_newly_granted JSONB;
    v_completion_granted JSONB := NULL;
    v_completion_points INT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '請先登入後再簽到';
    END IF;

    SELECT * INTO v_program
    FROM public.check_in_program
    WHERE id = 'b1000001-0001-4001-8001-000000000001';

    IF NOT FOUND OR v_program.is_active IS NOT TRUE THEN
        RAISE EXCEPTION '簽到計劃已暫停';
    END IF;

    INSERT INTO public.gamification_stats (user_id, points_balance, current_streak, longest_streak)
    VALUES (v_user_id, 0, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO v_stats
    FROM public.gamification_stats
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF v_stats.last_check_in IS NOT NULL THEN
        v_last_hk := (v_stats.last_check_in AT TIME ZONE 'Asia/Hong_Kong')::date;

        IF v_last_hk = v_today_hk THEN
            RAISE EXCEPTION '今日已簽到，請明天再來';
        END IF;

        IF v_last_hk = v_today_hk - 1 THEN
            v_streak := COALESCE(v_stats.current_streak, 0) + 1;
        ELSE
            v_streak := 1;
        END IF;
    END IF;

    v_longest := GREATEST(COALESCE(v_stats.longest_streak, 0), v_streak);
    v_cycle_day := ((v_streak - 1) % 7) + 1;
    v_points := public.fn_get_check_in_daily_points(v_cycle_day);

    UPDATE public.gamification_stats
    SET current_streak = v_streak,
        longest_streak = v_longest,
        last_check_in = NOW(),
        updated_at = NOW()
    WHERE user_id = v_user_id;

    v_new_balance := public.fn_apply_point_transaction(
        v_user_id,
        v_points,
        'daily_check_in',
        NULL,
        format('每日簽到第 %s 天（連續 %s 天）', v_cycle_day, v_streak)
    );

    PERFORM public.fn_recalculate_reputation_tags(v_user_id);

    IF v_cycle_day = 7
       AND v_program.completion_enabled IS TRUE THEN
        v_dedup := 'cycle-' || floor((v_streak - 1) / 7)::text;

        v_completion_id := public.fn_issue_reward_from_template(
            v_user_id,
            'b1000001-0001-4001-8001-000000000020',
            v_dedup
        );

        IF v_completion_id IS NOT NULL THEN
            SELECT * INTO v_completion_template
            FROM public.reward_templates
            WHERE id = 'b1000001-0001-4001-8001-000000000020';

            v_completion_grant := jsonb_build_array(
                public.fn_build_grant_json(v_completion_id, v_completion_template)
            );

            v_completion_points := NULL;
            IF v_completion_template.type = 'points' THEN
                v_completion_points := COALESCE(
                    (v_completion_template.reward_value ->> 'points')::int,
                    0
                );
            END IF;

            v_completion_granted := jsonb_build_object(
                'type', v_completion_template.type,
                'title', v_completion_template.title,
                'points_granted', v_completion_points
            );
        END IF;
    END IF;

    v_auto_grants := public.fn_try_auto_grant_rewards(v_user_id);
    v_newly_granted := v_completion_grant || COALESCE(v_auto_grants, '[]'::jsonb);

    RETURN jsonb_build_object(
        'success', true,
        'points_earned', v_points,
        'points_balance', v_new_balance,
        'current_streak', v_streak,
        'longest_streak', v_longest,
        'cycle_day', v_cycle_day,
        'checked_in_today', true,
        'newly_granted', v_newly_granted,
        'completion_granted', v_completion_granted
    );
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
          AND COALESCE(trigger_conditions ->> 'kind', '') <> 'check_in_program_internal'
        ORDER BY created_at ASC NULLS LAST
    LOOP
        SELECT t.eligible, t.grant_dedup_key
        INTO v_eligible, v_dedup_key
        FROM public.fn_template_is_eligible(p_user_id, v_template) AS t;

        IF NOT COALESCE(v_eligible, false) THEN
            CONTINUE;
        END IF;

        IF COALESCE((v_template.trigger_conditions ->> 'once_per_user')::boolean, false)
           OR v_template.trigger_conditions ->> 'kind' IN ('trade_count', 'check_in_streak', 'event_once') THEN
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
          AND COALESCE(rt.trigger_conditions ->> 'kind', '') NOT IN ('none', 'check_in_program_internal')
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
          AND COALESCE(rt.trigger_conditions ->> 'kind', '') <> 'check_in_program_internal'
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
      AND COALESCE(trigger_conditions ->> 'kind', '') <> 'check_in_program_internal';

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

REVOKE ALL ON FUNCTION public.fn_get_check_in_daily_points(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_build_grant_json(UUID, public.reward_templates) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_check_in_program_for_member() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_admin_get_check_in_program() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_admin_upsert_check_in_program(JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_get_check_in_daily_points(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_check_in_program_for_member() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_admin_get_check_in_program() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_admin_upsert_check_in_program(JSONB) TO authenticated, service_role;
