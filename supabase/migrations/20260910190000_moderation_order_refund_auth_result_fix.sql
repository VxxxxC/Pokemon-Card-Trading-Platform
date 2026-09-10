-- Fix: auth_result is TEXT, not enum public.auth_result.

CREATE OR REPLACE FUNCTION public.fn_moderation_order_refund_eligible(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_kind TEXT;
    v_eligible BOOLEAN := false;
    v_reason TEXT := NULL;
    v_window_ends TIMESTAMPTZ;
    v_payout_hold TIMESTAMPTZ;
    v_buyer_total NUMERIC;
    v_eligible_amount NUMERIC;
    v_refund_status TEXT;
BEGIN
    v_kind := public.fn_moderation_derive_order_kind(p_order_id);

    IF v_kind = 'unsupported' THEN
        RETURN jsonb_build_object(
            'eligible', false,
            'ineligibleReason', '找不到訂單',
            'orderKind', v_kind
        );
    END IF;

    IF v_kind = 'member_p2p' THEN
        RETURN jsonb_build_object(
            'eligible', false,
            'ineligibleReason', 'P2P 訂單不支援售後退款',
            'orderKind', v_kind
        );
    END IF;

    IF v_kind IN ('merchant_direct', 'merchant_auth') THEN
        SELECT
            mo.buyer_confirmed_at IS NOT NULL
                AND mo.payout_hold_until IS NOT NULL
                AND now() <= mo.payout_hold_until
                AND mo.payout_status IN ('held', 'frozen')
                AND mo.stripe_transfer_id IS NULL
                AND mo.escrow_status NOT IN (
                    'refunded'::public.escrow_state,
                    'completed_and_transferred'::public.escrow_state
                )
                AND mo.payment_capture_status = 'fully_captured'::public.payment_capture_status
                AND (
                    mo.refund_status IS NULL
                    OR btrim(mo.refund_status) = ''
                    OR lower(btrim(mo.refund_status)) IN ('none', 'failed')
                )
                AND (
                    (v_kind = 'merchant_direct' AND COALESCE(mo.requires_authentication, false) = false)
                    OR (
                        v_kind = 'merchant_auth'
                        AND COALESCE(mo.requires_authentication, false) = true
                        AND mo.auth_result = 'passed'
                    )
                ),
            CASE
                WHEN mo.buyer_confirmed_at IS NULL THEN '買家尚未確認收貨'
                WHEN mo.payout_hold_until IS NULL OR now() > mo.payout_hold_until THEN '已過售後退款窗口'
                WHEN mo.stripe_transfer_id IS NOT NULL THEN '已出款至商戶'
                WHEN mo.escrow_status IN (
                    'refunded'::public.escrow_state,
                    'completed_and_transferred'::public.escrow_state
                ) THEN '訂單已結案或已退款'
                WHEN mo.payment_capture_status IS DISTINCT FROM 'fully_captured'::public.payment_capture_status THEN '款項尚未全額 capture'
                WHEN lower(btrim(COALESCE(mo.refund_status, ''))) = 'refunded' THEN '已退款'
                WHEN lower(btrim(COALESCE(mo.refund_status, ''))) = 'processing' THEN '退款處理中'
                WHEN v_kind = 'merchant_auth' AND mo.auth_result IS DISTINCT FROM 'passed' THEN '鑑定尚未通過'
                ELSE '不符合退款條件'
            END,
            mo.payout_hold_until,
            mo.payout_hold_until,
            COALESCE(mo.buyer_total_amount, mo.total_amount, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount, 0),
            lower(btrim(COALESCE(mo.refund_status, 'none')))
        INTO v_eligible, v_reason, v_window_ends, v_payout_hold, v_buyer_total, v_eligible_amount, v_refund_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id;
    ELSE
        SELECT
            mo.buyer_confirmed_at IS NOT NULL
                AND mo.payout_hold_until IS NOT NULL
                AND now() <= mo.payout_hold_until
                AND mo.seller_payout_status = 'held'::public.member_seller_payout_status
                AND mo.payment_capture_status = 'fully_captured'::public.payment_capture_status
                AND mo.escrow_status IN (
                    'shipped'::public.member_escrow_status,
                    'released'::public.member_escrow_status
                )
                AND mo.auth_result = 'passed'
                AND (
                    mo.refund_status IS NULL
                    OR btrim(mo.refund_status) = ''
                    OR lower(btrim(mo.refund_status)) IN ('none', 'failed')
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM public.payout_requests pr
                    WHERE pr.order_id = mo.id
                      AND pr.status = 'completed'::public.payout_request_status
                ),
            CASE
                WHEN mo.buyer_confirmed_at IS NULL THEN '買家尚未確認收貨'
                WHEN mo.payout_hold_until IS NULL OR now() > mo.payout_hold_until THEN '已過售後退款窗口'
                WHEN mo.seller_payout_status IS DISTINCT FROM 'held'::public.member_seller_payout_status THEN '賣家出款狀態不允許退款'
                WHEN EXISTS (
                    SELECT 1 FROM public.payout_requests pr
                    WHERE pr.order_id = mo.id AND pr.status = 'paid'::public.payout_request_status
                ) THEN '賣家已 FPS 出款'
                WHEN mo.auth_result IS DISTINCT FROM 'passed' THEN '鑑定尚未通過'
                WHEN lower(btrim(COALESCE(mo.refund_status, ''))) = 'refunded' THEN '已退款'
                WHEN lower(btrim(COALESCE(mo.refund_status, ''))) = 'processing' THEN '退款處理中'
                ELSE '不符合退款條件'
            END,
            mo.payout_hold_until,
            mo.payout_hold_until,
            COALESCE(mo.buyer_total_amount, mo.total_amount, 0),
            COALESCE(mo.item_subtotal, mo.final_price, 0) + COALESCE(mo.outbound_shipping_fee, 0),
            lower(btrim(COALESCE(mo.refund_status, 'none')))
        INTO v_eligible, v_reason, v_window_ends, v_payout_hold, v_buyer_total, v_eligible_amount, v_refund_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'eligible', false,
            'ineligibleReason', '找不到訂單',
            'orderKind', v_kind
        );
    END IF;

    RETURN jsonb_build_object(
        'eligible', COALESCE(v_eligible, false),
        'ineligibleReason', CASE WHEN COALESCE(v_eligible, false) THEN NULL ELSE v_reason END,
        'orderKind', v_kind,
        'refundWindowEndsAt', v_window_ends,
        'payoutHoldUntil', v_payout_hold,
        'buyerTotalAmount', v_buyer_total,
        'eligibleRefundAmount', v_eligible_amount,
        'refundStatus', v_refund_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_moderation_order_refund_eligible(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_moderation_order_refund_eligible(UUID)
    TO authenticated, service_role;
