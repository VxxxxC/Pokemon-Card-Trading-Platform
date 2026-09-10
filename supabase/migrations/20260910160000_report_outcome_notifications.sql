-- Reporter in-app outcome notifications: column, backfill, resolve patch, RPCs.

ALTER TABLE public.reports
    ADD COLUMN IF NOT EXISTS outcome_acknowledged_at TIMESTAMPTZ NULL;

-- Prevent flooding reporters with legacy closed reports on deploy.
UPDATE public.reports
SET outcome_acknowledged_at = COALESCE(updated_at, created_at, now())
WHERE status IN ('resolved', 'dismissed')
  AND outcome_acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reports_outcome_pending
    ON public.reports (reporter_id, created_at DESC)
    WHERE status IN ('resolved', 'dismissed')
      AND outcome_acknowledged_at IS NULL;

CREATE OR REPLACE FUNCTION public.rpc_resolve_moderation_case(
  p_case_id UUID,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_case public.moderation_cases%ROWTYPE;
  v_resolution TEXT;
  v_violation_persona TEXT;
  v_adjustment NUMERIC;
  v_adjustment_reason TEXT;
  v_evidence_override_reason TEXT;
  v_sanction JSONB;
  v_sanction_scope TEXT;
  v_sanction_type TEXT;
  v_sanction_ends_at TIMESTAMPTZ;
  v_sanction_reason TEXT;
  v_required_chat BOOLEAN;
  v_chat_room_id UUID;
  v_evidence_sufficient BOOLEAN;
  v_new_case_status public.moderation_case_status;
  v_new_report_status public.report_state;
  v_sanction_id UUID;
  v_notify_reporter BOOLEAN;
BEGIN
  v_admin_id := public._grading_require_admin();

  v_resolution := COALESCE(
    NULLIF(p_payload ->> 'resolution', ''),
    NULLIF(p_payload ->> 'Resolution', '')
  );
  v_violation_persona := COALESCE(
    NULLIF(p_payload ->> 'violationPersona', ''),
    NULLIF(p_payload ->> 'violation_persona', '')
  );
  v_adjustment := COALESCE(
    NULLIF(p_payload ->> 'adjustment', '')::NUMERIC,
    0
  );
  v_adjustment_reason := COALESCE(
    NULLIF(p_payload ->> 'adjustmentReason', ''),
    NULLIF(p_payload ->> 'adjustment_reason', '')
  );
  v_evidence_override_reason := COALESCE(
    NULLIF(p_payload ->> 'evidenceOverrideReason', ''),
    NULLIF(p_payload ->> 'evidence_override_reason', '')
  );
  v_sanction := COALESCE(p_payload -> 'sanction', p_payload -> 'Sanction');
  v_notify_reporter := COALESCE(
    CASE
      WHEN p_payload ? 'notifyReporter' THEN (p_payload ->> 'notifyReporter')::BOOLEAN
      WHEN p_payload ? 'notify_reporter' THEN (p_payload ->> 'notify_reporter')::BOOLEAN
      ELSE NULL
    END,
    TRUE
  );

  IF v_resolution IS NULL OR v_resolution NOT IN ('upheld', 'dismissed', 'insufficient_evidence') THEN
    RAISE EXCEPTION '無效的裁定結果';
  END IF;

  SELECT *
  INTO v_case
  FROM public.moderation_cases mc
  WHERE mc.id = p_case_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到案件';
  END IF;

  IF v_case.status NOT IN ('open'::public.moderation_case_status, 'reviewing'::public.moderation_case_status) THEN
    RAISE EXCEPTION '案件已結案';
  END IF;

  v_required_chat := v_case.primary_category IN ('offline_trade', 'harassment');
  v_chat_room_id := public._moderation_resolve_chat_room_for_case(p_case_id);
  v_evidence_sufficient := NOT v_required_chat OR v_chat_room_id IS NOT NULL;

  IF v_resolution = 'upheld' THEN
    IF v_violation_persona IS NULL
       OR v_violation_persona NOT IN ('member', 'merchant', 'both', 'unknown') THEN
      RAISE EXCEPTION '裁定成立時必須指定違規身分';
    END IF;

    IF NOT v_evidence_sufficient AND v_evidence_override_reason IS NULL THEN
      RAISE EXCEPTION '證據不足，請提供覆寫原因或改選其他裁定';
    END IF;

    v_new_case_status := 'resolved'::public.moderation_case_status;
    v_new_report_status := 'resolved'::public.report_state;
  ELSE
    v_new_case_status := 'dismissed'::public.moderation_case_status;
    v_new_report_status := 'dismissed'::public.report_state;
  END IF;

  IF COALESCE(v_adjustment, 0) <> 0 THEN
    IF NULLIF(btrim(v_adjustment_reason), '') IS NULL THEN
      RAISE EXCEPTION '調整分數時必須填寫原因';
    END IF;

    UPDATE public.moderation_cases
    SET
      admin_adjustment = admin_adjustment + v_adjustment,
      adjustment_reason = btrim(v_adjustment_reason),
      updated_at = now()
    WHERE id = p_case_id;
  END IF;

  IF v_resolution = 'upheld' AND v_sanction IS NOT NULL AND v_sanction <> 'null'::JSONB THEN
    v_sanction_scope := COALESCE(
      NULLIF(v_sanction ->> 'scope', ''),
      NULLIF(v_sanction ->> 'Scope', '')
    );
    v_sanction_type := COALESCE(
      NULLIF(v_sanction ->> 'type', ''),
      NULLIF(v_sanction ->> 'Type', '')
    );
    v_sanction_reason := COALESCE(
      NULLIF(v_sanction ->> 'reason', ''),
      NULLIF(v_sanction ->> 'Reason', ''),
      ''
    );

    IF v_sanction ->> 'endsAt' IS NOT NULL OR v_sanction ->> 'ends_at' IS NOT NULL THEN
      v_sanction_ends_at := COALESCE(
        NULLIF(v_sanction ->> 'endsAt', '')::TIMESTAMPTZ,
        NULLIF(v_sanction ->> 'ends_at', '')::TIMESTAMPTZ
      );
    ELSE
      v_sanction_ends_at := NULL;
    END IF;

    IF v_sanction_scope IS NULL
       OR v_sanction_scope NOT IN ('account', 'member_persona', 'merchant_persona')
       OR v_sanction_type IS NULL
       OR v_sanction_type NOT IN (
         'warn', 'restrict_listing', 'restrict_chat', 'freeze_payout', 'suspend', 'ban'
       ) THEN
      RAISE EXCEPTION '無效的制裁設定';
    END IF;

    v_sanction_id := public._moderation_insert_account_sanction(
      v_admin_id,
      v_case.subject_user_id,
      v_sanction_scope::public.sanction_scope,
      v_sanction_type::public.sanction_type,
      v_sanction_ends_at,
      p_case_id,
      v_sanction_reason
    );
  END IF;

  UPDATE public.moderation_cases
  SET
    status = v_new_case_status,
    resolution = v_resolution::public.moderation_resolution,
    violation_persona = CASE
      WHEN v_violation_persona IS NOT NULL
      THEN v_violation_persona::public.violation_persona
      ELSE violation_persona
    END,
    resolved_at = now(),
    resolved_by = v_admin_id,
    updated_at = now()
  WHERE id = p_case_id;

  UPDATE public.reports
  SET
    status = v_new_report_status,
    outcome_acknowledged_at = CASE
      WHEN v_notify_reporter THEN outcome_acknowledged_at
      ELSE COALESCE(outcome_acknowledged_at, now())
    END
  WHERE case_id = p_case_id;

  PERFORM public._moderation_write_audit_log(
    p_case_id,
    'resolve',
    jsonb_build_object(
      'resolution', v_resolution,
      'violationPersona', v_violation_persona,
      'adjustment', v_adjustment,
      'adjustmentReason', v_adjustment_reason,
      'evidenceOverrideReason', v_evidence_override_reason,
      'sanction', v_sanction,
      'sanctionId', v_sanction_id,
      'newStatus', v_new_case_status::TEXT,
      'notifyReporter', v_notify_reporter
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'caseId', p_case_id,
    'status', v_new_case_status::TEXT,
    'resolution', v_resolution
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_resolve_moderation_case(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_moderation_case(UUID, JSONB)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_unacknowledged_report_outcomes_for_me()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'reportId', r.id,
        'caseId', mc.id,
        'caseNumber', mc.case_number,
        'resolution', mc.resolution::TEXT,
        'resolvedAt', mc.resolved_at
      )
      ORDER BY mc.resolved_at DESC NULLS LAST, r.created_at ASC
    )
    FROM public.reports r
    INNER JOIN public.moderation_cases mc ON mc.id = r.case_id
    WHERE r.reporter_id = v_user_id
      AND r.status IN ('resolved', 'dismissed')
      AND r.outcome_acknowledged_at IS NULL
      AND mc.resolved_at IS NOT NULL
  ), '[]'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.get_unacknowledged_report_outcomes_for_me() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unacknowledged_report_outcomes_for_me()
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.acknowledge_report_outcomes(p_report_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_updated INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  UPDATE public.reports r
  SET outcome_acknowledged_at = now()
  WHERE r.reporter_id = v_user_id
    AND r.id = ANY (COALESCE(p_report_ids, '{}'::UUID[]))
    AND r.outcome_acknowledged_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_report_outcomes(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_report_outcomes(UUID[])
  TO authenticated, service_role;
