-- Phase B added rpc_submit_user_report_v2(..., p_attachment_ids uuid[]).
-- Phase A's 4-arg overload remains unless dropped, which makes PostgREST fail with:
-- "Could not choose the best candidate function between ..."

DROP FUNCTION IF EXISTS public.rpc_submit_user_report_v2(
  UUID,
  public.report_category,
  TEXT,
  UUID
);
