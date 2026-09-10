-- Expose public review count on product detail order book rows (distinct from total_trades).

DROP FUNCTION IF EXISTS public.get_marketplace_product_listings(
  text,
  jsonb,
  boolean,
  text,
  integer,
  integer
);

CREATE OR REPLACE FUNCTION public.get_marketplace_product_listings(
  p_product_id text,
  p_grade_filters jsonb DEFAULT NULL,
  p_only_graded boolean DEFAULT false,
  p_sort text DEFAULT 'price_asc',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 5
)
RETURNS TABLE (
  listing_id uuid,
  price numeric,
  grading_company text,
  grading_score text,
  seller_id uuid,
  seller_name text,
  seller_rating numeric,
  seller_total_trades integer,
  seller_public_review_count integer,
  seller_persona public.seller_persona_type,
  use_authentication boolean,
  created_at timestamptz,
  filtered_lowest_price numeric,
  total_count bigint,
  page integer,
  page_size integer,
  total_pages integer,
  range_start integer,
  range_end integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      GREATEST(COALESCE(p_page, 1), 1) AS page,
      GREATEST(COALESCE(p_page_size, 5), 1) AS page_size
  ),
  filtered_listings AS (
    SELECT
      l.id AS listing_id,
      l.price,
      l.grading_company,
      l.grading_score,
      l.seller_id,
      l.seller_persona,
      l.use_authentication,
      l.created_at,
      p.display_name AS seller_name,
      p.rating_score AS seller_rating,
      p.total_trades AS seller_total_trades,
      (
        SELECT COUNT(*)::integer
        FROM public.transaction_reviews r
        WHERE r.reviewee_id = l.seller_id
          AND r.reviewee_persona = l.seller_persona::text::public.review_persona
          AND r.is_public = true
      ) AS seller_public_review_count
    FROM public.listings l
    INNER JOIN public.profiles p ON p.id = l.seller_id
    WHERE l.status = 'active'
      AND l.product_id = p_product_id
      AND (
        p_only_graded = false
        OR upper(trim(l.grading_company)) NOT IN ('RAW', 'RAW CARD')
      )
      AND (
        p_grade_filters IS NULL
        OR jsonb_typeof(p_grade_filters) <> 'array'
        OR jsonb_array_length(p_grade_filters) = 0
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_grade_filters) AS gf(filter)
          WHERE (
            upper(coalesce(filter->>'company', '')) = 'OTHER'
            AND coalesce(nullif(trim(filter->>'score'), ''), '') <> ''
            AND (
              (
                upper(l.grading_company) = 'OTHER'
                AND l.grading_score = trim(filter->>'score')
              )
              OR (
                upper(l.grading_company) = 'SEALED'
                AND trim(filter->>'score') = 'SEALED'
              )
            )
          )
          OR (
            upper(coalesce(filter->>'company', '')) = 'OTHER'
            AND coalesce(nullif(trim(filter->>'score'), ''), '') = ''
            AND upper(l.grading_company) NOT IN ('PSA', 'CGC', 'BGS', 'RAW')
          )
          OR (
            upper(coalesce(filter->>'company', '')) <> 'OTHER'
            AND upper(l.grading_company) = upper(coalesce(filter->>'company', ''))
            AND (
              coalesce(nullif(trim(filter->>'score'), ''), '') = ''
              OR l.grading_score = trim(filter->>'score')
            )
          )
        )
      )
  ),
  stats AS (
    SELECT
      COUNT(*)::bigint AS total_count,
      MIN(fl.price) AS filtered_lowest_price
    FROM filtered_listings fl
  ),
  paged AS (
    SELECT
      fl.*,
      s.total_count,
      s.filtered_lowest_price,
      params.page,
      params.page_size,
      GREATEST(CEIL(s.total_count::numeric / params.page_size::numeric), 0)::integer AS total_pages
    FROM filtered_listings fl
    CROSS JOIN stats s
    CROSS JOIN params
    ORDER BY
      CASE WHEN p_sort = 'price_asc' THEN fl.price END ASC NULLS LAST,
      CASE
        WHEN p_sort = 'grade_desc' THEN public.listing_grade_sort_score(fl.grading_company, fl.grading_score)
      END DESC NULLS LAST,
      CASE WHEN p_sort = 'grade_desc' THEN fl.price END ASC NULLS LAST,
      CASE WHEN p_sort = 'rating_desc' THEN coalesce(fl.seller_rating, 0) END DESC NULLS LAST,
      CASE WHEN p_sort = 'rating_desc' THEN fl.price END ASC NULLS LAST,
      fl.created_at DESC,
      fl.listing_id ASC
    LIMIT (SELECT page_size FROM params)
    OFFSET (SELECT (page - 1) * page_size FROM params)
  )
  SELECT
    p.listing_id,
    p.price,
    p.grading_company,
    p.grading_score,
    p.seller_id,
    p.seller_name,
    p.seller_rating,
    p.seller_total_trades,
    p.seller_public_review_count,
    p.seller_persona,
    p.use_authentication,
    p.created_at,
    p.filtered_lowest_price,
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
      ELSE LEAST(p.page * p.page_size, p.total_count::integer)
    END AS range_end
  FROM paged p;
$$;

GRANT EXECUTE ON FUNCTION public.get_marketplace_product_listings(
  text, jsonb, boolean, text, integer, integer
)
  TO anon, authenticated, service_role;
