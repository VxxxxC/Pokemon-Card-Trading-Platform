-- E2E/integration: merchant direct order shipped, paid, awaiting buyer confirm (no commission snapshot).

CREATE OR REPLACE FUNCTION public.rpc_e2e_seed_merchant_shipped_awaiting_confirm(
    p_listing_id UUID,
    p_buyer_id UUID,
    p_payment_intent_suffix TEXT DEFAULT NULL,
    p_item_subtotal NUMERIC DEFAULT 100
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id UUID;
    v_suffix TEXT;
    v_shipping_fee NUMERIC := 10;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    v_order_id := public.rpc_e2e_seed_merchant_pending_payment_order(p_listing_id, p_buyer_id);
    v_suffix := COALESCE(NULLIF(btrim(p_payment_intent_suffix), ''), v_order_id::TEXT);

    UPDATE public.merchant_orders
    SET
        escrow_status = 'shipped'::public.escrow_state,
        payment_capture_status = 'fully_captured'::public.payment_capture_status,
        stripe_payment_intent_id = 'pi_comm_' || v_suffix,
        item_subtotal = p_item_subtotal,
        shipping_fee = v_shipping_fee,
        total_amount = p_item_subtotal + v_shipping_fee,
        buyer_total_amount = p_item_subtotal + v_shipping_fee,
        payout_status = 'pending',
        buyer_confirmed_at = NULL,
        payout_hold_until = NULL,
        commission_rate_applied = NULL,
        commission_amount = NULL,
        merchant_payout_amount = NULL,
        merchant_payout_gross = NULL,
        updated_at = now()
    WHERE id = v_order_id;

    RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_e2e_seed_merchant_shipped_awaiting_confirm(UUID, UUID, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_seed_merchant_shipped_awaiting_confirm(UUID, UUID, TEXT, NUMERIC)
    TO service_role;
