-- Variable commission SSOT: platform_settings + fn_platform_commission_rate
-- Confirm snapshots current rate; prepare honours existing snapshot (T+7 safe).

INSERT INTO public.platform_settings (key, value)
VALUES (
    'platform_financial_config',
    '{"commissionRate": 0.08}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_platform_financial_config()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT ps.value
            FROM public.platform_settings ps
            WHERE ps.key = 'platform_financial_config'
        ),
        '{}'::jsonb
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_platform_commission_rate()
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_rate NUMERIC;
BEGIN
    v_rate := (public.fn_platform_financial_config() ->> 'commissionRate')::numeric;
    IF v_rate IS NULL OR v_rate < 0.01 OR v_rate > 0.20 THEN
        RETURN 0.08;
    END IF;
    RETURN v_rate;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_platform_financial_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_platform_financial_config()
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_platform_commission_rate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_platform_commission_rate()
    TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.rpc_confirm_merchant_buyer_receipt(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id UUID;
    v_merchant_id UUID;
    v_listing_id UUID;
    v_escrow_status public.escrow_state;
    v_requires_auth BOOLEAN;
    v_auth_result TEXT;
    v_outbound_tracking TEXT;
    v_payment_capture_status public.payment_capture_status;
    v_shipping_method TEXT;
    v_payout_status TEXT;
    v_item_subtotal NUMERIC;
    v_shipping_fee NUMERIC;
    v_inbound_shipping_fee NUMERIC;
    v_outbound_shipping_fee NUMERIC;
    v_auth_fee NUMERIC;
    v_total_amount NUMERIC;
    v_buyer_total NUMERIC;
    v_platform_subsidy NUMERIC;
    v_payment_intent_id TEXT;
    v_existing_transfer_id TEXT;
    v_buyer_confirmed_at TIMESTAMPTZ;
    v_kyc_status public.kyc_state;
    v_charges_enabled BOOLEAN;
    v_payouts_enabled BOOLEAN;
    v_destination TEXT;
    v_commission_rate NUMERIC;
    v_commission NUMERIC;
    v_gross NUMERIC;
BEGIN
    SELECT
        mo.buyer_id,
        mo.merchant_id,
        mo.listing_id,
        mo.escrow_status,
        COALESCE(mo.requires_authentication, false),
        mo.auth_result,
        mo.outbound_tracking_no,
        mo.payment_capture_status,
        mo.shipping_method,
        mo.payout_status,
        mo.item_subtotal,
        mo.shipping_fee,
        mo.inbound_shipping_fee,
        mo.outbound_shipping_fee,
        mo.auth_fee,
        mo.total_amount,
        COALESCE(mo.buyer_total_amount, mo.total_amount),
        COALESCE(mo.platform_subsidy_amount, 0),
        mo.stripe_payment_intent_id,
        mo.stripe_transfer_id,
        mo.buyer_confirmed_at
    INTO
        v_buyer_id,
        v_merchant_id,
        v_listing_id,
        v_escrow_status,
        v_requires_auth,
        v_auth_result,
        v_outbound_tracking,
        v_payment_capture_status,
        v_shipping_method,
        v_payout_status,
        v_item_subtotal,
        v_shipping_fee,
        v_inbound_shipping_fee,
        v_outbound_shipping_fee,
        v_auth_fee,
        v_total_amount,
        v_buyer_total,
        v_platform_subsidy,
        v_payment_intent_id,
        v_existing_transfer_id,
        v_buyer_confirmed_at
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id
    FOR UPDATE OF mo;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF auth.uid() IS DISTINCT FROM v_buyer_id THEN
        RAISE EXCEPTION '操作失敗：僅買家可確認完成交易。';
    END IF;

    IF v_existing_transfer_id IS NOT NULL
       OR v_escrow_status = 'completed_and_transferred'::public.escrow_state THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'order_id', p_order_id,
            'stripe_transfer_id', v_existing_transfer_id
        );
    END IF;

    IF v_buyer_confirmed_at IS NOT NULL
       AND v_payout_status IN ('held', 'processing', 'paid', 'frozen') THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'order_id', p_order_id
        );
    END IF;

    IF v_escrow_status = 'completed_and_transferred'::public.escrow_state THEN
        RAISE EXCEPTION '此訂單已由舊流程完成，需由管理員核對撥款。';
    END IF;

    IF v_requires_auth THEN
        IF v_escrow_status IS DISTINCT FROM 'authenticated'::public.escrow_state
           OR v_auth_result IS DISTINCT FROM 'passed'
           OR v_outbound_tracking IS NULL
           OR btrim(v_outbound_tracking) = ''
           OR v_payment_capture_status IS DISTINCT FROM 'fully_captured'::public.payment_capture_status THEN
            RAISE EXCEPTION '鑑定訂單尚未通過鑑定、款項未全額扣款或尚未出庫，無法確認收貨。';
        END IF;
    ELSIF COALESCE(v_shipping_method, 'sf') = 'meetup'
          AND v_escrow_status = 'payment_held'::public.escrow_state THEN
        NULL;
    ELSIF v_escrow_status IS DISTINCT FROM 'shipped'::public.escrow_state THEN
        RAISE EXCEPTION '商戶尚未發貨或訂單狀態不允許撥款。';
    END IF;

    SELECT
        kr.kyc_status,
        kr.stripe_charges_enabled,
        kr.stripe_payouts_enabled,
        kr.stripe_account_id
    INTO
        v_kyc_status,
        v_charges_enabled,
        v_payouts_enabled,
        v_destination
    FROM public.kyc_records kr
    WHERE kr.merchant_id = v_merchant_id
    LIMIT 1;

    IF NOT FOUND
       OR v_kyc_status IS DISTINCT FROM 'verified'::public.kyc_state
       OR NOT COALESCE(v_charges_enabled, false)
       OR NOT COALESCE(v_payouts_enabled, false)
       OR v_destination IS NULL
       OR btrim(v_destination) = '' THEN
        RAISE EXCEPTION '商戶收款帳戶尚未通過驗證，暫時無法撥款。';
    END IF;

    IF v_payment_intent_id IS NULL OR btrim(v_payment_intent_id) = '' THEN
        RAISE EXCEPTION '訂單缺少有效付款憑證，無法撥款。';
    END IF;

    IF v_item_subtotal IS NULL
       OR v_item_subtotal <= 0
       OR v_total_amount IS NULL
       OR v_total_amount <= 0 THEN
        RAISE EXCEPTION '訂單金額資料不完整，無法撥款。';
    END IF;

    v_shipping_fee := COALESCE(v_shipping_fee, 0);
    v_inbound_shipping_fee := COALESCE(v_inbound_shipping_fee, 0);
    v_outbound_shipping_fee := COALESCE(v_outbound_shipping_fee, 0);
    v_auth_fee := COALESCE(v_auth_fee, 0);

    v_commission_rate := public.fn_platform_commission_rate();

    IF v_requires_auth THEN
        IF v_total_amount IS DISTINCT FROM
           (v_item_subtotal + v_auth_fee + v_inbound_shipping_fee + v_outbound_shipping_fee) THEN
            RAISE EXCEPTION '訂單金額明細不一致，已攔截撥款。';
        END IF;

        v_commission := round(v_item_subtotal * v_commission_rate, 2);
        v_gross := round(v_item_subtotal - v_commission + v_inbound_shipping_fee, 2);
    ELSE
        IF v_total_amount IS DISTINCT FROM
           (v_item_subtotal + v_shipping_fee + v_auth_fee) THEN
            RAISE EXCEPTION '訂單金額明細不一致，已攔截撥款。';
        END IF;

        v_commission := round(v_item_subtotal * v_commission_rate, 2);
        v_gross := round(v_item_subtotal - v_commission + v_shipping_fee, 2);
    END IF;

    IF v_buyer_total IS DISTINCT FROM (v_total_amount - v_platform_subsidy) THEN
        RAISE EXCEPTION '買家實付金額與補貼記錄不一致，已攔截撥款。';
    END IF;

    IF v_gross <= 0 THEN
        RAISE EXCEPTION '商戶撥款金額異常，已攔截撥款。';
    END IF;

    UPDATE public.merchant_orders
    SET
        commission_rate_applied = v_commission_rate,
        commission_amount = v_commission,
        merchant_payout_gross = v_gross,
        merchant_payout_amount = v_gross,
        stripe_destination_account_id = v_destination,
        buyer_confirmed_at = now(),
        payout_hold_until = now() + interval '7 days',
        payout_status = 'held',
        payout_error = NULL,
        updated_at = now()
    WHERE id = p_order_id;

    UPDATE public.listings
    SET status = 'sold'
    WHERE id = v_listing_id;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_id', p_order_id,
        'payout_hold_until', (now() + interval '7 days')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_prepare_merchant_order_payout(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_merchant_id UUID;
    v_escrow_status public.escrow_state;
    v_payout_status TEXT;
    v_requires_auth BOOLEAN;
    v_item_subtotal NUMERIC;
    v_shipping_fee NUMERIC;
    v_inbound_shipping_fee NUMERIC;
    v_outbound_shipping_fee NUMERIC;
    v_auth_fee NUMERIC;
    v_total_amount NUMERIC;
    v_buyer_total NUMERIC;
    v_platform_subsidy NUMERIC;
    v_payment_intent_id TEXT;
    v_existing_rate NUMERIC;
    v_existing_commission NUMERIC;
    v_existing_gross NUMERIC;
    v_existing_transfer_id TEXT;
    v_existing_destination TEXT;
    v_buyer_confirmed_at TIMESTAMPTZ;
    v_payout_hold_until TIMESTAMPTZ;
    v_kyc_status public.kyc_state;
    v_charges_enabled BOOLEAN;
    v_payouts_enabled BOOLEAN;
    v_destination TEXT;
    v_commission_rate NUMERIC;
    v_commission NUMERIC;
    v_gross NUMERIC;
    v_net NUMERIC;
    v_total_deduction NUMERIC := 0;
    v_remaining_budget NUMERIC;
    v_apply NUMERIC;
    v_recovery_applications JSONB := '[]'::JSONB;
    v_recovery_row RECORD;
    v_result_order_id UUID;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    SELECT
        mo.merchant_id,
        mo.escrow_status,
        mo.payout_status,
        COALESCE(mo.requires_authentication, false),
        mo.item_subtotal,
        mo.shipping_fee,
        mo.inbound_shipping_fee,
        mo.outbound_shipping_fee,
        mo.auth_fee,
        mo.total_amount,
        COALESCE(mo.buyer_total_amount, mo.total_amount),
        COALESCE(mo.platform_subsidy_amount, 0),
        mo.stripe_payment_intent_id,
        mo.commission_rate_applied,
        mo.commission_amount,
        COALESCE(mo.merchant_payout_gross, mo.merchant_payout_amount),
        mo.stripe_transfer_id,
        mo.stripe_destination_account_id,
        mo.buyer_confirmed_at,
        mo.payout_hold_until
    INTO
        v_merchant_id,
        v_escrow_status,
        v_payout_status,
        v_requires_auth,
        v_item_subtotal,
        v_shipping_fee,
        v_inbound_shipping_fee,
        v_outbound_shipping_fee,
        v_auth_fee,
        v_total_amount,
        v_buyer_total,
        v_platform_subsidy,
        v_payment_intent_id,
        v_existing_rate,
        v_existing_commission,
        v_existing_gross,
        v_existing_transfer_id,
        v_existing_destination,
        v_buyer_confirmed_at,
        v_payout_hold_until
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id
    FOR UPDATE OF mo;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF v_existing_transfer_id IS NOT NULL
       AND v_escrow_status = 'completed_and_transferred'::public.escrow_state THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'order_id', p_order_id,
            'stripe_transfer_id', v_existing_transfer_id
        );
    END IF;

    IF v_escrow_status = 'completed_and_transferred'::public.escrow_state THEN
        RAISE EXCEPTION '此訂單已完成撥款。';
    END IF;

    IF v_payout_status = 'frozen' THEN
        RAISE EXCEPTION '訂單撥款已凍結，無法撥款。';
    END IF;

    IF v_buyer_confirmed_at IS NULL THEN
        RAISE EXCEPTION '買家尚未確認收貨。';
    END IF;

    IF v_payout_status IS DISTINCT FROM 'held' THEN
        RAISE EXCEPTION '訂單狀態不允許撥款。';
    END IF;

    IF v_payout_hold_until IS NULL OR v_payout_hold_until > now() THEN
        RAISE EXCEPTION '撥款保留期尚未屆滿。';
    END IF;

    IF v_existing_transfer_id IS NOT NULL THEN
        RAISE EXCEPTION '訂單已綁定 Stripe Transfer。';
    END IF;

    IF v_existing_destination IS NULL OR btrim(v_existing_destination) = '' THEN
        SELECT kr.stripe_account_id
        INTO v_destination
        FROM public.kyc_records kr
        WHERE kr.merchant_id = v_merchant_id
        LIMIT 1;
    ELSE
        v_destination := v_existing_destination;
    END IF;

    SELECT
        kr.kyc_status,
        kr.stripe_charges_enabled,
        kr.stripe_payouts_enabled,
        kr.stripe_account_id
    INTO
        v_kyc_status,
        v_charges_enabled,
        v_payouts_enabled,
        v_destination
    FROM public.kyc_records kr
    WHERE kr.merchant_id = v_merchant_id
    LIMIT 1;

    IF NOT FOUND
       OR v_kyc_status IS DISTINCT FROM 'verified'::public.kyc_state
       OR NOT COALESCE(v_charges_enabled, false)
       OR NOT COALESCE(v_payouts_enabled, false)
       OR v_destination IS NULL
       OR btrim(v_destination) = '' THEN
        RAISE EXCEPTION '商戶收款帳戶尚未通過驗證，暫時無法撥款。';
    END IF;

    IF v_payment_intent_id IS NULL OR btrim(v_payment_intent_id) = '' THEN
        RAISE EXCEPTION '訂單缺少有效付款憑證，無法撥款。';
    END IF;

    IF v_item_subtotal IS NULL
       OR v_item_subtotal <= 0
       OR v_total_amount IS NULL
       OR v_total_amount <= 0 THEN
        RAISE EXCEPTION '訂單金額資料不完整，無法撥款。';
    END IF;

    v_shipping_fee := COALESCE(v_shipping_fee, 0);
    v_inbound_shipping_fee := COALESCE(v_inbound_shipping_fee, 0);
    v_outbound_shipping_fee := COALESCE(v_outbound_shipping_fee, 0);
    v_auth_fee := COALESCE(v_auth_fee, 0);

    v_commission_rate := COALESCE(v_existing_rate, public.fn_platform_commission_rate());

    IF v_requires_auth THEN
        IF v_total_amount IS DISTINCT FROM
           (v_item_subtotal + v_auth_fee + v_inbound_shipping_fee + v_outbound_shipping_fee) THEN
            RAISE EXCEPTION '訂單金額明細不一致，已攔截撥款。';
        END IF;

        v_commission := round(v_item_subtotal * v_commission_rate, 2);
        v_gross := round(v_item_subtotal - v_commission + v_inbound_shipping_fee, 2);
    ELSE
        IF v_total_amount IS DISTINCT FROM
           (v_item_subtotal + v_shipping_fee + v_auth_fee) THEN
            RAISE EXCEPTION '訂單金額明細不一致，已攔截撥款。';
        END IF;

        v_commission := round(v_item_subtotal * v_commission_rate, 2);
        v_gross := round(v_item_subtotal - v_commission + v_shipping_fee, 2);
    END IF;

    IF v_buyer_total IS DISTINCT FROM (v_total_amount - v_platform_subsidy) THEN
        RAISE EXCEPTION '買家實付金額與補貼記錄不一致，已攔截撥款。';
    END IF;

    IF v_gross <= 0 THEN
        RAISE EXCEPTION '商戶撥款金額異常，已攔截撥款。';
    END IF;

    IF v_existing_rate IS NOT NULL
       AND (
           v_existing_rate IS DISTINCT FROM v_commission_rate
           OR v_existing_commission IS DISTINCT FROM v_commission
           OR v_existing_gross IS DISTINCT FROM v_gross
           OR v_existing_destination IS DISTINCT FROM v_destination
       ) THEN
        RAISE EXCEPTION '訂單撥款快照不一致，需由管理員處理。';
    END IF;

    v_remaining_budget := v_gross;

    FOR v_recovery_row IN
        SELECT
            r.recovery_order_id,
            r.remaining_hkd
        FROM public.fn_merchant_unsettled_grading_recovery(v_merchant_id) AS r
        WHERE r.recovery_order_id <> p_order_id
        ORDER BY r.recovery_created_at ASC
    LOOP
        EXIT WHEN v_remaining_budget <= 0;

        v_apply := LEAST(v_recovery_row.remaining_hkd, v_remaining_budget);
        IF v_apply <= 0 THEN
            CONTINUE;
        END IF;

        v_recovery_applications := v_recovery_applications || jsonb_build_array(
            jsonb_build_object(
                'recovery_order_id', v_recovery_row.recovery_order_id,
                'amount_applied', v_apply
            )
        );
        v_total_deduction := round(v_total_deduction + v_apply, 2);
        v_remaining_budget := round(v_remaining_budget - v_apply, 2);
    END LOOP;

    v_net := round(v_gross - v_total_deduction, 2);

    UPDATE public.merchant_orders
    SET
        commission_rate_applied = COALESCE(commission_rate_applied, v_commission_rate),
        commission_amount = COALESCE(commission_amount, v_commission),
        merchant_payout_gross = v_gross,
        merchant_payout_amount = v_net,
        stripe_destination_account_id = COALESCE(stripe_destination_account_id, v_destination),
        payout_status = 'processing',
        payout_attempted_at = now(),
        payout_error = NULL,
        updated_at = now()
    WHERE id = p_order_id
    RETURNING
        id,
        stripe_payment_intent_id,
        total_amount,
        COALESCE(buyer_total_amount, total_amount),
        commission_amount,
        merchant_payout_gross,
        merchant_payout_amount,
        stripe_destination_account_id
    INTO
        v_result_order_id,
        v_payment_intent_id,
        v_total_amount,
        v_buyer_total,
        v_commission,
        v_gross,
        v_net,
        v_destination;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_id', v_result_order_id,
        'stripe_payment_intent_id', v_payment_intent_id,
        'total_amount', v_total_amount,
        'buyer_total_amount', v_buyer_total,
        'commission_amount', v_commission,
        'merchant_payout_gross', v_gross,
        'merchant_payout_amount', v_net,
        'recovery_deduction_total', v_total_deduction,
        'recovery_applications', v_recovery_applications,
        'stripe_destination_account_id', v_destination
    );
END;
$$;
