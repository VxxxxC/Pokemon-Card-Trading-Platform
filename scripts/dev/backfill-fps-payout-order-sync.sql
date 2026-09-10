-- Ops: sync member_orders.seller_payout_status to 'paid' when admin already completed FPS payout.
-- Context: pre-20260923120000 admin updates may have left payout_requests.completed
--          while member_orders still shows ready/held.
--
-- Run in Supabase SQL editor (staging/production) after reviewing SELECT output.

-- 1) Preview rows that would be fixed
SELECT
  pr.id AS payout_request_id,
  pr.order_id,
  pr.status AS payout_status,
  pr.admin_fps_reference,
  mo.order_number,
  mo.seller_payout_status AS order_payout_status
FROM public.payout_requests pr
INNER JOIN public.member_orders mo ON mo.id = pr.order_id
WHERE pr.status = 'completed'::public.payout_request_status
  AND mo.seller_payout_status IN (
    'ready'::public.member_seller_payout_status,
    'held'::public.member_seller_payout_status,
    'processing'::public.member_seller_payout_status
  )
ORDER BY pr.paid_at DESC NULLS LAST;

-- 2) Apply sync (uncomment after review)
-- UPDATE public.member_orders mo
-- SET
--   seller_payout_status = 'paid'::public.member_seller_payout_status,
--   updated_at = now()
-- FROM public.payout_requests pr
-- WHERE pr.order_id = mo.id
--   AND pr.status = 'completed'::public.payout_request_status
--   AND mo.seller_payout_status IN (
--     'ready'::public.member_seller_payout_status,
--     'held'::public.member_seller_payout_status,
--     'processing'::public.member_seller_payout_status
--   );
