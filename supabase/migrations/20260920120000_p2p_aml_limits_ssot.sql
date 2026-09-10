-- P2P meetup AML limits SSOT: code constant mirrors + fn_assert_p2p_offer_aml_limits.

CREATE OR REPLACE FUNCTION public.fn_p2p_aml_new_account_grace_days()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT 14;
$$;

CREATE OR REPLACE FUNCTION public.fn_p2p_aml_meetup_max_new_account_hkd()
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT 300::NUMERIC;
$$;

CREATE OR REPLACE FUNCTION public.fn_p2p_aml_meetup_max_no_market_hkd()
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT 800::NUMERIC;
$$;

REVOKE ALL ON FUNCTION public.fn_p2p_aml_new_account_grace_days() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_p2p_aml_new_account_grace_days()
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_p2p_aml_meetup_max_new_account_hkd() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_p2p_aml_meetup_max_new_account_hkd()
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_p2p_aml_meetup_max_no_market_hkd() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_p2p_aml_meetup_max_no_market_hkd()
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_assert_p2p_offer_aml_limits(
  p_buyer_id UUID,
  p_offer_price NUMERIC,
  p_listing_id UUID,
  p_use_authentication BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_buyer_created_at TIMESTAMPTZ;
  v_product_id TEXT;
  v_grading_company TEXT;
  v_grading_score TEXT;
  v_market_avg_price NUMERIC;
BEGIN
  IF COALESCE(p_use_authentication, false) THEN
    RETURN;
  END IF;

  IF p_offer_price IS NULL OR p_offer_price <= 0 THEN
    RAISE EXCEPTION '參數錯誤：出價金額必須大於 0。';
  END IF;

  SELECT created_at
  INTO v_buyer_created_at
  FROM public.profiles
  WHERE id = p_buyer_id;

  IF v_buyer_created_at IS NOT NULL
     AND v_buyer_created_at > (
       now() - make_interval(days => public.fn_p2p_aml_new_account_grace_days())
     )
     AND p_offer_price > public.fn_p2p_aml_meetup_max_new_account_hkd() THEN
    RAISE EXCEPTION '%',
      format(
        '新註冊帳號（%s 天內）面交單筆上限為 HK$%s，請降低出價或選用平台鑑定託管。',
        public.fn_p2p_aml_new_account_grace_days(),
        public.fn_p2p_aml_meetup_max_new_account_hkd()::int
      );
  END IF;

  SELECT
    l.product_id,
    l.grading_company,
    l.grading_score
  INTO
    v_product_id,
    v_grading_company,
    v_grading_score
  FROM public.listings l
  WHERE l.id = p_listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到該卡牌商品。';
  END IF;

  SELECT pgmp.market_avg_price
  INTO v_market_avg_price
  FROM public.product_grading_market_prices pgmp
  WHERE pgmp.product_id = v_product_id
    AND upper(pgmp.grading_company) = upper(v_grading_company)
    AND pgmp.grading_score = COALESCE(v_grading_score, '')
  LIMIT 1;

  IF v_market_avg_price IS NULL
     AND p_offer_price > public.fn_p2p_aml_meetup_max_no_market_hkd() THEN
    RAISE EXCEPTION '%',
      format(
        '此卡牌無市場參考價，超過 HK$%s 的面交出價必須啟用平台鑑定託管服務。',
        public.fn_p2p_aml_meetup_max_no_market_hkd()::int
      );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_assert_p2p_offer_aml_limits(UUID, NUMERIC, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_assert_p2p_offer_aml_limits(UUID, NUMERIC, UUID, BOOLEAN)
    TO authenticated, service_role;
