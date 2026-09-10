-- Admin reward activity list: server-side search across title, id, type labels, etc.

DROP FUNCTION IF EXISTS public.rpc_admin_list_reward_activities(TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.rpc_admin_list_reward_activities(
    p_status TEXT DEFAULT 'all',
    p_page INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 20,
    p_search TEXT DEFAULT NULL
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
    v_search TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_limit := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
    v_offset := (GREATEST(COALESCE(p_page, 1), 1) - 1) * v_limit;
    v_status := lower(trim(COALESCE(p_status, 'all')));
    v_search := NULLIF(trim(COALESCE(p_search, '')), '');

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
        WHERE rt.type::text <> 'lucky_draw_ticket'
          AND COALESCE(rt.trigger_conditions ->> 'kind', '') NOT IN (
              'check_in_program_internal',
              'check_in_streak',
              'check_in_cycle_day'
          )
    ),
    filtered AS (
        SELECT *
        FROM base
        WHERE (
            v_status = 'all'
            OR display_status = v_status
            OR (v_status = 'draft' AND status::text = 'draft')
            OR (v_status = 'archived' AND status::text = 'archived')
        )
        AND (
            v_search IS NULL
            OR position(lower(v_search) in lower(coalesce(title, ''))) > 0
            OR position(lower(v_search) in lower(id::text)) > 0
            OR position(lower(v_search) in lower(left(id::text, 8))) > 0
            OR position(lower(v_search) in lower(coalesce(campaign_name, ''))) > 0
            OR position(lower(v_search) in lower(type::text)) > 0
            OR position(lower(v_search) in lower(distribution_mode::text)) > 0
            OR (
                type::text = 'discount_coupon'
                AND position(lower(v_search) in lower('折扣券')) > 0
            )
            OR (
                type::text = 'free_shipping'
                AND position(lower(v_search) in lower('免運券')) > 0
            )
            OR (
                type::text = 'points'
                AND position(lower(v_search) in lower('積分')) > 0
            )
            OR (
                distribution_mode::text = 'auto_grant'
                AND position(lower(v_search) in lower('條件達成自動發放')) > 0
            )
            OR (
                distribution_mode::text = 'flash_only'
                AND position(lower(v_search) in lower('限時搶領（先到先得）')) > 0
            )
        )
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

REVOKE ALL ON FUNCTION public.rpc_admin_list_reward_activities(TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_reward_activities(TEXT, INTEGER, INTEGER, TEXT)
    TO authenticated, service_role;
