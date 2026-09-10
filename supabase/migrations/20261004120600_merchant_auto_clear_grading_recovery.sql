-- B2C merchant seller-fault recovery uses Connect ledger FIFO; no manual admin clear.
-- Auto-set seller_settlement_status = cleared when grading_fail_recovery is recorded.

CREATE OR REPLACE FUNCTION public.fn_auto_clear_merchant_grading_recovery_settlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.transaction_type = 'grading_fail_recovery'::public.transaction_type
       AND NEW.order_id IS NOT NULL THEN
        UPDATE public.merchant_orders mo
        SET
            seller_settlement_status = 'cleared'::public.seller_settlement_status,
            updated_at = now()
        WHERE mo.id = NEW.order_id
          AND mo.requires_authentication = true
          AND mo.auth_result = 'failed'
          AND mo.fault_party = 'seller'::public.grading_fault_party
          AND mo.seller_settlement_status = 'pending'::public.seller_settlement_status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_clear_merchant_grading_recovery_settlement
    ON public.merchant_ledgers;

CREATE TRIGGER trg_auto_clear_merchant_grading_recovery_settlement
    AFTER INSERT ON public.merchant_ledgers
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_clear_merchant_grading_recovery_settlement();

-- Backfill orders that already have recovery ledger but remain pending.
UPDATE public.merchant_orders mo
SET
    seller_settlement_status = 'cleared'::public.seller_settlement_status,
    updated_at = now()
WHERE mo.requires_authentication = true
  AND mo.auth_result = 'failed'
  AND mo.fault_party = 'seller'::public.grading_fault_party
  AND mo.seller_settlement_status = 'pending'::public.seller_settlement_status
  AND EXISTS (
      SELECT 1
      FROM public.merchant_ledgers ml
      WHERE ml.order_id = mo.id
        AND ml.transaction_type = 'grading_fail_recovery'::public.transaction_type
  );

REVOKE ALL ON FUNCTION public.fn_auto_clear_merchant_grading_recovery_settlement() FROM PUBLIC;
