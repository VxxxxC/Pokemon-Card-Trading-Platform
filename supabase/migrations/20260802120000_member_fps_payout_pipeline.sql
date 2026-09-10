-- Member FPS payout pipeline (Phase 1A + 1B)
-- 1A: buyer confirm → T+3 hold on member_orders
-- 1B: cron RPCs → insert payout_requests when hold elapses

-- ---------------------------------------------------------------------------
-- 1A. rpc_confirm_buyer_received — set buyer_confirmed_at + payout hold
-- ---------------------------------------------------------------------------

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
        AND outbound_tracking_no IS NOT NULL
        AND btrim(outbound_tracking_no) <> '';

    IF NOT FOUND THEN
        RAISE EXCEPTION '確認收貨失敗：訂單狀態不合法、鑑定未通過或尚未出庫。';
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

-- ---------------------------------------------------------------------------
-- 1B. Cron: list orders ready for payout_requests insert
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_list_member_fps_payout_ready_candidates(
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (order_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT mo.id AS order_id
    FROM public.member_orders mo
    WHERE mo.use_authentication = true
        AND mo.seller_payout_status = 'held'
        AND mo.payout_hold_until IS NOT NULL
        AND mo.payout_hold_until <= now()
        AND mo.buyer_confirmed_at IS NOT NULL
        AND mo.status = 'completed'
        AND mo.escrow_status = 'released'
        AND mo.payment_capture_status = 'fully_captured'
        AND (
            mo.refund_status IS NULL
            OR btrim(mo.refund_status) = ''
            OR lower(btrim(mo.refund_status)) = 'none'
        )
        AND NOT EXISTS (
            SELECT 1
            FROM public.payout_requests pr
            WHERE pr.order_id = mo.id
        )
    ORDER BY mo.payout_hold_until ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

-- ---------------------------------------------------------------------------
-- 1B. Cron: finalize single order → payout_requests + seller_payout_status ready
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_finalize_member_fps_payout_ready(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seller_id UUID;
    v_final_price NUMERIC;
    v_fps_id TEXT;
    v_snapshot TEXT;
    v_request_status public.payout_request_status;
    v_request_id UUID;
BEGIN
    SELECT mo.seller_id, mo.final_price, p.fps_id
    INTO v_seller_id, v_final_price, v_fps_id
    FROM public.member_orders mo
    INNER JOIN public.profiles p ON p.id = mo.seller_id
    WHERE mo.id = p_order_id
        AND mo.use_authentication = true
        AND mo.seller_payout_status = 'held'
        AND mo.payout_hold_until IS NOT NULL
        AND mo.payout_hold_until <= now()
        AND mo.buyer_confirmed_at IS NOT NULL
        AND mo.status = 'completed'
        AND mo.escrow_status = 'released'
        AND mo.payment_capture_status = 'fully_captured'
        AND (
            mo.refund_status IS NULL
            OR btrim(mo.refund_status) = ''
            OR lower(btrim(mo.refund_status)) = 'none'
        )
        AND NOT EXISTS (
            SELECT 1
            FROM public.payout_requests pr
            WHERE pr.order_id = mo.id
        );

    IF NOT FOUND THEN
        RAISE EXCEPTION '訂單不符合 FPS 出款條件或已處理';
    END IF;

    v_fps_id := NULLIF(btrim(v_fps_id), '');
    v_snapshot := COALESCE(v_fps_id, 'PENDING_FPS');
    v_request_status := CASE
        WHEN v_fps_id IS NOT NULL THEN 'ready'::public.payout_request_status
        ELSE 'pending'::public.payout_request_status
    END;

    INSERT INTO public.payout_requests (
        order_id,
        seller_id,
        amount,
        fps_id_snapshot,
        status,
        ready_at
    )
    VALUES (
        p_order_id,
        v_seller_id,
        v_final_price,
        v_snapshot,
        v_request_status,
        now()
    )
    ON CONFLICT (order_id) DO NOTHING
    RETURNING id INTO v_request_id;

    IF v_request_id IS NULL THEN
        SELECT pr.id INTO v_request_id
        FROM public.payout_requests pr
        WHERE pr.order_id = p_order_id;
    END IF;

    IF v_request_id IS NULL THEN
        RAISE EXCEPTION '無法建立 FPS 提現單';
    END IF;

    UPDATE public.member_orders
    SET
        seller_payout_status = 'ready',
        updated_at = now()
    WHERE id = p_order_id
        AND seller_payout_status = 'held';

    RETURN jsonb_build_object(
        'payout_request_id', v_request_id,
        'order_id', p_order_id,
        'status', v_request_status::text
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_list_member_fps_payout_ready_candidates(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_list_member_fps_payout_ready_candidates(INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_finalize_member_fps_payout_ready(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_member_fps_payout_ready(UUID) TO service_role;
