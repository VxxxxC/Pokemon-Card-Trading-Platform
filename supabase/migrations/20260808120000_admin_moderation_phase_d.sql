-- Phase D: moderation audit logs, admin chat thread RPC, bundle chat fallback + auditLog.

-- ---------------------------------------------------------------------------
-- 1. moderation_audit_logs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.moderation_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.moderation_cases (id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.profiles (id),
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_logs_case_created
  ON public.moderation_audit_logs (case_id, created_at DESC);

ALTER TABLE public.moderation_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS moderation_audit_logs_admin_select ON public.moderation_audit_logs;
CREATE POLICY moderation_audit_logs_admin_select
  ON public.moderation_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.moderation_audit_logs TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.moderation_audit_logs TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._moderation_write_audit_log(
  p_case_id UUID,
  p_action TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  v_admin_id := public._grading_require_admin();

  INSERT INTO public.moderation_audit_logs (
    case_id,
    admin_id,
    action,
    payload
  ) VALUES (
    p_case_id,
    v_admin_id,
    p_action,
    COALESCE(p_payload, '{}'::JSONB)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._moderation_resolve_chat_room_for_case(
  p_case_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject_user_id UUID;
  v_chat_room_id UUID;
BEGIN
  SELECT mc.subject_user_id
  INTO v_subject_user_id
  FROM public.moderation_cases mc
  WHERE mc.id = p_case_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT r.context_id
  INTO v_chat_room_id
  FROM public.reports r
  WHERE r.case_id = p_case_id
    AND r.context_type = 'chat_room'
    AND r.context_id IS NOT NULL
  ORDER BY r.created_at ASC NULLS LAST
  LIMIT 1;

  IF v_chat_room_id IS NOT NULL THEN
    RETURN v_chat_room_id;
  END IF;

  SELECT cr.id
  INTO v_chat_room_id
  FROM public.chat_rooms cr
  WHERE (
    cr.buyer_id = v_subject_user_id
    AND cr.seller_id IN (
      SELECT DISTINCT r.reporter_id
      FROM public.reports r
      WHERE r.case_id = p_case_id
    )
  ) OR (
    cr.seller_id = v_subject_user_id
    AND cr.buyer_id IN (
      SELECT DISTINCT r.reporter_id
      FROM public.reports r
      WHERE r.case_id = p_case_id
    )
  )
  ORDER BY cr.updated_at DESC NULLS LAST, cr.created_at DESC
  LIMIT 1;

  IF v_chat_room_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.chat_rooms cr
    WHERE cr.id = v_chat_room_id
      AND (
        cr.buyer_id = v_subject_user_id
        OR cr.seller_id = v_subject_user_id
      )
  ) THEN
    RETURN NULL;
  END IF;

  RETURN v_chat_room_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Admin chat thread (read-only + view_chat audit on first page)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_moderation_chat_thread(
  p_case_id UUID,
  p_room_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_resolved_room_id UUID;
  v_limit INTEGER;
  v_has_more BOOLEAN := false;
  v_messages JSONB;
  v_next_before TIMESTAMPTZ;
BEGIN
  v_admin_id := public._grading_require_admin();

  IF p_case_id IS NULL OR p_room_id IS NULL THEN
    RAISE EXCEPTION '無效的聊天室';
  END IF;

  v_resolved_room_id := public._moderation_resolve_chat_room_for_case(p_case_id);

  IF v_resolved_room_id IS NULL OR v_resolved_room_id <> p_room_id THEN
    RAISE EXCEPTION '無法調閱此聊天室';
  END IF;

  v_limit := GREATEST(LEAST(COALESCE(p_limit, 50), 100), 1);

  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT cm.id
      FROM public.chat_messages cm
      WHERE cm.room_id = p_room_id
        AND (
          p_before IS NULL
          OR cm.created_at < p_before
        )
      ORDER BY cm.created_at DESC
      OFFSET v_limit
      LIMIT 1
    ) older_rows
  )
  INTO v_has_more;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', page_cm.id,
        'senderId', page_cm.sender_id,
        'senderDisplayName', sp.display_name,
        'content', page_cm.content,
        'createdAt', page_cm.created_at,
        'isSystemWarning', COALESCE(page_cm.is_system_warning, false),
        'offerId', page_cm.offer_id,
        'memberOrderId', page_cm.member_order_id,
        'merchantOrderId', page_cm.merchant_order_id
      )
      ORDER BY page_cm.created_at ASC
    ),
    '[]'::JSONB
  )
  INTO v_messages
  FROM (
    SELECT cm.*
    FROM public.chat_messages cm
    WHERE cm.room_id = p_room_id
      AND (
        p_before IS NULL
        OR cm.created_at < p_before
      )
    ORDER BY cm.created_at DESC
    LIMIT v_limit
  ) page_cm
  LEFT JOIN public.profiles sp ON sp.id = page_cm.sender_id;

  SELECT MIN(page_cm.created_at)
  INTO v_next_before
  FROM (
    SELECT cm.created_at
    FROM public.chat_messages cm
    WHERE cm.room_id = p_room_id
      AND (
        p_before IS NULL
        OR cm.created_at < p_before
      )
    ORDER BY cm.created_at DESC
    LIMIT v_limit
  ) page_cm;

  IF p_before IS NULL THEN
    PERFORM public._moderation_write_audit_log(
      p_case_id,
      'view_chat',
      jsonb_build_object('roomId', p_room_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'roomId', p_room_id,
    'messages', COALESCE(v_messages, '[]'::JSONB),
    'hasMore', COALESCE(v_has_more, false),
    'nextBefore', CASE
      WHEN v_has_more AND v_next_before IS NOT NULL THEN v_next_before::TEXT
      ELSE NULL
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_moderation_chat_thread(UUID, UUID, INTEGER, TIMESTAMPTZ) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_get_moderation_chat_thread(UUID, UUID, INTEGER, TIMESTAMPTZ)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Update case bundle — chat fallback + auditLog
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
  v_chat_room_id UUID;
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

  v_chat_room_id := public._moderation_resolve_chat_room_for_case(p_case_id);

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
      'requiredForCategory', v_required_chat,
      'evidenceSufficient', v_evidence_sufficient
    ),
    'relatedOrders', '[]'::JSONB,
    'activeSanctions', '[]'::JSONB,
    'auditLog', COALESCE(v_audit_log, '[]'::JSONB)
  );
END;
$$;
