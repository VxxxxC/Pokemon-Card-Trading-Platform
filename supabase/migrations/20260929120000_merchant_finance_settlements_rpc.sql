-- Merchant finance: paginated settlement list + month aggregate (RPC SSOT)

CREATE INDEX IF NOT EXISTS idx_merchant_orders_finance_settlements
  ON public.merchant_orders (merchant_id, transferred_at DESC NULLS LAST, payout_attempted_at DESC NULLS LAST)
  WHERE payout_status IN ('paid', 'processing', 'failed', 'held');

CREATE OR REPLACE FUNCTION public.rpc_list_merchant_finance_settlements(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 10,
  p_status_filter text DEFAULT 'all',
  p_sort text DEFAULT 'transferred_at-desc',
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_merchant_id uuid;
  v_page integer;
  v_page_size integer;
  v_status_filter text;
  v_sort text;
  v_search text;
  v_total bigint;
  v_total_pages integer;
  v_safe_page integer;
  v_offset integer;
  v_ascending boolean;
  v_result jsonb;
BEGIN
  v_merchant_id := auth.uid();
  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object('error', '未登入');
  END IF;

  v_page := GREATEST(1, COALESCE(p_page, 1));
  v_page_size := LEAST(50, GREATEST(5, COALESCE(p_page_size, 10)));
  v_status_filter := COALESCE(NULLIF(btrim(p_status_filter), ''), 'all');
  IF v_status_filter NOT IN ('all', 'paid', 'held', 'processing', 'failed') THEN
    v_status_filter := 'all';
  END IF;

  v_sort := COALESCE(NULLIF(btrim(p_sort), ''), 'transferred_at-desc');
  IF v_sort NOT IN ('transferred_at-desc', 'transferred_at-asc') THEN
    v_sort := 'transferred_at-desc';
  END IF;
  v_ascending := v_sort = 'transferred_at-asc';

  v_search := NULLIF(btrim(p_search), '');
  IF v_search IS NOT NULL THEN
    v_search := replace(replace(replace(v_search, '%', ''), '_', ''), ',', '');
    IF v_search = '' THEN
      v_search := NULL;
    END IF;
  END IF;

  WITH filtered AS (
    SELECT
      mo.id,
      mo.order_number,
      mo.merchant_payout_amount,
      mo.commission_amount,
      mo.transferred_at,
      mo.paid_at,
      mo.payout_attempted_at,
      mo.payout_status,
      mo.payout_hold_until,
      mo.payout_error,
      mo.stripe_transfer_id,
      mo.stripe_payment_intent_id,
      COALESCE(
        NULLIF(btrim(pc.name_zh), ''),
        NULLIF(btrim(pc.name_en), ''),
        NULLIF(btrim(pc.name_ja), '')
      ) AS card_name,
      COALESCE(mo.transferred_at, mo.payout_attempted_at, mo.paid_at) AS settlement_at
    FROM public.merchant_orders mo
    INNER JOIN public.listings l ON l.id = mo.listing_id
    LEFT JOIN public.product_catalog pc ON pc.id = l.product_id
    WHERE mo.merchant_id = v_merchant_id
      AND mo.payout_status IN ('paid', 'processing', 'failed', 'held')
      AND (
        mo.merchant_payout_amount IS NOT NULL
        OR mo.payout_status IN ('failed', 'held')
      )
      AND (v_status_filter = 'all' OR mo.payout_status = v_status_filter)
      AND (p_date_from IS NULL OR mo.transferred_at >= p_date_from)
      AND (p_date_to IS NULL OR mo.transferred_at <= p_date_to)
      AND (
        v_search IS NULL
        OR mo.order_number ILIKE '%' || v_search || '%'
        OR mo.stripe_transfer_id ILIKE '%' || v_search || '%'
      )
  ),
  month_stats AS (
    SELECT COALESCE(SUM(mo.merchant_payout_amount), 0)::numeric AS month_earned
    FROM public.merchant_orders mo
    WHERE mo.merchant_id = v_merchant_id
      AND mo.payout_status = 'paid'
      AND COALESCE(mo.transferred_at, mo.paid_at) >= date_trunc('month', now())
      AND mo.merchant_payout_amount IS NOT NULL
  ),
  counted AS (
    SELECT COUNT(*)::bigint AS cnt FROM filtered
  )
  SELECT cnt INTO v_total FROM counted;

  v_total_pages := GREATEST(1, CEIL(v_total::numeric / v_page_size::numeric)::integer);
  v_safe_page := LEAST(v_page, v_total_pages);
  v_offset := (v_safe_page - 1) * v_page_size;

  WITH filtered AS (
    SELECT
      mo.id,
      mo.order_number,
      mo.merchant_payout_amount,
      mo.commission_amount,
      mo.payout_status,
      mo.payout_hold_until,
      mo.payout_error,
      mo.stripe_transfer_id,
      mo.stripe_payment_intent_id,
      COALESCE(
        NULLIF(btrim(pc.name_zh), ''),
        NULLIF(btrim(pc.name_en), ''),
        NULLIF(btrim(pc.name_ja), '')
      ) AS card_name,
      COALESCE(mo.transferred_at, mo.payout_attempted_at, mo.paid_at) AS settlement_at
    FROM public.merchant_orders mo
    INNER JOIN public.listings l ON l.id = mo.listing_id
    LEFT JOIN public.product_catalog pc ON pc.id = l.product_id
    WHERE mo.merchant_id = v_merchant_id
      AND mo.payout_status IN ('paid', 'processing', 'failed', 'held')
      AND (
        mo.merchant_payout_amount IS NOT NULL
        OR mo.payout_status IN ('failed', 'held')
      )
      AND (v_status_filter = 'all' OR mo.payout_status = v_status_filter)
      AND (p_date_from IS NULL OR mo.transferred_at >= p_date_from)
      AND (p_date_to IS NULL OR mo.transferred_at <= p_date_to)
      AND (
        v_search IS NULL
        OR mo.order_number ILIKE '%' || v_search || '%'
        OR mo.stripe_transfer_id ILIKE '%' || v_search || '%'
      )
  ),
  month_stats AS (
    SELECT COALESCE(SUM(mo.merchant_payout_amount), 0)::numeric AS month_earned
    FROM public.merchant_orders mo
    WHERE mo.merchant_id = v_merchant_id
      AND mo.payout_status = 'paid'
      AND COALESCE(mo.transferred_at, mo.paid_at) >= date_trunc('month', now())
      AND mo.merchant_payout_amount IS NOT NULL
  ),
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE WHEN v_ascending THEN settlement_at END ASC NULLS LAST,
      CASE WHEN NOT v_ascending THEN settlement_at END DESC NULLS LAST,
      id ASC
    OFFSET v_offset
    LIMIT v_page_size
  )
  SELECT jsonb_build_object(
    'monthEarned', (SELECT month_earned FROM month_stats),
    'total', v_total,
    'page', v_safe_page,
    'pageSize', v_page_size,
    'totalPages', v_total_pages,
    'rows', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'orderId', p.id,
            'orderNumber', p.order_number,
            'cardName', p.card_name,
            'amount', COALESCE(p.merchant_payout_amount, 0),
            'commissionAmount', p.commission_amount,
            'paidAt', COALESCE(p.settlement_at, p.payout_hold_until),
            'payoutStatus', p.payout_status,
            'payoutHoldUntil', p.payout_hold_until,
            'stripeTransferId', p.stripe_transfer_id,
            'stripePaymentIntentId', p.stripe_payment_intent_id,
            'payoutError', p.payout_error
          )
          ORDER BY
            CASE WHEN v_ascending THEN p.settlement_at END ASC NULLS LAST,
            CASE WHEN NOT v_ascending THEN p.settlement_at END DESC NULLS LAST,
            p.id ASC
        )
        FROM paged p
      ),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_list_merchant_finance_settlements(
  integer,
  integer,
  text,
  text,
  timestamptz,
  timestamptz,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_list_merchant_finance_settlements(
  integer,
  integer,
  text,
  text,
  timestamptz,
  timestamptz,
  text
) TO authenticated, service_role;
