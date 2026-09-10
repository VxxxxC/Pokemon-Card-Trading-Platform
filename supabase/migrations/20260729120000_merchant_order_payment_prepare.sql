-- Payment Milestone 1：買家於 checkout 準備付款所需的 buyer-scoped 寫入。
--
-- merchant_orders 對 authenticated 只開放 SELECT（participant read policy），
-- 因此結帳期間的金額落單與 PaymentIntent 綁定一律經 SECURITY DEFINER RPC，
-- 由 DB 作為金額真理源，避免前端或 action 傳入被篡改的總額。

-- 平台結帳費率（與 lib/merchant-checkout/pricing.ts 的 UI 預覽值對齊，DB 為準）
CREATE OR REPLACE FUNCTION public.fn_merchant_checkout_shipping_fee(
    p_shipping_method TEXT
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE WHEN p_shipping_method = 'sf' THEN 30 ELSE 0 END::NUMERIC;
$$;

CREATE OR REPLACE FUNCTION public.fn_merchant_checkout_auth_fee(
    p_use_auth BOOLEAN
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE WHEN COALESCE(p_use_auth, false) THEN 150 ELSE 0 END::NUMERIC;
$$;

REVOKE ALL ON FUNCTION public.fn_merchant_checkout_shipping_fee(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_merchant_checkout_shipping_fee(TEXT)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_merchant_checkout_auth_fee(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_merchant_checkout_auth_fee(BOOLEAN)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 落單金額明細（買家於 checkout 選定配送方式 / 鑑定服務）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_prepare_merchant_order_payment(
    p_order_id UUID,
    p_shipping_method TEXT,
    p_use_auth BOOLEAN DEFAULT false
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
    v_final_price NUMERIC;
    v_escrow_status public.escrow_state;
    v_listing_accepts_auth BOOLEAN;
    v_shipping_fee NUMERIC;
    v_auth_fee NUMERIC;
    v_total NUMERIC;
    v_payment_intent_id TEXT;
BEGIN
    IF p_shipping_method IS NULL OR p_shipping_method NOT IN ('sf', 'meetup') THEN
        RAISE EXCEPTION '請選擇有效的配送方式。';
    END IF;

    SELECT
        mo.buyer_id,
        mo.merchant_id,
        mo.listing_id,
        mo.final_price,
        mo.escrow_status,
        mo.stripe_payment_intent_id,
        COALESCE(l.use_authentication, false)
    INTO
        v_buyer_id,
        v_merchant_id,
        v_listing_id,
        v_final_price,
        v_escrow_status,
        v_payment_intent_id,
        v_listing_accepts_auth
    FROM public.merchant_orders mo
    INNER JOIN public.listings l ON l.id = mo.listing_id
    WHERE mo.id = p_order_id
    FOR UPDATE OF mo;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF auth.uid() IS DISTINCT FROM v_buyer_id THEN
        RAISE EXCEPTION '保安攔截：僅買家本人可付款此訂單。';
    END IF;

    IF v_escrow_status IS DISTINCT FROM 'pending_payment'::public.escrow_state THEN
        RAISE EXCEPTION '此訂單並非待付款狀態，無法重複付款。';
    END IF;

    IF COALESCE(p_use_auth, false) AND NOT v_listing_accepts_auth THEN
        RAISE EXCEPTION '此賣家不接受平台鑑定加購服務，請關閉鑑定選項後再付款。';
    END IF;

    v_shipping_fee := public.fn_merchant_checkout_shipping_fee(p_shipping_method);
    v_auth_fee := public.fn_merchant_checkout_auth_fee(p_use_auth);
    v_total := v_final_price + v_shipping_fee + v_auth_fee;

    UPDATE public.merchant_orders
    SET
        item_subtotal = v_final_price,
        shipping_fee = v_shipping_fee,
        auth_fee = v_auth_fee,
        shipping_method = p_shipping_method,
        total_amount = v_total,
        requires_authentication = COALESCE(p_use_auth, false),
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'order_id', p_order_id,
        'buyer_id', v_buyer_id,
        'merchant_id', v_merchant_id,
        'listing_id', v_listing_id,
        'item_subtotal', v_final_price,
        'shipping_fee', v_shipping_fee,
        'auth_fee', v_auth_fee,
        'total_amount', v_total,
        'shipping_method', p_shipping_method,
        'requires_authentication', COALESCE(p_use_auth, false),
        'stripe_payment_intent_id', v_payment_intent_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_prepare_merchant_order_payment(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_merchant_order_payment(UUID, TEXT, BOOLEAN)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 綁定 PaymentIntent（一張待付款訂單只可對應一個 PI，避免重複收款）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_attach_merchant_order_payment_intent(
    p_order_id UUID,
    p_payment_intent_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id UUID;
    v_escrow_status public.escrow_state;
    v_existing_pi TEXT;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    SELECT buyer_id, escrow_status, stripe_payment_intent_id
    INTO v_buyer_id, v_escrow_status, v_existing_pi
    FROM public.merchant_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF auth.uid() IS DISTINCT FROM v_buyer_id THEN
        RAISE EXCEPTION '保安攔截：僅買家本人可付款此訂單。';
    END IF;

    IF v_escrow_status IS DISTINCT FROM 'pending_payment'::public.escrow_state THEN
        RAISE EXCEPTION '此訂單並非待付款狀態，無法綁定付款憑證。';
    END IF;

    UPDATE public.merchant_orders
    SET stripe_payment_intent_id = p_payment_intent_id,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'stripe_payment_intent_id', p_payment_intent_id,
        'replaced_payment_intent_id',
        CASE WHEN v_existing_pi IS DISTINCT FROM p_payment_intent_id THEN v_existing_pi ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_attach_merchant_order_payment_intent(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_attach_merchant_order_payment_intent(UUID, TEXT)
  TO authenticated, service_role;
