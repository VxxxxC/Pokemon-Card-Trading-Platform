-- Prefer Chinese card names in home trade ticker, then Japanese.

CREATE OR REPLACE FUNCTION public.rpc_list_home_trade_ticker(
    p_limit INTEGER DEFAULT 12
)
RETURNS TABLE (
    trade_id UUID,
    card_code TEXT,
    product_name TEXT,
    price_hkd NUMERIC,
    completed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH completed_trades AS (
        SELECT
            mo.id AS trade_id,
            l.product_id,
            mo.final_price AS price_hkd,
            COALESCE(mo.buyer_confirmed_at, mo.updated_at, mo.created_at) AS completed_at
        FROM public.member_orders mo
        INNER JOIN public.listings l ON l.id = mo.listing_id
        WHERE mo.status = 'completed'
          AND mo.final_price > 0

        UNION ALL

        SELECT
            mord.id AS trade_id,
            l.product_id,
            mord.final_price AS price_hkd,
            COALESCE(mord.buyer_confirmed_at, mord.updated_at, mord.created_at) AS completed_at
        FROM public.merchant_orders mord
        INNER JOIN public.listings l ON l.id = mord.listing_id
        WHERE mord.escrow_status = 'completed_and_transferred'
          AND mord.final_price > 0
    )
    SELECT
        ct.trade_id,
        COALESCE(
            NULLIF(TRIM(pc.display_id), ''),
            NULLIF(TRIM(pc.set_code || COALESCE('-' || pc.card_number, '')), ''),
            pc.id::TEXT
        ) AS card_code,
        COALESCE(
            NULLIF(TRIM(pc.name_zh), ''),
            NULLIF(TRIM(pc.name_ja), ''),
            '卡牌'
        ) AS product_name,
        ct.price_hkd,
        ct.completed_at
    FROM completed_trades ct
    LEFT JOIN public.product_catalog pc ON pc.id = ct.product_id
    ORDER BY ct.completed_at DESC NULLS LAST
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 12), 24));
$$;
