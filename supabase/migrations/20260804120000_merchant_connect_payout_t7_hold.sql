-- Merchant B2C: T+7 hold after buyer confirm; Connect transfer via cron when hold expires.

ALTER TABLE public.merchant_orders
    ADD COLUMN IF NOT EXISTS payout_hold_until TIMESTAMPTZ;

ALTER TABLE public.merchant_orders
    DROP CONSTRAINT IF EXISTS merchant_orders_payout_status_check;

ALTER TABLE public.merchant_orders
    ADD CONSTRAINT merchant_orders_payout_status_check
    CHECK (payout_status IN ('pending', 'held', 'processing', 'paid', 'failed', 'frozen'));

CREATE INDEX IF NOT EXISTS idx_merchant_orders_payout_hold_ready
    ON public.merchant_orders (payout_status, payout_hold_until)
    WHERE payout_status = 'held';

-- ---------------------------------------------------------------------------
-- Buyer confirm: snapshot + T+7 hold (no Stripe transfer)
-- ---------------------------------------------------------------------------

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
    v_auth_fee NUMERIC;
    v_total_amount NUMERIC;
    v_payment_intent_id TEXT;
    v_existing_transfer_id TEXT;
    v_buyer_confirmed_at TIMESTAMPTZ;
    v_kyc_status public.kyc_state;
    v_charges_enabled BOOLEAN;
    v_payouts_enabled BOOLEAN;
    v_destination TEXT;
    v_commission_rate CONSTANT NUMERIC := 0.08;
    v_commission NUMERIC;
    v_payout NUMERIC;
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
        mo.auth_fee,
        mo.total_amount,
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
        v_auth_fee,
        v_total_amount,
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

    UPDATE public.merchant_orders
    SET
        commission_rate_applied = v_commission_rate,
        commission_amount = v_commission,
        merchant_payout_amount = v_payout,
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

REVOKE ALL ON FUNCTION public.rpc_confirm_merchant_buyer_receipt(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_merchant_buyer_receipt(UUID)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Transfer prep (service_role / cron only): held + hold expired
-- ---------------------------------------------------------------------------

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
    v_buyer_confirmed_at TIMESTAMPTZ;
    v_payout_hold_until TIMESTAMPTZ;
    v_kyc_status public.kyc_state;
    v_charges_enabled BOOLEAN;
    v_payouts_enabled BOOLEAN;
    v_destination TEXT;
    v_commission_rate CONSTANT NUMERIC := 0.08;
    v_commission NUMERIC;
    v_payout NUMERIC;
    v_result_order_id UUID;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    SELECT
        mo.merchant_id,
        mo.escrow_status,
        mo.payout_status,
        mo.item_subtotal,
        mo.shipping_fee,
        mo.auth_fee,
        mo.total_amount,
        mo.stripe_payment_intent_id,
        mo.commission_rate_applied,
        mo.commission_amount,
        mo.merchant_payout_amount,
        mo.stripe_transfer_id,
        mo.stripe_destination_account_id,
        mo.buyer_confirmed_at,
        mo.payout_hold_until
    INTO
        v_merchant_id,
        v_escrow_status,
        v_payout_status,
        v_item_subtotal,
        v_shipping_fee,
        v_auth_fee,
        v_total_amount,
        v_payment_intent_id,
        v_existing_rate,
        v_existing_commission,
        v_existing_payout,
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

REVOKE ALL ON FUNCTION public.rpc_prepare_merchant_order_payout(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_prepare_merchant_order_payout(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_merchant_order_payout(UUID)
    TO service_role;

-- ---------------------------------------------------------------------------
-- Cron: list orders ready for Connect transfer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_list_merchant_connect_payout_candidates(
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (order_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT mo.id AS order_id
    FROM public.merchant_orders mo
    WHERE mo.payout_status = 'held'
        AND mo.payout_hold_until IS NOT NULL
        AND mo.payout_hold_until <= now()
        AND mo.buyer_confirmed_at IS NOT NULL
        AND mo.stripe_transfer_id IS NULL
        AND mo.merchant_payout_amount IS NOT NULL
        AND mo.merchant_payout_amount > 0
        AND mo.stripe_payment_intent_id IS NOT NULL
        AND btrim(mo.stripe_payment_intent_id) <> ''
        AND public.fn_merchant_order_is_open(mo.escrow_status)
        AND (
            mo.refund_status IS NULL
            OR btrim(mo.refund_status) = ''
            OR lower(btrim(mo.refund_status)) = 'none'
        )
    ORDER BY mo.payout_hold_until ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

REVOKE ALL ON FUNCTION public.rpc_list_merchant_connect_payout_candidates(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_list_merchant_connect_payout_candidates(INTEGER)
    TO service_role;

-- ---------------------------------------------------------------------------
-- Reviews: allow after buyer confirm (T+7 hold), not only after transfer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_submit_transaction_review(
    p_order_id UUID,
    p_reviewee_id UUID,
    p_rating INTEGER,
    p_comment TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_trimmed_comment TEXT;
    v_reviewee_persona public.review_persona;
    v_expected_reviewee UUID;
    v_member_order public.member_orders%ROWTYPE;
    v_merchant_order public.merchant_orders%ROWTYPE;
    v_review_id UUID;
    v_revealed BOOLEAN;
BEGIN
    IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
        RAISE EXCEPTION '請先登入後再提交評價';
    END IF;

    IF p_reviewee_id = p_user_id THEN
        RAISE EXCEPTION '無法評價自己';
    END IF;

    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION '請選擇 1 至 5 星評分';
    END IF;

    v_trimmed_comment := NULLIF(BTRIM(COALESCE(p_comment, '')), '');

    IF v_trimmed_comment IS NOT NULL AND char_length(v_trimmed_comment) > 200 THEN
        RAISE EXCEPTION '留言不可超過 200 字';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_reviewee_id) THEN
        RAISE EXCEPTION '找不到被評價用戶';
    END IF;

    SELECT * INTO v_member_order
    FROM public.member_orders
    WHERE id = p_order_id;

    IF FOUND THEN
        IF v_member_order.status <> 'completed' THEN
            RAISE EXCEPTION '僅能對已完成的交易提交評價';
        END IF;

        IF p_user_id NOT IN (v_member_order.buyer_id, v_member_order.seller_id) THEN
            RAISE EXCEPTION '您非此筆交易的關係人';
        END IF;

        IF p_user_id = v_member_order.buyer_id THEN
            v_expected_reviewee := v_member_order.seller_id;
        ELSE
            v_expected_reviewee := v_member_order.buyer_id;
        END IF;

        IF p_reviewee_id <> v_expected_reviewee THEN
            RAISE EXCEPTION '被評價對象與此訂單不符';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.transaction_reviews r
            WHERE r.reviewer_id = p_user_id
              AND r.member_order_id = p_order_id
        ) THEN
            RAISE EXCEPTION '您已評價過此筆交易';
        END IF;

        v_reviewee_persona := 'member'::public.review_persona;

        INSERT INTO public.transaction_reviews (
            reviewer_id,
            reviewee_id,
            reviewee_persona,
            member_order_id,
            merchant_order_id,
            rating,
            comment,
            is_public
        )
        VALUES (
            p_user_id,
            p_reviewee_id,
            v_reviewee_persona,
            p_order_id,
            NULL,
            p_rating,
            v_trimmed_comment,
            false
        )
        RETURNING id INTO v_review_id;

        v_revealed := public.fn_try_reveal_order_reviews(p_order_id, 'member');

        RETURN jsonb_build_object(
            'success', true,
            'review_id', v_review_id,
            'revealed', v_revealed
        );
    END IF;

    SELECT * INTO v_merchant_order
    FROM public.merchant_orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到此訂單';
    END IF;

    IF v_merchant_order.buyer_confirmed_at IS NULL
       AND v_merchant_order.escrow_status <> 'completed_and_transferred' THEN
        RAISE EXCEPTION '僅能對已完成的交易提交評價';
    END IF;

    IF p_user_id NOT IN (v_merchant_order.buyer_id, v_merchant_order.merchant_id) THEN
        RAISE EXCEPTION '您非此筆交易的關係人';
    END IF;

    IF p_user_id = v_merchant_order.buyer_id THEN
        v_expected_reviewee := v_merchant_order.merchant_id;
    ELSE
        v_expected_reviewee := v_merchant_order.buyer_id;
    END IF;

    IF p_reviewee_id <> v_expected_reviewee THEN
        RAISE EXCEPTION '被評價對象與此訂單不符';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.transaction_reviews r
        WHERE r.reviewer_id = p_user_id
          AND r.merchant_order_id = p_order_id
    ) THEN
        RAISE EXCEPTION '您已評價過此筆交易';
    END IF;

    IF p_reviewee_id = v_merchant_order.merchant_id THEN
        v_reviewee_persona := 'merchant'::public.review_persona;
    ELSE
        v_reviewee_persona := 'member'::public.review_persona;
    END IF;

    INSERT INTO public.transaction_reviews (
        reviewer_id,
        reviewee_id,
        reviewee_persona,
        member_order_id,
        merchant_order_id,
        rating,
        comment,
        is_public
    )
    VALUES (
        p_user_id,
        p_reviewee_id,
        v_reviewee_persona,
        NULL,
        p_order_id,
        p_rating,
        v_trimmed_comment,
        false
    )
    RETURNING id INTO v_review_id;

    v_revealed := public.fn_try_reveal_order_reviews(p_order_id, 'merchant');

    RETURN jsonb_build_object(
        'success', true,
        'review_id', v_review_id,
        'revealed', v_revealed
    );
END;
$$;
