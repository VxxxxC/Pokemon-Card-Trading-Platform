-- Report context-aware dedup: one case per subject, multiple pending reports per context.

-- ---------------------------------------------------------------------------
-- 1. Replace blanket pending unique index with context-aware partial indexes
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.idx_reports_pending_reporter_target;

CREATE UNIQUE INDEX idx_reports_pending_reporter_target_chat_room
  ON public.reports (reporter_id, target_id, context_id)
  WHERE status = 'pending'
    AND context_type = 'chat_room'
    AND context_id IS NOT NULL;

CREATE UNIQUE INDEX idx_reports_pending_reporter_target_profile_category
  ON public.reports (reporter_id, target_id, category)
  WHERE status = 'pending'
    AND source = 'profile';

-- ---------------------------------------------------------------------------
-- 2. Submit RPC — context-aware duplicate checks
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_submit_user_report_v2(
  p_target_id UUID,
  p_category public.report_category,
  p_details TEXT DEFAULT '',
  p_chat_room_id UUID DEFAULT NULL,
  p_attachment_ids UUID[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reporter_id UUID;
  v_case_id UUID;
  v_report_id UUID;
  v_case_number TEXT;
  v_source public.report_source;
  v_category_weight INT;
  v_contribution NUMERIC(10, 2);
  v_duplicate_dampening NUMERIC(10, 2) := 1.0;
  v_context_multiplier NUMERIC(10, 2) := 1.0;
  v_room public.chat_rooms%ROWTYPE;
  v_counterparty_id UUID;
  v_details TEXT;
  v_reason TEXT;
  v_attachment_ids UUID[];
  v_attachment_count INT;
  v_bound_count INT;
BEGIN
  v_reporter_id := auth.uid();

  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  IF p_target_id IS NULL OR p_target_id = v_reporter_id THEN
    RAISE EXCEPTION '無效的舉報對象';
  END IF;

  v_details := left(COALESCE(p_details, ''), 2000);
  v_attachment_ids := COALESCE(p_attachment_ids, '{}');

  v_attachment_count := COALESCE(array_length(v_attachment_ids, 1), 0);

  IF v_attachment_count > 3 THEN
    RAISE EXCEPTION '證據圖片不可超過 3 張';
  END IF;

  IF p_category IN ('offline_trade', 'harassment') AND p_chat_room_id IS NULL THEN
    RAISE EXCEPTION '請在對話內使用舉報功能';
  END IF;

  IF p_chat_room_id IS NOT NULL THEN
    SELECT *
    INTO v_room
    FROM public.chat_rooms cr
    WHERE cr.id = p_chat_room_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION '無法驗證聊天室，請稍後再試';
    END IF;

    IF v_room.buyer_id <> v_reporter_id AND v_room.seller_id <> v_reporter_id THEN
      RAISE EXCEPTION '無法舉報此對話中的用戶';
    END IF;

    v_counterparty_id := CASE
      WHEN v_room.buyer_id = v_reporter_id THEN v_room.seller_id
      ELSE v_room.buyer_id
    END;

    IF v_counterparty_id <> p_target_id THEN
      RAISE EXCEPTION '無法舉報此對話中的用戶';
    END IF;

    v_source := 'chat_room';
    v_context_multiplier := 1.1;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = p_target_id
    ) THEN
      RAISE EXCEPTION '找不到被舉報的用戶';
    END IF;

    v_source := 'profile';
  END IF;

  IF v_source = 'chat_room' THEN
    IF EXISTS (
      SELECT 1
      FROM public.reports r
      WHERE r.reporter_id = v_reporter_id
        AND r.target_id = p_target_id
        AND r.status = 'pending'
        AND r.context_type = 'chat_room'
        AND r.context_id = p_chat_room_id
    ) THEN
      RAISE EXCEPTION '您已在此對話提交過待審核的舉報，請等待處理結果';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.reports r
      WHERE r.reporter_id = v_reporter_id
        AND r.target_id = p_target_id
        AND r.status = 'pending'
        AND r.source = 'profile'
        AND r.category = p_category
    ) THEN
      RAISE EXCEPTION '您已在此用戶公開資料提交過同類別的待審核舉報，請等待處理結果';
    END IF;
  END IF;

  v_case_id := public._find_or_create_moderation_case(p_target_id);

  SELECT mc.case_number
  INTO v_case_number
  FROM public.moderation_cases mc
  WHERE mc.id = v_case_id;

  v_category_weight := public._moderation_category_weight(p_category);

  IF EXISTS (
    SELECT 1
    FROM public.reports r
    WHERE r.case_id = v_case_id
      AND r.reporter_id = v_reporter_id
      AND r.category = p_category
      AND r.created_at > (now() - INTERVAL '24 hours')
  ) THEN
    v_duplicate_dampening := 0.3;
  END IF;

  v_contribution := round(
    (
      v_category_weight::NUMERIC
      * 1.0
      * v_context_multiplier
      * v_duplicate_dampening
    )::NUMERIC,
    2
  );

  v_reason := public._moderation_format_report_reason(
    p_category,
    v_source,
    p_chat_room_id,
    v_details
  );

  INSERT INTO public.reports (
    reporter_id,
    target_type,
    target_id,
    reason,
    status,
    category,
    source,
    context_type,
    context_id,
    case_id,
    category_weight_snapshot,
    contribution_score,
    details
  )
  VALUES (
    v_reporter_id,
    'user',
    p_target_id,
    v_reason,
    'pending',
    p_category,
    v_source,
    CASE WHEN p_chat_room_id IS NOT NULL THEN 'chat_room' ELSE NULL END,
    p_chat_room_id,
    v_case_id,
    v_category_weight,
    v_contribution,
    v_details
  )
  RETURNING id INTO v_report_id;

  IF v_attachment_count > 0 THEN
    UPDATE public.report_attachments ra
    SET report_id = v_report_id
    WHERE ra.id = ANY (v_attachment_ids)
      AND ra.reporter_id = v_reporter_id
      AND ra.report_id IS NULL;

    GET DIAGNOSTICS v_bound_count = ROW_COUNT;

    IF v_bound_count <> v_attachment_count THEN
      RAISE EXCEPTION '無效的證據附件';
    END IF;
  END IF;

  PERFORM public._recompute_moderation_case_scores(v_case_id);

  RETURN jsonb_build_object(
    'report_id', v_report_id,
    'case_id', v_case_id,
    'case_number', v_case_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_submit_user_report_v2(
  UUID,
  public.report_category,
  TEXT,
  UUID,
  UUID[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_submit_user_report_v2(
  UUID,
  public.report_category,
  TEXT,
  UUID,
  UUID[]
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Case bundle — expose all linked chat room ids
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_moderation_case_bundle(
  p_case_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_case public.moderation_cases%ROWTYPE;
  v_subject RECORD;
  v_reports JSONB;
  v_attachments JSONB;
  v_reporter_summaries JSONB;
  v_audit_log JSONB;
  v_active_sanctions JSONB;
  v_related_orders JSONB;
  v_chat_room_id UUID;
  v_chat_room_ids UUID[];
  v_required_chat BOOLEAN;
  v_evidence_sufficient BOOLEAN;
BEGIN
  v_admin_id := public._grading_require_admin();

  SELECT *
  INTO v_case
  FROM public.moderation_cases mc
  WHERE mc.id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到案件';
  END IF;

  SELECT
    p.id,
    p.display_name,
    p.username,
    p.role
  INTO v_subject
  FROM public.profiles p
  WHERE p.id = v_case.subject_user_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'reporterId', r.reporter_id,
        'reporterDisplayName', pr.display_name,
        'reporterUsername', pr.username,
        'category', r.category,
        'source', r.source,
        'status', r.status,
        'details', r.details,
        'reason', r.reason,
        'contributionScore', r.contribution_score,
        'contextType', r.context_type,
        'contextId', r.context_id,
        'createdAt', r.created_at
      )
      ORDER BY r.created_at ASC NULLS LAST
    ),
    '[]'::JSONB
  )
  INTO v_reports
  FROM public.reports r
  JOIN public.profiles pr ON pr.id = r.reporter_id
  WHERE r.case_id = p_case_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ra.id,
        'reportId', ra.report_id,
        'reporterId', ra.reporter_id,
        'storagePath', ra.storage_path,
        'mimeType', ra.mime_type,
        'byteSize', ra.byte_size,
        'createdAt', ra.created_at
      )
      ORDER BY ra.created_at ASC
    ),
    '[]'::JSONB
  )
  INTO v_attachments
  FROM public.report_attachments ra
  WHERE ra.report_id IN (
    SELECT r.id FROM public.reports r WHERE r.case_id = p_case_id
  );

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', rs.reporter_id,
        'displayName', rs.display_name,
        'reportCount', rs.report_count
      )
      ORDER BY rs.report_count DESC, rs.display_name ASC
    ),
    '[]'::JSONB
  )
  INTO v_reporter_summaries
  FROM (
    SELECT
      r.reporter_id,
      pr.display_name,
      COUNT(*)::INT AS report_count
    FROM public.reports r
    JOIN public.profiles pr ON pr.id = r.reporter_id
    WHERE r.case_id = p_case_id
    GROUP BY r.reporter_id, pr.display_name
  ) rs;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', al.id,
        'action', al.action,
        'adminId', al.admin_id,
        'adminDisplayName', ap.display_name,
        'payload', al.payload,
        'createdAt', al.created_at
      )
      ORDER BY al.created_at DESC
    ),
    '[]'::JSONB
  )
  INTO v_audit_log
  FROM (
    SELECT
      mal.id,
      mal.action,
      mal.admin_id,
      mal.payload,
      mal.created_at
    FROM public.moderation_audit_logs mal
    WHERE mal.case_id = p_case_id
    ORDER BY mal.created_at DESC
    LIMIT 50
  ) al
  JOIN public.profiles ap ON ap.id = al.admin_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'scope', s.scope,
        'type', s.type,
        'startsAt', s.starts_at,
        'endsAt', s.ends_at,
        'reason', s.reason,
        'caseId', s.case_id
      )
      ORDER BY s.starts_at DESC
    ),
    '[]'::JSONB
  )
  INTO v_active_sanctions
  FROM public.account_sanctions s
  WHERE s.user_id = v_case.subject_user_id
    AND s.revoked_at IS NULL
    AND (s.ends_at IS NULL OR s.ends_at > now());

  v_related_orders := public.admin_get_moderation_order_context(p_case_id);

  SELECT COALESCE(
    array_agg(room_row.room_id ORDER BY room_row.min_created_at),
    '{}'::uuid[]
  )
  INTO v_chat_room_ids
  FROM (
    SELECT
      r.context_id AS room_id,
      MIN(r.created_at) AS min_created_at
    FROM public.reports r
    WHERE r.case_id = p_case_id
      AND r.context_type = 'chat_room'
      AND r.context_id IS NOT NULL
    GROUP BY r.context_id
  ) room_row;

  v_chat_room_id := public._moderation_resolve_chat_room_for_case(p_case_id);

  IF v_chat_room_id IS NULL AND COALESCE(array_length(v_chat_room_ids, 1), 0) > 0 THEN
    v_chat_room_id := v_chat_room_ids[1];
  END IF;

  v_required_chat := v_case.primary_category IN ('offline_trade', 'harassment');
  v_evidence_sufficient := NOT v_required_chat OR v_chat_room_id IS NOT NULL;

  RETURN jsonb_build_object(
    'case', jsonb_build_object(
      'id', v_case.id,
      'caseNumber', v_case.case_number,
      'status', v_case.status,
      'primaryCategory', v_case.primary_category,
      'autoScore', v_case.auto_score,
      'adminAdjustment', v_case.admin_adjustment,
      'finalScore', v_case.final_score,
      'adjustmentReason', v_case.adjustment_reason,
      'resolution', v_case.resolution,
      'violationPersona', v_case.violation_persona,
      'resolvedAt', v_case.resolved_at,
      'createdAt', v_case.created_at,
      'updatedAt', v_case.updated_at,
      'subject', jsonb_build_object(
        'id', v_subject.id,
        'displayName', v_subject.display_name,
        'username', v_subject.username,
        'role', v_subject.role
      )
    ),
    'reports', v_reports,
    'attachments', v_attachments,
    'reporterSummaries', v_reporter_summaries,
    'chatAccess', jsonb_build_object(
      'available', v_chat_room_id IS NOT NULL,
      'roomId', v_chat_room_id,
      'roomIds', to_jsonb(v_chat_room_ids),
      'requiredForCategory', v_required_chat,
      'evidenceSufficient', v_evidence_sufficient
    ),
    'relatedOrders', COALESCE(v_related_orders, '[]'::JSONB),
    'activeSanctions', COALESCE(v_active_sanctions, '[]'::JSONB),
    'auditLog', COALESCE(v_audit_log, '[]'::JSONB)
  );
END;
$$;
