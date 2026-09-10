-- Keep grading.order_fail GUC on during coupon restore (admin finalize path).
CREATE OR REPLACE FUNCTION public.rpc_finalize_auth_grading_fail(
    p_order_kind TEXT,
    p_order_id UUID,
    p_payment_intent_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_listing_id UUID;
    v_from_status TEXT;
    v_fault_party public.grading_fault_party;
    v_updated RECORD;
    v_admin_id UUID;
    v_liability JSONB := NULL;
    v_amount_hkd NUMERIC;
    v_stripe_fee NUMERIC;
    v_seller_id UUID;
    v_merchant_id UUID;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    IF p_order_kind = 'member' THEN
        SELECT
            mo.escrow_status::TEXT,
            mo.listing_id,
            mo.fault_party,
            mo.seller_id
        INTO v_from_status, v_listing_id, v_fault_party, v_seller_id
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
          AND mo.stripe_payment_intent_id = p_payment_intent_id
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.member_orders mo
            WHERE mo.id = p_order_id
              AND mo.auth_result = 'failed'
              AND mo.escrow_status = 'cancelled'::public.member_escrow_status
        ) THEN
            RETURN jsonb_build_object('success', true, 'already_applied', true);
        END IF;

        PERFORM set_config('grading.order_fail', 'on', true);

        UPDATE public.member_orders
        SET
            escrow_status = 'cancelled'::public.member_escrow_status,
            status = 'cancelled',
            auth_result = 'failed',
            auth_graded_at = now(),
            refund_status = 'none',
            refund_error = NULL,
            payment_capture_status = CASE
                WHEN escrow_capture_model = 'single'
                     AND fault_party = 'buyer'::public.grading_fault_party
                    THEN 'auth_fee_captured'::public.payment_capture_status
                WHEN escrow_capture_model = 'single'
                    THEN 'voided'::public.payment_capture_status
                ELSE payment_capture_status
            END,
            seller_settlement_status = CASE
                WHEN fault_party = 'seller'::public.grading_fault_party
                    THEN 'pending'::public.seller_settlement_status
                ELSE seller_settlement_status
            END,
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status = 'processing'
          AND (
              (
                  escrow_capture_model = 'single'
                  AND payment_capture_status IN (
                      'authorized'::public.payment_capture_status,
                      'voided'::public.payment_capture_status
                  )
              )
              OR (
                  escrow_capture_model IS DISTINCT FROM 'single'
                  AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
              )
          )
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            PERFORM set_config('grading.order_fail', 'off', true);
            RAISE EXCEPTION '鑑定失敗 finalize 失敗：訂單狀態不合法。';
        END IF;

        IF v_fault_party IS DISTINCT FROM 'buyer'::public.grading_fault_party THEN
            PERFORM public.fn_restore_member_order_coupon_on_void(p_order_id);
        END IF;

        PERFORM set_config('grading.order_fail', 'off', true);
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.escrow_status::TEXT,
            mo.listing_id,
            mo.fault_party,
            mo.merchant_id
        INTO v_from_status, v_listing_id, v_fault_party, v_merchant_id
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
          AND mo.stripe_payment_intent_id = p_payment_intent_id
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.merchant_orders mo
            WHERE mo.id = p_order_id
              AND mo.auth_result = 'failed'
              AND mo.escrow_status = 'refunded'::public.escrow_state
        ) THEN
            RETURN jsonb_build_object('success', true, 'already_applied', true);
        END IF;

        PERFORM set_config('grading.order_fail', 'on', true);

        UPDATE public.merchant_orders
        SET
            escrow_status = 'refunded'::public.escrow_state,
            auth_result = 'failed',
            auth_graded_at = now(),
            refund_status = 'none',
            refund_error = NULL,
            payment_capture_status = CASE
                WHEN escrow_capture_model = 'single'
                     AND fault_party = 'buyer'::public.grading_fault_party
                    THEN 'auth_fee_captured'::public.payment_capture_status
                WHEN escrow_capture_model = 'single'
                    THEN 'voided'::public.payment_capture_status
                ELSE payment_capture_status
            END,
            seller_settlement_status = CASE
                WHEN fault_party = 'seller'::public.grading_fault_party
                    THEN 'pending'::public.seller_settlement_status
                ELSE seller_settlement_status
            END,
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status = 'processing'
          AND (
              (
                  escrow_capture_model = 'single'
                  AND payment_capture_status IN (
                      'authorized'::public.payment_capture_status,
                      'voided'::public.payment_capture_status
                  )
              )
              OR (
                  escrow_capture_model IS DISTINCT FROM 'single'
                  AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
              )
          )
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            PERFORM set_config('grading.order_fail', 'off', true);
            RAISE EXCEPTION '鑑定失敗 finalize 失敗：訂單狀態不合法。';
        END IF;

        IF v_fault_party IS DISTINCT FROM 'buyer'::public.grading_fault_party THEN
            PERFORM public.fn_restore_merchant_order_coupon_on_void(p_order_id);
        END IF;

        PERFORM set_config('grading.order_fail', 'off', true);
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    UPDATE public.listings
    SET status = 'active'
    WHERE id = v_listing_id
      AND status = 'sold';

    IF v_fault_party = 'seller'::public.grading_fault_party THEN
        v_liability := public.fn_compute_seller_grading_fail_liability(p_order_kind, p_order_id);
        v_amount_hkd := (v_liability->>'amount_hkd')::NUMERIC;
        v_stripe_fee := COALESCE((v_liability->>'stripe_fee_hkd')::NUMERIC, 0);

        IF p_order_kind = 'member' THEN
            INSERT INTO public.seller_receivables (
                order_kind,
                order_id,
                seller_id,
                amount_hkd,
                stripe_fee_hkd,
                status
            )
            VALUES (
                p_order_kind,
                p_order_id,
                v_seller_id,
                v_amount_hkd,
                NULLIF(v_stripe_fee, 0),
                'pending'::public.seller_receivable_status
            )
            ON CONFLICT (order_kind, order_id) DO NOTHING;
        ELSE
            INSERT INTO public.merchant_ledgers (
                merchant_id,
                order_id,
                amount,
                transaction_type
            )
            VALUES (
                v_merchant_id,
                p_order_id,
                -1 * v_amount_hkd,
                'grading_fail_recovery'::public.transaction_type
            )
            ON CONFLICT (order_id, transaction_type)
                WHERE order_id IS NOT NULL
            DO NOTHING;
        END IF;
    END IF;

    SELECT gal.admin_id
    INTO v_admin_id
    FROM public.grading_audit_logs gal
    WHERE gal.order_kind = p_order_kind
      AND gal.order_id = p_order_id
      AND gal.action = 'prepare_fail_void'
    ORDER BY gal.created_at DESC
    LIMIT 1;

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        COALESCE(v_admin_id, auth.uid()),
        'fail_grading_void',
        v_from_status,
        CASE WHEN p_order_kind = 'member' THEN 'cancelled' ELSE 'refunded' END,
        COALESCE(v_fault_party::TEXT, '')
    );

    RETURN jsonb_build_object(
        'success', true,
        'order', to_jsonb(v_updated),
        'liability', v_liability
    );
END;
$$;
