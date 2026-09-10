-- Merge grading audit logs + merchant ledger recovery into one admin timeline.

CREATE OR REPLACE FUNCTION public.get_admin_grading_audit_history(
    p_order_kind TEXT,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_rows JSONB;
BEGIN
    v_admin_id := public._grading_require_admin();

    SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC), '[]'::JSONB)
    INTO v_rows
    FROM (
        SELECT
            gal.id::TEXT AS id,
            gal.order_kind,
            gal.order_id,
            gal.admin_id,
            'audit'::TEXT AS event_source,
            gal.action,
            gal.from_status,
            gal.to_status,
            gal.notes,
            gal.created_at,
            p.display_name AS admin_display_name,
            p.username AS admin_username,
            NULL::NUMERIC AS amount_hkd
        FROM public.grading_audit_logs gal
        JOIN public.profiles p ON p.id = gal.admin_id
        WHERE gal.order_kind = p_order_kind
          AND gal.order_id = p_order_id

        UNION ALL

        SELECT
            ml.id::TEXT AS id,
            p_order_kind AS order_kind,
            p_order_id AS order_id,
            NULL::UUID AS admin_id,
            'ledger'::TEXT AS event_source,
            CASE ml.transaction_type
                WHEN 'grading_fail_recovery'::public.transaction_type
                    THEN 'recovery_opened'
                WHEN 'grading_fail_recovery_applied'::public.transaction_type
                    THEN 'recovery_applied'
                ELSE ml.transaction_type::TEXT
            END AS action,
            NULL::TEXT AS from_status,
            NULL::TEXT AS to_status,
            CASE ml.transaction_type
                WHEN 'grading_fail_recovery'::public.transaction_type THEN
                    'merchant ledger 開立追償欠款'
                WHEN 'grading_fail_recovery_applied'::public.transaction_type THEN
                    'Connect 撥款抵扣 · 累計 HK$ '
                    || to_char(round(ml.amount, 2), 'FM999999990.00')
                    || CASE
                        WHEN round(
                            COALESCE(recovery_debt.total_hkd, 0) - COALESCE(ml.amount, 0),
                            2
                        ) > 0 THEN
                            ' · 尚欠 HK$ '
                            || to_char(
                                round(
                                    COALESCE(recovery_debt.total_hkd, 0) - COALESCE(ml.amount, 0),
                                    2
                                ),
                                'FM999999990.00'
                            )
                        ELSE ' · 已扣清'
                    END
                ELSE NULL
            END AS notes,
            ml.created_at,
            NULL::TEXT AS admin_display_name,
            NULL::TEXT AS admin_username,
            CASE ml.transaction_type
                WHEN 'grading_fail_recovery'::public.transaction_type
                    THEN round(ABS(ml.amount), 2)
                ELSE round(ml.amount, 2)
            END AS amount_hkd
        FROM public.merchant_ledgers ml
        LEFT JOIN LATERAL (
            SELECT ABS(rec.amount) AS total_hkd
            FROM public.merchant_ledgers rec
            WHERE rec.order_id = p_order_id
              AND rec.transaction_type = 'grading_fail_recovery'::public.transaction_type
            LIMIT 1
        ) recovery_debt ON true
        WHERE p_order_kind = 'merchant'
          AND ml.order_id = p_order_id
          AND ml.transaction_type IN (
              'grading_fail_recovery'::public.transaction_type,
              'grading_fail_recovery_applied'::public.transaction_type
          )

        UNION ALL

        SELECT
            sr.id::TEXT AS id,
            p_order_kind AS order_kind,
            p_order_id AS order_id,
            sr.paid_by AS admin_id,
            'receivable'::TEXT AS event_source,
            CASE
                WHEN sr.status = 'paid'::public.seller_receivable_status
                    THEN 'receivable_paid'
                ELSE 'receivable_opened'
            END AS action,
            NULL::TEXT AS from_status,
            NULL::TEXT AS to_status,
            CASE
                WHEN sr.status = 'paid'::public.seller_receivable_status THEN
                    COALESCE(
                        NULLIF(trim(COALESCE(sr.fps_reference, '')), ''),
                        'FPS 追償已確認'
                    )
                ELSE 'seller_receivables 開立追償'
            END AS notes,
            CASE
                WHEN sr.status = 'paid'::public.seller_receivable_status
                    THEN COALESCE(sr.paid_at, sr.updated_at)
                ELSE sr.created_at
            END AS created_at,
            payer.display_name AS admin_display_name,
            payer.username AS admin_username,
            round(sr.amount_hkd, 2) AS amount_hkd
        FROM public.seller_receivables sr
        LEFT JOIN public.profiles payer ON payer.id = sr.paid_by
        WHERE p_order_kind = 'member'
          AND sr.order_kind = 'member'
          AND sr.order_id = p_order_id
    ) l;

    RETURN jsonb_build_object('rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_grading_audit_history(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_grading_audit_history(TEXT, UUID)
    TO authenticated, service_role;
