-- Admin user control: pg_trgm search indexes + search_admin_platform_users RPC

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm
  ON public.profiles USING gin (display_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm
  ON public.profiles USING gin (username gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_merchant_shops_shop_name_trgm
  ON public.merchant_shops USING gin (shop_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_merchant_shops_shop_handle_trgm
  ON public.merchant_shops USING gin (shop_handle gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_kyc_applications_rep_email_trgm
  ON public.kyc_applications USING gin (rep_email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_kyc_records_stripe_account_id_pattern
  ON public.kyc_records (stripe_account_id text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_kyc_records_kyc_status
  ON public.kyc_records (kyc_status);

CREATE INDEX IF NOT EXISTS idx_kyc_applications_user_created
  ON public.kyc_applications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_role_updated_at
  ON public.profiles (role, updated_at DESC);

CREATE OR REPLACE FUNCTION public.search_admin_platform_users(
    p_keyword TEXT DEFAULT NULL,
    p_user_types TEXT[] DEFAULT ARRAY['member', 'merchant'],
    p_kyc_filter TEXT DEFAULT 'all',
    p_page INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 10
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
    v_user_types TEXT[];
    v_kyc_filter TEXT;
    v_rows JSONB;
    v_total BIGINT;
    v_kyc_counts JSONB;
    v_type_counts JSONB;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_limit := LEAST(GREATEST(COALESCE(p_page_size, 10), 1), 50);
    v_offset := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_limit;
    v_keyword := NULLIF(trim(COALESCE(p_keyword, '')), '');

    v_user_types := COALESCE(p_user_types, ARRAY['member', 'merchant']::TEXT[]);
    IF cardinality(v_user_types) = 0 THEN
        RETURN jsonb_build_object(
            'rows', '[]'::JSONB,
            'total', 0,
            'page', GREATEST(COALESCE(p_page, 1), 1),
            'page_size', v_limit,
            'kyc_counts', jsonb_build_object('all', 0, 'pending', 0, 'verified', 0, 'rejected', 0),
            'type_counts', jsonb_build_object('member', 0, 'merchant', 0)
        );
    END IF;

    v_kyc_filter := COALESCE(NULLIF(trim(COALESCE(p_kyc_filter, '')), ''), 'all');
    IF v_kyc_filter NOT IN ('all', 'pending', 'verified', 'rejected') THEN
        v_kyc_filter := 'all';
    END IF;

    WITH latest_applications AS (
        SELECT DISTINCT ON (ka.user_id)
            ka.id,
            ka.user_id,
            ka.status,
            ka.rep_email,
            ka.created_at
        FROM public.kyc_applications ka
        ORDER BY ka.user_id, ka.created_at DESC
    ),
    enriched AS (
        SELECT
            p.id,
            p.role::TEXT AS role,
            p.display_name,
            p.username,
            p.updated_at,
            ms.shop_name,
            ms.shop_handle,
            kr.stripe_account_id,
            kr.kyc_status AS record_status,
            ka.id AS application_id,
            ka.status AS app_status,
            ka.rep_email,
            CASE
                WHEN kr.kyc_status = 'verified' THEN 'verified'
                WHEN ka.status = 'approved' THEN 'verified'
                WHEN ka.status = 'pending' THEN 'pending'
                WHEN ka.status = 'rejected' OR kr.kyc_status = 'rejected' THEN 'rejected'
                WHEN kr.kyc_status = 'pending' THEN 'pending'
                WHEN p.role = 'member' AND ka.id IS NULL THEN NULL
                WHEN p.role = 'merchant' AND ka.id IS NULL THEN
                    CASE WHEN kr.kyc_status = 'pending' THEN 'pending' ELSE NULL END
                ELSE NULL
            END AS ui_kyc_status
        FROM public.profiles p
        LEFT JOIN public.merchant_shops ms ON ms.merchant_id = p.id
        LEFT JOIN public.kyc_records kr ON kr.merchant_id = p.id
        LEFT JOIN latest_applications ka ON ka.user_id = p.id
        WHERE p.role <> 'admin'
          AND p.role::TEXT = ANY (v_user_types)
    ),
    search_matched AS (
        SELECT *
        FROM enriched e
        WHERE (
            v_keyword IS NULL
            OR COALESCE(e.display_name, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(e.username, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(e.shop_name, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(e.shop_handle, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(e.stripe_account_id, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(e.rep_email, '') ILIKE '%' || v_keyword || '%'
        )
    ),
    kyc_filtered AS (
        SELECT *
        FROM search_matched sm
        WHERE (
            v_kyc_filter = 'all'
            OR (v_kyc_filter = 'pending' AND sm.ui_kyc_status = 'pending')
            OR (v_kyc_filter = 'verified' AND sm.ui_kyc_status = 'verified')
            OR (v_kyc_filter = 'rejected' AND sm.ui_kyc_status = 'rejected')
        )
    )
    SELECT
        (SELECT COUNT(*)::BIGINT FROM kyc_filtered),
        COALESCE((
            SELECT jsonb_agg(to_jsonb(f) ORDER BY f.updated_at DESC NULLS LAST)
            FROM (
                SELECT
                    kf.id,
                    kf.role,
                    kf.display_name,
                    kf.username,
                    kf.updated_at,
                    kf.shop_name,
                    kf.shop_handle,
                    kf.stripe_account_id,
                    kf.record_status,
                    kf.application_id,
                    kf.app_status,
                    kf.rep_email,
                    kf.ui_kyc_status
                FROM kyc_filtered kf
                ORDER BY kf.updated_at DESC NULLS LAST
                LIMIT v_limit OFFSET v_offset
            ) f
        ), '[]'::JSONB),
        jsonb_build_object(
            'all', (SELECT COUNT(*)::BIGINT FROM search_matched),
            'pending', (SELECT COUNT(*)::BIGINT FROM search_matched WHERE ui_kyc_status = 'pending'),
            'verified', (SELECT COUNT(*)::BIGINT FROM search_matched WHERE ui_kyc_status = 'verified'),
            'rejected', (SELECT COUNT(*)::BIGINT FROM search_matched WHERE ui_kyc_status = 'rejected')
        ),
        jsonb_build_object(
            'member', (
                SELECT COUNT(*)::BIGINT
                FROM kyc_filtered
                WHERE role = 'member'
            ),
            'merchant', (
                SELECT COUNT(*)::BIGINT
                FROM kyc_filtered
                WHERE role = 'merchant'
            )
        )
    INTO v_total, v_rows, v_kyc_counts, v_type_counts;

    RETURN jsonb_build_object(
        'rows', v_rows,
        'total', v_total,
        'page', GREATEST(COALESCE(p_page, 1), 1),
        'page_size', v_limit,
        'kyc_counts', v_kyc_counts,
        'type_counts', v_type_counts
    );
END;
$$;

REVOKE ALL ON FUNCTION public.search_admin_platform_users(TEXT, TEXT[], TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_admin_platform_users(TEXT, TEXT[], TEXT, INTEGER, INTEGER)
    TO authenticated, service_role;
