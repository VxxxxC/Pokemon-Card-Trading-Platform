-- Wipe reward admin config only (templates, campaigns, catalog, check-in program).
\set ON_ERROR_STOP on
BEGIN;

DELETE FROM public.reward_campaign_claims;
DELETE FROM public.reward_redemption_claims;
DELETE FROM public.user_rewards;
DELETE FROM public.reward_redemption_catalog;
DELETE FROM public.reward_template_audits;
DELETE FROM public.reward_campaigns;
DELETE FROM public.reward_templates;
DELETE FROM public.check_in_program;

COMMIT;
