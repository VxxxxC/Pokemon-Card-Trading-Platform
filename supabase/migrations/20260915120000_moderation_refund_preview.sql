-- PR3C: Read-only admin preview for Phase H moderation refund breakdown (IC-3 policy estimate).

CREATE OR REPLACE FUNCTION public.fn_preview_moderation_order_refund_breakdown(
    p_order_id UUID,
    p_fault_party public.grading_fault_party,
    p_platform_fault_reason TEXT DEFAULT NULL,
    p_carrier_liability_party TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_eligibility JSONB;
    v_compute JSONB;
    v_kind TEXT;
    v_policy_hkd NUMERIC;
    v_buyer_total NUMERIC;
    v_auth_fee NUMERIC;
    v_fee_recovery_mode TEXT;
    v_estimate_fee NUMERIC;
    v_eligible_policy NUMERIC;
    v_refund_to_buyer NUMERIC;
    v_auth_retained NUMERIC;
    v_seller_recovery NUMERIC;
    v_platform_absorb NUMERIC := 0;
    v_platform_fault_with_reason BOOLEAN;
BEGIN
    PERFORM public._grading_require_admin();

    v_eligibility := public.fn_moderation_order_refund_eligible(p_order_id);
    IF COALESCE((v_eligibility ->> 'eligible')::BOOLEAN, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', COALESCE(v_eligibility ->> 'ineligibleReason', '訂單不符合退款條件');
    END IF;

    v_compute := public.fn_compute_moderation_order_refund(
        p_order_id,
        p_fault_party,
        p_platform_fault_reason,
        p_carrier_liability_party
    );

    v_kind := v_compute ->> 'orderKind';
    v_policy_hkd := COALESCE((v_compute ->> 'policyHkd')::NUMERIC, 0);
    v_buyer_total := COALESCE((v_compute ->> 'buyerTotalHkd')::NUMERIC, 0);
    v_fee_recovery_mode := COALESCE(v_compute ->> 'feeRecoveryMode', 'none');

    IF v_kind = 'merchant_direct' THEN
        v_auth_fee := 0;
    ELSIF v_kind IN ('merchant_auth', 'member_auth') THEN
        IF v_kind = 'merchant_auth' THEN
            SELECT COALESCE(mo.auth_fee, 0)
            INTO v_auth_fee
            FROM public.merchant_orders mo
            WHERE mo.id = p_order_id;
        ELSE
            SELECT COALESCE(mo.auth_fee, 0)
            INTO v_auth_fee
            FROM public.member_orders mo
            WHERE mo.id = p_order_id;
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    v_estimate_fee := GREATEST(ROUND(COALESCE(v_buyer_total, 0) * 0.03, 2), 2.35);
    v_eligible_policy := ROUND(v_policy_hkd, 2);

    v_platform_fault_with_reason :=
        p_fault_party = 'platform'::public.grading_fault_party
        AND NULLIF(btrim(COALESCE(p_platform_fault_reason, '')), '') IS NOT NULL;

    IF v_kind IN ('merchant_auth', 'member_auth') AND NOT v_platform_fault_with_reason THEN
        v_auth_retained := ROUND(COALESCE(v_auth_fee, 0), 2);
    ELSE
        v_auth_retained := 0;
    END IF;

    IF p_fault_party = 'buyer'::public.grading_fault_party THEN
        v_refund_to_buyer := GREATEST(v_eligible_policy - v_estimate_fee, 0);
    ELSE
        v_refund_to_buyer := v_eligible_policy;
    END IF;

    IF v_fee_recovery_mode = 'full' THEN
        v_seller_recovery := ROUND(v_eligible_policy + v_estimate_fee, 2);
    ELSIF v_fee_recovery_mode = 'fee_half' THEN
        v_seller_recovery := ROUND(v_estimate_fee / 2, 2);
        v_platform_absorb := ROUND(v_estimate_fee / 2, 2);
    ELSIF p_fault_party = 'platform'::public.grading_fault_party THEN
        v_platform_absorb := v_estimate_fee;
    END IF;

    RETURN jsonb_build_object(
        'eligiblePolicyHkd', v_eligible_policy,
        'stripeFeeHkd', NULL,
        'stripeFeeNote', 'finalize 時從 Stripe 讀取',
        'refundToBuyerHkd', ROUND(v_refund_to_buyer, 2),
        'authFeeRetainedHkd', v_auth_retained,
        'sellerRecoveryHkd', ROUND(v_seller_recovery, 2),
        'platformAbsorbHkd', ROUND(v_platform_absorb, 2),
        'orderKind', v_kind,
        'faultParty', p_fault_party::TEXT
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_preview_moderation_order_refund_breakdown(
    UUID,
    public.grading_fault_party,
    TEXT,
    TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_preview_moderation_order_refund_breakdown(
    UUID,
    public.grading_fault_party,
    TEXT,
    TEXT
) TO authenticated, service_role;
