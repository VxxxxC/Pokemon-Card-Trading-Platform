-- FPS manual transfer fee SSOT: code constant mirror + payout_requests snapshot columns.

CREATE OR REPLACE FUNCTION public.fn_platform_fps_manual_transfer_fee_hkd()
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT 0::NUMERIC;
$$;

REVOKE ALL ON FUNCTION public.fn_platform_fps_manual_transfer_fee_hkd() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_platform_fps_manual_transfer_fee_hkd()
    TO authenticated, service_role;

ALTER TABLE public.payout_requests
    ADD COLUMN IF NOT EXISTS gross_payout_hkd NUMERIC,
    ADD COLUMN IF NOT EXISTS fps_transfer_fee_hkd NUMERIC;

UPDATE public.payout_requests
SET
    gross_payout_hkd = amount,
    fps_transfer_fee_hkd = 0
WHERE gross_payout_hkd IS NULL;

ALTER TABLE public.payout_requests
    ALTER COLUMN gross_payout_hkd SET NOT NULL,
    ALTER COLUMN gross_payout_hkd SET DEFAULT 0,
    ALTER COLUMN fps_transfer_fee_hkd SET NOT NULL,
    ALTER COLUMN fps_transfer_fee_hkd SET DEFAULT 0;

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
    v_gross NUMERIC;
    v_fee NUMERIC;
    v_net NUMERIC;
    v_fps_id TEXT;
    v_fps_name TEXT;
    v_id_snapshot TEXT;
    v_name_snapshot TEXT;
    v_request_status public.payout_request_status;
    v_request_id UUID;
BEGIN
    SELECT
        mo.seller_id,
        COALESCE(mo.item_subtotal, mo.final_price) + COALESCE(mo.inbound_shipping_fee, 0),
        p.fps_id,
        p.fps_name
    INTO v_seller_id, v_gross, v_fps_id, v_fps_name
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

    v_fee := public.fn_platform_fps_manual_transfer_fee_hkd();
    v_net := GREATEST(COALESCE(v_gross, 0) - COALESCE(v_fee, 0), 0);

    v_fps_id := NULLIF(btrim(v_fps_id), '');
    v_fps_name := NULLIF(btrim(v_fps_name), '');
    v_id_snapshot := COALESCE(v_fps_id, 'PENDING_FPS');
    v_name_snapshot := COALESCE(v_fps_name, 'PENDING_FPS_NAME');
    v_request_status := CASE
        WHEN v_fps_id IS NOT NULL AND v_fps_name IS NOT NULL
            THEN 'ready'::public.payout_request_status
        ELSE 'pending'::public.payout_request_status
    END;

    INSERT INTO public.payout_requests (
        order_id,
        seller_id,
        amount,
        gross_payout_hkd,
        fps_transfer_fee_hkd,
        fps_id_snapshot,
        fps_name_snapshot,
        status,
        ready_at
    )
    VALUES (
        p_order_id,
        v_seller_id,
        v_net,
        v_gross,
        v_fee,
        v_id_snapshot,
        v_name_snapshot,
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
        'request_id', v_request_id,
        'status', v_request_status,
        'gross_payout_hkd', v_gross,
        'fps_transfer_fee_hkd', v_fee,
        'amount', v_net
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_finalize_member_fps_payout_ready(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_member_fps_payout_ready(UUID) TO service_role;
