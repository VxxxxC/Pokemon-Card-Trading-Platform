-- Merchant pending_payment 48h expiry (escrow-payment-policy §10)
-- + fn_merchant_order_needs_seller_action: auth inbound only

-- ---------------------------------------------------------------------------
-- 1. Expiry candidate list (service_role / cron)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_list_merchant_pending_payment_expiry_candidates(
    p_limit integer DEFAULT 50
)
RETURNS TABLE (
    order_id uuid,
    stripe_payment_intent_id text,
    listing_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        mo.id AS order_id,
        mo.stripe_payment_intent_id,
        mo.listing_id
    FROM public.merchant_orders mo
    WHERE mo.escrow_status = 'pending_payment'::public.escrow_state
      AND mo.created_at < (now() - interval '48 hours')
    ORDER BY mo.created_at ASC
    LIMIT GREATEST(LEAST(COALESCE(p_limit, 50), 200), 1);
$$;

REVOKE ALL ON FUNCTION public.rpc_list_merchant_pending_payment_expiry_candidates(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_list_merchant_pending_payment_expiry_candidates(integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Finalize expiry (service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_finalize_merchant_pending_payment_expiry(
    p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_escrow_status public.escrow_state;
    v_listing_id uuid;
BEGIN
    SELECT mo.escrow_status, mo.listing_id
    INTO v_escrow_status, v_listing_id
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF v_escrow_status IS DISTINCT FROM 'pending_payment'::public.escrow_state THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'escrow_status', v_escrow_status
        );
    END IF;

    UPDATE public.merchant_orders
    SET
        escrow_status = 'refunded'::public.escrow_state,
        updated_at = now()
    WHERE id = p_order_id;

    UPDATE public.listings
    SET status = 'active'::public.listing_status
    WHERE id = v_listing_id
      AND status = 'inactive'::public.listing_status;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'escrow_status', 'refunded'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_finalize_merchant_pending_payment_expiry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_merchant_pending_payment_expiry(uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Needs-action: auth orders awaiting inbound tracking only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_merchant_order_needs_seller_action(
  p_escrow_status public.escrow_state,
  p_requires_authentication boolean,
  p_inbound_tracking_no text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    COALESCE(p_requires_authentication, false)
    AND p_escrow_status = 'payment_held'::public.escrow_state
    AND (
      p_inbound_tracking_no IS NULL
      OR btrim(p_inbound_tracking_no) = ''
    );
$$;

-- Patch search_merchant_trading_orders count_needs_action to pass inbound_tracking_no
CREATE OR REPLACE FUNCTION public.search_merchant_trading_orders(
  p_tab_status text DEFAULT 'all',
  p_search_query text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 8,
  p_include_payment_pending boolean DEFAULT true,
  p_include_auth_in_progress boolean DEFAULT true
)
RETURNS TABLE (
  order_id uuid,
  order_number text,
  buyer_id uuid,
  merchant_id uuid,
  final_price numeric,
  escrow_status public.escrow_state,
  requires_authentication boolean,
  created_at timestamptz,
  has_reviewed_by_me boolean,
  buyer_display_name text,
  buyer_username text,
  buyer_avatar_path text,
  grading_company text,
  grading_score text,
  listing_images jsonb,
  product_name_ja text,
  product_name_zh text,
  product_name_en text,
  card_number text,
  set_code text,
  display_id text,
  catalog_image_url text,
  total_count bigint,
  page integer,
  page_size integer,
  total_pages integer,
  range_start integer,
  range_end integer,
  count_status_all bigint,
  count_status_pending bigint,
  count_status_completed bigint,
  count_status_cancelled bigint,
  count_needs_action bigint,
  count_pending_payment bigint,
  count_pending_auth bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      auth.uid() AS user_id,
      GREATEST(COALESCE(p_page, 1), 1) AS page,
      LEAST(GREATEST(COALESCE(p_page_size, 8), 1), 50) AS page_size,
      NULLIF(trim(COALESCE(p_search_query, '')), '') AS search_query,
      COALESCE(NULLIF(trim(p_tab_status), ''), 'all') AS tab_status,
      COALESCE(p_include_payment_pending, true) AS include_payment,
      COALESCE(p_include_auth_in_progress, true) AS include_auth
  ),
  enriched AS (
    SELECT
      mo.id,
      mo.order_number,
      mo.buyer_id,
      mo.merchant_id,
      mo.final_price,
      mo.escrow_status,
      mo.requires_authentication,
      mo.inbound_tracking_no,
      mo.created_at,
      EXISTS (
        SELECT 1
        FROM public.transaction_reviews r
        WHERE r.merchant_order_id = mo.id
          AND r.reviewer_id = p.user_id
      ) AS has_reviewed_by_me,
      buyer.display_name AS buyer_display_name,
      buyer.username AS buyer_username,
      buyer.avatar_path AS buyer_avatar_path,
      l.grading_company,
      l.grading_score,
      l.images AS listing_images,
      pc.name_ja AS product_name_ja,
      pc.name_zh AS product_name_zh,
      pc.name_en AS product_name_en,
      pc.card_number,
      pc.set_code,
      pc.display_id,
      pc.image_url AS catalog_image_url
    FROM public.merchant_orders mo
    INNER JOIN public.listings l ON l.id = mo.listing_id
    INNER JOIN public.product_catalog pc ON pc.id = l.product_id
    INNER JOIN public.profiles buyer ON buyer.id = mo.buyer_id
    CROSS JOIN params p
    WHERE p.user_id IS NOT NULL
      AND mo.merchant_id = p.user_id
  ),
  search_matched AS (
    SELECT e.*
    FROM enriched e
    CROSS JOIN params p
    WHERE
      p.search_query IS NULL
      OR e.order_number ILIKE '%' || public.escape_ilike_pattern(p.search_query) || '%'
      OR e.id::text ILIKE '%' || public.escape_ilike_pattern(p.search_query) || '%'
      OR e.product_name_ja ILIKE '%' || public.escape_ilike_pattern(p.search_query) || '%'
      OR e.product_name_en ILIKE '%' || public.escape_ilike_pattern(p.search_query) || '%'
      OR COALESCE(e.product_name_zh, '') ILIKE '%' || public.escape_ilike_pattern(p.search_query) || '%'
      OR COALESCE(e.card_number, '') ILIKE '%' || public.escape_ilike_pattern(p.search_query) || '%'
      OR e.set_code ILIKE '%' || public.escape_ilike_pattern(p.search_query) || '%'
      OR COALESCE(e.display_id, '') ILIKE '%' || public.escape_ilike_pattern(p.search_query) || '%'
      OR COALESCE(e.buyer_display_name, '') ILIKE '%' || public.escape_ilike_pattern(p.search_query) || '%'
      OR COALESCE(e.buyer_username, '') ILIKE '%' || public.escape_ilike_pattern(p.search_query) || '%'
  ),
  filtered AS (
    SELECT sm.*
    FROM search_matched sm
    CROSS JOIN params p
    WHERE
      (
        p.tab_status = 'all'
        OR (
          p.tab_status = 'pending'
          AND public.fn_merchant_order_is_open(sm.escrow_status)
          AND (
            (
              p.include_payment
              AND public.fn_merchant_order_is_payment_stage(sm.escrow_status)
            )
            OR (
              p.include_auth
              AND public.fn_merchant_order_is_auth_in_progress(
                sm.escrow_status,
                sm.requires_authentication
              )
            )
            OR (
              p.include_payment
              AND sm.escrow_status = 'payment_held'::public.escrow_state
            )
          )
        )
        OR (
          p.tab_status = 'completed'
          AND sm.escrow_status = 'completed_and_transferred'::public.escrow_state
        )
        OR (
          p.tab_status = 'cancelled'
          AND sm.escrow_status = 'refunded'::public.escrow_state
        )
      )
  ),
  facet_counts AS (
    SELECT
      (
        SELECT COUNT(*)::bigint
        FROM search_matched sm
      ) AS count_status_all,
      (
        SELECT COUNT(*)::bigint
        FROM search_matched sm
        WHERE public.fn_merchant_order_is_open(sm.escrow_status)
      ) AS count_status_pending,
      (
        SELECT COUNT(*)::bigint
        FROM search_matched sm
        WHERE sm.escrow_status = 'completed_and_transferred'::public.escrow_state
      ) AS count_status_completed,
      (
        SELECT COUNT(*)::bigint
        FROM search_matched sm
        WHERE sm.escrow_status = 'refunded'::public.escrow_state
      ) AS count_status_cancelled,
      (
        SELECT COUNT(*)::bigint
        FROM search_matched sm
        WHERE public.fn_merchant_order_needs_seller_action(
          sm.escrow_status,
          sm.requires_authentication,
          sm.inbound_tracking_no
        )
      ) AS count_needs_action,
      (
        SELECT COUNT(*)::bigint
        FROM search_matched sm
        WHERE public.fn_merchant_order_is_payment_stage(sm.escrow_status)
      ) AS count_pending_payment,
      (
        SELECT COUNT(*)::bigint
        FROM search_matched sm
        WHERE public.fn_merchant_order_is_auth_in_progress(
          sm.escrow_status,
          sm.requires_authentication
        )
      ) AS count_pending_auth
  ),
  counted AS (
    SELECT COUNT(*)::bigint AS total_count
    FROM filtered
  ),
  paged AS (
    SELECT
      f.*,
      c.total_count,
      params.page,
      params.page_size,
      GREATEST(CEIL(c.total_count::numeric / params.page_size::numeric), 0)::integer AS total_pages
    FROM filtered f
    CROSS JOIN counted c
    CROSS JOIN params
    ORDER BY f.created_at DESC NULLS LAST, f.id DESC
    LIMIT (SELECT page_size FROM params)
    OFFSET (SELECT (page - 1) * page_size FROM params)
  )
  SELECT
    p.id AS order_id,
    p.order_number,
    p.buyer_id,
    p.merchant_id,
    p.final_price,
    p.escrow_status,
    p.requires_authentication,
    p.created_at,
    p.has_reviewed_by_me,
    p.buyer_display_name,
    p.buyer_username,
    p.buyer_avatar_path,
    p.grading_company,
    p.grading_score,
    p.listing_images,
    p.product_name_ja,
    p.product_name_zh,
    p.product_name_en,
    p.card_number,
    p.set_code,
    p.display_id,
    p.catalog_image_url,
    p.total_count,
    p.page,
    p.page_size,
    p.total_pages,
    CASE
      WHEN p.total_count = 0 THEN 0
      ELSE ((p.page - 1) * p.page_size) + 1
    END AS range_start,
    CASE
      WHEN p.total_count = 0 THEN 0
      ELSE LEAST((p.page * p.page_size), p.total_count::integer)
    END AS range_end,
    fc.count_status_all,
    fc.count_status_pending,
    fc.count_status_completed,
    fc.count_status_cancelled,
    fc.count_needs_action,
    fc.count_pending_payment,
    fc.count_pending_auth
  FROM paged p
  CROSS JOIN facet_counts fc;
$$;
