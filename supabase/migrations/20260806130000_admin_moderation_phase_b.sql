-- Admin moderation Phase B: report evidence attachments + bind on submit.

-- ---------------------------------------------------------------------------
-- 1. report_attachments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.report_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports (id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT report_attachments_byte_size_positive CHECK (byte_size > 0)
);

CREATE INDEX IF NOT EXISTS idx_report_attachments_reporter_pending
  ON public.report_attachments (reporter_id, created_at DESC)
  WHERE report_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_report_attachments_report_id
  ON public.report_attachments (report_id)
  WHERE report_id IS NOT NULL;

ALTER TABLE public.report_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_attachments_reporter_select ON public.report_attachments;
CREATE POLICY report_attachments_reporter_select
  ON public.report_attachments
  FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

DROP POLICY IF EXISTS report_attachments_reporter_insert ON public.report_attachments;
CREATE POLICY report_attachments_reporter_insert
  ON public.report_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reporter_id = auth.uid()
    AND report_id IS NULL
  );

DROP POLICY IF EXISTS report_attachments_admin_select ON public.report_attachments;
CREATE POLICY report_attachments_admin_select
  ON public.report_attachments
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

GRANT SELECT, INSERT ON public.report_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_attachments TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Submit RPC — bind pending attachments
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

  IF EXISTS (
    SELECT 1
    FROM public.reports r
    WHERE r.reporter_id = v_reporter_id
      AND r.target_id = p_target_id
      AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION '您已對該用戶提交過待審核的舉報，請等待處理結果';
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
