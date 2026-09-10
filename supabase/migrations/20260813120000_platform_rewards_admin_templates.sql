-- Platform Rewards v2 Phase 1: admin template CRUD, audits, validation RPCs.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reward_template_status') THEN
        CREATE TYPE public.reward_template_status AS ENUM ('draft', 'active', 'archived');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reward_distribution_mode') THEN
        CREATE TYPE public.reward_distribution_mode AS ENUM ('auto_grant', 'flash_only');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reward_template_audit_action') THEN
        CREATE TYPE public.reward_template_audit_action AS ENUM (
            'create',
            'update',
            'publish',
            'archive'
        );
    END IF;
END
$$;

ALTER TABLE public.reward_templates
    ADD COLUMN IF NOT EXISTS status public.reward_template_status NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS distribution_mode public.reward_distribution_mode NOT NULL DEFAULT 'auto_grant',
    ADD COLUMN IF NOT EXISTS restrictions JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.reward_templates
SET
    status = CASE
        WHEN COALESCE(is_active, false) THEN 'active'::public.reward_template_status
        ELSE 'archived'::public.reward_template_status
    END,
    distribution_mode = 'auto_grant'::public.reward_distribution_mode,
    restrictions = COALESCE(restrictions, '{}'::jsonb),
    updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.reward_template_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.reward_templates (id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES public.profiles (id),
    action public.reward_template_audit_action NOT NULL,
    snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reward_template_audits_template_created
    ON public.reward_template_audits (template_id, created_at DESC);

ALTER TABLE public.reward_template_audits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reward_template_audits FROM PUBLIC;
GRANT ALL ON TABLE public.reward_template_audits TO service_role;


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
BEGIN
    v_type := NULLIF(trim(COALESCE(p_payload ->> 'type', '')), '');
    v_reward_value := COALESCE(p_payload -> 'reward_value', '{}'::jsonb);
    v_trigger := COALESCE(p_payload -> 'trigger_conditions', '{}'::jsonb);
    v_kind := NULLIF(trim(COALESCE(v_trigger ->> 'kind', '')), '');

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

    IF v_kind IS NULL THEN
        RAISE EXCEPTION '請設定觸發條件';
    END IF;

    IF v_kind NOT IN ('event_once', 'trade_count', 'check_in_streak', 'check_in_cycle_day') THEN
        RAISE EXCEPTION '不支援的觸發條件';
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


CREATE OR REPLACE FUNCTION public._reward_template_row_to_json(p_row public.reward_templates)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'id', p_row.id,
        'title', p_row.title,
        'description', p_row.description,
        'type', p_row.type,
        'reward_value', p_row.reward_value,
        'trigger_conditions', p_row.trigger_conditions,
        'is_active', p_row.is_active,
        'is_infinite', p_row.is_infinite,
        'max_claims', p_row.max_claims,
        'claimed_count', p_row.claimed_count,
        'valid_duration_days', p_row.valid_duration_days,
        'fixed_expiry_date', p_row.fixed_expiry_date,
        'status', p_row.status,
        'distribution_mode', p_row.distribution_mode,
        'restrictions', p_row.restrictions,
        'created_at', p_row.created_at,
        'updated_at', p_row.updated_at
    );
$$;


CREATE OR REPLACE FUNCTION public._reward_template_write_audit(
    p_template_id UUID,
    p_admin_id UUID,
    p_action public.reward_template_audit_action,
    p_snapshot JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.reward_template_audits (
        template_id,
        admin_id,
        action,
        snapshot
    )
    VALUES (
        p_template_id,
        p_admin_id,
        p_action,
        p_snapshot
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


CREATE OR REPLACE FUNCTION public.rpc_admin_upsert_reward_template(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_id UUID;
    v_row public.reward_templates%ROWTYPE;
    v_is_new BOOLEAN := false;
    v_action public.reward_template_audit_action;
    v_is_infinite BOOLEAN;
    v_max_claims INT;
BEGIN
    v_admin_id := public._grading_require_admin();
    PERFORM public.fn_validate_reward_template(p_payload);

    v_id := NULLIF(trim(COALESCE(p_payload ->> 'id', '')), '')::uuid;

    v_is_infinite := COALESCE((p_payload ->> 'is_infinite')::boolean, true);
    v_max_claims := NULLIF(trim(COALESCE(p_payload ->> 'max_claims', '')), '')::int;

    IF NOT v_is_infinite AND (v_max_claims IS NULL OR v_max_claims <= 0) THEN
        RAISE EXCEPTION '限量模板必須設定 max_claims';
    END IF;

    IF v_id IS NULL THEN
        v_is_new := true;
        INSERT INTO public.reward_templates (
            title,
            description,
            type,
            reward_value,
            trigger_conditions,
            is_active,
            is_infinite,
            max_claims,
            valid_duration_days,
            fixed_expiry_date,
            status,
            distribution_mode,
            restrictions
        )
        VALUES (
            trim(p_payload ->> 'title'),
            NULLIF(trim(COALESCE(p_payload ->> 'description', '')), ''),
            (p_payload ->> 'type')::public.reward_type,
            COALESCE(p_payload -> 'reward_value', '{}'::jsonb),
            COALESCE(p_payload -> 'trigger_conditions', '{}'::jsonb),
            false,
            v_is_infinite,
            CASE WHEN v_is_infinite THEN NULL ELSE v_max_claims END,
            NULLIF(trim(COALESCE(p_payload ->> 'valid_duration_days', '')), '')::int,
            NULLIF(trim(COALESCE(p_payload ->> 'fixed_expiry_date', '')), '')::timestamptz,
            'draft'::public.reward_template_status,
            COALESCE(
                NULLIF(trim(COALESCE(p_payload ->> 'distribution_mode', '')), '')::public.reward_distribution_mode,
                'auto_grant'::public.reward_distribution_mode
            ),
            COALESCE(p_payload -> 'restrictions', '{}'::jsonb)
        )
        RETURNING * INTO v_row;

        v_action := 'create'::public.reward_template_audit_action;
    ELSE
        SELECT * INTO v_row
        FROM public.reward_templates
        WHERE id = v_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到獎勵模板';
        END IF;

        IF v_row.status = 'archived'::public.reward_template_status THEN
            RAISE EXCEPTION '已封存模板不可編輯';
        END IF;

        UPDATE public.reward_templates
        SET
            title = trim(p_payload ->> 'title'),
            description = NULLIF(trim(COALESCE(p_payload ->> 'description', '')), ''),
            type = (p_payload ->> 'type')::public.reward_type,
            reward_value = COALESCE(p_payload -> 'reward_value', '{}'::jsonb),
            trigger_conditions = COALESCE(p_payload -> 'trigger_conditions', '{}'::jsonb),
            is_infinite = v_is_infinite,
            max_claims = CASE WHEN v_is_infinite THEN NULL ELSE v_max_claims END,
            valid_duration_days = NULLIF(trim(COALESCE(p_payload ->> 'valid_duration_days', '')), '')::int,
            fixed_expiry_date = NULLIF(trim(COALESCE(p_payload ->> 'fixed_expiry_date', '')), '')::timestamptz,
            distribution_mode = COALESCE(
                NULLIF(trim(COALESCE(p_payload ->> 'distribution_mode', '')), '')::public.reward_distribution_mode,
                v_row.distribution_mode
            ),
            restrictions = COALESCE(p_payload -> 'restrictions', '{}'::jsonb),
            updated_at = NOW()
        WHERE id = v_id
        RETURNING * INTO v_row;

        v_action := 'update'::public.reward_template_audit_action;
    END IF;

    PERFORM public._reward_template_write_audit(
        v_row.id,
        v_admin_id,
        v_action,
        public._reward_template_row_to_json(v_row)
    );

    RETURN jsonb_build_object(
        'success', true,
        'template_id', v_row.id,
        'is_new', v_is_new,
        'row', public._reward_template_row_to_json(v_row)
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


CREATE OR REPLACE FUNCTION public.fn_reward_template_progress_detail(
    p_user_id UUID,
    p_template public.reward_templates
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_kind TEXT;
    v_event TEXT;
    v_buyer_trades INT := 0;
    v_merchant_trades INT := 0;
    v_current_streak INT := 0;
    v_streak_for_cycle INT := 0;
    v_last_check_in TIMESTAMPTZ;
    v_today_hk DATE;
    v_last_hk DATE;
    v_cycle_day INT;
    v_required_count INT;
    v_required_day INT;
    v_min_streak INT;
    v_role TEXT;
    v_listing_count INT := 0;
    v_chat_count INT := 0;
    v_profile_complete BOOLEAN := false;
    v_current INT := 0;
    v_required INT := 1;
    v_requirement_label TEXT := '完成指定條件後自動發放';
    v_progress_label TEXT := '0 / 1';
    v_cta_href TEXT := '/profile/user/rewards';
    v_remaining INT;
    v_max_subsidy NUMERIC;
BEGIN
    v_kind := p_template.trigger_conditions ->> 'kind';
    v_event := COALESCE(p_template.trigger_conditions ->> 'event', '');

    v_current_streak := public.fn_effective_check_in_streak(p_user_id);
    v_streak_for_cycle := v_current_streak;

    SELECT gs.last_check_in
    INTO v_last_check_in
    FROM public.gamification_stats gs
    WHERE gs.user_id = p_user_id;

    IF v_last_check_in IS NOT NULL AND v_current_streak > 0 THEN
        v_today_hk := (NOW() AT TIME ZONE 'Asia/Hong_Kong')::date;
        v_last_hk := (v_last_check_in AT TIME ZONE 'Asia/Hong_Kong')::date;
        IF v_last_hk <> v_today_hk AND v_last_hk = v_today_hk - 1 THEN
            v_streak_for_cycle := v_current_streak + 1;
        END IF;
    END IF;

    SELECT COALESCE(p.completed_trades_count, 0)
    INTO v_buyer_trades
    FROM public.profiles p
    WHERE p.id = p_user_id;

    SELECT COALESCE(ms.completed_trades_count, 0)
    INTO v_merchant_trades
    FROM public.merchant_shops ms
    WHERE ms.merchant_id = p_user_id;

    IF v_kind = 'check_in_streak' THEN
        v_min_streak := COALESCE((p_template.trigger_conditions ->> 'min_streak')::int, 1);
        v_current := LEAST(v_current_streak, v_min_streak);
        v_required := v_min_streak;
        v_requirement_label := format('連續簽到 %s 天', v_min_streak);
        v_cta_href := '/profile/user/rewards';
    ELSIF v_kind = 'check_in_cycle_day' THEN
        v_required_day := COALESCE((p_template.trigger_conditions ->> 'day')::int, 1);
        IF v_current_streak < 1 THEN
            v_current := 0;
        ELSE
            v_cycle_day := ((v_streak_for_cycle - 1) % 7) + 1;
            IF v_cycle_day >= v_required_day AND v_current_streak >= v_required_day THEN
                v_current := v_required_day;
            ELSE
                v_current := LEAST(v_cycle_day, GREATEST(v_required_day - 1, 0));
            END IF;
        END IF;
        v_required := v_required_day;
        v_requirement_label := format('簽到週期第 %s 天', v_required_day);
        v_cta_href := '/profile/user/rewards';
    ELSIF v_kind = 'trade_count' THEN
        v_role := COALESCE(p_template.trigger_conditions ->> 'role', 'buyer');
        v_required_count := GREATEST(COALESCE((p_template.trigger_conditions ->> 'count')::int, 1), 1);
        IF v_role = 'merchant' THEN
            v_current := LEAST(v_merchant_trades, v_required_count);
            v_required := v_required_count;
            v_requirement_label := format('完成 %s 筆商戶成交', v_required_count);
            v_cta_href := '/profile/merchant/trading';
        ELSE
            v_current := LEAST(v_buyer_trades, v_required_count);
            v_required := v_required_count;
            v_requirement_label := format('完成 %s 筆買入成交', v_required_count);
            v_cta_href := '/profile/user/trading';
        END IF;
    ELSIF v_kind = 'event_once' THEN
        v_required := 1;
        CASE v_event
            WHEN 'first_listing' THEN
                SELECT COUNT(*)::int INTO v_listing_count
                FROM public.listings l WHERE l.seller_id = p_user_id;
                v_current := LEAST(v_listing_count, 1);
                v_requirement_label := '上架首張現貨商品';
                v_cta_href := '/profile/user/inventory';
            WHEN 'first_chat' THEN
                SELECT COUNT(*)::int INTO v_chat_count
                FROM public.chat_messages cm
                WHERE cm.sender_id = p_user_id AND cm.content NOT LIKE 'SYSTEM_%';
                v_current := LEAST(v_chat_count, 1);
                v_requirement_label := '首次透過聊天室聯絡另一位玩家';
                v_cta_href := '/';
            WHEN 'profile_complete' THEN
                SELECT (
                    p.avatar_path IS NOT NULL
                    AND NULLIF(BTRIM(p.username), '') IS NOT NULL
                ) INTO v_profile_complete
                FROM public.profiles p WHERE p.id = p_user_id;
                v_current := CASE WHEN COALESCE(v_profile_complete, false) THEN 1 ELSE 0 END;
                v_requirement_label := '完善個人資料（用戶名稱 + 頭像）';
                v_cta_href := '/profile/user/settings';
            ELSE
                v_requirement_label := COALESCE(NULLIF(BTRIM(p_template.description), ''), '完成指定任務');
        END CASE;
    ELSE
        v_requirement_label := COALESCE(NULLIF(BTRIM(p_template.description), ''), '完成指定任務');
    END IF;

    IF p_template.type = 'free_shipping'::public.reward_type THEN
        v_max_subsidy := COALESCE((p_template.reward_value ->> 'max_subsidy_hkd')::numeric, 0);
        v_requirement_label := format(
            '%s；結帳享免運（平台補貼上限 HK$%s，即將推出）',
            v_requirement_label,
            trim(to_char(v_max_subsidy, 'FM999999990.00'))
        );
    END IF;

    v_progress_label := format('%s / %s', v_current, v_required);

    v_remaining := NULL;
    IF COALESCE(p_template.is_infinite, false) IS NOT TRUE
       AND p_template.max_claims IS NOT NULL
       AND p_template.max_claims > 0 THEN
        v_remaining := GREATEST(
            0,
            p_template.max_claims - COALESCE(p_template.claimed_count, 0)
        );
    END IF;

    RETURN jsonb_build_object(
        'progress_current', v_current,
        'progress_required', v_required,
        'progress_label', v_progress_label,
        'requirement_label', v_requirement_label,
        'cta_href', v_cta_href,
        'stock_remaining', v_remaining
    );
END;
$$;


REVOKE ALL ON FUNCTION public.fn_validate_reward_template(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._reward_template_row_to_json(public.reward_templates) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._reward_template_write_audit(UUID, UUID, public.reward_template_audit_action, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_admin_list_reward_templates(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_admin_upsert_reward_template(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_admin_set_reward_template_status(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_admin_list_reward_templates(TEXT, TEXT, INTEGER, INTEGER)
    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_admin_upsert_reward_template(JSONB)
    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_admin_set_reward_template_status(UUID, TEXT)
    TO authenticated, service_role;
