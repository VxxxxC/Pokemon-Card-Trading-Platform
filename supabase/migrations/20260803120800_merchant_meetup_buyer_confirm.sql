-- Meetup B2C: buyer may confirm at payment_held (P2P-aligned); courier still requires shipped.

CREATE OR REPLACE FUNCTION public.rpc_prepare_merchant_order_payout(
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
    v_escrow_status public.escrow_state;
    v_requires_auth BOOLEAN;
    v_auth_result TEXT;
    v_outbound_tracking TEXT;
    v_payment_capture_status public.payment_capture_status;
    v_shipping_method TEXT;
    v_item_subtotal NUMERIC;
    v_shipping_fee NUMERIC;
    v_auth_fee NUMERIC;
    v_total_amount NUMERIC;
    v_payment_intent_id TEXT;
    v_existing_rate NUMERIC;
    v_existing_commission NUMERIC;
    v_existing_payout NUMERIC;
    v_existing_transfer_id TEXT;
    v_existing_destination TEXT;
    v_kyc_status public.kyc_state;
    v_charges_enabled BOOLEAN;
    v_payouts_enabled BOOLEAN;
    v_destination TEXT;
    v_commission_rate CONSTANT NUMERIC := 0.08;
    v_commission NUMERIC;
    v_payout NUMERIC;
    v_result_order_id UUID;
BEGIN
    SELECT
        mo.buyer_id,
        mo.merchant_id,
        mo.escrow_status,
        COALESCE(mo.requires_authentication, false),
        mo.auth_result,
        mo.outbound_tracking_no,
        mo.payment_capture_status,
        mo.shipping_method,
        mo.item_subtotal,
        mo.shipping_fee,
        mo.auth_fee,
        mo.total_amount,
        mo.stripe_payment_intent_id,
        mo.commission_rate_applied,
        mo.commission_amount,
        mo.merchant_payout_amount,
        mo.stripe_transfer_id,
        mo.stripe_destination_account_id
    INTO
        v_buyer_id,
        v_merchant_id,
        v_escrow_status,
        v_requires_auth,
        v_auth_result,
        v_outbound_tracking,
        v_payment_capture_status,
        v_shipping_method,
        v_item_subtotal,
        v_shipping_fee,
        v_auth_fee,
        v_total_amount,
        v_payment_intent_id,
        v_existing_rate,
        v_existing_commission,
        v_existing_payout,
        v_existing_transfer_id,
        v_existing_destination
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
       AND v_escrow_status = 'completed_and_transferred'::public.escrow_state THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'order_id', p_order_id,
            'stripe_transfer_id', v_existing_transfer_id
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
        -- meetup: buyer may confirm at payment_held (P2P-aligned)
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
    v_auth_fee := COALESCE(v_auth_fee, 0);

    IF v_total_amount IS DISTINCT FROM
       (v_item_subtotal + v_shipping_fee + v_auth_fee) THEN
        RAISE EXCEPTION '訂單金額明細不一致，已攔截撥款。';
    END IF;

    v_commission := round(v_item_subtotal * v_commission_rate, 2);
    v_payout := round(v_item_subtotal - v_commission + v_shipping_fee, 2);

    IF v_payout <= 0 OR v_payout > v_total_amount THEN
        RAISE EXCEPTION '商戶撥款金額異常，已攔截撥款。';
    END IF;

    IF v_existing_rate IS NOT NULL
       AND (
           v_existing_rate IS DISTINCT FROM v_commission_rate
           OR v_existing_commission IS DISTINCT FROM v_commission
           OR v_existing_payout IS DISTINCT FROM v_payout
           OR v_existing_destination IS DISTINCT FROM v_destination
       ) THEN
        RAISE EXCEPTION '訂單撥款快照不一致，需由管理員處理。';
    END IF;

    UPDATE public.merchant_orders
    SET
        commission_rate_applied = COALESCE(commission_rate_applied, v_commission_rate),
        commission_amount = COALESCE(commission_amount, v_commission),
        merchant_payout_amount = COALESCE(merchant_payout_amount, v_payout),
        stripe_destination_account_id = COALESCE(stripe_destination_account_id, v_destination),
        buyer_confirmed_at = COALESCE(buyer_confirmed_at, now()),
        payout_status = 'processing',
        payout_attempted_at = now(),
        payout_error = NULL,
        updated_at = now()
    WHERE id = p_order_id
    RETURNING
        id,
        stripe_payment_intent_id,
        total_amount,
        commission_amount,
        merchant_payout_amount,
        stripe_destination_account_id
    INTO
        v_result_order_id,
        v_payment_intent_id,
        v_total_amount,
        v_commission,
        v_payout,
        v_destination;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_id', v_result_order_id,
        'stripe_payment_intent_id', v_payment_intent_id,
        'total_amount', v_total_amount,
        'commission_amount', v_commission,
        'merchant_payout_amount', v_payout,
        'stripe_destination_account_id', v_destination
    );
END;
$$;
