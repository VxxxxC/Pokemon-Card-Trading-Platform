-- Fix search_admin_moderation_cases: jsonb_agg ORDER BY must use output column aliases.

CREATE OR REPLACE FUNCTION public.search_admin_moderation_cases(
  p_status TEXT DEFAULT 'all',
  p_category public.report_category DEFAULT NULL,
  p_min_score NUMERIC DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
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
  v_search TEXT;
  v_rows JSONB;
  v_total BIGINT;
  v_pending_count BIGINT;
BEGIN
  v_admin_id := public._grading_require_admin();

  v_limit := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 50);
  v_offset := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_limit;
  v_status := lower(trim(COALESCE(p_status, 'all')));
  v_search := NULLIF(trim(COALESCE(p_search, '')), '');

  SELECT COUNT(*)::BIGINT
  INTO v_pending_count
  FROM public.moderation_cases mc
  WHERE mc.status IN ('open', 'reviewing');

  WITH filtered AS (
    SELECT
      mc.id,
      mc.case_number,
      mc.status,
      mc.primary_category,
      mc.auto_score,
      mc.admin_adjustment,
      mc.final_score,
      mc.created_at,
      mc.subject_user_id,
      ps.display_name AS subject_display_name,
      ps.username AS subject_username,
      (
        SELECT pr.display_name
        FROM public.reports r
        JOIN public.profiles pr ON pr.id = r.reporter_id
        WHERE r.case_id = mc.id
        ORDER BY r.created_at ASC NULLS LAST
        LIMIT 1
      ) AS first_reporter_display_name,
      (
        SELECT GREATEST(COUNT(DISTINCT r.reporter_id) - 1, 0)::INT
        FROM public.reports r
        WHERE r.case_id = mc.id
      ) AS reporter_extra_count,
      (
        SELECT left(COALESCE(r.details, r.reason, ''), 200)
        FROM public.reports r
        WHERE r.case_id = mc.id
        ORDER BY r.created_at ASC NULLS LAST
        LIMIT 1
      ) AS preview_details
    FROM public.moderation_cases mc
    JOIN public.profiles ps ON ps.id = mc.subject_user_id
    WHERE
      CASE
        WHEN v_status = 'pending' THEN mc.status IN ('open', 'reviewing')
        WHEN v_status = 'completed' THEN mc.status IN ('resolved', 'dismissed')
        WHEN v_status IN ('open', 'reviewing', 'resolved', 'dismissed') THEN mc.status::TEXT = v_status
        ELSE TRUE
      END
      AND (p_category IS NULL OR mc.primary_category = p_category)
      AND (p_min_score IS NULL OR mc.final_score >= p_min_score)
      AND (
        v_search IS NULL
        OR mc.case_number ILIKE '%' || v_search || '%'
        OR ps.display_name ILIKE '%' || v_search || '%'
        OR ps.username ILIKE '%' || v_search || '%'
        OR EXISTS (
          SELECT 1
          FROM public.reports r
          JOIN public.profiles pr ON pr.id = r.reporter_id
          WHERE r.case_id = mc.id
            AND (
              pr.display_name ILIKE '%' || v_search || '%'
              OR pr.username ILIKE '%' || v_search || '%'
            )
        )
      )
  ),
  counted AS (
    SELECT COUNT(*)::BIGINT AS total FROM filtered
  )
  SELECT
    COALESCE(
      (
        SELECT jsonb_agg(row_to_json(t)::JSONB ORDER BY t."finalScore" DESC NULLS LAST, t."createdAt" ASC)
        FROM (
          SELECT
            f.id,
            f.case_number AS "caseNumber",
            f.status,
            f.primary_category AS "primaryCategory",
            f.auto_score AS "autoScore",
            f.admin_adjustment AS "adminAdjustment",
            f.final_score AS "finalScore",
            f.created_at AS "createdAt",
            jsonb_build_object(
              'id', f.subject_user_id,
              'displayName', f.subject_display_name,
              'username', f.subject_username
            ) AS subject,
            jsonb_build_object(
              'displayName', COALESCE(f.first_reporter_display_name, '未知舉報人'),
              'extraCount', COALESCE(f.reporter_extra_count, 0)
            ) AS "reporterPreview",
            f.preview_details AS "previewDetails"
          FROM filtered f
          ORDER BY f.final_score DESC NULLS LAST, f.created_at ASC
          OFFSET v_offset
          LIMIT v_limit
        ) t
      ),
      '[]'::JSONB
    ),
    (SELECT total FROM counted)
  INTO v_rows, v_total;

  RETURN jsonb_build_object(
    'rows', COALESCE(v_rows, '[]'::JSONB),
    'total', COALESCE(v_total, 0),
    'pendingCount', COALESCE(v_pending_count, 0)
  );
END;
$$;
