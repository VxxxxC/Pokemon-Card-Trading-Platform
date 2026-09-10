-- Phase G: subject moderation history (read-only admin context) + list badge field.

CREATE OR REPLACE FUNCTION public.admin_get_subject_moderation_history(
  p_subject_user_id UUID,
  p_exclude_case_id UUID DEFAULT NULL,
  p_case_limit INT DEFAULT 10,
  p_sanction_limit INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_case_limit INT;
  v_sanction_limit INT;
  v_stats JSONB;
  v_prior_cases JSONB;
  v_sanction_history JSONB;
BEGIN
  v_admin_id := public._grading_require_admin();

  IF p_subject_user_id IS NULL THEN
    RAISE EXCEPTION '無效的被舉報人';
  END IF;

  v_case_limit := LEAST(GREATEST(COALESCE(p_case_limit, 10), 1), 50);
  v_sanction_limit := LEAST(GREATEST(COALESCE(p_sanction_limit, 20), 1), 100);

  SELECT jsonb_build_object(
    'priorCaseCount', COUNT(*)::INT,
    'upheldCount', COUNT(*) FILTER (WHERE mc.resolution = 'upheld')::INT,
    'dismissedCount', COUNT(*) FILTER (
      WHERE mc.resolution IN ('dismissed', 'insufficient_evidence')
    )::INT,
    'reportsLast90Days', (
      SELECT COUNT(*)::INT
      FROM public.reports r
      INNER JOIN public.moderation_cases mc2 ON mc2.id = r.case_id
      WHERE mc2.subject_user_id = p_subject_user_id
        AND r.created_at > now() - interval '90 days'
    ),
    'distinctSanctionTypes', COALESCE((
      SELECT jsonb_agg(DISTINCT s.type::TEXT ORDER BY s.type::TEXT)
      FROM public.account_sanctions s
      WHERE s.user_id = p_subject_user_id
        AND s.revoked_at IS NULL
    ), '[]'::JSONB)
  )
  INTO v_stats
  FROM public.moderation_cases mc
  WHERE mc.subject_user_id = p_subject_user_id
    AND (p_exclude_case_id IS NULL OR mc.id <> p_exclude_case_id);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'caseNumber', t.case_number,
        'status', t.status::TEXT,
        'primaryCategory', t.primary_category::TEXT,
        'finalScore', t.final_score,
        'resolution', t.resolution::TEXT,
        'createdAt', t.created_at,
        'resolvedAt', t.resolved_at
      )
      ORDER BY t.resolved_at DESC NULLS LAST, t.created_at DESC
    ),
    '[]'::JSONB
  )
  INTO v_prior_cases
  FROM (
    SELECT
      mc.id,
      mc.case_number,
      mc.status,
      mc.primary_category,
      mc.final_score,
      mc.resolution,
      mc.created_at,
      mc.resolved_at
    FROM public.moderation_cases mc
    WHERE mc.subject_user_id = p_subject_user_id
      AND (p_exclude_case_id IS NULL OR mc.id <> p_exclude_case_id)
    ORDER BY mc.resolved_at DESC NULLS LAST, mc.created_at DESC
    LIMIT v_case_limit
  ) t;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'scope', t.scope::TEXT,
        'type', t.type::TEXT,
        'caseId', t.case_id,
        'caseNumber', t.case_number,
        'startsAt', t.starts_at,
        'endsAt', t.ends_at,
        'revokedAt', t.revoked_at,
        'reason', t.reason,
        'status', t.status
      )
      ORDER BY t.starts_at DESC
    ),
    '[]'::JSONB
  )
  INTO v_sanction_history
  FROM (
    SELECT
      s.id,
      s.scope,
      s.type,
      s.case_id,
      mc.case_number,
      s.starts_at,
      s.ends_at,
      s.revoked_at,
      left(COALESCE(s.reason, ''), 200) AS reason,
      CASE
        WHEN s.revoked_at IS NOT NULL THEN 'revoked'
        WHEN s.ends_at IS NOT NULL AND s.ends_at <= now() THEN 'expired'
        ELSE 'active'
      END AS status
    FROM public.account_sanctions s
    LEFT JOIN public.moderation_cases mc ON mc.id = s.case_id
    WHERE s.user_id = p_subject_user_id
      AND s.revoked_at IS NULL
    ORDER BY s.starts_at DESC
    LIMIT v_sanction_limit
  ) t;

  RETURN jsonb_build_object(
    'subjectUserId', p_subject_user_id,
    'stats', COALESCE(v_stats, jsonb_build_object(
      'priorCaseCount', 0,
      'upheldCount', 0,
      'dismissedCount', 0,
      'reportsLast90Days', 0,
      'distinctSanctionTypes', '[]'::JSONB
    )),
    'priorCases', COALESCE(v_prior_cases, '[]'::JSONB),
    'sanctionHistory', COALESCE(v_sanction_history, '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_subject_moderation_history(UUID, UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_subject_moderation_history(UUID, UUID, INT, INT)
  TO authenticated, service_role;

-- Extend search_admin_moderation_cases with subject_prior_upheld_count for list badge.
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
        SELECT COUNT(*)::INT
        FROM public.moderation_cases prior_mc
        WHERE prior_mc.subject_user_id = mc.subject_user_id
          AND prior_mc.id <> mc.id
          AND prior_mc.resolution = 'upheld'
      ) AS subject_prior_upheld_count,
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
            f.subject_prior_upheld_count AS "subjectPriorUpheldCount",
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
