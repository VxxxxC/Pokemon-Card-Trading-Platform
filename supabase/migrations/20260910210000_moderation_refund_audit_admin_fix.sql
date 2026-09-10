-- Skip moderation audit rows when service_role finalize/fail has no admin context.

CREATE OR REPLACE FUNCTION public.rpc_finalize_moderation_order_refund(
    p_order_id UUID,
    p_payment_intent_id TEXT,
    p_refund_id TEXT,
    p_refund_cents INTEGER,
    p_stripe_fee_hkd NUMERIC DEFAULT 0,
    p_case_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_kind TEXT;
    v_fault_party public.grading_fault_party;
    v_listing_id UUID;
    v_updated RECORD;
    v_seller_id UUID;
    v_merchant_id UUID;
    v_refund_hkd NUMERIC;
    v_settlement_hkd NUMERIC;
    v_stripe_fee NUMERIC;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼';
    END IF;
    IF p_refund_id IS NULL OR btrim(p_refund_id) = '' THEN
        RAISE EXCEPTION '缺少 Refund 識別碼';
    END IF;

    v_order_kind := public.fn_moderation_derive_order_kind(p_order_id);

    IF v_order_kind IN ('merchant_direct', 'merchant_auth') THEN
        IF EXISTS (
            SELECT 1 FROM public.merchant_orders mo
            WHERE mo.id = p_order_id
              AND lower(btrim(COALESCE(mo.refund_status, ''))) = 'refunded'
        ) THEN
            RETURN jsonb_build_object('success', true, 'alreadyApplied', true);
        END IF;

        SELECT mo.fault_party, mo.listing_id, mo.merchant_id, mo.refund_amount
        INTO v_fault_party, v_listing_id, v_merchant_id, v_refund_hkd
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.stripe_payment_intent_id = p_payment_intent_id
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到商戶訂單';
        END IF;

        UPDATE public.merchant_orders
        SET
            escrow_status = 'refunded'::public.escrow_state,
            refund_status = 'refunded',
            refund_error = NULL,
            updated_at = now(),
            seller_settlement_status = CASE
                WHEN v_fault_party = 'seller'::public.grading_fault_party
                    THEN 'pending'::public.seller_settlement_status
                ELSE seller_settlement_status
            END
        WHERE id = p_order_id
          AND lower(btrim(COALESCE(refund_status, ''))) = 'processing'
          AND payment_capture_status = 'fully_captured'::public.payment_capture_status
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '售後退款 finalize 失敗：訂單狀態不合法';
        END IF;

        PERFORM public.fn_restore_merchant_order_coupon_on_void(p_order_id);
    ELSIF v_order_kind = 'member_auth' THEN
        IF EXISTS (
            SELECT 1 FROM public.member_orders mo
            WHERE mo.id = p_order_id
              AND lower(btrim(COALESCE(mo.refund_status, ''))) = 'refunded'
        ) THEN
            RETURN jsonb_build_object('success', true, 'alreadyApplied', true);
        END IF;

        SELECT mo.fault_party, mo.listing_id, mo.seller_id, mo.refund_amount
        INTO v_fault_party, v_listing_id, v_seller_id, v_refund_hkd
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.stripe_payment_intent_id = p_payment_intent_id
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到會員鑑定訂單';
        END IF;

        UPDATE public.member_orders
        SET
            escrow_status = 'cancelled'::public.member_escrow_status,
            status = 'cancelled',
            refund_status = 'refunded',
            refund_error = NULL,
            updated_at = now(),
            seller_settlement_status = CASE
                WHEN v_fault_party = 'seller'::public.grading_fault_party
                    THEN 'pending'::public.seller_settlement_status
                ELSE seller_settlement_status
            END
        WHERE id = p_order_id
          AND lower(btrim(COALESCE(refund_status, ''))) = 'processing'
          AND payment_capture_status = 'fully_captured'::public.payment_capture_status
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '售後退款 finalize 失敗：訂單狀態不合法';
        END IF;

        PERFORM public.fn_restore_member_order_coupon_on_void(p_order_id);
    ELSE
        RAISE EXCEPTION '不支援的訂單類型';
    END IF;

    UPDATE public.listings
    SET status = 'active'
    WHERE id = v_listing_id
      AND status = 'sold';

    v_stripe_fee := GREATEST(COALESCE(p_stripe_fee_hkd, 0), 0);
    v_settlement_hkd := COALESCE(v_refund_hkd, p_refund_cents::NUMERIC / 100.0);

    IF v_fault_party = 'seller'::public.grading_fault_party THEN
        IF v_order_kind = 'member_auth' THEN
            INSERT INTO public.seller_receivables (
                order_kind,
                order_id,
                seller_id,
                amount_hkd,
                stripe_fee_hkd,
                status
            )
            VALUES (
                'member',
                p_order_id,
                v_seller_id,
                v_settlement_hkd,
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
                -1 * (v_settlement_hkd + v_stripe_fee),
                'grading_fail_recovery'::public.transaction_type
            );
        END IF;
    END IF;

    IF p_case_id IS NOT NULL THEN
        INSERT INTO public.moderation_audit_logs (
            case_id,
            admin_id,
            action,
            payload
        )
        SELECT
            p_case_id,
            COALESCE(auth.uid(), mc.resolved_by),
            'finalize_order_refund',
            jsonb_build_object(
                'orderId', p_order_id,
                'orderKind', v_order_kind,
                'refundId', p_refund_id,
                'refundCents', p_refund_cents,
                'faultParty', v_fault_party::TEXT,
                'stripeFeeHkd', v_stripe_fee
            )
        FROM public.moderation_cases mc
        WHERE mc.id = p_case_id
          AND COALESCE(auth.uid(), mc.resolved_by) IS NOT NULL;
    END IF;

    RETURN jsonb_build_object('success', true, 'order', to_jsonb(v_updated));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_finalize_moderation_order_refund(UUID, TEXT, TEXT, INTEGER, NUMERIC, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_moderation_order_refund(UUID, TEXT, TEXT, INTEGER, NUMERIC, UUID)
    TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.rpc_mark_moderation_order_refund_failed(
    p_order_id UUID,
    p_error TEXT,
    p_case_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_kind TEXT;
BEGIN
    v_order_kind := public.fn_moderation_derive_order_kind(p_order_id);

    IF v_order_kind IN ('merchant_direct', 'merchant_auth') THEN
        UPDATE public.merchant_orders
        SET
            refund_status = 'failed',
            refund_error = left(COALESCE(p_error, ''), 500),
            updated_at = now()
        WHERE id = p_order_id
          AND lower(btrim(COALESCE(refund_status, ''))) = 'processing';
    ELSIF v_order_kind = 'member_auth' THEN
        UPDATE public.member_orders
        SET
            refund_status = 'failed',
            refund_error = left(COALESCE(p_error, ''), 500),
            updated_at = now()
        WHERE id = p_order_id
          AND lower(btrim(COALESCE(refund_status, ''))) = 'processing';
    ELSE
        RAISE EXCEPTION '不支援的訂單類型';
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'skipped', true);
    END IF;

    IF p_case_id IS NOT NULL THEN
        INSERT INTO public.moderation_audit_logs (
            case_id,
            admin_id,
            action,
            payload
        )
        SELECT
            p_case_id,
            COALESCE(auth.uid(), mc.resolved_by),
            'refund_failed',
            jsonb_build_object('orderId', p_order_id, 'error', left(COALESCE(p_error, ''), 500))
        FROM public.moderation_cases mc
        WHERE mc.id = p_case_id
          AND COALESCE(auth.uid(), mc.resolved_by) IS NOT NULL;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_moderation_order_refund_failed(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_moderation_order_refund_failed(UUID, TEXT, UUID)
    TO authenticated, service_role;
