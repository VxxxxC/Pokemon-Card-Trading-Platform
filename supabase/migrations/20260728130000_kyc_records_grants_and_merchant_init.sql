-- kyc_records 表級權限（修復 permission denied）+ 商戶開店初始化（0.0 評分 + random shop_handle）

-- ── 1. kyc_records GRANT + RLS ─────────────────────────────────────────────

GRANT SELECT ON public.kyc_records TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kyc_records TO service_role;

ALTER TABLE public.kyc_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyc_records_select_public ON public.kyc_records;
CREATE POLICY kyc_records_select_public
  ON public.kyc_records
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── 2. generate_merchant_shop_handle ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_merchant_shop_handle()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
  attempt integer := 0;
BEGIN
  LOOP
    candidate := 'shop_' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.merchant_shops
      WHERE lower(shop_handle) = lower(candidate)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE lower(username) = lower(candidate)
    );

    attempt := attempt + 1;
    IF attempt >= 12 THEN
      candidate := 'shop_' || lower(replace(gen_random_uuid()::text, '-', ''));
      EXIT;
    END IF;
  END LOOP;

  RETURN candidate;
END;
$$;

-- ── 3. fn_handle_kyc_verified — 0.0 rating + shop_handle ───────────────────

CREATE OR REPLACE FUNCTION public.fn_handle_kyc_verified()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.kyc_status = 'verified') OR
       (TG_OP = 'UPDATE' AND NEW.kyc_status = 'verified' AND OLD.kyc_status IS DISTINCT FROM 'verified') THEN

        INSERT INTO public.merchant_shops (
            merchant_id,
            completed_trades_count,
            cancelled_trades_count,
            rating_score,
            shop_rating_score,
            shop_description,
            shop_name,
            shop_handle
        )
        VALUES (
            NEW.merchant_id,
            0,
            0,
            0.0,
            0.0,
            '新認證優質商戶店鋪',
            '新認證優質商戶店鋪',
            public.generate_merchant_shop_handle()
        )
        ON CONFLICT (merchant_id) DO NOTHING;

        PERFORM public.fn_recalculate_reputation_tags(NEW.merchant_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. fn_recalculate_merchant_reputation_tags fallback 5.0 → 0.0 ──────────

CREATE OR REPLACE FUNCTION public.fn_recalculate_merchant_reputation_tags(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_platform_launch TIMESTAMPTZ := '2026-07-01T00:00:00+08:00'::timestamptz;

    v_seller_trades INT := 0;
    v_merchant_rating NUMERIC := 0.0;
    v_shop_created_at TIMESTAMPTZ;

    v_public_review_count INT := 0;
    v_five_star_review_count INT := 0;
    v_has_sub_four_star_review BOOLEAN := false;

    v_merchant_level INT := NULL;
    v_badges JSONB := '[]'::jsonb;
    v_final_payload JSONB;
BEGIN
    SELECT
        ms.completed_trades_count,
        ms.rating_score,
        ms.created_at
    INTO
        v_seller_trades,
        v_merchant_rating,
        v_shop_created_at
    FROM public.merchant_shops ms
    WHERE ms.merchant_id = p_user_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT
        COUNT(*)::int,
        COUNT(*) FILTER (WHERE rating = 5)::int,
        EXISTS (
            SELECT 1
            FROM public.transaction_reviews r2
            WHERE r2.reviewee_id = p_user_id
              AND r2.is_public = true
              AND r2.reviewee_persona = 'merchant'::public.review_persona
              AND r2.rating < 4
        )
    INTO
        v_public_review_count,
        v_five_star_review_count,
        v_has_sub_four_star_review
    FROM public.transaction_reviews r
    WHERE r.reviewee_id = p_user_id
      AND r.is_public = true
      AND r.reviewee_persona = 'merchant'::public.review_persona;

    v_merchant_level := 1;

    IF v_seller_trades >= 500 AND v_merchant_rating >= 4.95 THEN
        v_merchant_level := 4;
    ELSIF v_seller_trades >= 200 AND v_merchant_rating >= 4.85 THEN
        v_merchant_level := 3;
    ELSIF v_seller_trades >= 50 AND v_merchant_rating >= 4.7 THEN
        v_merchant_level := 2;
    END IF;

    IF v_shop_created_at IS NOT NULL
       AND v_shop_created_at >= v_platform_launch
       AND v_shop_created_at < v_platform_launch + INTERVAL '30 days' THEN
        v_badges := v_badges || jsonb_build_array('FOUNDING_MERCHANT');
    END IF;

    IF v_shop_created_at IS NOT NULL
       AND v_shop_created_at <= (NOW() - INTERVAL '365 days') THEN
        v_badges := v_badges || jsonb_build_array('SHOP_ANNUAL_VETERAN');
    END IF;

    IF v_public_review_count >= 50 AND NOT v_has_sub_four_star_review THEN
        v_badges := v_badges || jsonb_build_array('MERCHANT_FLAWLESS_REPUTATION');
    END IF;

    IF v_five_star_review_count >= 100 THEN
        v_badges := v_badges || jsonb_build_array('MERCHANT_HIGHLY_RECOMMENDED');
    END IF;

    IF v_seller_trades >= 1000 THEN
        v_badges := v_badges || jsonb_build_array('MERCHANT_ELITE_SELLER');
    ELSIF v_seller_trades >= 500 THEN
        v_badges := v_badges || jsonb_build_array('MERCHANT_VOLUME_SELLER');
    ELSIF v_seller_trades >= 100 THEN
        v_badges := v_badges || jsonb_build_array('MERCHANT_CENTURY_SELLER');
    END IF;

    v_final_payload := jsonb_build_object(
        'core_main_merchant', v_merchant_level,
        'activity_badges', v_badges
    );

    UPDATE public.merchant_shops
    SET reputation_tag = v_final_payload,
        updated_at = NOW()
    WHERE merchant_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. Backfill ────────────────────────────────────────────────────────────

UPDATE public.merchant_shops ms
SET
  rating_score = 0.0,
  shop_rating_score = 0.0
WHERE rating_score = 5.0
  AND NOT EXISTS (
    SELECT 1
    FROM public.transaction_reviews r
    WHERE r.reviewee_id = ms.merchant_id
      AND r.reviewee_persona = 'merchant'::public.review_persona
      AND r.is_public = true
  );

UPDATE public.merchant_shops ms
SET shop_handle = public.generate_merchant_shop_handle()
WHERE shop_handle IS NULL OR btrim(shop_handle) = '';
