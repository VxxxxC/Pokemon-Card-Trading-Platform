-- I-H14: prioritize report_context orders before LIMIT 20 in moderation order context
CREATE OR REPLACE FUNCTION public.admin_get_moderation_order_context(
  p_case_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject_user_id UUID;
  v_chat_room_id UUID;
  v_orders JSONB;
BEGIN
  PERFORM public._grading_require_admin();

  SELECT mc.subject_user_id
  INTO v_subject_user_id
  FROM public.moderation_cases mc
  WHERE mc.id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到案件';
  END IF;

  v_chat_room_id := public._moderation_resolve_chat_room_for_case(p_case_id);

  WITH reporters AS (
    SELECT DISTINCT r.reporter_id
    FROM public.reports r
    WHERE r.case_id = p_case_id
  ),
  order_refs AS (
    SELECT
      r.context_id AS order_id,
      CASE
        WHEN r.context_type = 'member_order' THEN 'member'::public.seller_persona_type
        ELSE 'merchant'::public.seller_persona_type
      END AS persona,
      'report_context'::TEXT AS source,
      1 AS priority
    FROM public.reports r
    WHERE r.case_id = p_case_id
      AND r.context_type IN ('member_order', 'merchant_order')
      AND r.context_id IS NOT NULL

    UNION ALL

    SELECT
      cm.member_order_id,
      'member'::public.seller_persona_type,
      'chat_message'::TEXT,
      2
    FROM public.chat_messages cm
    WHERE v_chat_room_id IS NOT NULL
      AND cm.room_id = v_chat_room_id
      AND cm.member_order_id IS NOT NULL

    UNION ALL

    SELECT
      cm.merchant_order_id,
      'merchant'::public.seller_persona_type,
      'chat_message'::TEXT,
      2
    FROM public.chat_messages cm
    WHERE v_chat_room_id IS NOT NULL
      AND cm.room_id = v_chat_room_id
      AND cm.merchant_order_id IS NOT NULL

    UNION ALL

    SELECT
      mo.id,
      'member'::public.seller_persona_type,
      'party_match'::TEXT,
      3
    FROM public.member_orders mo
    WHERE (
      mo.buyer_id = v_subject_user_id
      AND mo.seller_id IN (SELECT reporter_id FROM reporters)
    ) OR (
      mo.seller_id = v_subject_user_id
      AND mo.buyer_id IN (SELECT reporter_id FROM reporters)
    )

    UNION ALL

    SELECT
      mo.id,
      'merchant'::public.seller_persona_type,
      'party_match'::TEXT,
      3
    FROM public.merchant_orders mo
    WHERE (
      mo.merchant_id = v_subject_user_id
      AND mo.buyer_id IN (SELECT reporter_id FROM reporters)
    ) OR (
      mo.buyer_id = v_subject_user_id
      AND mo.merchant_id IN (SELECT reporter_id FROM reporters)
    )
  ),
  deduped AS (
    SELECT order_id, persona, source, priority
    FROM (
      SELECT DISTINCT ON (order_id, persona)
        order_id,
        persona,
        source,
        priority
      FROM order_refs
      WHERE order_id IS NOT NULL
      ORDER BY order_id, persona, priority ASC
    ) unique_refs
    ORDER BY priority ASC, order_id ASC
    LIMIT 20
  ),
  member_rows AS (
    SELECT
      d.order_id,
      d.persona,
      d.source,
      jsonb_build_object(
        'id', mo.id,
        'persona', 'member',
        'orderNumber', mo.order_number,
        'finalPrice', mo.final_price,
        'totalAmount', mo.total_amount,
        'status', mo.status::TEXT,
        'escrowStatus', mo.escrow_status::TEXT,
        'inboundTrackingNo', mo.inbound_tracking_no,
        'outboundTrackingNo', mo.outbound_tracking_no,
        'paidAt', mo.payment_confirmed_at,
        'buyerConfirmedAt', mo.buyer_confirmed_at,
        'createdAt', mo.created_at,
        'source', d.source,
        'useAuthentication', mo.use_authentication,
        'payoutHoldUntil', mo.payout_hold_until,
        'sellerPayoutStatus', mo.seller_payout_status::TEXT,
        'authResult', mo.auth_result::TEXT,
        'refundStatus', mo.refund_status,
        'orderKind', public.fn_moderation_derive_order_kind(mo.id),
        'refundEligible', (public.fn_moderation_order_refund_eligible(mo.id) ->> 'eligible')::BOOLEAN,
        'refundIneligibleReason', public.fn_moderation_order_refund_eligible(mo.id) ->> 'ineligibleReason',
        'refundWindowEndsAt', public.fn_moderation_order_refund_eligible(mo.id) ->> 'refundWindowEndsAt'
      ) AS row_json
    FROM deduped d
    JOIN public.member_orders mo ON mo.id = d.order_id
    WHERE d.persona = 'member'::public.seller_persona_type
  ),
  merchant_rows AS (
    SELECT
      d.order_id,
      d.persona,
      d.source,
      jsonb_build_object(
        'id', mo.id,
        'persona', 'merchant',
        'orderNumber', mo.order_number,
        'finalPrice', mo.final_price,
        'totalAmount', mo.total_amount,
        'status', NULL,
        'escrowStatus', mo.escrow_status::TEXT,
        'inboundTrackingNo', mo.inbound_tracking_no,
        'outboundTrackingNo', mo.outbound_tracking_no,
        'paidAt', mo.paid_at,
        'buyerConfirmedAt', mo.buyer_confirmed_at,
        'createdAt', mo.created_at,
        'source', d.source,
        'requiresAuthentication', mo.requires_authentication,
        'payoutHoldUntil', mo.payout_hold_until,
        'payoutStatus', mo.payout_status::TEXT,
        'authResult', mo.auth_result::TEXT,
        'refundStatus', mo.refund_status,
        'orderKind', public.fn_moderation_derive_order_kind(mo.id),
        'refundEligible', (public.fn_moderation_order_refund_eligible(mo.id) ->> 'eligible')::BOOLEAN,
        'refundIneligibleReason', public.fn_moderation_order_refund_eligible(mo.id) ->> 'ineligibleReason',
        'refundWindowEndsAt', public.fn_moderation_order_refund_eligible(mo.id) ->> 'refundWindowEndsAt'
      ) AS row_json
    FROM deduped d
    JOIN public.merchant_orders mo ON mo.id = d.order_id
    WHERE d.persona = 'merchant'::public.seller_persona_type
  ),
  combined AS (
    SELECT row_json FROM member_rows
    UNION ALL
    SELECT row_json FROM merchant_rows
  )
  SELECT COALESCE(
    jsonb_agg(c.row_json ORDER BY (c.row_json ->> 'createdAt') DESC NULLS LAST),
    '[]'::JSONB
  )
  INTO v_orders
  FROM combined c;

  RETURN COALESCE(v_orders, '[]'::JSONB);
END;
$$;
