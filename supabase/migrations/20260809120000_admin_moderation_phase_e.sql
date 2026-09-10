-- Phase E: account sanctions, score adjust, case resolve, chat/listing enforcement.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'sanction_scope'
  ) THEN
    CREATE TYPE public.sanction_scope AS ENUM (
      'account',
      'member_persona',
      'merchant_persona'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'sanction_type'
  ) THEN
    CREATE TYPE public.sanction_type AS ENUM (
      'warn',
      'restrict_listing',
      'restrict_chat',
      'freeze_payout',
      'suspend',
      'ban'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'moderation_resolution'
  ) THEN
    CREATE TYPE public.moderation_resolution AS ENUM (
      'upheld',
      'dismissed',
      'insufficient_evidence'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'violation_persona'
  ) THEN
    CREATE TYPE public.violation_persona AS ENUM (
      'member',
      'merchant',
      'both',
      'unknown'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. account_sanctions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_sanctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  scope public.sanction_scope NOT NULL,
  type public.sanction_type NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('auto', 'admin')),
  case_id UUID REFERENCES public.moderation_cases (id) ON DELETE SET NULL,
  reason TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_sanctions_user_active
  ON public.account_sanctions (user_id, starts_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE public.account_sanctions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_sanctions_admin_select ON public.account_sanctions;
CREATE POLICY account_sanctions_admin_select
  ON public.account_sanctions
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.account_sanctions TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.account_sanctions TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Extend moderation_cases
-- ---------------------------------------------------------------------------

ALTER TABLE public.moderation_cases
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT,
  ADD COLUMN IF NOT EXISTS violation_persona public.violation_persona,
  ADD COLUMN IF NOT EXISTS resolution public.moderation_resolution,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES public.profiles (id);

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._moderation_has_active_sanction(
  p_user_id UUID,
  p_scope public.sanction_scope DEFAULT NULL,
  p_type public.sanction_type DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_sanctions s
    WHERE s.user_id = p_user_id
      AND s.revoked_at IS NULL
      AND (s.ends_at IS NULL OR s.ends_at > now())
      AND (p_scope IS NULL OR s.scope = p_scope OR s.scope = 'account')
      AND (p_type IS NULL OR s.type = p_type)
  );
$$;

CREATE OR REPLACE FUNCTION public._moderation_apply_sanction_side_effects(
  p_user_id UUID,
  p_scope public.sanction_scope,
  p_type public.sanction_type
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_type = 'restrict_listing' THEN
    IF p_scope = 'member_persona' THEN
      UPDATE public.listings
      SET status = 'inactive'::public.listing_status,
          updated_at = now()
      WHERE seller_id = p_user_id
        AND seller_persona = 'member'::public.seller_persona_type
        AND status = 'active'::public.listing_status;
    ELSIF p_scope = 'merchant_persona' THEN
      UPDATE public.listings
      SET status = 'inactive'::public.listing_status,
          updated_at = now()
      WHERE seller_id = p_user_id
        AND seller_persona = 'merchant'::public.seller_persona_type
        AND status = 'active'::public.listing_status;
    ELSIF p_scope = 'account' THEN
      UPDATE public.listings
      SET status = 'inactive'::public.listing_status,
          updated_at = now()
      WHERE seller_id = p_user_id
        AND status = 'active'::public.listing_status;
    END IF;
  ELSIF p_type = 'freeze_payout' THEN
    UPDATE public.member_orders
    SET seller_payout_status = 'frozen'::public.member_seller_payout_status,
        updated_at = now()
    WHERE seller_id = p_user_id
      AND seller_payout_status IN (
        'held'::public.member_seller_payout_status,
        'ready'::public.member_seller_payout_status,
        'processing'::public.member_seller_payout_status
      );

    UPDATE public.merchant_orders
    SET payout_status = 'frozen',
        updated_at = now()
    WHERE merchant_id = p_user_id
      AND payout_status IN ('pending', 'held', 'processing');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._moderation_insert_account_sanction(
  p_admin_id UUID,
  p_user_id UUID,
  p_scope public.sanction_scope,
  p_type public.sanction_type,
  p_ends_at TIMESTAMPTZ,
  p_case_id UUID,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sanction_id UUID;
BEGIN
  INSERT INTO public.account_sanctions (
    user_id,
    scope,
    type,
    ends_at,
    source,
    case_id,
    reason
  )
  VALUES (
    p_user_id,
    p_scope,
    p_type,
    p_ends_at,
    'admin',
    p_case_id,
    NULLIF(btrim(p_reason), '')
  )
  RETURNING id INTO v_sanction_id;

  PERFORM public._moderation_apply_sanction_side_effects(p_user_id, p_scope, p_type);

  PERFORM public._moderation_write_audit_log(
    p_case_id,
    'apply_sanction',
    jsonb_build_object(
      'sanctionId', v_sanction_id,
      'userId', p_user_id,
      'scope', p_scope::TEXT,
      'type', p_type::TEXT,
      'endsAt', p_ends_at,
      'reason', p_reason
    )
  );

  RETURN v_sanction_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC: adjust score
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_adjust_moderation_case_score(
  p_case_id UUID,
  p_adjustment NUMERIC,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_case public.moderation_cases%ROWTYPE;
  v_reason TEXT;
BEGIN
  v_admin_id := public._grading_require_admin();
  v_reason := NULLIF(btrim(p_reason), '');

  SELECT *
  INTO v_case
  FROM public.moderation_cases mc
  WHERE mc.id = p_case_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到案件';
  END IF;

  IF v_case.status NOT IN ('open'::public.moderation_case_status, 'reviewing'::public.moderation_case_status) THEN
    RAISE EXCEPTION '案件已結案，無法調整分數';
  END IF;

  IF COALESCE(p_adjustment, 0) <> 0 AND v_reason IS NULL THEN
    RAISE EXCEPTION '調整分數時必須填寫原因';
  END IF;

  UPDATE public.moderation_cases
  SET
    admin_adjustment = admin_adjustment + COALESCE(p_adjustment, 0),
    adjustment_reason = COALESCE(v_reason, adjustment_reason),
    updated_at = now()
  WHERE id = p_case_id;

  PERFORM public._moderation_write_audit_log(
    p_case_id,
    'adjust_score',
    jsonb_build_object(
      'adjustment', p_adjustment,
      'reason', v_reason,
      'newAdminAdjustment', v_case.admin_adjustment + COALESCE(p_adjustment, 0)
    )
  );

  RETURN jsonb_build_object('success', true, 'caseId', p_case_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_adjust_moderation_case_score(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_moderation_case_score(UUID, NUMERIC, TEXT)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. RPC: apply account sanction (standalone admin)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_apply_account_sanction(
  p_user_id UUID,
  p_scope public.sanction_scope,
  p_type public.sanction_type,
  p_case_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_ends_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_sanction_id UUID;
BEGIN
  v_admin_id := public._grading_require_admin();

  IF p_case_id IS NOT NULL THEN
    PERFORM 1
    FROM public.moderation_cases mc
    WHERE mc.id = p_case_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION '找不到案件';
    END IF;
  END IF;

  v_sanction_id := public._moderation_insert_account_sanction(
    v_admin_id,
    p_user_id,
    p_scope,
    p_type,
    p_ends_at,
    p_case_id,
    p_reason
  );

  RETURN jsonb_build_object('success', true, 'sanctionId', v_sanction_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_apply_account_sanction(UUID, public.sanction_scope, public.sanction_type, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_apply_account_sanction(UUID, public.sanction_scope, public.sanction_type, UUID, TEXT, TIMESTAMPTZ)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. RPC: resolve moderation case
-- ---------------------------------------------------------------------------

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
  SET status = v_new_report_status
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
      'newStatus', v_new_case_status::TEXT
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

-- ---------------------------------------------------------------------------
-- 8. Listing enforcement helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moderation_check_listing_allowed(
  p_user_id UUID,
  p_persona public.seller_persona_type
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public._moderation_has_active_sanction(p_user_id, 'account', 'suspend')
     OR public._moderation_has_active_sanction(p_user_id, 'account', 'ban')
     OR public._moderation_has_active_sanction(p_user_id, 'account', 'restrict_listing') THEN
    RETURN FALSE;
  END IF;

  IF p_persona = 'member'::public.seller_persona_type
     AND public._moderation_has_active_sanction(p_user_id, 'member_persona', 'restrict_listing') THEN
    RETURN FALSE;
  END IF;

  IF p_persona = 'merchant'::public.seller_persona_type
     AND public._moderation_has_active_sanction(p_user_id, 'merchant_persona', 'restrict_listing') THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.moderation_check_listing_allowed(UUID, public.seller_persona_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderation_check_listing_allowed(UUID, public.seller_persona_type)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Chat enforcement — patch rpc_send_chat_message
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_send_chat_message(
  p_room_id UUID,
  p_sender_id UUID,
  p_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trimmed_content TEXT;
  v_message_id UUID;
  v_message_row RECORD;
  v_is_system_warning BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_sender_id THEN
    RAISE EXCEPTION '保安攔截：請先登入後再發送訊息。';
  END IF;

  v_trimmed_content := trim(p_content);

  IF v_trimmed_content IS NULL OR v_trimmed_content = '' THEN
    RAISE EXCEPTION '訊息不能為空。';
  END IF;

  IF char_length(v_trimmed_content) > 2000 THEN
    RAISE EXCEPTION '訊息長度不可超過 2000 字。';
  END IF;

  IF NOT public.is_chat_room_member(p_room_id, p_sender_id) THEN
    RAISE EXCEPTION '操作失敗：您不是此聊天室的成員。';
  END IF;

  IF public._moderation_has_active_sanction(p_sender_id, NULL, 'restrict_chat')
     OR public._moderation_has_active_sanction(p_sender_id, 'account', 'suspend')
     OR public._moderation_has_active_sanction(p_sender_id, 'account', 'ban') THEN
    RAISE EXCEPTION '帳戶已被限制發送訊息';
  END IF;

  v_is_system_warning :=
    v_trimmed_content LIKE '%私下%'
    AND v_trimmed_content LIKE '%過數%';

  INSERT INTO public.chat_messages (room_id, sender_id, content, is_system_warning)
  VALUES (p_room_id, p_sender_id, v_trimmed_content, v_is_system_warning)
  RETURNING id INTO v_message_id;

  SELECT id, room_id, content, created_at, is_system_warning
  INTO v_message_row
  FROM public.chat_messages
  WHERE id = v_message_id;

  RETURN jsonb_build_object(
    'id', v_message_row.id,
    'room_id', v_message_row.room_id,
    'content', v_message_row.content,
    'created_at', v_message_row.created_at,
    'is_system_warning', v_message_row.is_system_warning
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_send_chat_message(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_send_chat_message(UUID, UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Update case bundle — resolution fields + activeSanctions
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
    'relatedOrders', '[]'::JSONB,
    'activeSanctions', COALESCE(v_active_sanctions, '[]'::JSONB),
    'auditLog', COALESCE(v_audit_log, '[]'::JSONB)
  );
END;
$$;
