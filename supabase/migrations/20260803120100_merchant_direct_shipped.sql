-- Merchant B2C non-auth: direct fulfillment (SF tracking / meetup confirm) → shipped.
-- Patches payout gate, seller-action helpers, and trading search facets.

-- ---------------------------------------------------------------------------
-- 1. Merchant marks direct fulfillment (non-auth only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_submit_merchant_direct_fulfillment(
    p_order_id UUID,
    p_merchant_id UUID,
    p_tracking_no TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated RECORD;
    v_tracking TEXT;
    v_shipping_method TEXT;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_merchant_id THEN
        RAISE EXCEPTION '請先登入後再操作';
    END IF;

    v_tracking := NULLIF(trim(COALESCE(p_tracking_no, '')), '');

    SELECT shipping_method
    INTO v_shipping_method
    FROM public.merchant_orders
    WHERE id = p_order_id
      AND merchant_id = p_merchant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF COALESCE(v_shipping_method, 'sf') = 'sf' AND v_tracking IS NULL THEN
        RAISE EXCEPTION '請輸入有效的順豐物流單號。';
    END IF;

    UPDATE public.merchant_orders
    SET
        outbound_tracking_no = CASE
            WHEN COALESCE(shipping_method, 'sf') = 'sf' THEN v_tracking
            ELSE NULL
        END,
        escrow_status = 'shipped'::public.escrow_state,
        updated_at = now()
    WHERE id = p_order_id
      AND merchant_id = p_merchant_id
      AND COALESCE(requires_authentication, false) = false
      AND escrow_status = 'payment_held'::public.escrow_state
      AND stripe_payment_intent_id IS NOT NULL
    RETURNING * INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION '發貨失敗：訂單狀態不合法或您非此筆交易的商戶。';
    END IF;

    RETURN jsonb_build_object('order', to_jsonb(v_updated));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_submit_merchant_direct_fulfillment(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_submit_merchant_direct_fulfillment(UUID, UUID, TEXT)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_merchant_order_is_open(
  p_escrow_status public.escrow_state
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_escrow_status IN (
    'pending_payment'::public.escrow_state,
    'payment_held'::public.escrow_state,
    'shipped'::public.escrow_state,
    'authenticating'::public.escrow_state,
    'authenticated'::public.escrow_state
  );
$$;

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
    (
      COALESCE(p_requires_authentication, false)
      AND p_escrow_status = 'payment_held'::public.escrow_state
      AND (
        p_inbound_tracking_no IS NULL
        OR btrim(p_inbound_tracking_no) = ''
      )
    )
    OR (
      NOT COALESCE(p_requires_authentication, false)
      AND p_escrow_status = 'payment_held'::public.escrow_state
    );
$$;

-- ---------------------------------------------------------------------------
-- 3. Buyer payout: non-auth requires shipped (not payment_held)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_prepare_merchant_order_payout(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id UUID;
    v_merchant_id UUID;
    v_escrow_status public.escrow_state;
    v_requires_auth BOOLEAN;
    v_auth_result TEXT;
    v_outbound_tracking TEXT;
    v_payment_capture_status public.payment_capture_status;
    v_item_subtotal NUMERIC;
    v_shipping_fee NUMERIC;
    v_auth_fee NUMERIC;
    v_total_amount NUMERIC;
    v_payment_intent_id TEXT;
    v_existing_rate NUMERIC;
    v_existing_commission NUMERIC;
    v_existing_payout NUMERIC;
    v_existing_transfer_id TEXT;
    v_existing_destination TEXT;
    v_kyc_status public.kyc_state;
    v_charges_enabled BOOLEAN;
    v_payouts_enabled BOOLEAN;
    v_destination TEXT;
    v_commission_rate CONSTANT NUMERIC := 0.08;
    v_commission NUMERIC;
    v_payout NUMERIC;
    v_result_order_id UUID;
BEGIN
    SELECT
        mo.buyer_id,
        mo.merchant_id,
        mo.escrow_status,
        COALESCE(mo.requires_authentication, false),
        mo.auth_result,
        mo.outbound_tracking_no,
        mo.payment_capture_status,
        mo.item_subtotal,
        mo.shipping_fee,
        mo.auth_fee,
        mo.total_amount,
        mo.stripe_payment_intent_id,
        mo.commission_rate_applied,
        mo.commission_amount,
        mo.merchant_payout_amount,
        mo.stripe_transfer_id,
        mo.stripe_destination_account_id
    INTO
        v_buyer_id,
        v_merchant_id,
        v_escrow_status,
        v_requires_auth,
        v_auth_result,
        v_outbound_tracking,
        v_payment_capture_status,
        v_item_subtotal,
        v_shipping_fee,
        v_auth_fee,
        v_total_amount,
        v_payment_intent_id,
        v_existing_rate,
        v_existing_commission,
        v_existing_payout,
        v_existing_transfer_id,
        v_existing_destination
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id
    FOR UPDATE OF mo;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF auth.uid() IS DISTINCT FROM v_buyer_id THEN
        RAISE EXCEPTION '操作失敗：僅買家可確認完成交易。';
    END IF;

    IF v_existing_transfer_id IS NOT NULL
       AND v_escrow_status = 'completed_and_transferred'::public.escrow_state THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'order_id', p_order_id,
            'stripe_transfer_id', v_existing_transfer_id
        );
    END IF;

    IF v_escrow_status = 'completed_and_transferred'::public.escrow_state THEN
        RAISE EXCEPTION '此訂單已由舊流程完成，需由管理員核對撥款。';
    END IF;

    IF v_requires_auth THEN
        IF v_escrow_status IS DISTINCT FROM 'authenticated'::public.escrow_state
           OR v_auth_result IS DISTINCT FROM 'passed'
           OR v_outbound_tracking IS NULL
           OR btrim(v_outbound_tracking) = ''
           OR v_payment_capture_status IS DISTINCT FROM 'fully_captured'::public.payment_capture_status THEN
            RAISE EXCEPTION '鑑定訂單尚未通過鑑定、款項未全額扣款或尚未出庫，無法確認收貨。';
        END IF;
    ELSIF v_escrow_status IS DISTINCT FROM 'shipped'::public.escrow_state THEN
        RAISE EXCEPTION '商戶尚未發貨或訂單狀態不允許撥款。';
    END IF;

    SELECT
        kr.kyc_status,
        kr.stripe_charges_enabled,
        kr.stripe_payouts_enabled,
        kr.stripe_account_id
    INTO
        v_kyc_status,
        v_charges_enabled,
        v_payouts_enabled,
        v_destination
    FROM public.kyc_records kr
    WHERE kr.merchant_id = v_merchant_id
    LIMIT 1;

    IF NOT FOUND
       OR v_kyc_status IS DISTINCT FROM 'verified'::public.kyc_state
       OR NOT COALESCE(v_charges_enabled, false)
       OR NOT COALESCE(v_payouts_enabled, false)
       OR v_destination IS NULL
       OR btrim(v_destination) = '' THEN
        RAISE EXCEPTION '商戶收款帳戶尚未通過驗證，暫時無法撥款。';
    END IF;

    IF v_payment_intent_id IS NULL OR btrim(v_payment_intent_id) = '' THEN
        RAISE EXCEPTION '訂單缺少有效付款憑證，無法撥款。';
    END IF;

    IF v_item_subtotal IS NULL
       OR v_item_subtotal <= 0
       OR v_total_amount IS NULL
       OR v_total_amount <= 0 THEN
        RAISE EXCEPTION '訂單金額資料不完整，無法撥款。';
    END IF;

    v_shipping_fee := COALESCE(v_shipping_fee, 0);
    v_auth_fee := COALESCE(v_auth_fee, 0);

    IF v_total_amount IS DISTINCT FROM
       (v_item_subtotal + v_shipping_fee + v_auth_fee) THEN
        RAISE EXCEPTION '訂單金額明細不一致，已攔截撥款。';
    END IF;

    v_commission := round(v_item_subtotal * v_commission_rate, 2);
    v_payout := round(v_item_subtotal - v_commission + v_shipping_fee, 2);

    IF v_payout <= 0 OR v_payout > v_total_amount THEN
        RAISE EXCEPTION '商戶撥款金額異常，已攔截撥款。';
    END IF;

    IF v_existing_rate IS NOT NULL
       AND (
           v_existing_rate IS DISTINCT FROM v_commission_rate
           OR v_existing_commission IS DISTINCT FROM v_commission
           OR v_existing_payout IS DISTINCT FROM v_payout
           OR v_existing_destination IS DISTINCT FROM v_destination
       ) THEN
        RAISE EXCEPTION '訂單撥款快照不一致，需由管理員處理。';
    END IF;

    UPDATE public.merchant_orders
    SET
        commission_rate_applied = COALESCE(commission_rate_applied, v_commission_rate),
        commission_amount = COALESCE(commission_amount, v_commission),
        merchant_payout_amount = COALESCE(merchant_payout_amount, v_payout),
        stripe_destination_account_id = COALESCE(stripe_destination_account_id, v_destination),
        buyer_confirmed_at = COALESCE(buyer_confirmed_at, now()),
        payout_status = 'processing',
        payout_attempted_at = now(),
        payout_error = NULL,
        updated_at = now()
    WHERE id = p_order_id
    RETURNING
        id,
        stripe_payment_intent_id,
        total_amount,
        commission_amount,
        merchant_payout_amount,
        stripe_destination_account_id
    INTO
        v_result_order_id,
        v_payment_intent_id,
        v_total_amount,
        v_commission,
        v_payout,
        v_destination;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_id', v_result_order_id,
        'stripe_payment_intent_id', v_payment_intent_id,
        'total_amount', v_total_amount,
        'commission_amount', v_commission,
        'merchant_payout_amount', v_payout,
        'stripe_destination_account_id', v_destination
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Trading search: include shipped in pending tab
-- ---------------------------------------------------------------------------

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
              AND sm.escrow_status IN (
                'payment_held'::public.escrow_state,
                'shipped'::public.escrow_state
              )
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
      p.page,
      p.page_size,
      GREATEST(CEIL(c.total_count::numeric / NULLIF(p.page_size, 0)), 1)::integer AS total_pages,
      CASE
        WHEN c.total_count = 0 THEN 0
        ELSE ((p.page - 1) * p.page_size) + 1
      END AS range_start,
      LEAST(p.page * p.page_size, c.total_count::integer) AS range_end
    FROM filtered f
    CROSS JOIN counted c
    CROSS JOIN params p
    ORDER BY f.created_at DESC
    LIMIT (SELECT page_size FROM params)
    OFFSET (SELECT (page - 1) * page_size FROM params)
  )
  SELECT
    pg.id AS order_id,
    pg.order_number,
    pg.buyer_id,
    pg.merchant_id,
    pg.final_price,
    pg.escrow_status,
    pg.requires_authentication,
    pg.created_at,
    pg.has_reviewed_by_me,
    pg.buyer_display_name,
    pg.buyer_username,
    pg.buyer_avatar_path,
    pg.grading_company,
    pg.grading_score,
    pg.listing_images,
    pg.product_name_ja,
    pg.product_name_zh,
    pg.product_name_en,
    pg.card_number,
    pg.set_code,
    pg.display_id,
    pg.catalog_image_url,
    pg.total_count,
    pg.page,
    pg.page_size,
    pg.total_pages,
    pg.range_start,
    pg.range_end,
    fc.count_status_all,
    fc.count_status_pending,
    fc.count_status_completed,
    fc.count_status_cancelled,
    fc.count_needs_action,
    fc.count_pending_payment,
    fc.count_pending_auth
  FROM paged pg
  CROSS JOIN facet_counts fc;
$$;
