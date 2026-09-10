-- B2C seller return: block until grading_fail_recovery is fully applied via Connect ledger.

CREATE OR REPLACE FUNCTION public.rpc_admin_submit_seller_return_tracking(
    p_order_kind TEXT,
    p_order_id UUID,
    p_tracking_no TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_from_status TEXT;
    v_tracking TEXT;
    v_updated RECORD;
    v_recovery_remaining NUMERIC;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_tracking := NULLIF(trim(COALESCE(p_tracking_no, '')), '');
    IF v_tracking IS NULL THEN
        RAISE EXCEPTION '請輸入有效的寄回物流單號。';
    END IF;

    IF p_order_kind = 'member' THEN
        SELECT mo.escrow_status::TEXT
        INTO v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        UPDATE public.member_orders
        SET
            outbound_tracking_no = v_tracking,
            updated_at = now()
        WHERE id = p_order_id
          AND use_authentication = true
          AND auth_result = 'failed'
          AND fault_party = 'seller'::public.grading_fault_party
          AND seller_settlement_status = 'cleared'::public.seller_settlement_status
          AND escrow_status = 'cancelled'::public.member_escrow_status
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '寄回物流更新失敗：請先確認賣方已結清追償款項。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT mo.escrow_status::TEXT
        INTO v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        SELECT GREATEST(
            0,
            round(
                COALESCE(ABS(rec.amount), 0) - COALESCE(applied.amount, 0),
                2
            )
        )
        INTO v_recovery_remaining
        FROM public.merchant_ledgers rec
        LEFT JOIN public.merchant_ledgers applied
            ON applied.order_id = rec.order_id
           AND applied.transaction_type = 'grading_fail_recovery_applied'::public.transaction_type
        WHERE rec.order_id = p_order_id
          AND rec.transaction_type = 'grading_fail_recovery'::public.transaction_type
        LIMIT 1;

        IF COALESCE(v_recovery_remaining, 0) > 0 THEN
            RAISE EXCEPTION '寄回物流更新失敗：追償款項尚未扣清，請待 Connect 撥款抵扣完成。';
        END IF;

        UPDATE public.merchant_orders
        SET
            outbound_tracking_no = v_tracking,
            updated_at = now()
        WHERE id = p_order_id
          AND requires_authentication = true
          AND auth_result = 'failed'
          AND fault_party = 'seller'::public.grading_fault_party
          AND seller_settlement_status = 'cleared'::public.seller_settlement_status
          AND escrow_status = 'refunded'::public.escrow_state
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '寄回物流更新失敗：請先確認賣方已結清追償款項。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        v_admin_id,
        'submit_seller_return',
        v_from_status,
        v_from_status,
        v_tracking
    );

    RETURN jsonb_build_object('success', true, 'order', to_jsonb(v_updated));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_submit_seller_return_tracking(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_submit_seller_return_tracking(TEXT, UUID, TEXT)
    TO authenticated, service_role;
