-- PR3B: Phase H moderation refunds — carrier / inconclusive fault expansion.
-- IC-1: inconclusive → buyer full eligible; seller receivable = stripe_fee/2 (fee_half).
-- IC-2: carrier requires carrier_liability_party (seller | platform) persisted in auth_notes.

DROP FUNCTION IF EXISTS public.fn_compute_moderation_order_refund(UUID, public.grading_fault_party, TEXT);
DROP FUNCTION IF EXISTS public.rpc_prepare_moderation_order_refund(UUID, UUID, public.grading_fault_party, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.fn_compute_moderation_order_refund(
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
    v_kind TEXT;
    v_policy_hkd NUMERIC;
    v_buyer_total NUMERIC;
    v_auth_fee NUMERIC;
    v_refund_hkd NUMERIC;
    v_refund_cents INTEGER;
    v_settlement_required BOOLEAN := false;
    v_fee_recovery_mode TEXT := 'none';
    v_carrier_liability TEXT;
BEGIN
    v_kind := public.fn_moderation_derive_order_kind(p_order_id);

    IF v_kind = 'merchant_direct' THEN
        SELECT
            COALESCE(mo.buyer_total_amount, mo.total_amount, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount, 0)
        INTO v_policy_hkd, v_buyer_total
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id;
    ELSIF v_kind = 'merchant_auth' THEN
        SELECT
            COALESCE(mo.item_subtotal, mo.final_price, 0) + COALESCE(mo.outbound_shipping_fee, mo.shipping_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount, 0),
            COALESCE(mo.auth_fee, 0)
        INTO v_policy_hkd, v_buyer_total, v_auth_fee
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id;
    ELSIF v_kind = 'member_auth' THEN
        SELECT
            COALESCE(mo.item_subtotal, mo.final_price, 0) + COALESCE(mo.outbound_shipping_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount, 0),
            COALESCE(mo.auth_fee, 0)
        INTO v_policy_hkd, v_buyer_total, v_auth_fee
        FROM public.member_orders mo
        WHERE mo.id = p_order_id;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到訂單。';
    END IF;

    IF p_fault_party = 'platform'::public.grading_fault_party
       AND NULLIF(btrim(COALESCE(p_platform_fault_reason, '')), '') IS NOT NULL THEN
        v_policy_hkd := v_policy_hkd + COALESCE(v_auth_fee, 0);
    END IF;

    v_refund_hkd := LEAST(v_policy_hkd, v_buyer_total);

    IF v_refund_hkd <= 0 THEN
        RAISE EXCEPTION '退款金額異常。';
    END IF;

    v_refund_cents := ROUND(v_refund_hkd * 100)::INTEGER;

    v_carrier_liability := lower(btrim(COALESCE(p_carrier_liability_party, '')));

    IF p_fault_party = 'seller'::public.grading_fault_party THEN
        v_fee_recovery_mode := 'full';
    ELSIF p_fault_party = 'carrier'::public.grading_fault_party THEN
        IF v_carrier_liability NOT IN ('seller', 'platform') THEN
            RAISE EXCEPTION 'carrier 責任必須指定 carrier_liability_party (seller | platform)';
        END IF;
        IF v_carrier_liability = 'seller' THEN
            v_fee_recovery_mode := 'full';
        ELSE
            v_fee_recovery_mode := 'none';
        END IF;
    ELSIF p_fault_party = 'inconclusive'::public.grading_fault_party THEN
        v_fee_recovery_mode := 'fee_half';
    ELSE
        v_fee_recovery_mode := 'none';
    END IF;

    v_settlement_required := v_fee_recovery_mode IN ('full', 'fee_half');

    RETURN jsonb_build_object(
        'orderKind', v_kind,
        'policyHkd', v_policy_hkd,
        'buyerTotalHkd', v_buyer_total,
        'refundHkd', v_refund_hkd,
        'refundCents', v_refund_cents,
        'settlementRequired', v_settlement_required,
        'feeRecoveryMode', v_fee_recovery_mode,
        'faultParty', p_fault_party::TEXT,
        'carrierLiabilityParty', NULLIF(v_carrier_liability, '')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_compute_moderation_order_refund(UUID, public.grading_fault_party, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_compute_moderation_order_refund(UUID, public.grading_fault_party, TEXT, TEXT)
    TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.rpc_prepare_moderation_order_refund(
    p_case_id UUID,
    p_order_id UUID,
    p_fault_party public.grading_fault_party,
    p_reason TEXT DEFAULT NULL,
    p_platform_fault_reason TEXT DEFAULT NULL,
    p_carrier_liability_party TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_eligibility JSONB;
    v_amount JSONB;
    v_order_kind TEXT;
    v_payment_intent_id TEXT;
    v_refund_hkd NUMERIC;
    v_refund_cents INTEGER;
    v_settlement_required BOOLEAN;
    v_fee_recovery_mode TEXT;
    v_listing_id UUID;
    v_notes TEXT;
    v_carrier_liability TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF NOT public.fn_moderation_case_links_order(p_case_id, p_order_id) THEN
        RAISE EXCEPTION '訂單與案件無關聯';
    END IF;

    v_eligibility := public.fn_moderation_order_refund_eligible(p_order_id);
    IF COALESCE((v_eligibility ->> 'eligible')::BOOLEAN, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', COALESCE(v_eligibility ->> 'ineligibleReason', '訂單不符合退款條件');
    END IF;

    v_carrier_liability := lower(btrim(COALESCE(p_carrier_liability_party, '')));

    v_amount := public.fn_compute_moderation_order_refund(
        p_order_id,
        p_fault_party,
        p_platform_fault_reason,
        NULLIF(v_carrier_liability, '')
    );
    v_order_kind := v_amount ->> 'orderKind';
    v_refund_hkd := (v_amount ->> 'refundHkd')::NUMERIC;
    v_refund_cents := (v_amount ->> 'refundCents')::INTEGER;
    v_settlement_required := COALESCE((v_amount ->> 'settlementRequired')::BOOLEAN, false);
    v_fee_recovery_mode := COALESCE(v_amount ->> 'feeRecoveryMode', 'none');

    v_notes := NULLIF(btrim(COALESCE(p_reason, '')), '');
    IF p_fault_party = 'platform'::public.grading_fault_party
       AND NULLIF(btrim(COALESCE(p_platform_fault_reason, '')), '') IS NOT NULL THEN
        v_notes := COALESCE(v_notes || E'\n', '') || 'platform_fault: ' || btrim(p_platform_fault_reason);
    END IF;
    IF p_fault_party = 'carrier'::public.grading_fault_party
       AND v_carrier_liability IN ('seller', 'platform') THEN
        v_notes := COALESCE(v_notes || E'\n', '') || 'carrier_liability: ' || v_carrier_liability;
    END IF;

    IF v_order_kind IN ('merchant_direct', 'merchant_auth') THEN
        SELECT mo.stripe_payment_intent_id, mo.listing_id
        INTO v_payment_intent_id, v_listing_id
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
        FOR UPDATE OF mo;

        UPDATE public.merchant_orders
        SET
            refund_status = 'processing',
            refund_amount = v_refund_hkd,
            refund_attempted_at = now(),
            refund_error = NULL,
            fault_party = p_fault_party,
            auth_notes = COALESCE(v_notes, auth_notes),
            updated_at = now()
        WHERE id = p_order_id
          AND (
              refund_status IS NULL
              OR btrim(refund_status) = ''
              OR lower(btrim(refund_status)) IN ('none', 'failed')
          );

        IF NOT FOUND THEN
            RAISE EXCEPTION '退款已在處理中或已完成';
        END IF;
    ELSIF v_order_kind = 'member_auth' THEN
        SELECT mo.stripe_payment_intent_id, mo.listing_id
        INTO v_payment_intent_id, v_listing_id
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
        FOR UPDATE OF mo;

        PERFORM set_config('moderation.order_refund', 'on', true);

        UPDATE public.member_orders
        SET
            refund_status = 'processing',
            refund_amount = v_refund_hkd,
            refund_attempted_at = now(),
            refund_error = NULL,
            fault_party = p_fault_party,
            auth_notes = COALESCE(v_notes, auth_notes),
            updated_at = now()
        WHERE id = p_order_id
          AND (
              refund_status IS NULL
              OR btrim(refund_status) = ''
              OR lower(btrim(refund_status)) IN ('none', 'failed')
          );

        PERFORM set_config('moderation.order_refund', 'off', true);

        IF NOT FOUND THEN
            RAISE EXCEPTION '退款已在處理中或已完成';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型';
    END IF;

    IF v_payment_intent_id IS NULL OR btrim(v_payment_intent_id) = '' THEN
        RAISE EXCEPTION '訂單缺少有效付款憑證，無法退款';
    END IF;

    PERFORM public._moderation_write_audit_log(
        p_case_id,
        'prepare_order_refund',
        jsonb_build_object(
            'orderId', p_order_id,
            'orderKind', v_order_kind,
            'faultParty', p_fault_party::TEXT,
            'refundHkd', v_refund_hkd,
            'refundCents', v_refund_cents,
            'platformFaultReason', p_platform_fault_reason,
            'carrierLiabilityParty', NULLIF(v_carrier_liability, ''),
            'feeRecoveryMode', v_fee_recovery_mode
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'orderKind', v_order_kind,
        'orderId', p_order_id,
        'paymentIntentId', v_payment_intent_id,
        'refundHkd', v_refund_hkd,
        'refundCents', v_refund_cents,
        'settlementRequired', v_settlement_required,
        'feeRecoveryMode', v_fee_recovery_mode,
        'faultParty', p_fault_party::TEXT,
        'carrierLiabilityParty', NULLIF(v_carrier_liability, ''),
        'adminId', v_admin_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_prepare_moderation_order_refund(UUID, UUID, public.grading_fault_party, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_moderation_order_refund(UUID, UUID, public.grading_fault_party, TEXT, TEXT, TEXT)
    TO authenticated, service_role;


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
    v_auth_notes TEXT;
    v_carrier_liability TEXT;
    v_receivable_hkd NUMERIC;
    v_platform_absorb_hkd NUMERIC := 0;
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

        SELECT mo.fault_party, mo.listing_id, mo.merchant_id, mo.refund_amount, mo.auth_notes
        INTO v_fault_party, v_listing_id, v_merchant_id, v_refund_hkd, v_auth_notes
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
                    OR v_fault_party = 'inconclusive'::public.grading_fault_party
                    OR (
                        v_fault_party = 'carrier'::public.grading_fault_party
                        AND COALESCE(v_auth_notes, '') ~ 'carrier_liability:\s*seller'
                    )
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

        SELECT mo.fault_party, mo.listing_id, mo.seller_id, mo.refund_amount, mo.auth_notes
        INTO v_fault_party, v_listing_id, v_seller_id, v_refund_hkd, v_auth_notes
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.stripe_payment_intent_id = p_payment_intent_id
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到會員鑑定訂單';
        END IF;

        PERFORM set_config('moderation.order_refund', 'on', true);

        UPDATE public.member_orders
        SET
            escrow_status = 'cancelled'::public.member_escrow_status,
            status = 'cancelled',
            refund_status = 'refunded',
            refund_error = NULL,
            updated_at = now(),
            seller_settlement_status = CASE
                WHEN v_fault_party = 'seller'::public.grading_fault_party
                    OR v_fault_party = 'inconclusive'::public.grading_fault_party
                    OR (
                        v_fault_party = 'carrier'::public.grading_fault_party
                        AND COALESCE(v_auth_notes, '') ~ 'carrier_liability:\s*seller'
                    )
                    THEN 'pending'::public.seller_settlement_status
                ELSE seller_settlement_status
            END
        WHERE id = p_order_id
          AND lower(btrim(COALESCE(refund_status, ''))) = 'processing'
          AND payment_capture_status = 'fully_captured'::public.payment_capture_status
        RETURNING * INTO v_updated;

        PERFORM set_config('moderation.order_refund', 'off', true);

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

    IF COALESCE(v_auth_notes, '') ~ 'carrier_liability:\s*seller' THEN
        v_carrier_liability := 'seller';
    ELSIF COALESCE(v_auth_notes, '') ~ 'carrier_liability:\s*platform' THEN
        v_carrier_liability := 'platform';
    ELSE
        v_carrier_liability := NULL;
    END IF;

    IF v_fault_party = 'seller'::public.grading_fault_party
       OR (
           v_fault_party = 'carrier'::public.grading_fault_party
           AND v_carrier_liability = 'seller'
       ) THEN
        v_receivable_hkd := v_settlement_hkd;
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
                v_receivable_hkd,
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
                -1 * (v_receivable_hkd + v_stripe_fee),
                'grading_fail_recovery'::public.transaction_type
            );
        END IF;
    ELSIF v_fault_party = 'inconclusive'::public.grading_fault_party
          AND v_stripe_fee > 0 THEN
        -- p_stripe_fee_hkd is already fee/2 from saga (fee_half mode)
        v_receivable_hkd := v_stripe_fee;
        v_platform_absorb_hkd := v_stripe_fee;
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
                v_receivable_hkd,
                NULL,
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
                -1 * v_receivable_hkd,
                'grading_fail_recovery'::public.transaction_type
            );
        END IF;
    ELSIF v_fault_party = 'carrier'::public.grading_fault_party
          AND v_carrier_liability = 'platform'
          AND v_stripe_fee > 0 THEN
        v_platform_absorb_hkd := v_stripe_fee;
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
                'carrierLiabilityParty', v_carrier_liability,
                'stripeFeeHkd', v_stripe_fee,
                'platformAbsorbHkd', v_platform_absorb_hkd,
                'sellerReceivableHkd', v_receivable_hkd
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


CREATE OR REPLACE FUNCTION public.rpc_retry_moderation_order_refund_prepare(
    p_case_id UUID,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_case public.moderation_cases%ROWTYPE;
    v_eligibility JSONB;
    v_order_kind TEXT;
    v_payment_intent_id TEXT;
    v_refund_hkd NUMERIC;
    v_refund_cents INTEGER;
    v_fault_party public.grading_fault_party;
    v_auth_notes TEXT;
    v_carrier_liability TEXT;
    v_amount JSONB;
    v_settlement_required BOOLEAN;
    v_fee_recovery_mode TEXT;
BEGIN
    PERFORM public._grading_require_admin();

    SELECT *
    INTO v_case
    FROM public.moderation_cases mc
    WHERE mc.id = p_case_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到案件';
    END IF;

    IF v_case.status NOT IN ('resolved'::public.moderation_case_status, 'dismissed'::public.moderation_case_status) THEN
        RAISE EXCEPTION '案件尚未結案';
    END IF;

    IF v_case.resolution IS DISTINCT FROM 'upheld'::public.moderation_resolution THEN
        RAISE EXCEPTION '僅裁定成立案件可重試退款';
    END IF;

    IF NOT public.fn_moderation_case_links_order(p_case_id, p_order_id) THEN
        RAISE EXCEPTION '訂單與案件無關聯';
    END IF;

    v_eligibility := public.fn_moderation_order_refund_eligible(p_order_id);
    IF COALESCE((v_eligibility ->> 'eligible')::BOOLEAN, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', COALESCE(v_eligibility ->> 'ineligibleReason', '訂單不符合退款條件');
    END IF;

    v_order_kind := v_eligibility ->> 'orderKind';

    IF v_order_kind IN ('merchant_direct', 'merchant_auth') THEN
        SELECT mo.stripe_payment_intent_id, mo.refund_amount, mo.fault_party, mo.auth_notes
        INTO v_payment_intent_id, v_refund_hkd, v_fault_party, v_auth_notes
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND lower(btrim(COALESCE(mo.refund_status, ''))) IN ('processing', 'failed')
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '訂單狀態不允許重試退款';
        END IF;

        UPDATE public.merchant_orders
        SET
            refund_status = 'processing',
            refund_attempted_at = now(),
            refund_error = NULL,
            updated_at = now()
        WHERE id = p_order_id;
    ELSIF v_order_kind = 'member_auth' THEN
        SELECT mo.stripe_payment_intent_id, mo.refund_amount, mo.fault_party, mo.auth_notes
        INTO v_payment_intent_id, v_refund_hkd, v_fault_party, v_auth_notes
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND lower(btrim(COALESCE(mo.refund_status, ''))) IN ('processing', 'failed')
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '訂單狀態不允許重試退款';
        END IF;

        PERFORM set_config('moderation.order_refund', 'on', true);

        UPDATE public.member_orders
        SET
            refund_status = 'processing',
            refund_attempted_at = now(),
            refund_error = NULL,
            updated_at = now()
        WHERE id = p_order_id;

        PERFORM set_config('moderation.order_refund', 'off', true);
    ELSE
        RAISE EXCEPTION '不支援的訂單類型';
    END IF;

    IF v_fault_party IS NULL THEN
        RAISE EXCEPTION '缺少 fault_party，請重新裁定';
    END IF;

    IF COALESCE(v_auth_notes, '') ~ 'carrier_liability:\s*seller' THEN
        v_carrier_liability := 'seller';
    ELSIF COALESCE(v_auth_notes, '') ~ 'carrier_liability:\s*platform' THEN
        v_carrier_liability := 'platform';
    ELSE
        v_carrier_liability := NULL;
    END IF;

    v_amount := public.fn_compute_moderation_order_refund(
        p_order_id,
        v_fault_party,
        NULL,
        v_carrier_liability
    );
    v_refund_hkd := (v_amount ->> 'refundHkd')::NUMERIC;
    v_refund_cents := (v_amount ->> 'refundCents')::INTEGER;
    v_settlement_required := COALESCE((v_amount ->> 'settlementRequired')::BOOLEAN, false);
    v_fee_recovery_mode := COALESCE(v_amount ->> 'feeRecoveryMode', 'none');

    RETURN jsonb_build_object(
        'success', true,
        'orderKind', v_order_kind,
        'orderId', p_order_id,
        'paymentIntentId', v_payment_intent_id,
        'refundHkd', v_refund_hkd,
        'refundCents', v_refund_cents,
        'settlementRequired', v_settlement_required,
        'feeRecoveryMode', v_fee_recovery_mode,
        'faultParty', v_fault_party::TEXT,
        'carrierLiabilityParty', v_carrier_liability
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_retry_moderation_order_refund_prepare(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_retry_moderation_order_refund_prepare(UUID, UUID)
    TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.rpc_resolve_moderation_case(
  p_case_id UUID,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_case public.moderation_cases%ROWTYPE;
  v_resolution TEXT;
  v_violation_persona TEXT;
  v_adjustment NUMERIC;
  v_adjustment_reason TEXT;
  v_evidence_override_reason TEXT;
  v_sanction JSONB;
  v_sanction_scope TEXT;
  v_sanction_type TEXT;
  v_sanction_ends_at TIMESTAMPTZ;
  v_sanction_reason TEXT;
  v_required_chat BOOLEAN;
  v_chat_room_id UUID;
  v_evidence_sufficient BOOLEAN;
  v_new_case_status public.moderation_case_status;
  v_new_report_status public.report_state;
  v_sanction_id UUID;
  v_notify_reporter BOOLEAN;
  v_order_refund JSONB;
  v_order_refund_enabled BOOLEAN;
  v_order_id UUID;
  v_fault_party public.grading_fault_party;
  v_platform_fault_reason TEXT;
  v_carrier_liability_party TEXT;
  v_refund_reason TEXT;
  v_prepare JSONB;
BEGIN
  v_admin_id := public._grading_require_admin();

  v_resolution := COALESCE(
    NULLIF(p_payload ->> 'resolution', ''),
    NULLIF(p_payload ->> 'Resolution', '')
  );
  v_violation_persona := COALESCE(
    NULLIF(p_payload ->> 'violationPersona', ''),
    NULLIF(p_payload ->> 'violation_persona', '')
  );
  v_adjustment := COALESCE(
    NULLIF(p_payload ->> 'adjustment', '')::NUMERIC,
    0
  );
  v_adjustment_reason := COALESCE(
    NULLIF(p_payload ->> 'adjustmentReason', ''),
    NULLIF(p_payload ->> 'adjustment_reason', '')
  );
  v_evidence_override_reason := COALESCE(
    NULLIF(p_payload ->> 'evidenceOverrideReason', ''),
    NULLIF(p_payload ->> 'evidence_override_reason', '')
  );
  v_sanction := COALESCE(p_payload -> 'sanction', p_payload -> 'Sanction');
  v_notify_reporter := COALESCE(
    CASE
      WHEN p_payload ? 'notifyReporter' THEN (p_payload ->> 'notifyReporter')::BOOLEAN
      WHEN p_payload ? 'notify_reporter' THEN (p_payload ->> 'notify_reporter')::BOOLEAN
      ELSE NULL
    END,
    TRUE
  );
  v_order_refund := COALESCE(p_payload -> 'orderRefund', p_payload -> 'order_refund');
  v_order_refund_enabled := COALESCE(
    (v_order_refund ->> 'enabled')::BOOLEAN,
    (v_order_refund ->> 'Enabled')::BOOLEAN,
    false
  );

  IF v_resolution IS NULL OR v_resolution NOT IN ('upheld', 'dismissed', 'insufficient_evidence') THEN
    RAISE EXCEPTION '無效的裁定結果';
  END IF;

  IF v_order_refund_enabled AND v_resolution IS DISTINCT FROM 'upheld' THEN
    RAISE EXCEPTION '僅裁定成立時可執行售後退款';
  END IF;

  SELECT *
  INTO v_case
  FROM public.moderation_cases mc
  WHERE mc.id = p_case_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到案件';
  END IF;

  IF v_case.status NOT IN ('open'::public.moderation_case_status, 'reviewing'::public.moderation_case_status) THEN
    RAISE EXCEPTION '案件已結案';
  END IF;

  v_required_chat := v_case.primary_category IN ('offline_trade', 'harassment');
  v_chat_room_id := public._moderation_resolve_chat_room_for_case(p_case_id);
  v_evidence_sufficient := NOT v_required_chat OR v_chat_room_id IS NOT NULL;

  IF v_resolution = 'upheld' THEN
    IF v_violation_persona IS NULL
       OR v_violation_persona NOT IN ('member', 'merchant', 'both', 'unknown') THEN
      RAISE EXCEPTION '裁定成立時必須指定違規身分';
    END IF;

    IF NOT v_evidence_sufficient AND v_evidence_override_reason IS NULL THEN
      RAISE EXCEPTION '證據不足，請提供覆寫原因或改選其他裁定';
    END IF;

    v_new_case_status := 'resolved'::public.moderation_case_status;
    v_new_report_status := 'resolved'::public.report_state;
  ELSE
    v_new_case_status := 'dismissed'::public.moderation_case_status;
    v_new_report_status := 'dismissed'::public.report_state;
  END IF;

  IF COALESCE(v_adjustment, 0) <> 0 THEN
    IF NULLIF(btrim(v_adjustment_reason), '') IS NULL THEN
      RAISE EXCEPTION '調整分數時必須填寫原因';
    END IF;

    UPDATE public.moderation_cases
    SET
      admin_adjustment = admin_adjustment + v_adjustment,
      adjustment_reason = btrim(v_adjustment_reason),
      updated_at = now()
    WHERE id = p_case_id;
  END IF;

  IF v_resolution = 'upheld' AND v_sanction IS NOT NULL AND v_sanction <> 'null'::JSONB THEN
    v_sanction_scope := COALESCE(
      NULLIF(v_sanction ->> 'scope', ''),
      NULLIF(v_sanction ->> 'Scope', '')
    );
    v_sanction_type := COALESCE(
      NULLIF(v_sanction ->> 'type', ''),
      NULLIF(v_sanction ->> 'Type', '')
    );
    v_sanction_reason := COALESCE(
      NULLIF(v_sanction ->> 'reason', ''),
      NULLIF(v_sanction ->> 'Reason', ''),
      ''
    );

    IF v_sanction ->> 'endsAt' IS NOT NULL OR v_sanction ->> 'ends_at' IS NOT NULL THEN
      v_sanction_ends_at := COALESCE(
        NULLIF(v_sanction ->> 'endsAt', '')::TIMESTAMPTZ,
        NULLIF(v_sanction ->> 'ends_at', '')::TIMESTAMPTZ
      );
    ELSE
      v_sanction_ends_at := NULL;
    END IF;

    IF v_sanction_scope IS NULL
       OR v_sanction_scope NOT IN ('account', 'member_persona', 'merchant_persona')
       OR v_sanction_type IS NULL
       OR v_sanction_type NOT IN (
         'warn', 'restrict_listing', 'restrict_chat', 'freeze_payout', 'suspend', 'ban'
       ) THEN
      RAISE EXCEPTION '無效的制裁設定';
    END IF;

    v_sanction_id := public._moderation_insert_account_sanction(
      v_admin_id,
      v_case.subject_user_id,
      v_sanction_scope::public.sanction_scope,
      v_sanction_type::public.sanction_type,
      v_sanction_ends_at,
      p_case_id,
      v_sanction_reason
    );
  END IF;

  UPDATE public.moderation_cases
  SET
    status = v_new_case_status,
    resolution = v_resolution::public.moderation_resolution,
    violation_persona = CASE
      WHEN v_violation_persona IS NOT NULL
      THEN v_violation_persona::public.violation_persona
      ELSE violation_persona
    END,
    resolved_at = now(),
    resolved_by = v_admin_id,
    updated_at = now()
  WHERE id = p_case_id;

  UPDATE public.reports
  SET
    status = v_new_report_status,
    outcome_acknowledged_at = CASE
      WHEN v_notify_reporter THEN outcome_acknowledged_at
      ELSE COALESCE(outcome_acknowledged_at, now())
    END
  WHERE case_id = p_case_id;

  PERFORM public._moderation_write_audit_log(
    p_case_id,
    'resolve',
    jsonb_build_object(
      'resolution', v_resolution,
      'violationPersona', v_violation_persona,
      'adjustment', v_adjustment,
      'adjustmentReason', v_adjustment_reason,
      'evidenceOverrideReason', v_evidence_override_reason,
      'sanction', v_sanction,
      'sanctionId', v_sanction_id,
      'newStatus', v_new_case_status::TEXT,
      'notifyReporter', v_notify_reporter,
      'orderRefundEnabled', v_order_refund_enabled
    )
  );

  v_prepare := NULL;

  IF v_order_refund_enabled THEN
    v_order_id := COALESCE(
      NULLIF(v_order_refund ->> 'orderId', '')::UUID,
      NULLIF(v_order_refund ->> 'order_id', '')::UUID
    );
    IF v_order_id IS NULL THEN
      RAISE EXCEPTION '請選擇要退款的訂單';
    END IF;

    v_fault_party := COALESCE(
      NULLIF(v_order_refund ->> 'faultParty', '')::public.grading_fault_party,
      NULLIF(v_order_refund ->> 'fault_party', '')::public.grading_fault_party
    );
    IF v_fault_party IS NULL
       OR v_fault_party NOT IN (
         'buyer'::public.grading_fault_party,
         'seller'::public.grading_fault_party,
         'platform'::public.grading_fault_party,
         'carrier'::public.grading_fault_party,
         'inconclusive'::public.grading_fault_party
       ) THEN
      RAISE EXCEPTION '無效的 fault_party';
    END IF;

    v_platform_fault_reason := COALESCE(
      NULLIF(v_order_refund ->> 'platformFaultReason', ''),
      NULLIF(v_order_refund ->> 'platform_fault_reason', '')
    );
    IF v_fault_party = 'platform'::public.grading_fault_party
       AND NULLIF(btrim(COALESCE(v_platform_fault_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION '平台責任退款必須填寫原因';
    END IF;

    v_carrier_liability_party := lower(btrim(COALESCE(
      NULLIF(v_order_refund ->> 'carrierLiabilityParty', ''),
      NULLIF(v_order_refund ->> 'carrier_liability_party', ''),
      ''
    )));
    IF v_fault_party = 'carrier'::public.grading_fault_party THEN
      IF v_carrier_liability_party NOT IN ('seller', 'platform') THEN
        RAISE EXCEPTION 'carrier 責任必須指定 carrierLiabilityParty (seller | platform)';
      END IF;
    ELSE
      v_carrier_liability_party := NULL;
    END IF;

    v_refund_reason := COALESCE(
      NULLIF(p_payload ->> 'refundReason', ''),
      'moderation resolve refund'
    );

    v_prepare := public.rpc_prepare_moderation_order_refund(
      p_case_id,
      v_order_id,
      v_fault_party,
      v_refund_reason,
      v_platform_fault_reason,
      v_carrier_liability_party
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'caseId', p_case_id,
    'status', v_new_case_status::TEXT,
    'resolution', v_resolution,
    'orderRefundPrepared', v_order_refund_enabled,
    'orderKind', v_prepare ->> 'orderKind',
    'orderId', v_prepare ->> 'orderId',
    'refundCents', v_prepare ->> 'refundCents',
    'paymentIntentId', v_prepare ->> 'paymentIntentId',
    'settlementRequired', v_prepare ->> 'settlementRequired',
    'feeRecoveryMode', v_prepare ->> 'feeRecoveryMode',
    'faultParty', v_prepare ->> 'faultParty',
    'carrierLiabilityParty', v_prepare ->> 'carrierLiabilityParty'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_resolve_moderation_case(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_moderation_case(UUID, JSONB)
  TO authenticated, service_role;
