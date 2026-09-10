-- Skip no-op member_orders UPDATE in fn_release_member_order_coupon when coupon state is already cleared.
-- Fixes buyer no-coupon prepare tripping fn_enforce_member_order_transitions (updated_at-only write).

CREATE OR REPLACE FUNCTION public.fn_release_member_order_coupon(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coupon_id UUID;
BEGIN
    SELECT mo.coupon_user_reward_id
    INTO v_coupon_id
    FROM public.member_orders mo
    WHERE mo.id = p_order_id;

    UPDATE public.user_rewards ur
    SET
        reserved_member_order_id = NULL,
        reserved_at = NULL
    WHERE ur.reserved_member_order_id = p_order_id
      AND ur.used_at IS NULL
      AND COALESCE(ur.is_used, false) = false;

    IF v_coupon_id IS NOT NULL THEN
        UPDATE public.user_rewards ur
        SET
            reserved_member_order_id = NULL,
            reserved_at = NULL
        WHERE ur.id = v_coupon_id
          AND ur.reserved_member_order_id = p_order_id
          AND ur.used_at IS NULL
          AND COALESCE(ur.is_used, false) = false;
    END IF;

    UPDATE public.member_orders mo
    SET
        coupon_user_reward_id = NULL,
        coupon_type = NULL,
        platform_subsidy_amount = 0,
        buyer_total_amount = mo.total_amount,
        updated_at = now()
    WHERE mo.id = p_order_id
      AND (
          mo.coupon_user_reward_id IS NOT NULL
          OR mo.coupon_type IS NOT NULL
          OR COALESCE(mo.platform_subsidy_amount, 0) <> 0
          OR (
              mo.total_amount IS NOT NULL
              AND mo.buyer_total_amount IS DISTINCT FROM mo.total_amount
          )
      );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_release_member_order_coupon(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_release_member_order_coupon(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_release_member_order_coupon(UUID) TO service_role;
