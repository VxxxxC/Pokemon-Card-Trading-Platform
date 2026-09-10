-- Phase E+: account access restriction (middleware), order context, bundle relatedOrders.

-- ---------------------------------------------------------------------------
-- 1. Account access restriction (middleware / self-check)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moderation_get_account_access_restriction(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sanction RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('blocked', false);
  END IF;

  IF auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION '無權限查詢此帳戶限制狀態';
  END IF;

  SELECT
    s.type,
    s.ends_at,
    s.reason
  INTO v_sanction
  FROM public.account_sanctions s
  WHERE s.user_id = p_user_id
    AND s.scope = 'account'::public.sanction_scope
    AND s.type IN ('suspend'::public.sanction_type, 'ban'::public.sanction_type)
    AND s.revoked_at IS NULL
    AND (s.ends_at IS NULL OR s.ends_at > now())
  ORDER BY s.starts_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('blocked', false);
  END IF;

  RETURN jsonb_build_object(
    'blocked', true,
    'type', v_sanction.type::TEXT,
    'endsAt', v_sanction.ends_at,
    'reason', v_sanction.reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.moderation_get_account_access_restriction(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderation_get_account_access_restriction(UUID)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Order context for moderation case (admin)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_moderation_order_context(
  p_case_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject_user_id UUID;
  v_chat_room_id UUID;
  v_orders JSONB;
BEGIN
  PERFORM public._grading_require_admin();

  SELECT mc.subject_user_id
  INTO v_subject_user_id
  FROM public.moderation_cases mc
  WHERE mc.id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到案件';
  END IF;

  v_chat_room_id := public._moderation_resolve_chat_room_for_case(p_case_id);

  WITH reporters AS (
    SELECT DISTINCT r.reporter_id
    FROM public.reports r
    WHERE r.case_id = p_case_id
  ),
  order_refs AS (
    SELECT
      r.context_id AS order_id,
      CASE
        WHEN r.context_type = 'member_order' THEN 'member'::public.seller_persona_type
        ELSE 'merchant'::public.seller_persona_type
      END AS persona,
      'report_context'::TEXT AS source,
      1 AS priority
    FROM public.reports r
    WHERE r.case_id = p_case_id
      AND r.context_type IN ('member_order', 'merchant_order')
      AND r.context_id IS NOT NULL

    UNION ALL

    SELECT
      cm.member_order_id,
      'member'::public.seller_persona_type,
      'chat_message'::TEXT,
      2
    FROM public.chat_messages cm
    WHERE v_chat_room_id IS NOT NULL
      AND cm.room_id = v_chat_room_id
      AND cm.member_order_id IS NOT NULL

    UNION ALL

    SELECT
      cm.merchant_order_id,
      'merchant'::public.seller_persona_type,
      'chat_message'::TEXT,
      2
    FROM public.chat_messages cm
    WHERE v_chat_room_id IS NOT NULL
      AND cm.room_id = v_chat_room_id
      AND cm.merchant_order_id IS NOT NULL

    UNION ALL

    SELECT
      mo.id,
      'member'::public.seller_persona_type,
      'party_match'::TEXT,
      3
    FROM public.member_orders mo
    WHERE (
      mo.buyer_id = v_subject_user_id
      AND mo.seller_id IN (SELECT reporter_id FROM reporters)
    ) OR (
      mo.seller_id = v_subject_user_id
      AND mo.buyer_id IN (SELECT reporter_id FROM reporters)
    )

    UNION ALL

    SELECT
      mo.id,
      'merchant'::public.seller_persona_type,
      'party_match'::TEXT,
      3
    FROM public.merchant_orders mo
    WHERE (
      mo.merchant_id = v_subject_user_id
      AND mo.buyer_id IN (SELECT reporter_id FROM reporters)
    ) OR (
      mo.buyer_id = v_subject_user_id
      AND mo.merchant_id IN (SELECT reporter_id FROM reporters)
    )
  ),
  deduped AS (
    SELECT DISTINCT ON (order_id, persona)
      order_id,
      persona,
      source,
      priority
    FROM order_refs
    WHERE order_id IS NOT NULL
    ORDER BY order_id, persona, priority ASC
    LIMIT 20
  ),
  member_rows AS (
    SELECT
      d.order_id,
      d.persona,
      d.source,
      jsonb_build_object(
        'id', mo.id,
        'persona', 'member',
        'orderNumber', mo.order_number,
        'finalPrice', mo.final_price,
        'totalAmount', mo.total_amount,
        'status', mo.status::TEXT,
        'escrowStatus', mo.escrow_status::TEXT,
        'inboundTrackingNo', mo.inbound_tracking_no,
        'outboundTrackingNo', mo.outbound_tracking_no,
        'paidAt', mo.payment_confirmed_at,
        'buyerConfirmedAt', mo.buyer_confirmed_at,
        'createdAt', mo.created_at,
        'source', d.source,
        'useAuthentication', mo.use_authentication
      ) AS row_json
    FROM deduped d
    JOIN public.member_orders mo ON mo.id = d.order_id
    WHERE d.persona = 'member'::public.seller_persona_type
  ),
  merchant_rows AS (
    SELECT
      d.order_id,
      d.persona,
      d.source,
      jsonb_build_object(
        'id', mo.id,
        'persona', 'merchant',
        'orderNumber', mo.order_number,
        'finalPrice', mo.final_price,
        'totalAmount', mo.total_amount,
        'status', NULL,
        'escrowStatus', mo.escrow_status::TEXT,
        'inboundTrackingNo', mo.inbound_tracking_no,
        'outboundTrackingNo', mo.outbound_tracking_no,
        'paidAt', mo.paid_at,
        'buyerConfirmedAt', mo.buyer_confirmed_at,
        'createdAt', mo.created_at,
        'source', d.source,
        'requiresAuthentication', mo.requires_authentication
      ) AS row_json
    FROM deduped d
    JOIN public.merchant_orders mo ON mo.id = d.order_id
    WHERE d.persona = 'merchant'::public.seller_persona_type
  ),
  combined AS (
    SELECT row_json FROM member_rows
    UNION ALL
    SELECT row_json FROM merchant_rows
  )
  SELECT COALESCE(
    jsonb_agg(c.row_json ORDER BY (c.row_json ->> 'createdAt') DESC NULLS LAST),
    '[]'::JSONB
  )
  INTO v_orders
  FROM combined c;

  RETURN COALESCE(v_orders, '[]'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_moderation_order_context(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_moderation_order_context(UUID)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Update case bundle — real relatedOrders
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
      'requiredForCategory', v_required_chat,
      'evidenceSufficient', v_evidence_sufficient
    ),
    'relatedOrders', COALESCE(v_related_orders, '[]'::JSONB),
    'activeSanctions', COALESCE(v_active_sanctions, '[]'::JSONB),
    'auditLog', COALESCE(v_audit_log, '[]'::JSONB)
  );
END;
$$;
