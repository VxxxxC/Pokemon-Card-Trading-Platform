-- Rewards security hardening (R-01..R-03):
-- R-01: restrict authenticated UPDATE on user_rewards to acknowledged_at only
-- R-02: bind get_reward_coupon_center to auth.uid() (admin bypass via is_admin)
-- R-03: fn_release_merchant_order_coupon executable only by service_role

REVOKE UPDATE ON public.user_rewards FROM authenticated;
GRANT UPDATE (acknowledged_at) ON public.user_rewards TO authenticated;


CREATE OR REPLACE FUNCTION public.get_reward_coupon_center(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_wallet JSONB;
    v_locked JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '請先登入';
    END IF;

    IF p_user_id IS NOT NULL
       AND p_user_id IS DISTINCT FROM auth.uid()
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION '無權查看他人優惠券';
    END IF;

    v_user_id := COALESCE(p_user_id, auth.uid());

    PERFORM public.fn_try_auto_grant_rewards(v_user_id);

    v_wallet := COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', ur.id,
                'is_used', ur.is_used,
                'calculated_expiry', ur.calculated_expiry,
                'used_at', ur.used_at,
                'template', jsonb_build_object(
                    'title', rt.title,
                    'description', rt.description,
                    'type', rt.type,
                    'reward_value', rt.reward_value
                )
            )
            ORDER BY ur.created_at DESC
        )
        FROM public.user_rewards ur
        INNER JOIN public.reward_templates rt ON rt.id = ur.template_id
        WHERE ur.user_id = v_user_id
          AND rt.type IN ('discount_coupon', 'free_shipping')
    ), '[]'::jsonb);

    v_locked := COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object(
                'template_id', rt.id,
                'title', rt.title,
                'description', rt.description,
                'type', rt.type,
                'reward_value', rt.reward_value,
                'progress', public.fn_reward_template_progress_detail(v_user_id, rt)
            )
            ORDER BY rt.created_at ASC NULLS LAST
        )
        FROM public.reward_templates rt
        WHERE rt.is_active IS TRUE
          AND rt.type IN ('discount_coupon', 'free_shipping')
          AND COALESCE(rt.distribution_mode, 'auto_grant'::public.reward_distribution_mode)
              = 'auto_grant'::public.reward_distribution_mode
          AND COALESCE(rt.trigger_conditions ->> 'kind', '') NOT IN (
              'none',
              'check_in_program_internal',
              'check_in_streak',
              'check_in_cycle_day'
          )
          AND public.fn_reward_template_has_stock(rt)
          AND NOT EXISTS (
              SELECT 1
              FROM public.reward_campaigns rc
              WHERE rc.template_id = rt.id
                AND NOW() > rc.ends_at
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.fn_template_is_eligible(v_user_id, rt) AS elig
              WHERE COALESCE(elig.eligible, false)
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.user_rewards ur
              WHERE ur.user_id = v_user_id
                AND ur.template_id = rt.id
                AND ur.grant_dedup_key = 'lifetime'
          )
    ), '[]'::jsonb);

    RETURN jsonb_build_object(
        'wallet', v_wallet,
        'locked', v_locked
    );
END;
$$;


REVOKE ALL ON FUNCTION public.fn_release_merchant_order_coupon(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_release_merchant_order_coupon(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_release_merchant_order_coupon(UUID) TO service_role;
