-- Admin moderation Phase A: structured reports, moderation cases, atomic submit RPC.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'report_category'
  ) THEN
    CREATE TYPE public.report_category AS ENUM (
      'fraud',
      'offline_trade',
      'harassment',
      'other'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'report_source'
  ) THEN
    CREATE TYPE public.report_source AS ENUM (
      'chat_room',
      'profile'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'moderation_case_status'
  ) THEN
    CREATE TYPE public.moderation_case_status AS ENUM (
      'open',
      'reviewing',
      'resolved',
      'dismissed'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. moderation_cases
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.moderation_case_number_seq;

CREATE TABLE IF NOT EXISTS public.moderation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT NOT NULL UNIQUE,
  status public.moderation_case_status NOT NULL DEFAULT 'open',
  subject_user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  primary_category public.report_category,
  auto_score NUMERIC(10, 2) NOT NULL DEFAULT 0,
  admin_adjustment NUMERIC(10, 2) NOT NULL DEFAULT 0,
  final_score NUMERIC(10, 2) GENERATED ALWAYS AS (auto_score + admin_adjustment) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_cases_subject_open
  ON public.moderation_cases (subject_user_id, created_at DESC)
  WHERE status IN ('open', 'reviewing');

CREATE INDEX IF NOT EXISTS idx_moderation_cases_status_created
  ON public.moderation_cases (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Extend reports
-- ---------------------------------------------------------------------------

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS category public.report_category,
  ADD COLUMN IF NOT EXISTS source public.report_source,
  ADD COLUMN IF NOT EXISTS context_type TEXT,
  ADD COLUMN IF NOT EXISTS context_id UUID,
  ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES public.moderation_cases (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_weight_snapshot INT,
  ADD COLUMN IF NOT EXISTS contribution_score NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS details TEXT;

CREATE INDEX IF NOT EXISTS idx_reports_case_id
  ON public.reports (case_id)
  WHERE case_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. RLS — moderation_cases + admin read on reports
-- ---------------------------------------------------------------------------

ALTER TABLE public.moderation_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS moderation_cases_admin_select ON public.moderation_cases;
CREATE POLICY moderation_cases_admin_select
  ON public.moderation_cases
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS reports_admin_select ON public.reports;
CREATE POLICY reports_admin_select
  ON public.reports
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.moderation_cases TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.moderation_cases TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._moderation_category_weight(
  p_category public.report_category
)
RETURNS INT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_category
    WHEN 'fraud' THEN 40
    WHEN 'offline_trade' THEN 30
    WHEN 'harassment' THEN 15
    WHEN 'other' THEN 10
    ELSE 10
  END;
$$;

CREATE OR REPLACE FUNCTION public._moderation_category_label(
  p_category public.report_category
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_category
    WHEN 'fraud' THEN '惡意欺詐 / 虛假交易'
    WHEN 'harassment' THEN '言語辱罵 / 不當言論'
    WHEN 'offline_trade' THEN '誘導私下交易'
    WHEN 'other' THEN '其他違規行為'
    ELSE '其他違規行為'
  END;
$$;

CREATE OR REPLACE FUNCTION public._moderation_format_report_reason(
  p_category public.report_category,
  p_source public.report_source,
  p_chat_room_id UUID,
  p_details TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_lines TEXT[] := ARRAY[]::TEXT[];
BEGIN
  v_lines := array_append(
    v_lines,
    '[CATEGORY] ' || public._moderation_category_label(p_category)
  );
  v_lines := array_append(v_lines, '[SOURCE] ' || p_source::TEXT);

  IF p_source = 'chat_room' AND p_chat_room_id IS NOT NULL THEN
    v_lines := array_append(v_lines, '[ROOM_ID] ' || p_chat_room_id::TEXT);
  END IF;

  v_lines := array_append(v_lines, '[DETAILS] ' || COALESCE(p_details, ''));

  RETURN array_to_string(v_lines, E'\n');
END;
$$;

CREATE OR REPLACE FUNCTION public._moderation_next_case_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_seq BIGINT;
BEGIN
  v_seq := nextval('public.moderation_case_number_seq');
  RETURN 'MOD-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public._find_or_create_moderation_case(
  p_subject_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_case_id UUID;
  v_case_number TEXT;
BEGIN
  SELECT mc.id
  INTO v_case_id
  FROM public.moderation_cases mc
  WHERE mc.subject_user_id = p_subject_user_id
    AND mc.status IN ('open', 'reviewing')
    AND mc.created_at > (now() - INTERVAL '7 days')
  ORDER BY mc.created_at DESC
  LIMIT 1;

  IF v_case_id IS NOT NULL THEN
    RETURN v_case_id;
  END IF;

  v_case_number := public._moderation_next_case_number();

  INSERT INTO public.moderation_cases (
    case_number,
    subject_user_id,
    status
  )
  VALUES (
    v_case_number,
    p_subject_user_id,
    'open'
  )
  RETURNING id INTO v_case_id;

  RETURN v_case_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._recompute_moderation_case_scores(
  p_case_id UUID
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_auto_score NUMERIC(10, 2);
  v_primary_category public.report_category;
BEGIN
  SELECT COALESCE(SUM(r.contribution_score), 0)
  INTO v_auto_score
  FROM public.reports r
  WHERE r.case_id = p_case_id
    AND COALESCE(r.status::TEXT, 'pending') <> 'dismissed';

  SELECT r.category
  INTO v_primary_category
  FROM public.reports r
  WHERE r.case_id = p_case_id
    AND r.category IS NOT NULL
  ORDER BY public._moderation_category_weight(r.category) DESC, r.created_at ASC
  LIMIT 1;

  UPDATE public.moderation_cases mc
  SET
    auto_score = COALESCE(v_auto_score, 0),
    primary_category = v_primary_category,
    updated_at = now()
  WHERE mc.id = p_case_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Submit RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_submit_user_report_v2(
  p_target_id UUID,
  p_category public.report_category,
  p_details TEXT DEFAULT '',
  p_chat_room_id UUID DEFAULT NULL
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
BEGIN
  v_reporter_id := auth.uid();

  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION '請先登入';
  END IF;

  IF p_target_id IS NULL OR p_target_id = v_reporter_id THEN
    RAISE EXCEPTION '無效的舉報對象';
  END IF;

  v_details := left(COALESCE(p_details, ''), 2000);

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

  PERFORM public._recompute_moderation_case_scores(v_case_id);

  RETURN jsonb_build_object(
    'report_id', v_report_id,
    'case_id', v_case_id,
    'case_number', v_case_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_submit_user_report_v2(UUID, public.report_category, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_submit_user_report_v2(UUID, public.report_category, TEXT, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public._moderation_category_weight(public.report_category) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._moderation_category_label(public.report_category) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._moderation_format_report_reason(public.report_category, public.report_source, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._moderation_next_case_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._find_or_create_moderation_case(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._recompute_moderation_case_scores(UUID) FROM PUBLIC;
