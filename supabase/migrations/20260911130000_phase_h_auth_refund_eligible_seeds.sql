-- Phase H integration: e2e seeds for merchant_auth + member_auth refund-eligible orders.

CREATE OR REPLACE FUNCTION public.rpc_e2e_seed_merchant_auth_refund_eligible_order(
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
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    v_order_id := public.rpc_e2e_seed_merchant_pending_payment_order(p_listing_id, p_buyer_id);
    v_suffix := COALESCE(NULLIF(btrim(p_payment_intent_suffix), ''), v_order_id::TEXT);

    UPDATE public.merchant_orders
    SET
        requires_authentication = true,
        auth_result = 'passed',
        escrow_status = 'shipped'::public.escrow_state,
        payment_capture_status = 'fully_captured'::public.payment_capture_status,
        outbound_tracking_no = COALESCE(outbound_tracking_no, 'E2E-AUTH-OUT'),
        outbound_courier_name = COALESCE(outbound_courier_name, 'E2E Courier'),
        payout_status = 'held',
        buyer_confirmed_at = now(),
        payout_hold_until = now() + interval '5 days',
        stripe_payment_intent_id = 'pi_phase_h_' || v_suffix,
        buyer_total_amount = COALESCE(buyer_total_amount, total_amount, final_price, 100),
        total_amount = COALESCE(total_amount, final_price, 100),
        item_subtotal = COALESCE(item_subtotal, final_price, 90),
        shipping_fee = COALESCE(shipping_fee, 10),
        outbound_shipping_fee = COALESCE(outbound_shipping_fee, shipping_fee, 10),
        auth_fee = COALESCE(auth_fee, 0),
        refund_status = 'none',
        merchant_payout_amount = COALESCE(merchant_payout_amount, 80),
        updated_at = now()
    WHERE id = v_order_id;

    RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_e2e_seed_merchant_auth_refund_eligible_order(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_seed_merchant_auth_refund_eligible_order(UUID, UUID, TEXT)
    TO service_role;


CREATE OR REPLACE FUNCTION public.rpc_e2e_seed_member_auth_refund_eligible_order(
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
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION '保安攔截：此操作只限平台服務執行。';
    END IF;

    v_order_id := public.rpc_e2e_seed_member_auth_pending_payment_order(p_listing_id, p_buyer_id);
    v_suffix := COALESCE(NULLIF(btrim(p_payment_intent_suffix), ''), v_order_id::TEXT);

    UPDATE public.member_orders
    SET
        auth_result = 'passed',
        payment_capture_status = 'fully_captured'::public.payment_capture_status,
        escrow_status = 'released'::public.member_escrow_status,
        status = 'completed'::public.member_order_state,
        outbound_tracking_no = COALESCE(outbound_tracking_no, 'E2E-MEM-AUTH-OUT'),
        seller_payout_status = 'held'::public.member_seller_payout_status,
        buyer_confirmed_at = now(),
        payout_hold_until = now() + interval '3 days',
        stripe_payment_intent_id = 'pi_phase_h_' || v_suffix,
        total_amount = COALESCE(total_amount, final_price, 100),
        buyer_total_amount = COALESCE(buyer_total_amount, total_amount, final_price, 100),
        item_subtotal = COALESCE(item_subtotal, final_price, 90),
        outbound_shipping_fee = COALESCE(outbound_shipping_fee, 10),
        auth_fee = COALESCE(auth_fee, 0),
        refund_status = 'none',
        updated_at = now()
    WHERE id = v_order_id;

    RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_e2e_seed_member_auth_refund_eligible_order(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_seed_member_auth_refund_eligible_order(UUID, UUID, TEXT)
    TO service_role;
