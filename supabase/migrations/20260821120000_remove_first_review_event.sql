-- Remove first_review event; align account_registered progress label.

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
                v_requirement_label := '完成註冊';
                v_cta_href := '/profile/user/rewards';
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
    RETURN jsonb_build_object(
        'success', true,
        'review_id', v_review_id,
        'revealed', v_revealed
    );
END;
$$;
