-- Direct lookup for admin grading order detail page (no tab filter).

CREATE OR REPLACE FUNCTION public.get_admin_grading_order(
    p_order_kind TEXT,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row JSONB;
BEGIN
    PERFORM public._grading_require_admin();

    WITH unified AS (
        SELECT
            'member'::TEXT AS order_kind,
            mo.id AS order_id,
            mo.order_number,
            mo.buyer_id,
            mo.seller_id AS counterparty_seller_id,
            NULL::UUID AS merchant_id,
            mo.listing_id,
            COALESCE(mo.item_subtotal, mo.final_price) AS item_subtotal,
            COALESCE(mo.inbound_shipping_fee, 0) + COALESCE(mo.outbound_shipping_fee, 0) AS shipping_fee,
            mo.auth_fee,
            mo.total_amount,
            mo.buyer_total_amount,
            mo.inbound_shipping_fee,
            mo.outbound_shipping_fee,
            mo.escrow_capture_model,
            mo.inbound_tracking_no,
            mo.outbound_tracking_no,
            mo.auth_result,
            mo.refund_status,
            mo.refund_amount,
            mo.escrow_status::TEXT AS escrow_status,
            mo.platform_received_at,
            mo.auth_graded_at,
            mo.auth_grading_company,
            mo.auth_grading_score,
            mo.fault_party::TEXT AS fault_party,
            mo.seller_settlement_status::TEXT AS seller_settlement_status,
            sr.amount_hkd AS receivable_amount_hkd,
            sr.amount_hkd AS recovery_total_hkd,
            CASE
                WHEN sr.status = 'paid'::public.seller_receivable_status
                    THEN COALESCE(sr.amount_hkd, 0)
                ELSE 0
            END AS recovery_applied_hkd,
            CASE
                WHEN sr.status = 'paid'::public.seller_receivable_status
                    THEN 0
                ELSE COALESCE(sr.amount_hkd, 0)
            END AS recovery_remaining_hkd,
            mo.created_at,
            mo.updated_at,
            pb.display_name AS buyer_display_name,
            pb.username AS buyer_username,
            ps.display_name AS seller_display_name,
            ps.username AS seller_username,
            NULL::TEXT AS shop_name,
            pc.name_zh AS product_name_zh,
            pc.name_ja AS product_name_ja,
            pc.name_en AS product_name_en,
            l.grading_company,
            l.grading_score
        FROM public.member_orders mo
        JOIN public.profiles pb ON pb.id = mo.buyer_id
        JOIN public.profiles ps ON ps.id = mo.seller_id
        JOIN public.listings l ON l.id = mo.listing_id
        JOIN public.product_catalog pc ON pc.id = l.product_id
        LEFT JOIN public.seller_receivables sr
            ON sr.order_kind = 'member'
           AND sr.order_id = mo.id
        WHERE mo.use_authentication = true

        UNION ALL

        SELECT
            'merchant'::TEXT AS order_kind,
            mo.id AS order_id,
            mo.order_number,
            mo.buyer_id,
            NULL::UUID AS counterparty_seller_id,
            mo.merchant_id,
            mo.listing_id,
            COALESCE(mo.item_subtotal, mo.final_price) AS item_subtotal,
            COALESCE(mo.shipping_fee, 0) AS shipping_fee,
            mo.auth_fee,
            mo.total_amount,
            mo.buyer_total_amount,
            mo.inbound_shipping_fee,
            mo.outbound_shipping_fee,
            mo.escrow_capture_model,
            mo.inbound_tracking_no,
            mo.outbound_tracking_no,
            mo.auth_result,
            mo.refund_status,
            mo.refund_amount,
            mo.escrow_status::TEXT AS escrow_status,
            mo.platform_received_at,
            mo.auth_graded_at,
            mo.auth_grading_company,
            mo.auth_grading_score,
            mo.fault_party::TEXT AS fault_party,
            mo.seller_settlement_status::TEXT AS seller_settlement_status,
            recovery.total_hkd AS receivable_amount_hkd,
            recovery.total_hkd AS recovery_total_hkd,
            recovery.applied_hkd AS recovery_applied_hkd,
            GREATEST(
                0,
                round(
                    COALESCE(recovery.total_hkd, 0) - COALESCE(recovery.applied_hkd, 0),
                    2
                )
            ) AS recovery_remaining_hkd,
            mo.created_at,
            mo.updated_at,
            pb.display_name AS buyer_display_name,
            pb.username AS buyer_username,
            NULL::TEXT AS seller_display_name,
            NULL::TEXT AS seller_username,
            ms.shop_name,
            pc.name_zh AS product_name_zh,
            pc.name_ja AS product_name_ja,
            pc.name_en AS product_name_en,
            l.grading_company,
            l.grading_score
        FROM public.merchant_orders mo
        JOIN public.profiles pb ON pb.id = mo.buyer_id
        JOIN public.listings l ON l.id = mo.listing_id
        JOIN public.product_catalog pc ON pc.id = l.product_id
        LEFT JOIN public.merchant_shops ms ON ms.merchant_id = mo.merchant_id
        LEFT JOIN LATERAL (
            SELECT
                ABS(rec.amount) AS total_hkd,
                COALESCE(applied.amount, 0) AS applied_hkd
            FROM public.merchant_ledgers rec
            LEFT JOIN public.merchant_ledgers applied
                ON applied.order_id = rec.order_id
               AND applied.transaction_type = 'grading_fail_recovery_applied'::public.transaction_type
            WHERE rec.order_id = mo.id
              AND rec.transaction_type = 'grading_fail_recovery'::public.transaction_type
            LIMIT 1
        ) recovery ON true
        WHERE mo.requires_authentication = true
    )
    SELECT to_jsonb(u)
    INTO v_row
    FROM unified u
    WHERE u.order_kind = p_order_kind
      AND u.order_id = p_order_id
    LIMIT 1;

    IF v_row IS NULL THEN
        RETURN jsonb_build_object('row', NULL);
    END IF;

    RETURN jsonb_build_object('row', v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_grading_order(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_grading_order(TEXT, UUID)
    TO authenticated, service_role;
