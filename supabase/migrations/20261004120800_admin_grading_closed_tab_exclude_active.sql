-- Closed tab: exclude seller-fault orders still in awaiting_settlement or recovery_tracking.

CREATE OR REPLACE FUNCTION public.search_admin_grading_orders(
    p_tab TEXT,
    p_order_kind TEXT DEFAULT NULL,
    p_keyword TEXT DEFAULT NULL,
    p_page INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_offset INTEGER;
    v_limit INTEGER;
    v_keyword TEXT;
    v_rows JSONB;
    v_total BIGINT;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_limit := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 50);
    v_offset := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_limit;
    v_keyword := NULLIF(trim(COALESCE(p_keyword, '')), '');

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
    ),
    filtered AS (
        SELECT *
        FROM unified u
        WHERE (
            p_order_kind IS NULL
            OR btrim(p_order_kind) = ''
            OR u.order_kind = p_order_kind
        )
        AND (
            v_keyword IS NULL
            OR u.order_number ILIKE '%' || v_keyword || '%'
            OR u.order_id::TEXT = v_keyword
            OR u.buyer_display_name ILIKE '%' || v_keyword || '%'
            OR u.buyer_username ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.seller_display_name, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.seller_username, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.shop_name, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.inbound_tracking_no, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.outbound_tracking_no, '') ILIKE '%' || v_keyword || '%'
        )
        AND (
            (p_tab = 'awaiting_intake' AND (
                (u.order_kind = 'member' AND u.escrow_status = 'custody' AND u.inbound_tracking_no IS NOT NULL)
                OR (u.order_kind = 'merchant' AND u.escrow_status = 'payment_held' AND u.inbound_tracking_no IS NOT NULL)
            ))
            OR (p_tab = 'grading' AND (
                (u.order_kind = 'member' AND u.escrow_status = 'grading')
                OR (u.order_kind = 'merchant' AND u.escrow_status = 'authenticating')
            ))
            OR (p_tab = 'awaiting_outbound' AND (
                (u.order_kind = 'member' AND u.escrow_status = 'shipped' AND u.auth_result = 'passed')
                OR (u.order_kind = 'merchant' AND u.escrow_status = 'authenticated' AND u.auth_result = 'passed')
            ))
            OR (p_tab = 'awaiting_settlement' AND (
                u.auth_result = 'failed'
                AND u.fault_party = 'seller'
                AND (
                    u.seller_settlement_status = 'pending'
                    OR (
                        u.seller_settlement_status = 'cleared'
                        AND (u.outbound_tracking_no IS NULL OR btrim(u.outbound_tracking_no) = '')
                    )
                )
            ))
            OR (p_tab = 'recovery_tracking' AND (
                u.order_kind = 'merchant'
                AND u.auth_result = 'failed'
                AND u.fault_party = 'seller'
                AND u.seller_settlement_status = 'cleared'
                AND u.outbound_tracking_no IS NOT NULL
                AND btrim(u.outbound_tracking_no) <> ''
                AND COALESCE(u.recovery_remaining_hkd, 0) > 0
            ))
            OR (p_tab = 'closed' AND (
                (
                    (u.order_kind = 'member' AND u.escrow_status IN ('released', 'cancelled'))
                    OR (u.order_kind = 'merchant' AND u.escrow_status IN ('completed_and_transferred', 'refunded'))
                    OR u.refund_status = 'refunded'
                )
                AND NOT (
                    u.auth_result = 'failed'
                    AND u.fault_party = 'seller'
                    AND (
                        u.seller_settlement_status = 'pending'
                        OR (
                            u.seller_settlement_status = 'cleared'
                            AND (u.outbound_tracking_no IS NULL OR btrim(u.outbound_tracking_no) = '')
                        )
                        OR (
                            u.order_kind = 'merchant'
                            AND u.seller_settlement_status = 'cleared'
                            AND u.outbound_tracking_no IS NOT NULL
                            AND btrim(u.outbound_tracking_no) <> ''
                            AND COALESCE(u.recovery_remaining_hkd, 0) > 0
                        )
                    )
                )
            ))
        )
    )
    SELECT
        (SELECT COUNT(*)::BIGINT FROM filtered),
        COALESCE((
            SELECT jsonb_agg(to_jsonb(f) ORDER BY f.updated_at DESC NULLS LAST, f.created_at DESC)
            FROM (
                SELECT * FROM filtered
                ORDER BY updated_at DESC NULLS LAST, created_at DESC
                LIMIT v_limit OFFSET v_offset
            ) f
        ), '[]'::JSONB)
    INTO v_total, v_rows;

    RETURN jsonb_build_object(
        'rows', v_rows,
        'total', v_total,
        'page', GREATEST(COALESCE(p_page, 1), 1),
        'page_size', v_limit
    );
END;
$$;

REVOKE ALL ON FUNCTION public.search_admin_grading_orders(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_admin_grading_orders(TEXT, TEXT, TEXT, INTEGER, INTEGER)
    TO authenticated, service_role;
