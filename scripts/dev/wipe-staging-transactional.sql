-- Wipe transactional / test data.
-- KEEP: product_catalog, KYC, platform_settings, profiles/auth, merchant_shops.
-- REMOVED: reward templates/campaigns (recreate in Admin QA).
-- Usage: psql "$DATABASE_URL" -v preserve_listing="<uuid-or-empty>" -f scripts/dev/wipe-staging-transactional.sql

\set ON_ERROR_STOP on
BEGIN;

-- 1) Break coupon ↔ order reservations
UPDATE public.user_rewards
SET reserved_merchant_order_id = NULL,
    reserved_member_order_id = NULL;

-- 2) Reviews & chat
DELETE FROM public.transaction_reviews;
DELETE FROM public.chat_messages;
DELETE FROM public.chat_room_reads;

-- 3) Offers & financial ledgers
DELETE FROM public.offers;
DELETE FROM public.seller_receivables;
DELETE FROM public.merchant_ledgers;
DELETE FROM public.payout_requests;
DELETE FROM public.payout_batches;

-- 4) Orders
DELETE FROM public.member_orders;
DELETE FROM public.merchant_orders;

-- 5) Chat rooms & listing engagement
DELETE FROM public.chat_rooms;
DELETE FROM public.listing_engagement_events;
DELETE FROM public.listing_stats;
DELETE FROM public.listing_bookmarks;

-- 6) Collections ↔ listings link
UPDATE public.listings SET source_collection_id = NULL;
UPDATE public.user_collections SET sold_listing_id = NULL;
DELETE FROM public.user_collections;

-- 7) Listings (preserve E2E fixture when :preserve_listing is set)
DELETE FROM public.listings
WHERE COALESCE(NULLIF(:'preserve_listing', ''), '') = ''
   OR id::text <> :'preserve_listing';

UPDATE public.listings
SET status = 'active',
    updated_at = now()
WHERE COALESCE(NULLIF(:'preserve_listing', ''), '') <> ''
  AND id::text = :'preserve_listing';

-- 8) Rewards — issued grants + admin templates/campaigns (FK order)
DELETE FROM public.reward_campaign_claims;
DELETE FROM public.reward_redemption_claims;
DELETE FROM public.user_rewards;
DELETE FROM public.reward_redemption_catalog;
DELETE FROM public.reward_template_audits;
DELETE FROM public.reward_campaigns;
DELETE FROM public.reward_templates;
DELETE FROM public.check_in_program;

-- 9) Points / watchlists
DELETE FROM public.point_ledger;
DELETE FROM public.gamification_stats;
DELETE FROM public.product_watchlists;

-- 10) Moderation & grading audit
DELETE FROM public.report_attachments;
DELETE FROM public.reports;
DELETE FROM public.moderation_audit_logs;
DELETE FROM public.moderation_cases;
DELETE FROM public.account_sanctions;
DELETE FROM public.grading_audit_logs;

-- 11) Notification outbox
DELETE FROM public.notification_email_outbox;

-- 12) Reset profile trade counters (accounts kept)
UPDATE public.profiles
SET completed_trades_count = 0,
    cancelled_trades_count = 0,
    total_trades = 0,
    rating_score = NULL;

COMMIT;

REFRESH MATERIALIZED VIEW CONCURRENTLY public.marketplace_product_summaries;
