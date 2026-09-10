-- E2E/integration: merchant auth order passed + outbound but payment still authorized (confirm guard negative).

CREATE OR REPLACE FUNCTION public.rpc_e2e_seed_merchant_auth_confirm_guard_order(
    p_listing_id UUID,
    p_buyer_id UUID,
    p_payment_intent_suffix TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id UUID;
    v_suffix TEXT;
    v_item_subtotal NUMERIC := 100;
    v_auth_fee NUMERIC := 150;
    v_inbound NUMERIC := 30;
    v_outbound NUMERIC := 30;
    v_buyer_total NUMERIC;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    v_order_id := public.rpc_e2e_seed_merchant_pending_payment_order(p_listing_id, p_buyer_id);
    v_suffix := COALESCE(NULLIF(btrim(p_payment_intent_suffix), ''), v_order_id::TEXT);
    v_buyer_total := v_item_subtotal + v_auth_fee + v_inbound + v_outbound;

    UPDATE public.merchant_orders
    SET
        requires_authentication = true,
        escrow_capture_model = 'single',
        escrow_status = 'authenticated'::public.escrow_state,
        auth_result = 'passed',
        outbound_tracking_no = 'SF-CONF-GUARD-' || v_suffix,
        payment_capture_status = 'authorized'::public.payment_capture_status,
        stripe_payment_intent_id = 'pi_conf_guard_' || v_suffix,
        item_subtotal = v_item_subtotal,
        auth_fee = v_auth_fee,
        inbound_shipping_fee = v_inbound,
        outbound_shipping_fee = v_outbound,
        total_amount = v_buyer_total,
        buyer_total_amount = v_buyer_total,
        payout_status = 'pending',
        buyer_confirmed_at = NULL,
        payout_hold_until = NULL,
        updated_at = now()
    WHERE id = v_order_id;

    RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_e2e_seed_merchant_auth_confirm_guard_order(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_seed_merchant_auth_confirm_guard_order(UUID, UUID, TEXT)
    TO service_role;
