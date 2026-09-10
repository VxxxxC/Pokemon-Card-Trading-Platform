-- Dev-only seed: mixed-status payout_requests for admin FPS ledger testing.
-- Run manually in Supabase SQL editor AFTER migration 20260801120000_member_fps_payout.sql.
-- Idempotent: skips orders that already have a payout_requests row.

WITH candidate_orders AS (
  SELECT
    mo.id AS order_id,
    mo.seller_id,
    COALESCE(mo.final_price, 0) AS amount,
    COALESCE(NULLIF(TRIM(p.fps_id), ''), '9999999') AS fps_id_snapshot,
  ROW_NUMBER() OVER (ORDER BY mo.created_at DESC) AS rn
  FROM public.member_orders mo
  JOIN public.profiles p ON p.id = mo.seller_id
  LEFT JOIN public.payout_requests pr ON pr.order_id = mo.id
  WHERE mo.use_authentication = true
    AND pr.id IS NULL
  LIMIT 20
),
status_plan AS (
  SELECT *
  FROM (
    VALUES
      (1, 'pending'::public.payout_request_status, NULL::timestamptz, NULL::timestamptz),
      (2, 'ready'::public.payout_request_status, NOW() - INTERVAL '2 days', NULL::timestamptz),
      (3, 'processing'::public.payout_request_status, NOW() - INTERVAL '1 day', NULL::timestamptz),
      (4, 'completed'::public.payout_request_status, NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days'),
      (5, 'failed'::public.payout_request_status, NOW() - INTERVAL '4 days', NULL::timestamptz)
  ) AS t(slot, status, ready_at, paid_at)
),
to_insert AS (
  SELECT
    c.order_id,
    c.seller_id,
    c.amount,
    c.fps_id_snapshot,
    sp.status,
    sp.ready_at,
    sp.paid_at,
    NOW() - (c.rn || ' hours')::interval AS created_at
  FROM candidate_orders c
  JOIN status_plan sp ON ((c.rn - 1) % 5 + 1) = sp.slot
)
INSERT INTO public.payout_requests (
  order_id,
  seller_id,
  amount,
  gross_payout_hkd,
  fps_transfer_fee_hkd,
  fps_id_snapshot,
  status,
  ready_at,
  paid_at,
  created_at,
  updated_at
)
SELECT
  order_id,
  seller_id,
  amount,
  amount,
  0,
  fps_id_snapshot,
  status,
  ready_at,
  paid_at,
  created_at,
  created_at
FROM to_insert
ON CONFLICT (order_id) DO NOTHING;

-- Sanity checks
SELECT status, COUNT(*) FROM public.payout_requests GROUP BY status ORDER BY status;
SELECT COUNT(*) AS total_payout_requests FROM public.payout_requests;
