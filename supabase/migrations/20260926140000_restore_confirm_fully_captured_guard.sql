-- Restore fully_captured guard on buyer confirm (keep FPS payout hold fields).

CREATE OR REPLACE FUNCTION public.rpc_confirm_buyer_received(
    p_order_id UUID,
    p_buyer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_listing_id UUID;
    v_seller_id UUID;
    v_final_price NUMERIC;
    v_updated RECORD;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_buyer_id THEN
        RAISE EXCEPTION '請先登入後再操作';
    END IF;

    SELECT listing_id, seller_id, final_price
    INTO v_listing_id, v_seller_id, v_final_price
    FROM public.member_orders
    WHERE id = p_order_id
        AND buyer_id = p_buyer_id
        AND use_authentication = true
        AND escrow_status = 'shipped'
        AND status = 'pending'
        AND auth_result = 'passed'
        AND payment_capture_status = 'fully_captured'::public.payment_capture_status
        AND outbound_tracking_no IS NOT NULL
        AND btrim(outbound_tracking_no) <> '';

    IF NOT FOUND THEN
        RAISE EXCEPTION '確認收貨失敗：訂單狀態不合法、鑑定未通過、款項未全額扣款或尚未出庫。';
    END IF;

    UPDATE public.member_orders
    SET
        escrow_status = 'released',
        status = 'completed',
        buyer_confirmed_at = now(),
        payout_hold_until = now() + interval '3 days',
        seller_payout_status = 'held',
        updated_at = now()
    WHERE id = p_order_id
    RETURNING * INTO v_updated;

    UPDATE public.listings SET status = 'sold' WHERE id = v_listing_id;

    PERFORM public.fn_archive_seller_collection_for_listing(
        v_listing_id,
        v_seller_id,
        v_final_price
    );

    RETURN jsonb_build_object('order', to_jsonb(v_updated));
END;
$$;
