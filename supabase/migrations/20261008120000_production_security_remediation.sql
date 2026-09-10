-- Production security remediation: CRIT-01/02/03, DB-H-01/02/03/07, economy RPC hardening

-- ---------------------------------------------------------------------------
-- CRIT-02: profiles.role — column grants + trigger (defense in depth)
-- ---------------------------------------------------------------------------

REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (
  display_name,
  username,
  short_description,
  avatar_path,
  fps_id,
  fps_name,
  email_market_alerts,
  email_rewards,
  email_transactional,
  push_market_alerts,
  push_rewards,
  push_transactional,
  push_chat_digest
) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_profiles_role_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
      NEW.role := 'member'::public.user_role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_role ON public.profiles;
CREATE TRIGGER profiles_protect_role
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_role_column();

-- ---------------------------------------------------------------------------
-- CRIT-01: handle_new_user — never trust signup metadata for role
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, username, role)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
      split_part(NEW.email, '@', 1)
    ),
    public.generate_profile_username(),
    'member'::public.user_role
  )
  ON CONFLICT (id) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    username = COALESCE(public.profiles.username, EXCLUDED.username),
    updated_at = now();

  INSERT INTO public.gamification_stats (user_id, points_balance, current_streak, longest_streak)
  VALUES (NEW.id, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM public.fn_recalculate_reputation_tags(NEW.id);
  PERFORM public.fn_try_auto_grant_rewards(NEW.id);

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- CRIT-03 + economy: revoke insecure authenticated RPC grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.fn_claim_mission_points(UUID, INT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_mission_points(UUID, INT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.fn_redeem_member_points(INT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_redeem_member_points(INT, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.fn_platform_financial_config() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_platform_financial_config() TO service_role;

REVOKE ALL ON FUNCTION public.fn_platform_auth_escrow_config() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_platform_auth_escrow_config() TO service_role;

-- Harden template points grant: require eligibility before issuing
CREATE OR REPLACE FUNCTION public.fn_grant_points_from_template(
    p_user_id UUID,
    p_template_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_template public.reward_templates%ROWTYPE;
    v_user_reward_id UUID;
    v_points INT;
    v_balance INT;
    v_eligible BOOLEAN;
BEGIN
    IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
        RAISE EXCEPTION '請先登入';
    END IF;

    SELECT * INTO v_template
    FROM public.reward_templates
    WHERE id = p_template_id
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION '獎勵模板不存在或已停用';
    END IF;

    IF v_template.type <> 'points' THEN
        RAISE EXCEPTION '此模板並非積分類型獎勵';
    END IF;

    SELECT COALESCE(elig.eligible, false)
    INTO v_eligible
    FROM public.fn_template_is_eligible(p_user_id, v_template) AS elig
    LIMIT 1;

    IF NOT COALESCE(v_eligible, false) THEN
        RAISE EXCEPTION '尚未符合領取條件';
    END IF;

    v_user_reward_id := public.fn_issue_reward_from_template(
        p_user_id,
        p_template_id,
        'lifetime'
    );

    IF v_user_reward_id IS NULL THEN
        RAISE EXCEPTION '此獎勵已領取';
    END IF;

    v_points := COALESCE((v_template.reward_value ->> 'points')::int, 0);

    SELECT gs.points_balance
    INTO v_balance
    FROM public.gamification_stats gs
    WHERE gs.user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'points_granted', v_points,
        'points_balance', COALESCE(v_balance, 0),
        'template_id', p_template_id,
        'user_reward_id', v_user_reward_id
    );
END;
$$;

-- Service-role-only test seed helper (replaces insecure fn_claim_mission_points in tests)
CREATE OR REPLACE FUNCTION public.rpc_service_seed_user_points(
    p_user_id UUID,
    p_points INT,
    p_description TEXT DEFAULT 'service seed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance INT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user required';
    END IF;

    IF p_points IS NULL OR p_points <= 0 THEN
        RAISE EXCEPTION 'points must be positive';
    END IF;

    v_balance := public.fn_apply_point_transaction(
        p_user_id,
        p_points,
        'admin_adjust',
        NULL,
        COALESCE(NULLIF(trim(p_description), ''), 'service seed')
    );

    RETURN jsonb_build_object(
        'success', true,
        'points_balance', v_balance
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_service_seed_user_points(UUID, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_service_seed_user_points(UUID, INT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- DB-H-02: public-safe profiles view; restrict direct profiles SELECT
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

REVOKE SELECT ON public.profiles FROM anon;

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_barrier = true) AS
SELECT
  p.id,
  p.display_name,
  p.username,
  p.short_description,
  p.avatar_path,
  p.created_at,
  p.completed_trades_count,
  p.rating_score,
  p.reputation_tag,
  (p.role = 'merchant'::public.user_role) AS is_merchant
FROM public.profiles p;

GRANT SELECT ON public.public_profiles TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- DB-H-01: kyc_records — owner/admin only; public verification RPC
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.kyc_records FROM anon;

DROP POLICY IF EXISTS kyc_records_select_public ON public.kyc_records;

DROP POLICY IF EXISTS kyc_records_select_own ON public.kyc_records;
CREATE POLICY kyc_records_select_own
  ON public.kyc_records
  FOR SELECT
  TO authenticated
  USING (merchant_id = auth.uid());

DROP POLICY IF EXISTS kyc_records_select_admin ON public.kyc_records;
CREATE POLICY kyc_records_select_admin
  ON public.kyc_records
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.fn_get_merchant_public_verification(p_merchant_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'kyc_status', kr.kyc_status,
        'stripe_charges_enabled', kr.stripe_charges_enabled,
        'stripe_payouts_enabled', kr.stripe_payouts_enabled,
        'verified', kr.kyc_status = 'verified'::public.kyc_state
      )
      FROM public.kyc_records kr
      WHERE kr.merchant_id = p_merchant_id
    ),
    jsonb_build_object(
      'kyc_status', NULL,
      'stripe_charges_enabled', false,
      'stripe_payouts_enabled', false,
      'verified', false
    )
  );
$$;

REVOKE ALL ON FUNCTION public.fn_get_merchant_public_verification(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_merchant_public_verification(UUID)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- DB-H-03: platform_settings — public legal docs only for anon/authenticated
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS settings_public_read ON public.platform_settings;

CREATE POLICY settings_public_read ON public.platform_settings
  FOR SELECT
  TO anon, authenticated
  USING (key IN ('platform_terms', 'platform_privacy'));

DROP POLICY IF EXISTS settings_admin_read ON public.platform_settings;
CREATE POLICY settings_admin_read ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- DB-H-07: member_orders — remove global completed-order read
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "member_orders_completed_read_authenticated" ON public.member_orders;
