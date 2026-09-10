-- Auth Escrow Phase C: seller-fault grading fail settlement (receivables, admin queue, return gate).

-- ---------------------------------------------------------------------------
-- 1. Liability helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_compute_seller_grading_fail_liability(
    p_order_kind TEXT,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_fault_party public.grading_fault_party;
    v_capture_model TEXT;
    v_auth_fee NUMERIC;
    v_inbound NUMERIC;
    v_buyer_total NUMERIC;
    v_refund_amount NUMERIC;
    v_amount_hkd NUMERIC;
BEGIN
    IF p_order_kind = 'member' THEN
        SELECT
            mo.fault_party,
            mo.escrow_capture_model,
            COALESCE(mo.auth_fee, 0),
            COALESCE(mo.inbound_shipping_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount, 0)
        INTO v_fault_party, v_capture_model, v_auth_fee, v_inbound, v_buyer_total
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.fault_party,
            mo.escrow_capture_model,
            COALESCE(mo.auth_fee, 0),
            COALESCE(mo.inbound_shipping_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount, 0)
        INTO v_fault_party, v_capture_model, v_auth_fee, v_inbound, v_buyer_total
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_fault_party IS DISTINCT FROM 'seller'::public.grading_fault_party THEN
        RETURN jsonb_build_object(
            'applies', false,
            'settlement_required', false
        );
    END IF;

    v_refund_amount := v_auth_fee + v_inbound;

    IF v_capture_model = 'single' THEN
        v_amount_hkd := v_buyer_total;
    ELSE
        v_amount_hkd := v_refund_amount;
    END IF;

    IF v_amount_hkd <= 0 THEN
        RAISE EXCEPTION '賣方追償金額異常。';
    END IF;

    RETURN jsonb_build_object(
        'applies', true,
        'settlement_required', true,
        'escrow_capture_model', v_capture_model,
        'amount_hkd', v_amount_hkd,
        'stripe_fee_hkd', 0,
        'refund_cents', CASE
            WHEN v_capture_model = 'single' THEN 0
            ELSE ROUND(v_refund_amount * 100)::INTEGER
        END,
        'refund_amount_hkd', v_refund_amount
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_compute_seller_grading_fail_liability(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_compute_seller_grading_fail_liability(TEXT, UUID)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Prepare fail — refund hints + audit action fix
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_prepare_auth_grading_fail(
    p_order_kind TEXT,
    p_order_id UUID,
    p_fault_party public.grading_fault_party,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_pi TEXT;
    v_capture_status public.payment_capture_status;
    v_from_status TEXT;
    v_capture_model TEXT;
    v_void_mode TEXT;
    v_auth_fee NUMERIC;
    v_inbound NUMERIC;
    v_refund_cents INTEGER;
    v_settlement_required BOOLEAN;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_fault_party IS NULL THEN
        RAISE EXCEPTION '請選擇責任方（fault_party）。';
    END IF;

    v_settlement_required := p_fault_party = 'seller'::public.grading_fault_party;

    IF p_order_kind = 'member' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            mo.escrow_status::TEXT,
            mo.escrow_capture_model,
            COALESCE(mo.auth_fee, 0),
            COALESCE(mo.inbound_shipping_fee, 0)
        INTO v_pi, v_capture_status, v_from_status, v_capture_model, v_auth_fee, v_inbound
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF v_capture_model = 'single' THEN
            IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
                RAISE EXCEPTION '鑑定失敗處理失敗：訂單付款狀態不合法。';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.member_orders mo
                WHERE mo.id = p_order_id
                  AND mo.platform_received_at IS NOT NULL
                  AND mo.escrow_status = 'grading'::public.member_escrow_status
                  AND mo.status = 'pending'
                  AND mo.auth_result IS NULL
            ) THEN
                RAISE EXCEPTION '僅鑑定中的訂單可標記失敗。';
            END IF;

            v_void_mode := 'cancel';
        ELSE
            IF v_capture_status IS DISTINCT FROM 'auth_fee_captured'::public.payment_capture_status THEN
                RAISE EXCEPTION '鑑定失敗處理失敗：訂單付款狀態不合法。';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.member_orders mo
                WHERE mo.id = p_order_id
                  AND mo.escrow_status = 'grading'::public.member_escrow_status
                  AND mo.status = 'pending'
                  AND mo.auth_result IS NULL
            ) THEN
                RAISE EXCEPTION '僅鑑定中的訂單可標記失敗。';
            END IF;

            v_void_mode := 'capture_zero';
        END IF;

        UPDATE public.member_orders
        SET
            refund_status = 'processing',
            fault_party = p_fault_party,
            auth_notes = COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), auth_notes),
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status IN ('none', 'failed');

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗處理已在進行中或已完成。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            mo.escrow_status::TEXT,
            mo.escrow_capture_model,
            COALESCE(mo.auth_fee, 0),
            COALESCE(mo.inbound_shipping_fee, 0)
        INTO v_pi, v_capture_status, v_from_status, v_capture_model, v_auth_fee, v_inbound
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF v_capture_model = 'single' THEN
            IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
                RAISE EXCEPTION '鑑定失敗處理失敗：訂單付款狀態不合法。';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.merchant_orders mo
                WHERE mo.id = p_order_id
                  AND mo.platform_received_at IS NOT NULL
                  AND mo.escrow_status = 'authenticating'::public.escrow_state
                  AND mo.auth_result IS NULL
            ) THEN
                RAISE EXCEPTION '僅鑑定中的訂單可標記失敗。';
            END IF;

            v_void_mode := 'cancel';
        ELSE
            IF v_capture_status IS DISTINCT FROM 'auth_fee_captured'::public.payment_capture_status THEN
                RAISE EXCEPTION '鑑定失敗處理失敗：訂單付款狀態不合法。';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.merchant_orders mo
                WHERE mo.id = p_order_id
                  AND mo.escrow_status = 'authenticating'::public.escrow_state
                  AND mo.auth_result IS NULL
            ) THEN
                RAISE EXCEPTION '僅鑑定中的訂單可標記失敗。';
            END IF;

            v_void_mode := 'capture_zero';
        END IF;

        UPDATE public.merchant_orders
        SET
            refund_status = 'processing',
            fault_party = p_fault_party,
            auth_notes = COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), auth_notes),
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status IN ('none', 'failed');

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗處理已在進行中或已完成。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_pi IS NULL OR btrim(v_pi) = '' THEN
        RAISE EXCEPTION '訂單缺少有效付款憑證，無法釋放餘額。';
    END IF;

    v_refund_cents := CASE
        WHEN v_settlement_required AND v_capture_model IS DISTINCT FROM 'single'
            THEN ROUND((v_auth_fee + v_inbound) * 100)::INTEGER
        ELSE 0
    END;

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        v_admin_id,
        'prepare_fail_void',
        v_from_status,
        CASE WHEN p_order_kind = 'member' THEN 'grading' ELSE 'authenticating' END,
        NULLIF(trim(COALESCE(p_reason, '')), '')
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_kind', p_order_kind,
        'order_id', p_order_id,
        'payment_intent_id', v_pi,
        'admin_id', v_admin_id,
        'fault_party', p_fault_party,
        'escrow_capture_model', v_capture_model,
        'void_mode', v_void_mode,
        'settlement_required', v_settlement_required,
        'refund_cents', v_refund_cents
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Finalize fail — seller receivable / ledger
-- ---------------------------------------------------------------------------

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

        UPDATE public.member_orders
        SET
            escrow_status = 'cancelled'::public.member_escrow_status,
            status = 'cancelled',
            auth_result = 'failed',
            auth_graded_at = now(),
            refund_status = 'none',
            refund_error = NULL,
            payment_capture_status = CASE
                WHEN escrow_capture_model = 'single' THEN 'voided'::public.payment_capture_status
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
                  AND payment_capture_status = 'authorized'::public.payment_capture_status
              )
              OR (
                  escrow_capture_model IS DISTINCT FROM 'single'
                  AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
              )
          )
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗 finalize 失敗：訂單狀態不合法。';
        END IF;
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

        UPDATE public.merchant_orders
        SET
            escrow_status = 'refunded'::public.escrow_state,
            auth_result = 'failed',
            auth_graded_at = now(),
            refund_status = 'none',
            refund_error = NULL,
            payment_capture_status = CASE
                WHEN escrow_capture_model = 'single' THEN 'voided'::public.payment_capture_status
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
                  AND payment_capture_status = 'authorized'::public.payment_capture_status
              )
              OR (
                  escrow_capture_model IS DISTINCT FROM 'single'
                  AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
              )
          )
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗 finalize 失敗：訂單狀態不合法。';
        END IF;

        PERFORM public.fn_restore_merchant_order_coupon_on_void(p_order_id);
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

-- ---------------------------------------------------------------------------
-- 4. Admin clear seller settlement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_admin_clear_seller_settlement(
    p_order_kind TEXT,
    p_order_id UUID,
    p_fps_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_updated RECORD;
    v_from_status TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_order_kind = 'member' THEN
        UPDATE public.member_orders mo
        SET
            seller_settlement_status = 'cleared'::public.seller_settlement_status,
            updated_at = now()
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
          AND mo.auth_result = 'failed'
          AND mo.fault_party = 'seller'::public.grading_fault_party
          AND mo.seller_settlement_status = 'pending'::public.seller_settlement_status
        RETURNING mo.escrow_status::TEXT INTO v_from_status;

        IF NOT FOUND THEN
            RAISE EXCEPTION '無法確認收款：訂單狀態不合法。';
        END IF;

        UPDATE public.seller_receivables sr
        SET
            status = 'paid'::public.seller_receivable_status,
            fps_reference = NULLIF(trim(COALESCE(p_fps_reference, '')), ''),
            notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
            paid_at = now(),
            paid_by = v_admin_id,
            updated_at = now()
        WHERE sr.order_kind = p_order_kind
          AND sr.order_id = p_order_id
          AND sr.status = 'pending'::public.seller_receivable_status;
    ELSIF p_order_kind = 'merchant' THEN
        UPDATE public.merchant_orders mo
        SET
            seller_settlement_status = 'cleared'::public.seller_settlement_status,
            updated_at = now()
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
          AND mo.auth_result = 'failed'
          AND mo.fault_party = 'seller'::public.grading_fault_party
          AND mo.seller_settlement_status = 'pending'::public.seller_settlement_status
        RETURNING mo.escrow_status::TEXT INTO v_from_status;

        IF NOT FOUND THEN
            RAISE EXCEPTION '無法確認收款：訂單狀態不合法。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        v_admin_id,
        'clear_seller_settlement',
        v_from_status,
        'cleared',
        NULLIF(trim(COALESCE(p_notes, p_fps_reference, '')), '')
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_clear_seller_settlement(TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_clear_seller_settlement(TEXT, UUID, TEXT, TEXT)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Admin submit seller return tracking
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 6. Member trigger — admin seller return on cancelled orders
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_enforce_member_order_transitions()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF COALESCE(OLD.use_authentication, false) THEN
        IF auth.uid() = OLD.buyer_id THEN
            IF OLD.status = 'pending'
               AND NEW.status = 'pending'
               AND OLD.escrow_status = 'payment'
               AND NEW.escrow_status = 'payment'
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count
               AND NEW.buyer_id = OLD.buyer_id
               AND NEW.seller_id = OLD.seller_id
               AND NEW.final_price = OLD.final_price
               AND COALESCE(NEW.use_authentication, false) = COALESCE(OLD.use_authentication, false)
               AND NEW.inbound_tracking_no IS NOT DISTINCT FROM OLD.inbound_tracking_no
               AND NEW.outbound_tracking_no IS NOT DISTINCT FROM OLD.outbound_tracking_no
               AND (
                   NEW.item_subtotal IS DISTINCT FROM OLD.item_subtotal
                   OR NEW.auth_fee IS DISTINCT FROM OLD.auth_fee
                   OR NEW.inbound_shipping_fee IS DISTINCT FROM OLD.inbound_shipping_fee
                   OR NEW.outbound_shipping_fee IS DISTINCT FROM OLD.outbound_shipping_fee
                   OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
                   OR NEW.buyer_total_amount IS DISTINCT FROM OLD.buyer_total_amount
                   OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
                   OR (
                       NEW.item_subtotal IS NOT DISTINCT FROM OLD.item_subtotal
                       AND NEW.auth_fee IS NOT DISTINCT FROM OLD.auth_fee
                       AND NEW.inbound_shipping_fee IS NOT DISTINCT FROM OLD.inbound_shipping_fee
                       AND NEW.outbound_shipping_fee IS NOT DISTINCT FROM OLD.outbound_shipping_fee
                       AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
                       AND NEW.buyer_total_amount IS NOT DISTINCT FROM OLD.buyer_total_amount
                       AND NEW.stripe_payment_intent_id IS NOT DISTINCT FROM OLD.stripe_payment_intent_id
                       AND OLD.item_subtotal IS NOT NULL
                       AND OLD.total_amount IS NOT NULL
                   )
               ) THEN
                RETURN NEW;
            END IF;

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
               AND NEW.inbound_tracking_no IS NOT DISTINCT FROM OLD.inbound_tracking_no
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

        IF auth.uid() IS NOT NULL AND public.is_admin() THEN
            IF OLD.status = 'pending'
               AND NEW.status = 'pending'
               AND OLD.escrow_status = 'grading'
               AND NEW.escrow_status = 'grading'
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count
               AND NEW.buyer_id = OLD.buyer_id
               AND NEW.seller_id = OLD.seller_id
               AND NEW.final_price = OLD.final_price
               AND COALESCE(NEW.use_authentication, false) = COALESCE(OLD.use_authentication, false)
               AND NEW.inbound_tracking_no IS NOT DISTINCT FROM OLD.inbound_tracking_no
               AND NEW.outbound_tracking_no IS NOT DISTINCT FROM OLD.outbound_tracking_no THEN
                RETURN NEW;
            END IF;

            IF OLD.status = 'pending'
               AND NEW.status = 'cancelled'
               AND OLD.escrow_status = 'grading'
               AND NEW.escrow_status = 'cancelled'
               AND NEW.auth_result = 'failed'
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count
               AND NEW.buyer_id = OLD.buyer_id
               AND NEW.seller_id = OLD.seller_id
               AND NEW.final_price = OLD.final_price
               AND COALESCE(NEW.use_authentication, false) = COALESCE(OLD.use_authentication, false)
               AND NEW.inbound_tracking_no IS NOT DISTINCT FROM OLD.inbound_tracking_no
               AND NEW.outbound_tracking_no IS NOT DISTINCT FROM OLD.outbound_tracking_no THEN
                RETURN NEW;
            END IF;

            IF OLD.status = 'cancelled'
               AND NEW.status = 'cancelled'
               AND OLD.escrow_status = 'cancelled'
               AND NEW.escrow_status = 'cancelled'
               AND OLD.auth_result = 'failed'
               AND NEW.auth_result = 'failed'
               AND NEW.outbound_tracking_no IS DISTINCT FROM OLD.outbound_tracking_no
               AND NEW.seller_settlement_status = 'cleared'::public.seller_settlement_status THEN
                RETURN NEW;
            END IF;
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

-- ---------------------------------------------------------------------------
-- 7. Admin grading search — awaiting_settlement tab
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_admin_grading_orders(
    p_tab TEXT,
    p_order_kind TEXT DEFAULT NULL,
    p_keyword TEXT DEFAULT NULL,
    p_page INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_offset INTEGER;
    v_limit INTEGER;
    v_keyword TEXT;
    v_rows JSONB;
    v_total BIGINT;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_limit := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 50);
    v_offset := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_limit;
    v_keyword := NULLIF(trim(COALESCE(p_keyword, '')), '');

    WITH unified AS (
        SELECT
            'member'::TEXT AS order_kind,
            mo.id AS order_id,
            mo.order_number,
            mo.buyer_id,
            mo.seller_id AS counterparty_seller_id,
            NULL::UUID AS merchant_id,
            mo.listing_id,
            COALESCE(mo.item_subtotal, mo.final_price) AS item_subtotal,
            0::NUMERIC AS shipping_fee,
            mo.auth_fee,
            mo.total_amount,
            mo.inbound_tracking_no,
            mo.outbound_tracking_no,
            mo.auth_result,
            mo.refund_status,
            mo.refund_amount,
            mo.escrow_status::TEXT AS escrow_status,
            mo.platform_received_at,
            mo.auth_graded_at,
            mo.auth_grading_company,
            mo.auth_grading_score,
            mo.fault_party::TEXT AS fault_party,
            mo.seller_settlement_status::TEXT AS seller_settlement_status,
            sr.amount_hkd AS receivable_amount_hkd,
            mo.created_at,
            mo.updated_at,
            pb.display_name AS buyer_display_name,
            pb.username AS buyer_username,
            ps.display_name AS seller_display_name,
            ps.username AS seller_username,
            NULL::TEXT AS shop_name,
            pc.name_zh AS product_name_zh,
            pc.name_ja AS product_name_ja,
            pc.name_en AS product_name_en,
            l.grading_company,
            l.grading_score
        FROM public.member_orders mo
        JOIN public.profiles pb ON pb.id = mo.buyer_id
        JOIN public.profiles ps ON ps.id = mo.seller_id
        JOIN public.listings l ON l.id = mo.listing_id
        JOIN public.product_catalog pc ON pc.id = l.product_id
        LEFT JOIN public.seller_receivables sr
            ON sr.order_kind = 'member'
           AND sr.order_id = mo.id
        WHERE mo.use_authentication = true

        UNION ALL

        SELECT
            'merchant'::TEXT AS order_kind,
            mo.id AS order_id,
            mo.order_number,
            mo.buyer_id,
            NULL::UUID AS counterparty_seller_id,
            mo.merchant_id,
            mo.listing_id,
            COALESCE(mo.item_subtotal, mo.final_price) AS item_subtotal,
            COALESCE(mo.shipping_fee, 0) AS shipping_fee,
            mo.auth_fee,
            mo.total_amount,
            mo.inbound_tracking_no,
            mo.outbound_tracking_no,
            mo.auth_result,
            mo.refund_status,
            mo.refund_amount,
            mo.escrow_status::TEXT AS escrow_status,
            mo.platform_received_at,
            mo.auth_graded_at,
            mo.auth_grading_company,
            mo.auth_grading_score,
            mo.fault_party::TEXT AS fault_party,
            mo.seller_settlement_status::TEXT AS seller_settlement_status,
            (
                SELECT ABS(ml.amount)
                FROM public.merchant_ledgers ml
                WHERE ml.order_id = mo.id
                  AND ml.transaction_type = 'grading_fail_recovery'::public.transaction_type
                LIMIT 1
            ) AS receivable_amount_hkd,
            mo.created_at,
            mo.updated_at,
            pb.display_name AS buyer_display_name,
            pb.username AS buyer_username,
            NULL::TEXT AS seller_display_name,
            NULL::TEXT AS seller_username,
            ms.shop_name,
            pc.name_zh AS product_name_zh,
            pc.name_ja AS product_name_ja,
            pc.name_en AS product_name_en,
            l.grading_company,
            l.grading_score
        FROM public.merchant_orders mo
        JOIN public.profiles pb ON pb.id = mo.buyer_id
        JOIN public.listings l ON l.id = mo.listing_id
        JOIN public.product_catalog pc ON pc.id = l.product_id
        LEFT JOIN public.merchant_shops ms ON ms.merchant_id = mo.merchant_id
        WHERE mo.requires_authentication = true
    ),
    filtered AS (
        SELECT *
        FROM unified u
        WHERE (
            p_order_kind IS NULL
            OR btrim(p_order_kind) = ''
            OR u.order_kind = p_order_kind
        )
        AND (
            v_keyword IS NULL
            OR u.order_number ILIKE '%' || v_keyword || '%'
            OR u.buyer_display_name ILIKE '%' || v_keyword || '%'
            OR u.buyer_username ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.seller_display_name, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.seller_username, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.shop_name, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.inbound_tracking_no, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.outbound_tracking_no, '') ILIKE '%' || v_keyword || '%'
        )
        AND (
            (p_tab = 'awaiting_intake' AND (
                (u.order_kind = 'member' AND u.escrow_status = 'custody' AND u.inbound_tracking_no IS NOT NULL)
                OR (u.order_kind = 'merchant' AND u.escrow_status = 'payment_held' AND u.inbound_tracking_no IS NOT NULL)
            ))
            OR (p_tab = 'grading' AND (
                (u.order_kind = 'member' AND u.escrow_status = 'grading')
                OR (u.order_kind = 'merchant' AND u.escrow_status = 'authenticating')
            ))
            OR (p_tab = 'awaiting_outbound' AND (
                (u.order_kind = 'member' AND u.escrow_status = 'shipped' AND u.auth_result = 'passed')
                OR (u.order_kind = 'merchant' AND u.escrow_status = 'authenticated' AND u.auth_result = 'passed')
            ))
            OR (p_tab = 'awaiting_settlement' AND (
                u.auth_result = 'failed'
                AND u.fault_party = 'seller'
                AND u.seller_settlement_status = 'pending'
            ))
            OR (p_tab = 'closed' AND (
                (u.order_kind = 'member' AND u.escrow_status IN ('released', 'cancelled'))
                OR (u.order_kind = 'merchant' AND u.escrow_status IN ('completed_and_transferred', 'refunded'))
                OR u.refund_status = 'refunded'
            ))
        )
    )
    SELECT
        (SELECT COUNT(*)::BIGINT FROM filtered),
        COALESCE((
            SELECT jsonb_agg(to_jsonb(f) ORDER BY f.updated_at DESC NULLS LAST, f.created_at DESC)
            FROM (
                SELECT * FROM filtered
                ORDER BY updated_at DESC NULLS LAST, created_at DESC
                LIMIT v_limit OFFSET v_offset
            ) f
        ), '[]'::JSONB)
    INTO v_total, v_rows;

    RETURN jsonb_build_object(
        'rows', v_rows,
        'total', v_total,
        'page', GREATEST(COALESCE(p_page, 1), 1),
        'page_size', v_limit
    );
END;
$$;

REVOKE ALL ON FUNCTION public.search_admin_grading_orders(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_admin_grading_orders(TEXT, TEXT, TEXT, INTEGER, INTEGER)
    TO authenticated, service_role;
