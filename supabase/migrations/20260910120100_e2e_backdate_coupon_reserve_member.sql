-- Extend E2E backdate helper for member coupon reserves (parity merchant).

CREATE OR REPLACE FUNCTION public.rpc_e2e_backdate_coupon_reserve(
    p_user_reward_id UUID,
    p_minutes_ago INTEGER DEFAULT 16
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    UPDATE public.user_rewards
    SET reserved_at = now() - make_interval(mins => GREATEST(COALESCE(p_minutes_ago, 16), 1))
    WHERE id = p_user_reward_id
      AND (
          reserved_merchant_order_id IS NOT NULL
          OR reserved_member_order_id IS NOT NULL
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到已預留的優惠券。';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_reward_id', p_user_reward_id,
        'minutes_ago', p_minutes_ago
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_e2e_backdate_coupon_reserve(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_backdate_coupon_reserve(UUID, INTEGER) TO service_role;
