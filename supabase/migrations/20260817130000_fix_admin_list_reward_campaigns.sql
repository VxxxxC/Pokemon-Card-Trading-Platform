-- Fix rpc_admin_list_reward_campaigns: cannot cast joined row to reward_campaigns composite.

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
        SELECT
            rc.id,
            rt.title AS template_title,
            rt.type AS template_type
        FROM public.reward_campaigns rc
        INNER JOIN public.reward_templates rt ON rt.id = rc.template_id
        WHERE
            CASE
                WHEN v_status IN ('draft', 'active', 'paused', 'ended') THEN rc.status::TEXT = v_status
                ELSE TRUE
            END
    ),
    paged AS (
        SELECT f.id, f.template_title, f.template_type
        FROM filtered f
        INNER JOIN public.reward_campaigns rc ON rc.id = f.id
        ORDER BY rc.updated_at DESC NULLS LAST, rc.created_at DESC
        LIMIT v_limit OFFSET v_offset
    ),
    counted AS (
        SELECT COUNT(*)::BIGINT AS total FROM filtered
    )
    SELECT
        COALESCE(
            (
                SELECT jsonb_agg(
                    public._reward_campaign_row_to_json(rc)
                    || jsonb_build_object(
                        'template_title', p.template_title,
                        'template_type', p.template_type
                    )
                    ORDER BY rc.updated_at DESC NULLS LAST, rc.created_at DESC
                )
                FROM paged p
                INNER JOIN public.reward_campaigns rc ON rc.id = p.id
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
