-- Status chip counts: optional p_search (same filter as rpc_admin_list_reward_activities)

DROP FUNCTION IF EXISTS public.rpc_admin_reward_activity_status_counts();

CREATE OR REPLACE FUNCTION public.rpc_admin_reward_activity_status_counts(
    p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_search TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();
    v_search := NULLIF(trim(COALESCE(p_search, '')), '');

    RETURN (
        WITH base AS (
            SELECT
                rt.status,
                rt.title,
                rt.id,
                rt.type,
                rt.distribution_mode,
                rc.name AS campaign_name,
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
            WHERE v_search IS NULL
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
        SELECT jsonb_build_object(
            'all', COUNT(*)::bigint,
            'draft', COUNT(*) FILTER (
                WHERE display_status = 'draft'
                   OR status::text = 'draft'
            )::bigint,
            'active', COUNT(*) FILTER (WHERE display_status = 'active')::bigint,
            'paused', COUNT(*) FILTER (WHERE display_status = 'paused')::bigint,
            'ended', COUNT(*) FILTER (WHERE display_status = 'ended')::bigint,
            'archived', COUNT(*) FILTER (
                WHERE display_status = 'archived'
                   OR status::text = 'archived'
            )::bigint
        )
        FROM filtered
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_reward_activity_status_counts(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_reward_activity_status_counts(TEXT)
    TO authenticated, service_role;
