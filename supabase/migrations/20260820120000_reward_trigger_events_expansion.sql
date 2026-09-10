-- Reward trigger expansion: account_registered / first_review events,
-- auto_grant optional activity windows via reward_campaigns, trigger param hooks.

-- ---------------------------------------------------------------------------
-- Window helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_reward_auto_grant_in_window(p_template_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_campaign public.reward_campaigns%ROWTYPE;
BEGIN
    SELECT * INTO v_campaign
    FROM public.reward_campaigns
    WHERE template_id = p_template_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN true;
    END IF;

    IF v_campaign.status IS DISTINCT FROM 'active'::public.reward_campaign_status THEN
        RETURN false;
    END IF;

    RETURN NOW() >= v_campaign.starts_at AND NOW() <= v_campaign.ends_at;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reward_auto_grant_in_window(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reward_auto_grant_in_window(UUID) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Validation: new event_once events
-- ---------------------------------------------------------------------------

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
        IF v_event NOT IN (
            'profile_complete',
            'first_listing',
            'first_chat',
            'account_registered',
            'first_review'
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


-- ---------------------------------------------------------------------------
-- Eligibility: window gate + account_registered / first_review
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_template_is_eligible(
    p_user_id UUID,
    p_template public.reward_templates
)
RETURNS TABLE (
    eligible BOOLEAN,
    grant_dedup_key TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_kind TEXT;
    v_buyer_trades INT := 0;
    v_merchant_trades INT := 0;
    v_current_streak INT := 0;
    v_cycle_day INT;
    v_required_count INT;
    v_required_day INT;
    v_min_streak INT;
    v_role TEXT;
    v_listing_count INT := 0;
    v_chat_count INT := 0;
    v_review_count INT := 0;
    v_profile_complete BOOLEAN := false;
    v_account_registered BOOLEAN := false;
BEGIN
    eligible := false;
    grant_dedup_key := 'lifetime';

    IF p_template.is_active IS NOT TRUE
       OR NOT public.fn_reward_template_has_stock(p_template) THEN
        RETURN NEXT;
        RETURN;
    END IF;

    IF NOT public.fn_reward_auto_grant_in_window(p_template.id) THEN
        RETURN NEXT;
        RETURN;
    END IF;

    v_kind := p_template.trigger_conditions ->> 'kind';

    v_current_streak := public.fn_effective_check_in_streak(p_user_id);

    IF v_kind = 'check_in_streak' THEN
        v_min_streak := COALESCE((p_template.trigger_conditions ->> 'min_streak')::int, 1);

        IF v_current_streak >= v_min_streak THEN
            eligible := true;
            grant_dedup_key := 'lifetime';
        END IF;

        RETURN NEXT;
        RETURN;
    END IF;

    IF v_kind = 'check_in_cycle_day' THEN
        v_required_day := COALESCE((p_template.trigger_conditions ->> 'day')::int, 1);
        v_cycle_day := ((GREATEST(v_current_streak, 1) - 1) % 7) + 1;

        IF v_cycle_day = v_required_day AND v_current_streak >= v_required_day THEN
            eligible := true;

            IF COALESCE((p_template.trigger_conditions ->> 'once_per_cycle')::boolean, false) THEN
                grant_dedup_key := 'cycle-' || FLOOR((v_current_streak - 1) / 7)::text;
            ELSE
                grant_dedup_key := 'lifetime';
            END IF;
        END IF;

        RETURN NEXT;
        RETURN;
    END IF;

    IF v_kind = 'trade_count' THEN
        v_role := COALESCE(p_template.trigger_conditions ->> 'role', 'buyer');
        v_required_count := COALESCE((p_template.trigger_conditions ->> 'count')::int, 1);

        SELECT COALESCE(p.completed_trades_count, 0)
        INTO v_buyer_trades
        FROM public.profiles p
        WHERE p.id = p_user_id;

        SELECT COALESCE(ms.completed_trades_count, 0)
        INTO v_merchant_trades
        FROM public.merchant_shops ms
        WHERE ms.merchant_id = p_user_id;

        IF v_role = 'buyer' AND v_buyer_trades >= v_required_count THEN
            eligible := true;
        ELSIF v_role = 'merchant' AND v_merchant_trades >= v_required_count THEN
            eligible := true;
        END IF;

        grant_dedup_key := 'lifetime';
        RETURN NEXT;
        RETURN;
    END IF;

    IF v_kind = 'event_once' THEN
        CASE COALESCE(p_template.trigger_conditions ->> 'event', '')
            WHEN 'first_listing' THEN
                SELECT COUNT(*)::int
                INTO v_listing_count
                FROM public.listings l
                WHERE l.seller_id = p_user_id;

                IF v_listing_count >= 1 THEN
                    eligible := true;
                END IF;
            WHEN 'first_chat' THEN
                SELECT COUNT(*)::int
                INTO v_chat_count
                FROM public.chat_messages cm
                WHERE cm.sender_id = p_user_id
                  AND cm.content NOT LIKE 'SYSTEM_%';

                IF v_chat_count >= 1 THEN
                    eligible := true;
                END IF;
            WHEN 'profile_complete' THEN
                SELECT (
                    p.avatar_path IS NOT NULL
                    AND NULLIF(BTRIM(p.username), '') IS NOT NULL
                )
                INTO v_profile_complete
                FROM public.profiles p
                WHERE p.id = p_user_id;

                IF COALESCE(v_profile_complete, false) THEN
                    eligible := true;
                END IF;
            WHEN 'account_registered' THEN
                SELECT (
                    p.created_at >= COALESCE(
                        (
                            SELECT rc.starts_at
                            FROM public.reward_campaigns rc
                            WHERE rc.template_id = p_template.id
                            LIMIT 1
                        ),
                        p_template.created_at
                    )
                )
                INTO v_account_registered
                FROM public.profiles p
                WHERE p.id = p_user_id;

                IF COALESCE(v_account_registered, false) THEN
                    eligible := true;
                END IF;
            WHEN 'first_review' THEN
                SELECT COUNT(*)::int
                INTO v_review_count
                FROM public.transaction_reviews r
                WHERE r.reviewer_id = p_user_id;

                IF v_review_count >= 1 THEN
                    eligible := true;
                END IF;
            ELSE
                NULL;
        END CASE;

        grant_dedup_key := 'lifetime';
        RETURN NEXT;
        RETURN;
    END IF;

    RETURN NEXT;
END;
$$;


-- ---------------------------------------------------------------------------
-- Progress detail: new events + optional window label
-- ---------------------------------------------------------------------------

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
    v_review_count INT := 0;
    v_profile_complete BOOLEAN := false;
    v_account_registered BOOLEAN := false;
    v_current INT := 0;
    v_required INT := 1;
    v_requirement_label TEXT := '完成指定條件後自動發放';
    v_progress_label TEXT := '0 / 1';
    v_cta_href TEXT := '/profile/user/rewards';
    v_remaining INT;
    v_max_subsidy NUMERIC;
    v_campaign public.reward_campaigns%ROWTYPE;
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
            WHEN 'account_registered' THEN
                SELECT (
                    p.created_at >= COALESCE(
                        (
                            SELECT rc.starts_at
                            FROM public.reward_campaigns rc
                            WHERE rc.template_id = p_template.id
                            LIMIT 1
                        ),
                        p_template.created_at
                    )
                )
                INTO v_account_registered
                FROM public.profiles p
                WHERE p.id = p_user_id;
                v_current := CASE WHEN COALESCE(v_account_registered, false) THEN 1 ELSE 0 END;
                v_requirement_label := '完成帳戶註冊';
                v_cta_href := '/profile/user/rewards';
            WHEN 'first_review' THEN
                SELECT COUNT(*)::int INTO v_review_count
                FROM public.transaction_reviews r
                WHERE r.reviewer_id = p_user_id;
                v_current := LEAST(v_review_count, 1);
                v_requirement_label := '完成首次交易評價';
                v_cta_href := '/profile/user/trading';
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

    SELECT * INTO v_campaign
    FROM public.reward_campaigns rc
    WHERE rc.template_id = p_template.id
    LIMIT 1;

    IF FOUND AND NOW() <= v_campaign.ends_at THEN
        v_requirement_label := format(
            '%s（活動期：%s 至 %s）',
            v_requirement_label,
            to_char(v_campaign.starts_at AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI'),
            to_char(v_campaign.ends_at AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI')
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


-- ---------------------------------------------------------------------------
-- Admin upsert: auto_grant optional activity window
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
-- Admin status: sync auto_grant campaign window
-- ---------------------------------------------------------------------------

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

    SELECT * INTO v_template FROM public.reward_templates WHERE id = p_template_id;

    RETURN jsonb_build_object(
        'success', true,
        'activity_id', p_template_id,
        'status', v_status,
        'row', public._reward_activity_row_to_json(v_template, v_campaign)
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


CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role public.user_role;
BEGIN
  BEGIN
    requested_role := COALESCE(
      (NEW.raw_user_meta_data->>'role')::public.user_role,
      'member'::public.user_role
    );
  EXCEPTION
    WHEN invalid_text_representation THEN
      requested_role := 'member'::public.user_role;
  END;

  INSERT INTO public.profiles (id, display_name, username, role)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
      split_part(NEW.email, '@', 1)
    ),
    public.generate_profile_username(),
    requested_role
  )
  ON CONFLICT (id) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    username = COALESCE(public.profiles.username, EXCLUDED.username),
    updated_at = now();

  INSERT INTO public.gamification_stats (user_id, points_balance, current_streak, longest_streak)
  VALUES (NEW.id, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM public.fn_recalculate_reputation_tags(NEW.id);
  PERFORM public.fn_try_auto_grant_rewards(NEW.id);

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.rpc_submit_transaction_review(
    p_order_id UUID,
    p_reviewee_id UUID,
    p_rating INTEGER,
    p_comment TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_trimmed_comment TEXT;
    v_reviewee_persona public.review_persona;
    v_expected_reviewee UUID;
    v_member_order public.member_orders%ROWTYPE;
    v_merchant_order public.merchant_orders%ROWTYPE;
    v_review_id UUID;
    v_revealed BOOLEAN;
BEGIN
    IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
        RAISE EXCEPTION '請先登入後再提交評價';
    END IF;

    IF p_reviewee_id = p_user_id THEN
        RAISE EXCEPTION '無法評價自己';
    END IF;

    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION '請選擇 1 至 5 星評分';
    END IF;

    v_trimmed_comment := NULLIF(BTRIM(COALESCE(p_comment, '')), '');

    IF v_trimmed_comment IS NOT NULL AND char_length(v_trimmed_comment) > 200 THEN
        RAISE EXCEPTION '留言不可超過 200 字';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_reviewee_id) THEN
        RAISE EXCEPTION '找不到被評價用戶';
    END IF;

    SELECT * INTO v_member_order
    FROM public.member_orders
    WHERE id = p_order_id;

    IF FOUND THEN
        IF v_member_order.status <> 'completed' THEN
            RAISE EXCEPTION '僅能對已完成的交易提交評價';
        END IF;

        IF p_user_id NOT IN (v_member_order.buyer_id, v_member_order.seller_id) THEN
            RAISE EXCEPTION '您非此筆交易的關係人';
        END IF;

        IF p_user_id = v_member_order.buyer_id THEN
            v_expected_reviewee := v_member_order.seller_id;
        ELSE
            v_expected_reviewee := v_member_order.buyer_id;
        END IF;

        IF p_reviewee_id <> v_expected_reviewee THEN
            RAISE EXCEPTION '被評價對象與此訂單不符';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.transaction_reviews r
            WHERE r.reviewer_id = p_user_id
              AND r.member_order_id = p_order_id
        ) THEN
            RAISE EXCEPTION '您已評價過此筆交易';
        END IF;

        v_reviewee_persona := 'member'::public.review_persona;

        INSERT INTO public.transaction_reviews (
            reviewer_id,
            reviewee_id,
            reviewee_persona,
            member_order_id,
            merchant_order_id,
            rating,
            comment,
            is_public
        )
        VALUES (
            p_user_id,
            p_reviewee_id,
            v_reviewee_persona,
            p_order_id,
            NULL,
            p_rating,
            v_trimmed_comment,
            false
        )
        RETURNING id INTO v_review_id;

        v_revealed := public.fn_try_reveal_order_reviews(p_order_id, 'member');
        PERFORM public.fn_try_auto_grant_rewards(p_user_id);

        RETURN jsonb_build_object(
            'success', true,
            'review_id', v_review_id,
            'revealed', v_revealed
        );
    END IF;

    SELECT * INTO v_merchant_order
    FROM public.merchant_orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到此訂單';
    END IF;

    IF v_merchant_order.buyer_confirmed_at IS NULL
       AND v_merchant_order.escrow_status <> 'completed_and_transferred' THEN
        RAISE EXCEPTION '僅能對已完成的交易提交評價';
    END IF;

    IF p_user_id NOT IN (v_merchant_order.buyer_id, v_merchant_order.merchant_id) THEN
        RAISE EXCEPTION '您非此筆交易的關係人';
    END IF;

    IF p_user_id = v_merchant_order.buyer_id THEN
        v_expected_reviewee := v_merchant_order.merchant_id;
    ELSE
        v_expected_reviewee := v_merchant_order.buyer_id;
    END IF;

    IF p_reviewee_id <> v_expected_reviewee THEN
        RAISE EXCEPTION '被評價對象與此訂單不符';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.transaction_reviews r
        WHERE r.reviewer_id = p_user_id
          AND r.merchant_order_id = p_order_id
    ) THEN
        RAISE EXCEPTION '您已評價過此筆交易';
    END IF;

    IF p_reviewee_id = v_merchant_order.merchant_id THEN
        v_reviewee_persona := 'merchant'::public.review_persona;
    ELSE
        v_reviewee_persona := 'member'::public.review_persona;
    END IF;

    INSERT INTO public.transaction_reviews (
        reviewer_id,
        reviewee_id,
        reviewee_persona,
        member_order_id,
        merchant_order_id,
        rating,
        comment,
        is_public
    )
    VALUES (
        p_user_id,
        p_reviewee_id,
        v_reviewee_persona,
        NULL,
        p_order_id,
        p_rating,
        v_trimmed_comment,
        false
    )
    RETURNING id INTO v_review_id;

    v_revealed := public.fn_try_reveal_order_reviews(p_order_id, 'merchant');
    PERFORM public.fn_try_auto_grant_rewards(p_user_id);

    RETURN jsonb_build_object(
        'success', true,
        'review_id', v_review_id,
        'revealed', v_revealed
    );
END;
$$;
