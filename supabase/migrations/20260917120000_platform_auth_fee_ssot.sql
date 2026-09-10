-- Appraisal fee SSOT: unify fn_merchant_checkout_auth_fee with platform_settings.auth_escrow_config.

CREATE OR REPLACE FUNCTION public.fn_platform_auth_fee_hkd()
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_fee NUMERIC;
BEGIN
    v_fee := (public.fn_platform_auth_escrow_config() ->> 'auth_fee_hkd')::numeric;
    IF v_fee IS NULL OR v_fee < 50 OR v_fee > 1000 THEN
        RETURN 150::numeric;
    END IF;
    RETURN v_fee;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_merchant_checkout_auth_fee(
    p_use_auth BOOLEAN
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT CASE
        WHEN COALESCE(p_use_auth, false) THEN public.fn_platform_auth_fee_hkd()
        ELSE 0::numeric
    END;
$$;

REVOKE ALL ON FUNCTION public.fn_merchant_checkout_auth_fee(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_merchant_checkout_auth_fee(BOOLEAN)
    TO authenticated, service_role;
