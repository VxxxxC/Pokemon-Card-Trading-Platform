-- Allow admin moderation post-sale refund RPCs to update member_orders without tripping
-- fn_enforce_member_order_transitions (admin is not buyer/seller).

CREATE OR REPLACE FUNCTION public.fn_enforce_member_order_transitions()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF current_setting('moderation.freeze_payout', true) = 'on'
       AND NEW.seller_payout_status = 'frozen'::public.member_seller_payout_status
       AND OLD.seller_payout_status IS DISTINCT FROM NEW.seller_payout_status THEN
        RETURN NEW;
    END IF;

    IF current_setting('moderation.order_refund', true) = 'on' THEN
        RETURN NEW;
    END IF;

    IF COALESCE(OLD.use_authentication, false) THEN
        IF auth.uid() = OLD.buyer_id THEN
            IF OLD.status = 'pending'
               AND NEW.status = 'pending'
               AND OLD.escrow_status = 'payment'
               AND NEW.escrow_status = 'custody'
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count THEN
                RETURN NEW;
            END IF;

            IF OLD.status = 'pending'
               AND NEW.status = 'completed'
               AND OLD.escrow_status = 'shipped'
               AND NEW.escrow_status = 'released'
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count THEN
                RETURN NEW;
            END IF;

            RAISE EXCEPTION '保安攔截：買家操作不合法。';
        END IF;

        IF auth.uid() = OLD.seller_id THEN
            IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
                RETURN NEW;
            END IF;

            IF OLD.status = 'pending'
               AND NEW.status = 'pending'
               AND OLD.escrow_status = 'custody'
               AND NEW.escrow_status = 'custody'
               AND NEW.inbound_tracking_no IS DISTINCT FROM OLD.inbound_tracking_no
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count THEN
                RETURN NEW;
            END IF;

            IF NEW.extended_count = OLD.extended_count + 1
               AND NEW.expires_at > OLD.expires_at
               AND NEW.status = OLD.status THEN
                RETURN NEW;
            END IF;

            RAISE EXCEPTION '保安攔截：賣家操作不合法。';
        END IF;

        IF OLD.status = 'pending'
           AND NEW.status = 'pending'
           AND NEW.expires_at = OLD.expires_at
           AND NEW.extended_count = OLD.extended_count THEN
            IF OLD.escrow_status = 'custody' AND NEW.escrow_status = 'grading' THEN
                RETURN NEW;
            END IF;

            IF OLD.escrow_status = 'grading' AND NEW.escrow_status = 'shipped' THEN
                RETURN NEW;
            END IF;

            IF OLD.escrow_status = 'shipped'
               AND NEW.escrow_status = 'shipped'
               AND NEW.outbound_tracking_no IS DISTINCT FROM OLD.outbound_tracking_no THEN
                RETURN NEW;
            END IF;
        END IF;

        RAISE EXCEPTION '保安攔截：您不屬於此筆訂單的交易關係人。';
    END IF;

    IF auth.uid() = OLD.buyer_id THEN
        IF NEW.status = 'completed'
           AND OLD.status = 'pending'
           AND NEW.expires_at = OLD.expires_at
           AND NEW.extended_count = OLD.extended_count THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION '保安攔截：買家操作不合法。';
    END IF;

    IF auth.uid() = OLD.seller_id THEN
        IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
            RETURN NEW;
        END IF;

        IF NEW.extended_count = OLD.extended_count + 1
           AND NEW.expires_at > OLD.expires_at
           AND NEW.status = OLD.status THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION '保安攔截：賣家操作不合法。';
    END IF;

    RAISE EXCEPTION '保安攔截：您不屬於此筆訂單的交易關係人。';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.rpc_prepare_moderation_order_refund(
    p_case_id UUID,
    p_order_id UUID,
    p_fault_party public.grading_fault_party,
    p_reason TEXT DEFAULT NULL,
    p_platform_fault_reason TEXT DEFAULT NULL
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
    v_listing_id UUID;
    v_notes TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF NOT public.fn_moderation_case_links_order(p_case_id, p_order_id) THEN
        RAISE EXCEPTION '訂單與案件無關聯';
    END IF;

    v_eligibility := public.fn_moderation_order_refund_eligible(p_order_id);
    IF COALESCE((v_eligibility ->> 'eligible')::BOOLEAN, false) IS NOT TRUE THEN
        RAISE EXCEPTION '%', COALESCE(v_eligibility ->> 'ineligibleReason', '訂單不符合退款條件');
    END IF;

    v_amount := public.fn_compute_moderation_order_refund(
        p_order_id,
        p_fault_party,
        p_platform_fault_reason
    );
    v_order_kind := v_amount ->> 'orderKind';
    v_refund_hkd := (v_amount ->> 'refundHkd')::NUMERIC;
    v_refund_cents := (v_amount ->> 'refundCents')::INTEGER;
    v_settlement_required := COALESCE((v_amount ->> 'settlementRequired')::BOOLEAN, false);

    v_notes := NULLIF(btrim(COALESCE(p_reason, '')), '');
    IF p_fault_party = 'platform'::public.grading_fault_party
       AND NULLIF(btrim(COALESCE(p_platform_fault_reason, '')), '') IS NOT NULL THEN
        v_notes := COALESCE(v_notes || E'\n', '') || 'platform_fault: ' || btrim(p_platform_fault_reason);
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
            'platformFaultReason', p_platform_fault_reason
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
        'faultParty', p_fault_party::TEXT,
        'adminId', v_admin_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_prepare_moderation_order_refund(UUID, UUID, public.grading_fault_party, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_moderation_order_refund(UUID, UUID, public.grading_fault_party, TEXT, TEXT)
    TO authenticated, service_role;
