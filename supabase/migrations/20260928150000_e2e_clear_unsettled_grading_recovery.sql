-- E2E: settle unsettled grading_fail_recovery so stripe-reconcile connect payout
-- is not zero-net after grading integration on the same E2E_SELLER_ID.

CREATE OR REPLACE FUNCTION public.rpc_e2e_clear_unsettled_grading_recovery(
    p_merchant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_recovery_row RECORD;
    v_cleared INTEGER := 0;
    v_total NUMERIC := 0;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    IF p_merchant_id IS NULL THEN
        RAISE EXCEPTION 'merchant_id required';
    END IF;

    FOR v_recovery_row IN
        SELECT
            r.recovery_order_id,
            r.remaining_hkd
        FROM public.fn_merchant_unsettled_grading_recovery(p_merchant_id) AS r
    LOOP
        IF v_recovery_row.remaining_hkd IS NULL OR v_recovery_row.remaining_hkd <= 0 THEN
            CONTINUE;
        END IF;

        INSERT INTO public.merchant_ledgers (
            merchant_id,
            order_id,
            amount,
            transaction_type
        )
        VALUES (
            p_merchant_id,
            v_recovery_row.recovery_order_id,
            round(v_recovery_row.remaining_hkd, 2),
            'grading_fail_recovery_applied'::public.transaction_type
        )
        ON CONFLICT (order_id, transaction_type)
            WHERE order_id IS NOT NULL
        DO UPDATE SET
            amount = round(public.merchant_ledgers.amount + EXCLUDED.amount, 2);

        v_cleared := v_cleared + 1;
        v_total := round(v_total + v_recovery_row.remaining_hkd, 2);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'merchant_id', p_merchant_id,
        'entries_cleared', v_cleared,
        'amount_cleared', v_total
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_e2e_clear_unsettled_grading_recovery(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_clear_unsettled_grading_recovery(UUID) TO service_role;
