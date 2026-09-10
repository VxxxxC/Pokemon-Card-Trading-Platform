-- Platform Rewards Phase 3: flash campaigns + atomic claim.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reward_campaign_status') THEN
        CREATE TYPE public.reward_campaign_status AS ENUM ('draft', 'active', 'paused', 'ended');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.reward_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.reward_templates(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    status public.reward_campaign_status NOT NULL DEFAULT 'draft',
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    max_claims INTEGER NOT NULL,
    claimed_count INTEGER NOT NULL DEFAULT 0,
    max_claims_per_user INTEGER NOT NULL DEFAULT 1,
    override_valid_days INTEGER,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reward_campaigns_window_chk CHECK (ends_at > starts_at),
    CONSTRAINT reward_campaigns_max_claims_chk CHECK (max_claims > 0),
    CONSTRAINT reward_campaigns_max_per_user_chk CHECK (max_claims_per_user > 0),
    CONSTRAINT reward_campaigns_claimed_count_chk CHECK (claimed_count >= 0 AND claimed_count <= max_claims)
);

CREATE INDEX IF NOT EXISTS idx_reward_campaigns_template_id
    ON public.reward_campaigns (template_id);

CREATE INDEX IF NOT EXISTS idx_reward_campaigns_status_window
    ON public.reward_campaigns (status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS public.reward_campaign_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.reward_campaigns(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_reward_id UUID NOT NULL REFERENCES public.user_rewards(id) ON DELETE RESTRICT,
    claim_day DATE NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reward_campaign_claims_unique_day UNIQUE (campaign_id, user_id, claim_day)
);

CREATE INDEX IF NOT EXISTS idx_reward_campaign_claims_campaign_user
    ON public.reward_campaign_claims (campaign_id, user_id, claim_day);

ALTER TABLE public.reward_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_campaign_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reward_campaigns FROM PUBLIC;
REVOKE ALL ON TABLE public.reward_campaign_claims FROM PUBLIC;


CREATE OR REPLACE FUNCTION public._hk_today()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT (timezone('Asia/Hong_Kong', now()))::date;
$$;


CREATE OR REPLACE FUNCTION public._reward_campaign_row_to_json(p_row public.reward_campaigns)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'id', p_row.id,
        'template_id', p_row.template_id,
        'name', p_row.name,
        'status', p_row.status,
        'starts_at', p_row.starts_at,
        'ends_at', p_row.ends_at,
        'max_claims', p_row.max_claims,
        'claimed_count', p_row.claimed_count,
        'max_claims_per_user', p_row.max_claims_per_user,
        'override_valid_days', p_row.override_valid_days,
        'created_by', p_row.created_by,
        'created_at', p_row.created_at,
        'updated_at', p_row.updated_at
    );
$$;


CREATE OR REPLACE FUNCTION public.rpc_admin_list_reward_campaigns(
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
    v_offset INTEGER;
    v_limit INTEGER;
    v_status TEXT;
    v_rows JSONB;
    v_total BIGINT;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_limit := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 50);
    v_offset := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_limit;
    v_status := lower(trim(COALESCE(p_status, 'all')));

    WITH filtered AS (
        SELECT rc.*, rt.title AS template_title, rt.type AS template_type
        FROM public.reward_campaigns rc
        INNER JOIN public.reward_templates rt ON rt.id = rc.template_id
        WHERE
            CASE
                WHEN v_status IN ('draft', 'active', 'paused', 'ended') THEN rc.status::TEXT = v_status
                ELSE TRUE
            END
    ),
    counted AS (
        SELECT COUNT(*)::BIGINT AS total FROM filtered
    )
    SELECT
        COALESCE(
            (
                SELECT jsonb_agg(
                    public._reward_campaign_row_to_json(f)
                    || jsonb_build_object(
                        'template_title', f.template_title,
                        'template_type', f.template_type
                    )
                    ORDER BY f.updated_at DESC NULLS LAST, f.created_at DESC
                )
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


CREATE OR REPLACE FUNCTION public.rpc_admin_upsert_reward_campaign(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_id UUID;
    v_row public.reward_campaigns%ROWTYPE;
    v_template public.reward_templates%ROWTYPE;
    v_name TEXT;
    v_status public.reward_campaign_status;
    v_starts_at TIMESTAMPTZ;
    v_ends_at TIMESTAMPTZ;
    v_max_claims INTEGER;
    v_max_per_user INTEGER;
    v_override_days INTEGER;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_name := NULLIF(trim(COALESCE(p_payload ->> 'name', '')), '');
    IF v_name IS NULL THEN
        RAISE EXCEPTION '請填寫活動名稱';
    END IF;

    v_starts_at := NULLIF(trim(COALESCE(p_payload ->> 'starts_at', '')), '')::timestamptz;
    v_ends_at := NULLIF(trim(COALESCE(p_payload ->> 'ends_at', '')), '')::timestamptz;
    IF v_starts_at IS NULL OR v_ends_at IS NULL THEN
        RAISE EXCEPTION '請設定活動開始與結束時間';
    END IF;
    IF v_ends_at <= v_starts_at THEN
        RAISE EXCEPTION '活動結束時間必須晚於開始時間';
    END IF;

    v_max_claims := NULLIF(trim(COALESCE(p_payload ->> 'max_claims', '')), '')::integer;
    v_max_per_user := COALESCE(
        NULLIF(trim(COALESCE(p_payload ->> 'max_claims_per_user', '')), '')::integer,
        1
    );
    IF v_max_claims IS NULL OR v_max_claims <= 0 THEN
        RAISE EXCEPTION '場次庫存必須大於 0';
    END IF;
    IF v_max_per_user <= 0 THEN
        RAISE EXCEPTION '每人限搶必須大於 0';
    END IF;

    v_override_days := NULLIF(trim(COALESCE(p_payload ->> 'override_valid_days', '')), '')::integer;

    SELECT * INTO v_template
    FROM public.reward_templates rt
    WHERE rt.id = NULLIF(trim(COALESCE(p_payload ->> 'template_id', '')), '')::uuid;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到獎勵模板';
    END IF;

    IF v_template.distribution_mode IS DISTINCT FROM 'flash_only'::public.reward_distribution_mode THEN
        RAISE EXCEPTION '僅限時搶領模板可建立活動檔期';
    END IF;

    v_id := NULLIF(trim(COALESCE(p_payload ->> 'id', '')), '')::uuid;

    v_status := COALESCE(
        NULLIF(trim(COALESCE(p_payload ->> 'status', '')), '')::public.reward_campaign_status,
        'draft'::public.reward_campaign_status
    );

    IF v_id IS NULL THEN
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
            v_template.id,
            v_name,
            v_status,
            v_starts_at,
            v_ends_at,
            v_max_claims,
            v_max_per_user,
            v_override_days,
            v_admin_id
        )
        RETURNING * INTO v_row;
    ELSE
        SELECT * INTO v_row
        FROM public.reward_campaigns
        WHERE id = v_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到活動檔期';
        END IF;

        IF v_max_claims < v_row.claimed_count THEN
            RAISE EXCEPTION '場次庫存不可少於已領取數量';
        END IF;

        UPDATE public.reward_campaigns
        SET
            template_id = v_template.id,
            name = v_name,
            status = v_status,
            starts_at = v_starts_at,
            ends_at = v_ends_at,
            max_claims = v_max_claims,
            max_claims_per_user = v_max_per_user,
            override_valid_days = v_override_days,
            updated_at = now()
        WHERE id = v_id
        RETURNING * INTO v_row;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'campaign_id', v_row.id,
        'row', public._reward_campaign_row_to_json(v_row)
            || jsonb_build_object(
                'template_title', v_template.title,
                'template_type', v_template.type
            )
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.rpc_admin_set_reward_campaign_status(
    p_campaign_id UUID,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_target public.reward_campaign_status;
    v_row public.reward_campaigns%ROWTYPE;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_target := lower(trim(COALESCE(p_status, '')))::public.reward_campaign_status;

    IF v_target NOT IN (
        'draft'::public.reward_campaign_status,
        'active'::public.reward_campaign_status,
        'paused'::public.reward_campaign_status,
        'ended'::public.reward_campaign_status
    ) THEN
        RAISE EXCEPTION '無效的活動狀態';
    END IF;

    UPDATE public.reward_campaigns
    SET
        status = v_target,
        updated_at = now()
    WHERE id = p_campaign_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到活動檔期';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'campaign_id', v_row.id,
        'status', v_row.status,
        'row', public._reward_campaign_row_to_json(v_row)
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.rpc_list_active_flash_campaigns()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_hk_today DATE;
    v_rows JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '請先登入';
    END IF;

    v_hk_today := public._hk_today();

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', rc.id,
                'name', rc.name,
                'starts_at', rc.starts_at,
                'ends_at', rc.ends_at,
                'max_claims', rc.max_claims,
                'claimed_count', rc.claimed_count,
                'max_claims_per_user', rc.max_claims_per_user,
                'remaining_claims', GREATEST(rc.max_claims - rc.claimed_count, 0),
                'user_claims_today', COALESCE(uc.cnt, 0),
                'can_claim', (
                    rc.status = 'active'::public.reward_campaign_status
                    AND now() >= rc.starts_at
                    AND now() < rc.ends_at
                    AND rc.claimed_count < rc.max_claims
                    AND COALESCE(uc.cnt, 0) < rc.max_claims_per_user
                ),
                'template', jsonb_build_object(
                    'id', rt.id,
                    'title', rt.title,
                    'description', rt.description,
                    'type', rt.type,
                    'reward_value', rt.reward_value
                )
            )
            ORDER BY rc.starts_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_rows
    FROM public.reward_campaigns rc
    INNER JOIN public.reward_templates rt ON rt.id = rc.template_id
    LEFT JOIN LATERAL (
        SELECT COUNT(*)::INTEGER AS cnt
        FROM public.reward_campaign_claims rcc
        WHERE rcc.campaign_id = rc.id
          AND rcc.user_id = v_user_id
          AND rcc.claim_day = v_hk_today
    ) uc ON TRUE
    WHERE rc.status = 'active'::public.reward_campaign_status
      AND rc.ends_at > now()
      AND rc.starts_at < now() + interval '7 days'
      AND rt.status = 'active'::public.reward_template_status
      AND rt.distribution_mode = 'flash_only'::public.reward_distribution_mode;

    RETURN v_rows;
END;
$$;


CREATE OR REPLACE FUNCTION public.rpc_claim_flash_reward(p_campaign_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_hk_today DATE;
    v_campaign public.reward_campaigns%ROWTYPE;
    v_template public.reward_templates%ROWTYPE;
    v_user_claims_today INTEGER;
    v_dedup_key TEXT;
    v_user_reward_id UUID;
    v_claim_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '請先登入';
    END IF;

    IF p_campaign_id IS NULL THEN
        RAISE EXCEPTION '活動編號無效';
    END IF;

    v_hk_today := public._hk_today();
    v_dedup_key := 'flash:' || p_campaign_id::TEXT || ':' || v_hk_today::TEXT;

    SELECT * INTO v_campaign
    FROM public.reward_campaigns
    WHERE id = p_campaign_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到活動檔期';
    END IF;

    IF v_campaign.status IS DISTINCT FROM 'active'::public.reward_campaign_status THEN
        RAISE EXCEPTION '活動尚未開放或已暫停';
    END IF;

    IF now() < v_campaign.starts_at THEN
        RAISE EXCEPTION '活動尚未開始';
    END IF;

    IF now() >= v_campaign.ends_at THEN
        RAISE EXCEPTION '活動已結束';
    END IF;

    IF v_campaign.claimed_count >= v_campaign.max_claims THEN
        RAISE EXCEPTION '優惠券已被搶光';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_user_claims_today
    FROM public.reward_campaign_claims rcc
    WHERE rcc.campaign_id = p_campaign_id
      AND rcc.user_id = v_user_id
      AND rcc.claim_day = v_hk_today;

    IF v_user_claims_today >= v_campaign.max_claims_per_user THEN
        RAISE EXCEPTION '你已達今日搶券上限';
    END IF;

    SELECT * INTO v_template
    FROM public.reward_templates rt
    WHERE rt.id = v_campaign.template_id;

    IF NOT FOUND
       OR v_template.status IS DISTINCT FROM 'active'::public.reward_template_status
       OR v_template.distribution_mode IS DISTINCT FROM 'flash_only'::public.reward_distribution_mode THEN
        RAISE EXCEPTION '獎勵模板不可用';
    END IF;

    UPDATE public.reward_campaigns
    SET
        claimed_count = claimed_count + 1,
        updated_at = now()
    WHERE id = p_campaign_id
      AND claimed_count < max_claims
    RETURNING * INTO v_campaign;

    IF NOT FOUND THEN
        RAISE EXCEPTION '優惠券已被搶光';
    END IF;

    v_user_reward_id := public.fn_issue_reward_from_template(
        v_user_id,
        v_template.id,
        v_dedup_key
    );

    IF v_user_reward_id IS NULL THEN
        RAISE EXCEPTION '你已達今日搶券上限';
    END IF;

    IF v_campaign.override_valid_days IS NOT NULL AND v_campaign.override_valid_days > 0 THEN
        UPDATE public.user_rewards
        SET calculated_expiry = now() + (v_campaign.override_valid_days || ' days')::interval
        WHERE id = v_user_reward_id;
    END IF;

    INSERT INTO public.reward_campaign_claims (
        campaign_id,
        user_id,
        user_reward_id,
        claim_day
    )
    VALUES (
        p_campaign_id,
        v_user_id,
        v_user_reward_id,
        v_hk_today
    )
    RETURNING id INTO v_claim_id;

    RETURN jsonb_build_object(
        'success', true,
        'campaign_id', p_campaign_id,
        'claim_id', v_claim_id,
        'user_reward_id', v_user_reward_id
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_reward_coupon_center()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_wallet JSONB;
    v_locked JSONB;
BEGIN
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


REVOKE ALL ON FUNCTION public.rpc_admin_list_reward_campaigns(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_reward_campaigns(TEXT, INTEGER, INTEGER)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_admin_upsert_reward_campaign(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_upsert_reward_campaign(JSONB)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_admin_set_reward_campaign_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_set_reward_campaign_status(UUID, TEXT)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_list_active_flash_campaigns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_list_active_flash_campaigns()
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_claim_flash_reward(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_claim_flash_reward(UUID)
    TO authenticated, service_role;
