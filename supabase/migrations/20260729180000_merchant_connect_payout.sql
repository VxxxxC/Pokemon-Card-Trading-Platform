-- Merchant B2C Payment Milestone 2
-- Buyer confirms receipt -> platform keeps 8% card commission + auth fee ->
-- remaining card proceeds and buyer-paid shipping transfer to Merchant Connect.

ALTER TABLE public.merchant_orders
    ADD COLUMN IF NOT EXISTS commission_rate_applied NUMERIC,
    ADD COLUMN IF NOT EXISTS commission_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS merchant_payout_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_destination_account_id TEXT,
    ADD COLUMN IF NOT EXISTS buyer_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payout_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS payout_attempted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payout_error TEXT;

ALTER TABLE public.merchant_orders
    DROP CONSTRAINT IF EXISTS merchant_orders_payout_status_check;

ALTER TABLE public.merchant_orders
    ADD CONSTRAINT merchant_orders_payout_status_check
    CHECK (payout_status IN ('pending', 'processing', 'paid', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_orders_stripe_transfer_id
    ON public.merchant_orders (stripe_transfer_id)
    WHERE stripe_transfer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_ledgers_order_transaction_type
    ON public.merchant_ledgers (order_id, transaction_type)
    WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_ledgers_stripe_transfer_id
    ON public.merchant_ledgers (stripe_transfer_id)
    WHERE stripe_transfer_id IS NOT NULL;

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
BEGIN
    SELECT
        mo.buyer_id,
        mo.merchant_id,
        mo.escrow_status,
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

    IF v_escrow_status NOT IN (
        'payment_held'::public.escrow_state,
        'authenticating'::public.escrow_state,
        'authenticated'::public.escrow_state
    ) THEN
        RAISE EXCEPTION '此訂單尚未完成付款或目前狀態不允許撥款。';
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
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_id', p_order_id,
        'merchant_id', v_merchant_id,
        'payment_intent_id', v_payment_intent_id,
        'stripe_account_id', v_destination,
        'item_subtotal', v_item_subtotal,
        'shipping_fee', v_shipping_fee,
        'auth_fee', v_auth_fee,
        'total_amount', v_total_amount,
        'commission_rate', v_commission_rate,
        'commission_amount', v_commission,
        'merchant_payout_amount', v_payout
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_prepare_merchant_order_payout(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_merchant_order_payout(UUID)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_finalize_merchant_order_payout(
    p_order_id UUID,
    p_transfer_id TEXT,
    p_transfer_amount_cents BIGINT,
    p_destination_account_id TEXT
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
    v_commission NUMERIC;
    v_payout NUMERIC;
    v_existing_transfer_id TEXT;
    v_destination TEXT;
    v_room_id UUID;
    v_message_id UUID;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    IF p_transfer_id IS NULL OR btrim(p_transfer_id) = '' THEN
        RAISE EXCEPTION '缺少 Stripe Transfer 識別碼。';
    END IF;

    SELECT
        mo.buyer_id,
        mo.merchant_id,
        mo.listing_id,
        mo.escrow_status,
        mo.commission_amount,
        mo.merchant_payout_amount,
        mo.stripe_transfer_id,
        mo.stripe_destination_account_id
    INTO
        v_buyer_id,
        v_merchant_id,
        v_listing_id,
        v_escrow_status,
        v_commission,
        v_payout,
        v_existing_transfer_id,
        v_destination
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id
    FOR UPDATE OF mo;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF v_payout IS NULL
       OR round(v_payout * 100)::BIGINT <> p_transfer_amount_cents
       OR v_destination IS DISTINCT FROM p_destination_account_id THEN
        RAISE EXCEPTION 'Stripe Transfer 與訂單撥款快照不符。';
    END IF;

    IF v_existing_transfer_id IS NOT NULL THEN
        IF v_existing_transfer_id <> p_transfer_id THEN
            RAISE EXCEPTION '訂單已綁定另一筆 Stripe Transfer。';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'stripe_transfer_id', v_existing_transfer_id
        );
    END IF;

    IF v_escrow_status NOT IN (
        'payment_held'::public.escrow_state,
        'authenticating'::public.escrow_state,
        'authenticated'::public.escrow_state
    ) THEN
        RAISE EXCEPTION '訂單狀態不允許完成撥款。';
    END IF;

    UPDATE public.merchant_orders
    SET
        stripe_transfer_id = p_transfer_id,
        payout_status = 'paid',
        payout_error = NULL,
        transferred_at = now(),
        escrow_status = 'completed_and_transferred'::public.escrow_state,
        updated_at = now()
    WHERE id = p_order_id;

    UPDATE public.listings
    SET status = 'sold'
    WHERE id = v_listing_id;

    INSERT INTO public.merchant_ledgers (
        merchant_id,
        order_id,
        amount,
        transaction_type
    )
    VALUES (
        v_merchant_id,
        p_order_id,
        v_commission,
        'commission_deduction'::public.transaction_type
    )
    ON CONFLICT (order_id, transaction_type)
        WHERE order_id IS NOT NULL
        DO NOTHING;

    INSERT INTO public.merchant_ledgers (
        merchant_id,
        order_id,
        amount,
        transaction_type,
        stripe_transfer_id
    )
    VALUES (
        v_merchant_id,
        p_order_id,
        v_payout,
        'payout'::public.transaction_type,
        p_transfer_id
    )
    ON CONFLICT (order_id, transaction_type)
        WHERE order_id IS NOT NULL
        DO NOTHING;

    SELECT cr.id
    INTO v_room_id
    FROM public.chat_rooms cr
    WHERE cr.buyer_id = v_buyer_id
      AND cr.seller_id = v_merchant_id
      AND cr.buyer_persona = 'member'::public.seller_persona_type
      AND cr.seller_persona = 'merchant'::public.seller_persona_type
    ORDER BY cr.updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_room_id IS NULL THEN
        SELECT cr.id
        INTO v_room_id
        FROM public.chat_rooms cr
        WHERE cr.buyer_id = v_buyer_id
          AND cr.seller_id = v_merchant_id
        ORDER BY cr.updated_at DESC NULLS LAST
        LIMIT 1;
    END IF;

    IF v_room_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM public.chat_messages cm
           WHERE cm.merchant_order_id = p_order_id
             AND cm.content = 'SYSTEM_ORDER_COMPLETED'
       ) THEN
        INSERT INTO public.chat_messages (
            room_id,
            sender_id,
            content,
            merchant_order_id,
            is_system_warning
        )
        VALUES (
            v_room_id,
            v_buyer_id,
            'SYSTEM_ORDER_COMPLETED',
            p_order_id,
            false
        )
        RETURNING id INTO v_message_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'stripe_transfer_id', p_transfer_id,
        'message_id', v_message_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_finalize_merchant_order_payout(UUID, TEXT, BIGINT, TEXT)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_merchant_order_payout(UUID, TEXT, BIGINT, TEXT)
    TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_mark_merchant_order_payout_failed(
    p_order_id UUID,
    p_error TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    UPDATE public.merchant_orders
    SET
        payout_status = 'failed',
        payout_error = left(COALESCE(NULLIF(btrim(p_error), ''), 'transfer_failed'), 300),
        updated_at = now()
    WHERE id = p_order_id
      AND stripe_transfer_id IS NULL
      AND payout_status <> 'paid';

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_merchant_order_payout_failed(UUID, TEXT)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_merchant_order_payout_failed(UUID, TEXT)
    TO service_role;

-- Old RPC could mark an order completed without a real Stripe Transfer.
REVOKE EXECUTE ON FUNCTION public.rpc_complete_merchant_order(UUID, UUID)
    FROM authenticated;
