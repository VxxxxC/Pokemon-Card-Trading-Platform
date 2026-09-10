-- Admin reward activity status counts (single round-trip for filter chips)

CREATE OR REPLACE FUNCTION public.rpc_admin_reward_activity_status_counts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
BEGIN
    v_admin_id := public._grading_require_admin();

    RETURN (
        WITH base AS (
            SELECT
                rt.status,
                CASE
                    WHEN rt.distribution_mode = 'flash_only'::public.reward_distribution_mode
                         AND rc.id IS NOT NULL THEN rc.status::text
                    ELSE rt.status::text
                END AS display_status
            FROM public.reward_templates rt
            LEFT JOIN public.reward_campaigns rc ON rc.template_id = rt.id
            WHERE rt.type <> 'lucky_draw_ticket'
        )
        SELECT jsonb_build_object(
            'all', COUNT(*)::bigint,
            'draft', COUNT(*) FILTER (
                WHERE display_status = 'draft'
                   OR status = 'draft'::public.reward_template_status
            )::bigint,
            'active', COUNT(*) FILTER (WHERE display_status = 'active')::bigint,
            'paused', COUNT(*) FILTER (WHERE display_status = 'paused')::bigint,
            'ended', COUNT(*) FILTER (WHERE display_status = 'ended')::bigint,
            'archived', COUNT(*) FILTER (
                WHERE display_status = 'archived'
                   OR status = 'archived'::public.reward_template_status
            )::bigint
        )
        FROM base
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_reward_activity_status_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_reward_activity_status_counts()
    TO authenticated, service_role;
