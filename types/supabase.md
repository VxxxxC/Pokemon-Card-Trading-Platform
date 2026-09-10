# Supabase Database Types Reference

> **Auto-generated** from `types/supabase.ts` — do not edit by hand.
>
> **PostgREST version:** 14.5
> **Schema:** `public`

Regenerate TypeScript + this doc:

```bash
bun run supabase:types
```

---

## TypeScript Usage

```typescript
import type { Tables, TablesInsert, TablesUpdate, Enums } from "@/types/supabase";

// Row type (SELECT)
type Profile = Tables<"profiles">;
type Listing = Tables<"listings">;

// Insert / Update payloads
type NewListing = TablesInsert<"listings">;
type ListingPatch = TablesUpdate<"listings">;

// Enum union
type UserRole = Enums<"user_role">;
```

---

## Enums

| Enum | Values |
|------|--------|
| `catalog_type` | `single_card`, `booster_pack`, `booster_box`, `gift_set`, `starter_deck`, `accessories` |
| `escrow_state` | `pending_payment`, `payment_held`, `shipped`, `authenticating`, `authenticated`, `completed_and_transferred`, `refunded` |
| `grading_fault_party` | `buyer`, `seller`, `platform`, `carrier`, `inconclusive` |
| `kyc_application_status` | `pending`, `approved`, `rejected` |
| `kyc_state` | `pending`, `verified`, `rejected` |
| `listing_engagement_event_type` | `view`, `offer` |
| `listing_status` | `active`, `sold`, `inactive` |
| `member_escrow_status` | `payment`, `custody`, `grading`, `shipped`, `released`, `cancelled` |
| `member_order_state` | `pending`, `meetup_arranged`, `completed`, `cancelled` |
| `member_seller_payout_status` | `none`, `held`, `ready`, `processing`, `paid`, `frozen`, `failed` |
| `moderation_case_status` | `open`, `reviewing`, `resolved`, `dismissed` |
| `moderation_resolution` | `upheld`, `dismissed`, `insufficient_evidence` |
| `notification_email_status` | `pending`, `sent`, `failed`, `dead` |
| `offer_status` | `pending`, `accepted`, `rejected`, `cancelled` |
| `payment_capture_status` | `none`, `authorized`, `auth_fee_captured`, `fully_captured`, `voided`, `refunded`, `partially_refunded` |
| `payout_batch_status` | `draft`, `processing`, `completed` |
| `payout_request_status` | `pending`, `ready`, `processing`, `completed`, `failed` |
| `report_category` | `fraud`, `offline_trade`, `harassment`, `other` |
| `report_source` | `chat_room`, `profile` |
| `report_state` | `pending`, `reviewing`, `resolved`, `dismissed` |
| `review_persona` | `member`, `merchant` |
| `reward_campaign_status` | `draft`, `active`, `paused`, `ended` |
| `reward_distribution_mode` | `auto_grant`, `flash_only` |
| `reward_template_audit_action` | `create`, `update`, `publish`, `archive` |
| `reward_template_status` | `draft`, `active`, `archived` |
| `reward_type` | `discount_coupon`, `free_shipping`, `lucky_draw_ticket`, `points` |
| `sanction_scope` | `account`, `member_persona`, `merchant_persona` |
| `sanction_type` | `warn`, `restrict_listing`, `restrict_chat`, `freeze_payout`, `suspend`, `ban` |
| `seller_persona_type` | `member`, `merchant` |
| `seller_receivable_status` | `pending`, `paid`, `waived`, `cancelled` |
| `seller_settlement_status` | `none`, `pending`, `cleared`, `waived` |
| `sync_state` | `synced`, `partial`, `needs_review` |
| `transaction_type` | `escrow_payment`, `commission_deduction`, `shipping_subsidy`, `refund`, `payout`, `grading_fail_recovery`, `grading_fail_recovery_applied` |
| `user_role` | `admin`, `merchant`, `member` |
| `violation_persona` | `member`, `merchant`, `both`, `unknown` |

---

## RPC Functions

| Function | Args | Returns |
|----------|------|---------|
| `_admin_sync_redemption_catalog` | `{ p_payload: Json; p_template_id: string }` | `undefined` |
| `_check_in_program_row_to_json` | `{ p_row: Database["public"]["Tables"]["check_in_program"]["Row"] }` | `Json` |
| `_find_or_create_moderation_case` | `{ p_subject_user_id: string }` | `string` |
| `_grading_require_admin` | `never;` | `string` |
| `_grading_write_audit_log` | `{ p_action: string p_admin_id: string p_from_status: string p_notes?: string p_order_id: string p_o…` | `undefined` |
| `_hk_today` | `never;` | `string` |
| `_moderation_apply_sanction_side_effects` | `{ p_scope: Database["public"]["Enums"]["sanction_scope"] p_type: Database["public"]["Enums"]["sanct…` | `undefined` |
| `_moderation_category_label` | `{ p_category: Database["public"]["Enums"]["report_category"] }` | `string` |
| `_moderation_category_weight` | `{ p_category: Database["public"]["Enums"]["report_category"] }` | `number` |
| `_moderation_format_report_reason` | `{ p_category: Database["public"]["Enums"]["report_category"] p_chat_room_id: string p_details: stri…` | `string` |
| `_moderation_has_active_sanction` | `{ p_scope?: Database["public"]["Enums"]["sanction_scope"] p_type?: Database["public"]["Enums"]["san…` | `boolean` |
| `_moderation_insert_account_sanction` | `{ p_admin_id: string p_case_id: string p_ends_at: string p_reason: string p_scope: Database["public…` | `string` |
| `_moderation_next_case_number` | `never;` | `string` |
| `_moderation_resolve_chat_room_for_case` | `{ p_case_id: string }` | `string` |
| `_moderation_write_audit_log` | `{ p_action: string; p_case_id: string; p_payload?: Json }` | `undefined` |
| `_recompute_moderation_case_scores` | `{ p_case_id: string }` | `undefined` |
| `_reward_activity_row_to_json` | `{ p_campaign?: Database["public"]["Tables"]["reward_campaigns"]["Row"] p_template: Database["public…` | `Json` |
| `_reward_campaign_row_to_json` | `{ p_row: Database["public"]["Tables"]["reward_campaigns"]["Row"] }` | `Json` |
| `_reward_template_row_to_json` | `{ p_row: Database["public"]["Tables"]["reward_templates"]["Row"] }` | `Json` |
| `_reward_template_write_audit` | `{ p_action: Database["public"]["Enums"]["reward_template_audit_action"] p_admin_id: string p_snapsh…` | `undefined` |
| `_sync_catalog_active_for_template_status` | `{ p_status: string; p_template_id: string }` | `undefined` |
| `acknowledge_report_outcomes` | `{ p_report_ids: string[] }` | `Json` |
| `acknowledge_reward_grants` | `{ p_user_reward_ids: string[] }` | `Json` |
| `admin_get_moderation_case_bundle` | `{ p_case_id: string }` | `Json` |
| `admin_get_moderation_chat_thread` | `{ p_before?: string p_case_id: string p_limit?: number p_room_id: string }` | `Json` |
| `admin_get_moderation_order_context` | `{ p_case_id: string }` | `Json` |
| `admin_get_subject_moderation_history` | `{ p_case_limit?: number p_exclude_case_id?: string p_sanction_limit?: number p_subject_user_id: str…` | `Json` |
| `canonical_card_search_key` | `{ input: string };` | `string` |
| `card_identifier_flexible_match` | `{ p_query: string; p_target: string }` | `boolean` |
| `card_search_tokens_array` | `{ input: string };` | `string[]` |
| `catalog_card_identifier_matches` | `{ p_card_number: string p_display_id: string p_query: string p_set_code: string }` | `boolean` |
| `compact_alphanumeric` | `{ input: string };` | `string` |
| `compute_price_vs_market_pct` | `{ p_listing_price: number; p_market_avg_price: number }` | `number` |
| `escape_ilike_pattern` | `{ input: string };` | `string` |
| `execute_daily_check_in` | `never;` | `Json` |
| `fn_apply_point_transaction` | `{ p_amount: number p_description?: string p_source_ref?: string p_source_type: string p_user_id: st…` | `number` |
| `fn_archive_seller_collection_for_listing` | `{ p_final_price: number p_listing_id: string p_seller_id: string }` | `undefined` |
| `fn_assert_offer_not_self_dealing` | `{ p_buyer_id: string; p_seller_id: string }` | `undefined` |
| `fn_assert_p2p_offer_aml_limits` | `{ p_buyer_id: string p_listing_id: string p_offer_price: number p_use_authentication: boolean }` | `undefined` |
| `fn_build_grant_json` | `{ p_template: Database["public"]["Tables"]["reward_templates"]["Row"] p_user_reward_id: string }` | `Json` |
| `fn_bump_listing_offers_count` | `{ p_actor_id?: string; p_listing_id: string }` | `undefined` |
| `fn_chat_party_profile_snippet` | `{ p_persona: Database["public"]["Enums"]["seller_persona_type"] p_profile_id: string }` | `Json` |
| `fn_claim_mission_points` | `{ p_description?: string; p_mission_id: string; p_points: number }` | `Json` |
| `fn_compute_auth_escrow_amounts` | `{ p_item_subtotal: number }` | `{ auth_fee: number buyer_total_amount: number inbound_shipping_fee: number outbound_shipping_fee: n…` |
| `fn_compute_moderation_order_refund` | `{ p_carrier_liability_party?: string p_fault_party: Database["public"]["Enums"]["grading_fault_part…` | `Json` |
| `fn_compute_platform_subsidy` | `{ p_buyer_id: string p_item_subtotal: number p_order_id?: string p_order_kind?: string p_shipping_f…` | `{ coupon_type: Database["public"]["Enums"]["reward_type"] subsidy_amount: number }[]` |
| `fn_compute_seller_grading_fail_liability` | `{ p_order_id: string; p_order_kind: string }` | `Json` |
| `fn_count_public_reviews_for_persona` | `{ p_reviewee_id: string p_reviewee_persona: Database["public"]["Enums"]["review_persona"] }` | `number` |
| `fn_effective_check_in_streak` | `{ p_user_id: string }` | `number` |
| `fn_fps_payout_blocked_for_complete` | `{ p_fps_id_snapshot: string p_fps_name_snapshot: string p_status: Database["public"]["Enums"]["payo…` | `boolean` |
| `fn_get_check_in_daily_points` | `{ p_cycle_day: number }` | `number` |
| `fn_get_merchant_public_verification` | `{ p_merchant_id: string }` | `Json` |
| `fn_grant_points_from_template` | `{ p_template_id: string; p_user_id: string }` | `Json` |
| `fn_issue_reward_from_template` | `{ p_grant_dedup_key?: string p_template_id: string p_user_id: string }` | `string` |
| `fn_map_merchant_escrow_to_member_status` | `{ p_escrow_status: Database["public"]["Enums"]["escrow_state"] }` | `Database["public"]["Enums"]["member_order_state"]` |
| `fn_member_order_is_open` | `{ p_escrow_status: Database["public"]["Enums"]["member_escrow_status"] p_status: Database["public"]…` | `boolean` |
| `fn_merchant_checkout_auth_fee` | `{ p_use_auth: boolean }` | `number` |
| `fn_merchant_checkout_shipping_fee` | `{ p_listing_id: string p_merchant_id: string p_shipping_method: string }` | `number` |
| `fn_merchant_order_is_auth_in_progress` | `{ p_escrow_status: Database["public"]["Enums"]["escrow_state"] p_requires_authentication: boolean }` | `boolean` |
| `fn_merchant_order_is_open` | `{ p_escrow_status: Database["public"]["Enums"]["escrow_state"] }` | `boolean` |
| `fn_merchant_order_is_payment_stage` | `{ p_escrow_status: Database["public"]["Enums"]["escrow_state"] }` | `boolean` |
| `fn_merchant_order_needs_seller_action` | `{ p_escrow_status: Database["public"]["Enums"]["escrow_state"] p_requires_authentication: boolean }` | `boolean } | { Args: { p_escrow_status: Database["public"]["Enums"]["escrow_state"] p_inbound_tracki…` |
| `fn_merchant_unsettled_grading_recovery` | `{ p_merchant_id: string }` | `{ recovery_created_at: string recovery_order_id: string remaining_hkd: number }[]` |
| `fn_moderation_case_links_order` | `{ p_case_id: string; p_order_id: string }` | `boolean` |
| `fn_moderation_derive_order_kind` | `{ p_order_id: string }` | `string` |
| `fn_moderation_order_refund_eligible` | `{ p_order_id: string }` | `Json` |
| `fn_p2p_aml_meetup_max_new_account_hkd` | `never;` | `number` |
| `fn_p2p_aml_meetup_max_no_market_hkd` | `never;` | `number` |
| `fn_p2p_aml_new_account_grace_days` | `never;` | `number` |
| `fn_platform_active_announcements` | `never` | `{ content: string created_at: string created_by: string | null end_date: string id: string image_ob…` |
| `fn_platform_auth_escrow_config` | `never;` | `Json` |
| `fn_platform_auth_fee_hkd` | `never;` | `number` |
| `fn_platform_auth_sf_leg_fee` | `never;` | `number` |
| `fn_platform_commission_rate` | `never;` | `number` |
| `fn_platform_financial_config` | `never;` | `Json` |
| `fn_platform_fps_manual_transfer_fee_hkd` | `never;` | `number` |
| `fn_platform_home_banners` | `never` | `{ content: string created_at: string created_by: string | null end_date: string id: string image_ob…` |
| `fn_preview_moderation_order_refund_breakdown` | `{ p_carrier_liability_party?: string p_fault_party: Database["public"]["Enums"]["grading_fault_part…` | `Json` |
| `fn_recalculate_member_reputation_tags` | `{ p_user_id: string }` | `undefined` |
| `fn_recalculate_merchant_reputation_tags` | `{ p_user_id: string }` | `undefined` |
| `fn_recalculate_reputation_tags` | `{ p_user_id: string }` | `undefined` |
| `fn_redeem_member_points` | `{ p_amount: number p_description?: string p_source_ref?: string }` | `Json` |
| `fn_release_member_order_coupon` | `{ p_order_id: string }` | `undefined` |
| `fn_release_merchant_order_coupon` | `{ p_order_id: string }` | `undefined` |
| `fn_reserve_user_reward_for_member_order` | `{ p_buyer_id: string p_order_id: string p_user_reward_id: string }` | `string` |
| `fn_reserve_user_reward_for_merchant_order` | `{ p_buyer_id: string p_order_id: string p_user_reward_id: string }` | `string` |
| `fn_resolve_member_listing_id` | `{ p_listing_ref: string; p_seller_id: string }` | `string` |
| `fn_restore_member_order_coupon_on_void` | `{ p_order_id: string }` | `undefined` |
| `fn_restore_merchant_order_coupon_on_void` | `{ p_order_id: string }` | `undefined` |
| `fn_reward_auto_grant_in_window` | `{ p_template_id: string }` | `boolean` |
| `fn_reward_template_has_stock` | `{ p_template: Database["public"]["Tables"]["reward_templates"]["Row"] }` | `boolean` |
| `fn_reward_template_progress_detail` | `{ p_template: Database["public"]["Tables"]["reward_templates"]["Row"] p_user_id: string }` | `Json` |
| `fn_sync_broken_check_in_streak` | `{ p_user_id: string }` | `number` |
| `fn_sync_check_in_program_template` | `{ p_program: Database["public"]["Tables"]["check_in_program"]["Row"] }` | `undefined` |
| `fn_template_is_eligible` | `{ p_template: Database["public"]["Tables"]["reward_templates"]["Row"] p_user_id: string }` | `{ eligible: boolean grant_dedup_key: string }[]` |
| `fn_try_auto_grant_rewards` | `{ p_user_id: string };` | `Json` |
| `fn_try_reveal_order_reviews` | `{ p_order_id: string; p_order_kind: string }` | `boolean` |
| `fn_validate_check_in_program_payload` | `{ p_payload: Json }` | `undefined` |
| `fn_validate_reward_template` | `{ p_payload: Json }` | `undefined` |
| `generate_merchant_shop_handle` | `never;` | `string` |
| `generate_profile_username` | `never;` | `string` |
| `get_admin_grading_audit_history` | `{ p_order_id: string; p_order_kind: string }` | `Json` |
| `get_admin_grading_order` | `{ p_order_id: string; p_order_kind: string }` | `Json` |
| `get_chat_room_thread` | `{ p_room_id: string };` | `Json } | { Args: { p_before_created_at?: string p_limit?: number p_room_id: string } Returns: Json` |
| `get_check_in_program_for_member` | `never;` | `Json` |
| `get_gamification_stats_for_me` | `never;` | `Json` |
| `get_marketplace_price_bounds` | `never` | `{ max_price: number min_price: number }[]` |
| `get_marketplace_product_listings` | `{ p_grade_filters?: Json p_only_graded?: boolean p_page?: number p_page_size?: number p_product_id:…` | `{ created_at: string filtered_lowest_price: number grading_company: string grading_score: string li…` |
| `get_marketplace_rarities` | `never` | `{ rarity: string }[]` |
| `get_merchant_performance_analytics` | `{ p_time_range?: string; p_top_limit?: number }` | `Json` |
| `get_merchant_product_analytics` | `{ p_history_page?: number p_history_page_size?: number p_product_id: string p_time_range?: string }` | `Json` |
| `get_reward_coupon_center` | `never;` | `Json } | { Args: { p_user_id?: string }; Returns: Json` |
| `get_unacknowledged_report_outcomes_for_me` | `never;` | `Json` |
| `get_unacknowledged_reward_grants` | `never;` | `Json` |
| `get_user_chat_inbox` | `never;` | `Json` |
| `get_user_chat_inbox_lobby` | `never;` | `Json` |
| `get_user_reward_coupons` | `never;` | `Json` |
| `is_admin` | `never;` | `boolean` |
| `is_card_identifier_query` | `{ p_query: string };` | `boolean` |
| `is_chat_room_member` | `{ p_room_id: string; p_user_id?: string }` | `boolean` |
| `is_display_name_available` | `{ name: string };` | `boolean` |
| `listing_grade_sort_score` | `{ grading_company: string; grading_score: string }` | `number` |
| `moderation_check_listing_allowed` | `{ p_persona: Database["public"]["Enums"]["seller_persona_type"] p_user_id: string }` | `boolean` |
| `moderation_get_account_access_restriction` | `{ p_user_id: string }` | `Json` |
| `refresh_marketplace_product_summaries` | `never;` | `undefined` |
| `resolve_listing_market_price_company` | `{ p_grading_company: string }` | `string` |
| `resolve_listing_market_price_score` | `{ p_grading_company: string; p_grading_score: string }` | `string` |
| `rpc_accept_offer` | `{ p_offer_id: string; p_seller_id: string }` | `Json` |
| `rpc_adjust_moderation_case_score` | `{ p_adjustment: number; p_case_id: string; p_reason?: string }` | `Json` |
| `rpc_admin_batch_complete_fps_payout_requests` | `{ p_admin_id: string; p_request_ids: string[] }` | `Json` |
| `rpc_admin_clear_seller_settlement` | `{ p_fps_reference?: string p_notes?: string p_order_id: string p_order_kind: string }` | `Json` |
| `rpc_admin_confirm_grading_intake` | `{ p_order_id: string; p_order_kind: string }` | `Json` |
| `rpc_admin_get_check_in_program` | `never;` | `Json` |
| `rpc_admin_get_reward_activity` | `{ p_template_id: string }` | `Json` |
| `rpc_admin_list_reward_activities` | `{ p_page?: number p_page_size?: number p_search?: string p_status?: string }` | `Json` |
| `rpc_admin_list_reward_campaigns` | `{ p_page?: number; p_page_size?: number; p_status?: string }` | `Json` |
| `rpc_admin_list_reward_templates` | `{ p_page?: number p_page_size?: number p_status?: string p_type?: string }` | `Json` |
| `rpc_admin_pass_grading` | `{ p_notes?: string; p_order_id: string; p_order_kind: string }` | `Json` |
| `rpc_admin_prepare_auth_refund` | `{ p_order_id: string; p_order_kind: string; p_reason?: string }` | `Json` |
| `rpc_admin_reset_merchant_connect_payout_retry` | `{ p_admin_id: string; p_order_id: string }` | `Json` |
| `rpc_admin_reward_activity_status_counts` | `{ p_search?: string }` | `Json` |
| `rpc_admin_set_fps_payout_request_status` | `{ p_admin_fps_reference?: string p_admin_id: string p_request_id: string p_status: Database["public…` | `Json` |
| `rpc_admin_set_reward_activity_status` | `{ p_status: string; p_template_id: string }` | `Json` |
| `rpc_admin_set_reward_campaign_status` | `{ p_campaign_id: string; p_status: string }` | `Json` |
| `rpc_admin_set_reward_template_status` | `{ p_status: string; p_template_id: string }` | `Json` |
| `rpc_admin_submit_grading_outbound` | `{ p_order_id: string p_order_kind: string p_tracking_no: string }` | `Json` |
| `rpc_admin_submit_seller_return_tracking` | `{ p_order_id: string p_order_kind: string p_tracking_no: string }` | `Json` |
| `rpc_admin_upsert_check_in_program` | `{ p_payload: Json }` | `Json` |
| `rpc_admin_upsert_reward_activity` | `{ p_payload: Json }` | `Json` |
| `rpc_admin_upsert_reward_campaign` | `{ p_payload: Json }` | `Json` |
| `rpc_admin_upsert_reward_template` | `{ p_payload: Json }` | `Json` |
| `rpc_apply_account_sanction` | `{ p_case_id: string p_ends_at?: string p_reason?: string p_scope: Database["public"]["Enums"]["sanc…` | `Json` |
| `rpc_attach_member_auth_order_payment_intent` | `{ p_order_id: string; p_payment_intent_id: string }` | `Json` |
| `rpc_attach_merchant_order_payment_intent` | `{ p_order_id: string; p_payment_intent_id: string }` | `Json` |
| `rpc_buy_now_listing` | `{ p_buyer_id: string; p_listing_id: string; p_use_auth?: boolean }` | `Json` |
| `rpc_buy_now_merchant_listing` | `{ p_buyer_id: string; p_listing_id: string; p_use_auth?: boolean }` | `Json` |
| `rpc_cancel_member_order` | `{ p_order_id: string; p_user_id: string }` | `Json` |
| `rpc_cancel_merchant_auth_order` | `{ p_merchant_id: string; p_order_id: string }` | `Json` |
| `rpc_claim_flash_reward` | `{ p_campaign_id: string };` | `Json` |
| `rpc_complete_member_auth_grading` | `{ p_order_id: string }` | `Json` |
| `rpc_complete_member_order` | `{ p_order_id: string; p_user_id: string }` | `Json` |
| `rpc_complete_merchant_order` | `{ p_order_id: string; p_user_id: string }` | `Json` |
| `rpc_confirm_buyer_received` | `{ p_buyer_id: string; p_order_id: string }` | `Json` |
| `rpc_confirm_merchant_buyer_receipt` | `{ p_order_id: string }` | `Json` |
| `rpc_confirm_platform_received` | `{ p_order_id: string }` | `Json` |
| `rpc_e2e_backdate_coupon_reserve` | `{ p_minutes_ago?: number; p_user_reward_id: string }` | `Json` |
| `rpc_e2e_backdate_merchant_order_created_at` | `{ p_hours_ago?: number; p_order_id: string }` | `undefined` |
| `rpc_e2e_backdate_merchant_payout_hold` | `{ p_order_id: string }` | `Json` |
| `rpc_e2e_clear_unsettled_grading_recovery` | `{ p_merchant_id: string }` | `Json` |
| `rpc_e2e_is_merchant_payout_hold_elapsed` | `{ p_order_id: string }` | `boolean` |
| `rpc_e2e_reset_listing_trading_fixture` | `{ p_buyer_id: string; p_listing_id: string; p_seller_id: string }` | `Json` |
| `rpc_e2e_seed_member_auth_pending_payment_order` | `{ p_buyer_id: string; p_listing_id: string }` | `string` |
| `rpc_e2e_seed_member_auth_refund_eligible_order` | `{ p_buyer_id: string p_listing_id: string p_payment_intent_suffix?: string }` | `string` |
| `rpc_e2e_seed_merchant_auth_confirm_guard_order` | `{ p_buyer_id: string p_listing_id: string p_payment_intent_suffix?: string }` | `string` |
| `rpc_e2e_seed_merchant_auth_refund_eligible_order` | `{ p_buyer_id: string p_listing_id: string p_payment_intent_suffix?: string }` | `string` |
| `rpc_e2e_seed_merchant_direct_refund_eligible_order` | `{ p_buyer_id: string p_listing_id: string p_payment_intent_suffix?: string }` | `string` |
| `rpc_e2e_seed_merchant_pending_payment_order` | `{ p_buyer_id: string; p_listing_id: string }` | `string` |
| `rpc_e2e_seed_merchant_shipped_awaiting_confirm` | `{ p_buyer_id: string p_item_subtotal?: number p_listing_id: string p_payment_intent_suffix?: string…` | `string` |
| `rpc_e2e_set_merchant_order_payout_retry_test_state` | `{ p_order_id: string; p_scenario: string }` | `Json` |
| `rpc_ensure_chat_room` | `{ p_partner_id: string p_partner_persona?: Database["public"]["Enums"]["seller_persona_type"] p_vie…` | `Json` |
| `rpc_fail_member_auth_order` | `{ p_order_id: string }` | `Json` |
| `rpc_finalize_auth_fee_capture` | `{ p_admin_id?: string p_captured_amount_cents: number p_order_id: string p_order_kind: string p_pay…` | `Json` |
| `rpc_finalize_auth_grading_fail` | `{ p_order_id: string p_order_kind: string p_payment_intent_id: string }` | `Json` |
| `rpc_finalize_auth_intake_confirm` | `{ p_admin_id?: string p_order_id: string p_order_kind: string p_payment_intent_id: string }` | `Json` |
| `rpc_finalize_auth_refund` | `{ p_order_id: string p_order_kind: string p_refund_amount_cents: number p_refund_id: string }` | `Json` |
| `rpc_finalize_goods_capture` | `{ p_admin_id?: string p_auth_grading_company?: string p_auth_grading_score?: string p_captured_amou…` | `Json` |
| `rpc_finalize_member_fps_payout_ready` | `{ p_order_id: string }` | `Json` |
| `rpc_finalize_merchant_order_payout` | `{ p_destination_account_id: string p_order_id: string p_transfer_amount_cents: number p_transfer_id…` | `Json } | { Args: { p_destination_account_id: string p_order_id: string p_recovery_applications?: Js…` |
| `rpc_finalize_merchant_pending_payment_expiry` | `{ p_order_id: string }` | `Json` |
| `rpc_finalize_moderation_order_refund` | `{ p_case_id?: string p_order_id: string p_payment_intent_id: string p_refund_cents: number p_refund…` | `Json` |
| `rpc_finalize_stale_coupon_reserve` | `{ p_user_reward_id: string }` | `Json` |
| `rpc_get_auth_escrow_capture_model` | `{ p_order_id: string; p_order_kind: string }` | `Json` |
| `rpc_get_user_reviewed_member_order_ids` | `{ p_order_ids: string[] }` | `string[]` |
| `rpc_get_user_reviewed_merchant_order_ids` | `{ p_order_ids: string[] }` | `string[]` |
| `rpc_increment_listing_view` | `{ p_listing_id: string }` | `undefined` |
| `rpc_list_active_flash_campaigns` | `never;` | `Json` |
| `rpc_list_chat_unread_digest_candidates` | `{ p_limit?: number }` | `{ unread_count: number user_id: string }[]` |
| `rpc_list_checkout_eligible_coupons` | `{ p_order_id: string p_shipping_method?: string p_use_auth?: boolean }` | `Json` |
| `rpc_list_home_trade_ticker` | `{ p_limit?: number }` | `{ card_code: string completed_at: string price_hkd: number product_name: string trade_id: string }[]` |
| `rpc_list_member_fps_payout_ready_candidates` | `{ p_limit?: number }` | `{ order_id: string }[]` |
| `rpc_list_merchant_connect_payout_candidates` | `{ p_limit?: number }` | `{ order_id: string }[]` |
| `rpc_list_merchant_finance_settlements` | `{ p_date_from?: string p_date_to?: string p_page?: number p_page_size?: number p_search?: string p_…` | `Json` |
| `rpc_list_merchant_pending_payment_expiry_candidates` | `{ p_limit?: number }` | `{ listing_id: string order_id: string stripe_payment_intent_id: string }[]` |
| `rpc_list_points_redemption_catalog` | `never;` | `Json` |
| `rpc_list_stale_coupon_reserve_candidates` | `{ p_limit?: number }` | `{ order_id: string order_kind: string user_reward_id: string }[]` |
| `rpc_make_offer` | `{ p_buyer_id: string p_content: string p_listing_id: string p_offer_price: number }` | `Json } | { Args: { p_buyer_id: string p_content: string p_listing_id: string p_offer_price: number …` |
| `rpc_mark_auth_grading_fail_failed` | `{ p_error: string; p_order_id: string; p_order_kind: string }` | `Json` |
| `rpc_mark_auth_order_payment_voided` | `{ p_order_id: string p_order_kind: string p_payment_intent_id: string }` | `Json` |
| `rpc_mark_auth_refund_failed` | `{ p_error: string; p_order_id: string; p_order_kind: string }` | `Json` |
| `rpc_mark_chat_room_read` | `{ p_read_at?: string; p_room_id: string }` | `Json` |
| `rpc_mark_member_auth_order_authorized` | `{ p_amounts?: Json p_order_id: string p_payment_intent_id: string }` | `Json` |
| `rpc_mark_member_auth_order_paid` | `{ p_amounts?: Json p_order_id: string p_payment_intent_id: string }` | `Json` |
| `rpc_mark_merchant_order_authorized` | `{ p_amounts?: Json p_order_id: string p_payment_intent_id: string }` | `Json` |
| `rpc_mark_merchant_order_paid` | `{ p_amounts?: Json p_order_id: string p_payment_intent_id: string }` | `Json` |
| `rpc_mark_merchant_order_payout_failed` | `{ p_error: string; p_order_id: string }` | `Json` |
| `rpc_mark_moderation_order_refund_failed` | `{ p_case_id?: string; p_error: string; p_order_id: string }` | `Json` |
| `rpc_modify_offer` | `{ p_buyer_id: string p_content: string p_new_price: number p_offer_id: string }` | `Json` |
| `rpc_prepare_auth_fee_capture` | `{ p_order_id: string; p_order_kind: string }` | `Json` |
| `rpc_prepare_auth_grading_fail` | `{ p_carrier_liability_party?: string p_fault_party: Database["public"]["Enums"]["grading_fault_part…` | `Json` |
| `rpc_prepare_auth_intake_confirm` | `{ p_order_id: string; p_order_kind: string }` | `Json` |
| `rpc_prepare_goods_capture` | `{ p_auth_grading_company?: string p_auth_grading_score?: string p_notes?: string p_order_id: string…` | `Json` |
| `rpc_prepare_member_auth_order_payment` | `{ p_order_id: string; p_user_reward_id?: string }` | `Json` |
| `rpc_prepare_merchant_order_payment` | `{ p_order_id: string p_shipping_method: string p_use_auth?: boolean }` | `Json } | { Args: { p_buyer_phone?: string p_buyer_remark?: string p_meetup_detail?: string p_order_…` |
| `rpc_prepare_merchant_order_payout` | `{ p_order_id: string }` | `Json` |
| `rpc_prepare_moderation_order_refund` | `{ p_carrier_liability_party?: string p_case_id: string p_fault_party: Database["public"]["Enums"]["…` | `Json` |
| `rpc_redeem_points_catalog_item` | `{ p_catalog_id: string }` | `Json` |
| `rpc_refresh_auth_escrow_payment_intent` | `{ p_order_id: string p_order_kind: string p_payment_intent_id: string }` | `Json` |
| `rpc_reject_offer` | `{ p_offer_id: string; p_seller_id: string }` | `Json` |
| `rpc_resolve_moderation_case` | `{ p_case_id: string; p_payload: Json }` | `Json` |
| `rpc_retry_moderation_order_refund_prepare` | `{ p_case_id: string; p_order_id: string }` | `Json` |
| `rpc_send_chat_message` | `{ p_content: string; p_room_id: string; p_sender_id: string }` | `Json` |
| `rpc_service_seed_user_points` | `{ p_description?: string; p_points: number; p_user_id: string }` | `Json` |
| `rpc_submit_inbound_tracking` | `{ p_order_id: string p_seller_id: string p_tracking_no: string }` | `Json } | { Args: { p_courier_name?: string p_order_id: string p_seller_id: string p_tracking_no: st…` |
| `rpc_submit_merchant_auth_inbound_tracking` | `{ p_merchant_id: string p_order_id: string p_tracking_no: string }` | `Json } | { Args: { p_courier_name?: string p_merchant_id: string p_order_id: string p_tracking_no: …` |
| `rpc_submit_merchant_direct_fulfillment` | `{ p_courier_name?: string p_merchant_id: string p_order_id: string p_tracking_no?: string }` | `Json` |
| `rpc_submit_merchant_kyc_application` | `{ p_application: Json; p_documents: Json; p_user_id: string }` | `Json` |
| `rpc_submit_outbound_tracking` | `{ p_order_id: string; p_tracking_no: string }` | `Json` |
| `rpc_submit_transaction_review` | `{ p_comment?: string p_order_id: string p_rating: number p_reviewee_id: string p_user_id?: string }` | `Json` |
| `rpc_submit_user_report_v2` | `{ p_attachment_ids?: string[] p_category: Database["public"]["Enums"]["report_category"] p_chat_roo…` | `Json` |
| `run_auto_grant_rewards_for_me` | `never;` | `Json` |
| `search_admin_grading_orders` | `{ p_keyword?: string p_order_kind?: string p_page?: number p_page_size?: number p_tab: string }` | `Json` |
| `search_admin_moderation_cases` | `{ p_category?: Database["public"]["Enums"]["report_category"] p_min_score?: number p_page?: number …` | `Json` |
| `search_admin_platform_users` | `{ p_keyword?: string p_kyc_filter?: string p_page?: number p_page_size?: number p_user_types?: stri…` | `Json` |
| `search_marketplace_products` | `{ p_card_number?: string p_catalog_types?: Database["public"]["Enums"]["catalog_type"][] p_grade_fi…` | `{ card_number: string catalog_type: Database["public"]["Enums"]["catalog_type"] display_id: string …` |
| `search_marketplace_products_browse` | `{ p_page?: number; p_page_size?: number; p_sort?: string }` | `{ card_number: string catalog_type: Database["public"]["Enums"]["catalog_type"] display_id: string …` |
| `search_marketplace_seller_listings` | `{ p_grade_filters?: Json p_name_query?: string p_page?: number p_page_size?: number p_price_max?: n…` | `{ card_number: string created_at: string display_id: string grading_company: string grading_score: …` |
| `search_merchant_trading_orders` | `{ p_include_auth_in_progress?: boolean p_include_payment_pending?: boolean p_page?: number p_page_s…` | `{ buyer_avatar_path: string buyer_display_name: string buyer_id: string buyer_username: string card…` |
| `search_product_catalog` | `{ p_item_type?: string; p_query: string }` | `{ card_number: string display_id: string id: string image_url: string jan_code: string name_en: str…` |
| `search_public_profile_reviews` | `{ p_page?: number p_page_size?: number p_persona: Database["public"]["Enums"]["review_persona"] p_p…` | `{ aggregate_rating: number comment: string created_at: string is_merchant_tx: boolean page: number …` |
| `search_user_trading_orders` | `{ p_page?: number p_page_size?: number p_persona?: string p_search_query?: string p_tab_status?: st…` | `{ buyer_id: string card_number: string catalog_image_url: string count_needs_action: number count_p…` |
| `show_limit` | `never;` | `number` |
| `show_trgm` | `{ "": string };` | `string[]` |

---

## Tables


### `account_sanctions`

| Column | Type | Nullable |
|--------|------|----------|
| `case_id` | `string | null` | Yes |
| `created_at` | `string` | No |
| `ends_at` | `string | null` | Yes |
| `id` | `string` | No |
| `reason` | `string | null` | Yes |
| `revoked_at` | `string | null` | Yes |
| `scope` | `sanction_scope` | No |
| `source` | `string` | No |
| `starts_at` | `string` | No |
| `type` | `sanction_type` | No |
| `user_id` | `string` | No |

**Foreign keys:** `case_id` → `moderation_cases`

---

### `chat_messages`

*Domain:* Messaging

| Column | Type | Nullable |
|--------|------|----------|
| `content` | `string` | No |
| `created_at` | `string | null` | Yes |
| `id` | `string` | No |
| `is_system_warning` | `boolean | null` | Yes |
| `member_order_id` | `string | null` | Yes |
| `merchant_order_id` | `string | null` | Yes |
| `offer_id` | `string | null` | Yes |
| `room_id` | `string` | No |
| `sender_id` | `string` | No |

**Foreign keys:** `member_order_id` → `member_orders`

---

### `chat_room_reads`

| Column | Type | Nullable |
|--------|------|----------|
| `last_read_at` | `string` | No |
| `room_id` | `string` | No |
| `user_id` | `string` | No |

**Foreign keys:** `room_id` → `chat_rooms`

---

### `chat_rooms`

*Domain:* Messaging

| Column | Type | Nullable |
|--------|------|----------|
| `buyer_id` | `string` | No |
| `buyer_persona` | `seller_persona_type` | No |
| `created_at` | `string | null` | Yes |
| `id` | `string` | No |
| `seller_id` | `string` | No |
| `seller_persona` | `seller_persona_type` | No |
| `updated_at` | `string | null` | Yes |

**Foreign keys:** `buyer_id` → `profiles`

---

### `check_in_program`

| Column | Type | Nullable |
|--------|------|----------|
| `completion_description` | `string | null` | Yes |
| `completion_enabled` | `boolean` | No |
| `completion_reward_value` | `Json` | No |
| `completion_title` | `string` | No |
| `completion_type` | `reward_type` | No |
| `completion_type_locked` | `boolean` | No |
| `completion_valid_duration_days` | `number | null` | Yes |
| `cycle_length_days` | `number` | No |
| `daily_rewards` | `Json` | No |
| `id` | `string` | No |
| `is_active` | `boolean` | No |
| `updated_at` | `string` | No |
| `updated_by` | `string | null` | Yes |

---

### `gamification_stats`

*Domain:* Gamification

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | `string | null` | Yes |
| `current_streak` | `number | null` | Yes |
| `last_check_in` | `string | null` | Yes |
| `longest_streak` | `number | null` | Yes |
| `points_balance` | `number` | No |
| `updated_at` | `string | null` | Yes |
| `user_id` | `string` | No |

**Foreign keys:** `user_id` → `profiles`

---

### `grading_audit_logs`

| Column | Type | Nullable |
|--------|------|----------|
| `action` | `string` | No |
| `admin_id` | `string` | No |
| `created_at` | `string` | No |
| `from_status` | `string | null` | Yes |
| `id` | `string` | No |
| `notes` | `string | null` | Yes |
| `order_id` | `string` | No |
| `order_kind` | `string` | No |
| `to_status` | `string | null` | Yes |

**Foreign keys:** `admin_id` → `profiles`

---

### `kyc_applications`

| Column | Type | Nullable |
|--------|------|----------|
| `bank_account_holder` | `string | null` | Yes |
| `bank_account_masked` | `string | null` | Yes |
| `bank_account_number` | `string | null` | Yes |
| `bank_code` | `string | null` | Yes |
| `bank_name` | `string | null` | Yes |
| `br_number` | `string` | No |
| `branch_code` | `string | null` | Yes |
| `company_address` | `Json` | No |
| `company_name_en` | `string` | No |
| `company_name_zh` | `string | null` | Yes |
| `company_phone` | `string` | No |
| `created_at` | `string` | No |
| `id` | `string` | No |
| `reject_reason` | `string | null` | Yes |
| `rep_address` | `Json` | No |
| `rep_dob` | `string` | No |
| `rep_email` | `string` | No |
| `rep_hkid` | `string` | No |
| `rep_name_en` | `string` | No |
| `rep_name_zh` | `string | null` | Yes |
| `rep_phone` | `string` | No |
| `rep_title` | `string` | No |
| `reviewed_at` | `string | null` | Yes |
| `reviewed_by` | `string | null` | Yes |
| `status` | `kyc_application_status` | No |
| `updated_at` | `string` | No |
| `user_id` | `string` | No |

**Foreign keys:** `reviewed_by` → `profiles`

---

### `kyc_documents`

| Column | Type | Nullable |
|--------|------|----------|
| `application_id` | `string` | No |
| `content_type` | `string` | No |
| `created_at` | `string` | No |
| `document_type` | `string` | No |
| `id` | `string` | No |
| `storage_path` | `string` | No |
| `stripe_file_id` | `string | null` | Yes |

**Foreign keys:** `application_id` → `kyc_applications`

---

### `kyc_records`

*Domain:* Merchant KYC

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | `string | null` | Yes |
| `kyc_status` | `kyc_state | null` | Yes |
| `merchant_id` | `string` | No |
| `stripe_account_id` | `string | null` | Yes |
| `stripe_charges_enabled` | `boolean` | No |
| `stripe_payouts_enabled` | `boolean` | No |
| `updated_at` | `string | null` | Yes |
| `verified_at` | `string | null` | Yes |

**Foreign keys:** `merchant_id` → `profiles`

---

### `listing_bookmarks`

*Domain:* Marketplace bookmarks

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | `string | null` | Yes |
| `listing_id` | `string` | No |
| `user_id` | `string` | No |

**Foreign keys:** `listing_id` → `listings`

---

### `listing_engagement_events`

| Column | Type | Nullable |
|--------|------|----------|
| `actor_id` | `string | null` | Yes |
| `event_type` | `listing_engagement_event_type` | No |
| `id` | `string` | No |
| `listing_id` | `string` | No |
| `occurred_at` | `string` | No |

**Foreign keys:** `actor_id` → `profiles`

---

### `listing_stats`

*Domain:* Marketplace analytics

| Column | Type | Nullable |
|--------|------|----------|
| `listing_id` | `string` | No |
| `offers_count` | `number` | No |
| `updated_at` | `string | null` | Yes |
| `views` | `number` | No |

**Foreign keys:** `listing_id` → `listings`

---

### `listings`

*Domain:* Marketplace

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | `string` | No |
| `extra_shipping_fee` | `number` | No |
| `grading_company` | `string` | No |
| `grading_score` | `string | null` | Yes |
| `id` | `string` | No |
| `images` | `Json` | No |
| `price` | `number` | No |
| `product_id` | `string` | No |
| `seller_description` | `string | null` | Yes |
| `seller_id` | `string` | No |
| `seller_persona` | `seller_persona_type` | No |
| `source_collection_id` | `string | null` | Yes |
| `status` | `listing_status` | No |
| `updated_at` | `string` | No |
| `use_authentication` | `boolean` | No |

**Foreign keys:** `seller_id` → `profiles`

---

### `member_orders`

*Domain:* P2P orders

| Column | Type | Nullable |
|--------|------|----------|
| `auth_fee` | `number` | No |
| `auth_fee_captured_at` | `string | null` | Yes |
| `auth_graded_at` | `string | null` | Yes |
| `auth_graded_by` | `string | null` | Yes |
| `auth_grading_company` | `string | null` | Yes |
| `auth_grading_score` | `string | null` | Yes |
| `auth_notes` | `string | null` | Yes |
| `auth_result` | `string | null` | Yes |
| `buyer_confirmed_at` | `string | null` | Yes |
| `buyer_id` | `string` | No |
| `buyer_total_amount` | `number | null` | Yes |
| `coupon_type` | `reward_type | null` | Yes |
| `coupon_user_reward_id` | `string | null` | Yes |
| `created_at` | `string | null` | Yes |
| `escrow_capture_model` | `string | null` | Yes |
| `escrow_status` | `| member_escrow_status` | No |
| `expires_at` | `string` | No |
| `extended_count` | `number` | No |
| `fault_party` | `grading_fault_party | null` | Yes |
| `final_price` | `number` | No |
| `id` | `string` | No |
| `inbound_courier_name` | `string | null` | Yes |
| `inbound_shipping_fee` | `number` | No |
| `inbound_tracking_no` | `string | null` | Yes |
| `item_subtotal` | `number | null` | Yes |
| `listing_id` | `string` | No |
| `logistics_proof_path` | `string | null` | Yes |
| `meetup_details` | `Json | null` | Yes |
| `order_number` | `string | null` | Yes |
| `outbound_shipping_fee` | `number` | No |
| `outbound_tracking_no` | `string | null` | Yes |
| `payment_capture_status` | `payment_capture_status` | No |
| `payment_confirmed_at` | `string | null` | Yes |
| `payout_hold_until` | `string | null` | Yes |
| `platform_received_at` | `string | null` | Yes |
| `platform_subsidy_amount` | `number` | No |
| `refund_amount` | `number | null` | Yes |
| `refund_attempted_at` | `string | null` | Yes |
| `refund_error` | `string | null` | Yes |
| `refund_status` | `string` | No |
| `refunded_at` | `string | null` | Yes |
| `seller_id` | `string` | No |
| `seller_payout_status` | `member_seller_payout_status` | No |
| `seller_settlement_status` | `seller_settlement_status` | No |
| `status` | `member_order_state | null` | Yes |
| `stripe_payment_intent_id` | `string | null` | Yes |
| `stripe_refund_id` | `string | null` | Yes |
| `total_amount` | `number | null` | Yes |
| `updated_at` | `string | null` | Yes |
| `use_authentication` | `boolean` | No |

**Foreign keys:** `buyer_id` → `profiles`

---

### `merchant_ledgers`

*Domain:* Merchant finance

| Column | Type | Nullable |
|--------|------|----------|
| `amount` | `number` | No |
| `created_at` | `string | null` | Yes |
| `id` | `string` | No |
| `merchant_id` | `string` | No |
| `order_id` | `string | null` | Yes |
| `stripe_transfer_id` | `string | null` | Yes |
| `transaction_type` | `transaction_type` | No |

**Foreign keys:** `merchant_id` → `profiles`

---

### `merchant_orders`

*Domain:* Escrow orders

| Column | Type | Nullable |
|--------|------|----------|
| `auth_fee` | `number` | No |
| `auth_fee_captured_at` | `string | null` | Yes |
| `auth_graded_at` | `string | null` | Yes |
| `auth_graded_by` | `string | null` | Yes |
| `auth_grading_company` | `string | null` | Yes |
| `auth_grading_score` | `string | null` | Yes |
| `auth_notes` | `string | null` | Yes |
| `auth_result` | `string | null` | Yes |
| `buyer_confirmed_at` | `string | null` | Yes |
| `buyer_id` | `string` | No |
| `buyer_phone` | `string | null` | Yes |
| `buyer_remark` | `string | null` | Yes |
| `buyer_total_amount` | `number | null` | Yes |
| `commission_amount` | `number | null` | Yes |
| `commission_rate_applied` | `number | null` | Yes |
| `coupon_type` | `reward_type | null` | Yes |
| `coupon_user_reward_id` | `string | null` | Yes |
| `created_at` | `string | null` | Yes |
| `escrow_capture_model` | `string | null` | Yes |
| `escrow_status` | `escrow_state | null` | Yes |
| `fault_party` | `grading_fault_party | null` | Yes |
| `final_price` | `number` | No |
| `id` | `string` | No |
| `inbound_courier_name` | `string | null` | Yes |
| `inbound_shipping_fee` | `number` | No |
| `inbound_tracking_no` | `string | null` | Yes |
| `item_subtotal` | `number | null` | Yes |
| `listing_id` | `string` | No |
| `logistics_proof_path` | `string | null` | Yes |
| `meetup_detail` | `string | null` | Yes |
| `merchant_id` | `string` | No |
| `merchant_payout_amount` | `number | null` | Yes |
| `merchant_payout_gross` | `number | null` | Yes |
| `order_number` | `string | null` | Yes |
| `outbound_courier_name` | `string | null` | Yes |
| `outbound_shipping_fee` | `number` | No |
| `outbound_tracking_no` | `string | null` | Yes |
| `paid_at` | `string | null` | Yes |
| `payment_capture_status` | `payment_capture_status` | No |
| `payout_attempted_at` | `string | null` | Yes |
| `payout_error` | `string | null` | Yes |
| `payout_hold_until` | `string | null` | Yes |
| `payout_status` | `string` | No |
| `platform_received_at` | `string | null` | Yes |
| `platform_subsidy_amount` | `number` | No |
| `refund_amount` | `number | null` | Yes |
| `refund_attempted_at` | `string | null` | Yes |
| `refund_error` | `string | null` | Yes |
| `refund_status` | `string` | No |
| `refunded_at` | `string | null` | Yes |
| `requires_authentication` | `boolean | null` | Yes |
| `seller_settlement_status` | `seller_settlement_status` | No |
| `sf_address` | `string | null` | Yes |
| `sf_locker_code` | `string | null` | Yes |
| `shipping_fee` | `number` | No |
| `shipping_method` | `string | null` | Yes |
| `stripe_destination_account_id` | `string | null` | Yes |
| `stripe_payment_intent_id` | `string | null` | Yes |
| `stripe_refund_id` | `string | null` | Yes |
| `stripe_transfer_id` | `string | null` | Yes |
| `total_amount` | `number | null` | Yes |
| `transferred_at` | `string | null` | Yes |
| `updated_at` | `string | null` | Yes |

**Foreign keys:** `buyer_id` → `profiles`

---

### `merchant_shops`

*Domain:* Merchant storefront

| Column | Type | Nullable |
|--------|------|----------|
| `base_courier_shipping_fee` | `number` | No |
| `business_details` | `Json | null` | Yes |
| `cancelled_trades_count` | `number` | No |
| `completed_trades_count` | `number` | No |
| `created_at` | `string | null` | Yes |
| `merchant_id` | `string` | No |
| `rating_score` | `number | null` | Yes |
| `reputation_tag` | `Json | null` | Yes |
| `shipping_speed_score` | `number | null` | Yes |
| `shop_avatar_path` | `string | null` | Yes |
| `shop_description` | `string | null` | Yes |
| `shop_handle` | `string | null` | Yes |
| `shop_name` | `string | null` | Yes |
| `shop_rating_score` | `number | null` | Yes |
| `top_banner_path` | `string | null` | Yes |
| `updated_at` | `string | null` | Yes |

**Foreign keys:** `merchant_id` → `profiles`

---

### `moderation_audit_logs`

| Column | Type | Nullable |
|--------|------|----------|
| `action` | `string` | No |
| `admin_id` | `string` | No |
| `case_id` | `string` | No |
| `created_at` | `string` | No |
| `id` | `string` | No |
| `payload` | `Json` | No |

**Foreign keys:** `admin_id` → `profiles`

---

### `moderation_cases`

| Column | Type | Nullable |
|--------|------|----------|
| `adjustment_reason` | `string | null` | Yes |
| `admin_adjustment` | `number` | No |
| `auto_score` | `number` | No |
| `case_number` | `string` | No |
| `created_at` | `string` | No |
| `final_score` | `number | null` | Yes |
| `id` | `string` | No |
| `primary_category` | `| report_category` | No |
| `resolution` | `| moderation_resolution` | No |
| `resolved_at` | `string | null` | Yes |
| `resolved_by` | `string | null` | Yes |
| `status` | `moderation_case_status` | No |
| `subject_user_id` | `string` | No |
| `updated_at` | `string` | No |
| `violation_persona` | `| violation_persona` | No |

**Foreign keys:** `resolved_by` → `profiles`

---

### `notification_email_outbox`

| Column | Type | Nullable |
|--------|------|----------|
| `attempts` | `number` | No |
| `created_at` | `string` | No |
| `event_id` | `string` | No |
| `html_body` | `string` | No |
| `id` | `string` | No |
| `idempotency_key` | `string` | No |
| `last_error` | `string | null` | Yes |
| `max_attempts` | `number` | No |
| `next_attempt_at` | `string` | No |
| `payload` | `Json` | No |
| `resend_message_id` | `string | null` | Yes |
| `sent_at` | `string | null` | Yes |
| `status` | `notification_email_status` | No |
| `subject` | `string` | No |
| `template_key` | `string` | No |
| `text_body` | `string | null` | Yes |
| `to_email` | `string` | No |
| `updated_at` | `string` | No |

---

### `offers`

*Domain:* Negotiation

| Column | Type | Nullable |
|--------|------|----------|
| `buyer_id` | `string` | No |
| `created_at` | `string | null` | Yes |
| `id` | `string` | No |
| `listing_id` | `string | null` | Yes |
| `modified_count` | `number` | No |
| `offer_price` | `number` | No |
| `room_id` | `string` | No |
| `status` | `offer_status | null` | Yes |
| `updated_at` | `string | null` | Yes |
| `use_authentication` | `boolean` | No |

**Foreign keys:** `buyer_id` → `profiles`

---

### `payout_batches`

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | `string` | No |
| `cutoff_at` | `string` | No |
| `id` | `string` | No |
| `notes` | `string | null` | Yes |
| `processed_by` | `string | null` | Yes |
| `scheduled_date` | `string` | No |
| `status` | `payout_batch_status` | No |
| `updated_at` | `string` | No |

**Foreign keys:** `processed_by` → `profiles`

---

### `payout_requests`

| Column | Type | Nullable |
|--------|------|----------|
| `admin_fps_reference` | `string | null` | Yes |
| `amount` | `number` | No |
| `batch_id` | `string | null` | Yes |
| `created_at` | `string` | No |
| `fps_id_snapshot` | `string` | No |
| `fps_name_snapshot` | `string | null` | Yes |
| `fps_transfer_fee_hkd` | `number` | No |
| `gross_payout_hkd` | `number` | No |
| `id` | `string` | No |
| `order_id` | `string` | No |
| `paid_at` | `string | null` | Yes |
| `paid_by` | `string | null` | Yes |
| `ready_at` | `string | null` | Yes |
| `seller_id` | `string` | No |
| `status` | `payout_request_status` | No |
| `updated_at` | `string` | No |

**Foreign keys:** `batch_id` → `payout_batches`

---

### `platform_announcements`

| Column | Type | Nullable |
|--------|------|----------|
| `content` | `string` | No |
| `created_at` | `string` | No |
| `created_by` | `string | null` | Yes |
| `end_date` | `string` | No |
| `id` | `string` | No |
| `image_object_key` | `string | null` | Yes |
| `image_url` | `string` | No |
| `is_active` | `boolean` | No |
| `link_url` | `string | null` | Yes |
| `priority` | `number` | No |
| `show_in_announcements` | `boolean` | No |
| `show_on_home_banner` | `boolean` | No |
| `start_date` | `string` | No |
| `title` | `string` | No |
| `updated_at` | `string` | No |

**Foreign keys:** `created_by` → `profiles`

---

### `platform_settings`

| Column | Type | Nullable |
|--------|------|----------|
| `key` | `string` | No |
| `updated_at` | `string` | No |
| `updated_by` | `string | null` | Yes |
| `value` | `Json` | No |

**Foreign keys:** `updated_by` → `profiles`

---

### `point_ledger`

| Column | Type | Nullable |
|--------|------|----------|
| `amount` | `number` | No |
| `balance_after` | `number` | No |
| `created_at` | `string` | No |
| `description` | `string | null` | Yes |
| `id` | `string` | No |
| `source_ref` | `string | null` | Yes |
| `source_type` | `string` | No |
| `user_id` | `string` | No |

**Foreign keys:** `user_id` → `profiles`

---

### `product_catalog`

*Domain:* Catalog

| Column | Type | Nullable |
|--------|------|----------|
| `card_number` | `string | null` | Yes |
| `card_text` | `Json | null` | Yes |
| `created_at` | `string` | No |
| `display_id` | `string | null` | Yes |
| `element_type` | `string | null` | Yes |
| `hp` | `number | null` | Yes |
| `id` | `string` | No |
| `id_canonical` | `string | null` | Yes |
| `id_compact` | `string | null` | Yes |
| `image_url` | `string` | No |
| `jan_code` | `string | null` | Yes |
| `last_synced_at` | `string | null` | Yes |
| `name_en` | `string | null` | Yes |
| `name_ja` | `string` | No |
| `name_zh` | `string | null` | Yes |
| `pack_count` | `number | null` | Yes |
| `pokemon_stage` | `string | null` | Yes |
| `rarity` | `string | null` | Yes |
| `set_code` | `string` | No |
| `snkr_rank` | `number | null` | Yes |
| `sub_type_ja` | `string | null` | Yes |
| `type` | `catalog_type` | No |
| `updated_at` | `string` | No |

---

### `product_grading_market_prices`

| Column | Type | Nullable |
|--------|------|----------|
| `grading_company` | `string` | No |
| `grading_score` | `string` | No |
| `id` | `string` | No |
| `market_avg_price` | `number | null` | Yes |
| `market_chart_data` | `Json | null` | Yes |
| `market_data_source` | `string` | No |
| `market_trend_30d` | `number | null` | Yes |
| `product_id` | `string | null` | Yes |
| `updated_at` | `string | null` | Yes |

**Foreign keys:** `product_id` → `product_catalog`

---

### `product_price_snapshots`

*Domain:* Catalog / pricing

| Column | Type | Nullable |
|--------|------|----------|
| `condition_name_ja` | `string | null` | Yes |
| `condition_type` | `string` | No |
| `created_at` | `string` | No |
| `grading_company` | `string | null` | Yes |
| `grading_score` | `string | null` | Yes |
| `id` | `string` | No |
| `member_order_id` | `string | null` | Yes |
| `price_hkd` | `number | null` | Yes |
| `price_jpy` | `number` | No |
| `product_id` | `string` | No |
| `snapshot_date` | `string` | No |
| `source` | `string | null` | Yes |

**Foreign keys:** `member_order_id` → `member_orders`

---

### `product_watchlists`

*Domain:* User watchlist

| Column | Type | Nullable |
|--------|------|----------|
| `alert_enabled` | `boolean` | No |
| `created_at` | `string` | No |
| `grading_company` | `string` | No |
| `grading_score` | `string` | No |
| `last_alerted_at` | `string | null` | Yes |
| `product_id` | `string` | No |
| `target_price` | `number | null` | Yes |
| `tracked_price` | `number | null` | Yes |
| `user_id` | `string` | No |

**Foreign keys:** `user_id` → `profiles`

---

### `profiles`

*Domain:* Users & auth

| Column | Type | Nullable |
|--------|------|----------|
| `avatar_path` | `string | null` | Yes |
| `cancelled_trades_count` | `number` | No |
| `completed_trades_count` | `number` | No |
| `created_at` | `string` | No |
| `display_name` | `string` | No |
| `email_market_alerts` | `boolean` | No |
| `email_rewards` | `boolean` | No |
| `email_transactional` | `boolean` | No |
| `fps_id` | `string | null` | Yes |
| `fps_name` | `string | null` | Yes |
| `id` | `string` | No |
| `last_active_at` | `string | null` | Yes |
| `last_chat_digest_pushed_at` | `string | null` | Yes |
| `push_chat_digest` | `boolean` | No |
| `push_market_alerts` | `boolean` | No |
| `push_rewards` | `boolean` | No |
| `push_transactional` | `boolean` | No |
| `rating_score` | `number | null` | Yes |
| `reputation_tag` | `Json | null` | Yes |
| `role` | `user_role` | No |
| `short_description` | `string | null` | Yes |
| `total_trades` | `number | null` | Yes |
| `updated_at` | `string` | No |
| `username` | `string | null` | Yes |

---

### `report_attachments`

| Column | Type | Nullable |
|--------|------|----------|
| `byte_size` | `number` | No |
| `created_at` | `string` | No |
| `id` | `string` | No |
| `mime_type` | `string` | No |
| `report_id` | `string | null` | Yes |
| `reporter_id` | `string` | No |
| `storage_path` | `string` | No |

**Foreign keys:** `report_id` → `reports`

---

### `reports`

*Domain:* Moderation

| Column | Type | Nullable |
|--------|------|----------|
| `case_id` | `string | null` | Yes |
| `category` | `report_category | null` | Yes |
| `category_weight_snapshot` | `number | null` | Yes |
| `context_id` | `string | null` | Yes |
| `context_type` | `string | null` | Yes |
| `contribution_score` | `number | null` | Yes |
| `created_at` | `string | null` | Yes |
| `details` | `string | null` | Yes |
| `id` | `string` | No |
| `outcome_acknowledged_at` | `string | null` | Yes |
| `reason` | `string` | No |
| `reporter_id` | `string` | No |
| `source` | `report_source | null` | Yes |
| `status` | `report_state | null` | Yes |
| `target_id` | `string` | No |
| `target_type` | `string` | No |
| `updated_at` | `string | null` | Yes |

**Foreign keys:** `reporter_id` → `profiles`

---

### `reward_campaign_claims`

| Column | Type | Nullable |
|--------|------|----------|
| `campaign_id` | `string` | No |
| `claim_day` | `string` | No |
| `claimed_at` | `string` | No |
| `id` | `string` | No |
| `user_id` | `string` | No |
| `user_reward_id` | `string` | No |

**Foreign keys:** `campaign_id` → `reward_campaigns`

---

### `reward_campaigns`

| Column | Type | Nullable |
|--------|------|----------|
| `claimed_count` | `number` | No |
| `created_at` | `string` | No |
| `created_by` | `string | null` | Yes |
| `ends_at` | `string` | No |
| `id` | `string` | No |
| `max_claims` | `number` | No |
| `max_claims_per_user` | `number` | No |
| `name` | `string` | No |
| `override_valid_days` | `number | null` | Yes |
| `starts_at` | `string` | No |
| `status` | `reward_campaign_status` | No |
| `template_id` | `string` | No |
| `updated_at` | `string` | No |

**Foreign keys:** `template_id` → `reward_templates`

---

### `reward_redemption_catalog`

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | `string` | No |
| `display_order` | `number` | No |
| `id` | `string` | No |
| `initial_stock` | `number | null` | Yes |
| `is_active` | `boolean` | No |
| `max_redemptions_per_user` | `number | null` | Yes |
| `points_cost` | `number` | No |
| `stock` | `number` | No |
| `template_id` | `string` | No |
| `updated_at` | `string` | No |

**Foreign keys:** `template_id` → `reward_templates`

---

### `reward_redemption_claims`

| Column | Type | Nullable |
|--------|------|----------|
| `catalog_id` | `string` | No |
| `created_at` | `string` | No |
| `id` | `string` | No |
| `points_spent` | `number` | No |
| `user_id` | `string` | No |
| `user_reward_id` | `string | null` | Yes |

**Foreign keys:** `catalog_id` → `reward_redemption_catalog`

---

### `reward_template_audits`

| Column | Type | Nullable |
|--------|------|----------|
| `action` | `reward_template_audit_action` | No |
| `admin_id` | `string` | No |
| `created_at` | `string` | No |
| `id` | `string` | No |
| `snapshot` | `Json` | No |
| `template_id` | `string` | No |

**Foreign keys:** `admin_id` → `profiles`

---

### `reward_templates`

*Domain:* Rewards

| Column | Type | Nullable |
|--------|------|----------|
| `claimed_count` | `number` | No |
| `created_at` | `string | null` | Yes |
| `description` | `string | null` | Yes |
| `distribution_mode` | `reward_distribution_mode` | No |
| `fixed_expiry_date` | `string | null` | Yes |
| `id` | `string` | No |
| `is_active` | `boolean | null` | Yes |
| `is_infinite` | `boolean | null` | Yes |
| `max_claims` | `number | null` | Yes |
| `restrictions` | `Json` | No |
| `reward_value` | `Json` | No |
| `status` | `reward_template_status` | No |
| `title` | `string` | No |
| `trigger_conditions` | `Json` | No |
| `type` | `reward_type` | No |
| `updated_at` | `string | null` | Yes |
| `valid_duration_days` | `number | null` | Yes |

---

### `seller_receivables`

| Column | Type | Nullable |
|--------|------|----------|
| `amount_hkd` | `number` | No |
| `created_at` | `string` | No |
| `fps_reference` | `string | null` | Yes |
| `id` | `string` | No |
| `notes` | `string | null` | Yes |
| `order_id` | `string` | No |
| `order_kind` | `string` | No |
| `paid_at` | `string | null` | Yes |
| `paid_by` | `string | null` | Yes |
| `seller_id` | `string` | No |
| `status` | `seller_receivable_status` | No |
| `stripe_fee_hkd` | `number | null` | Yes |
| `updated_at` | `string` | No |

**Foreign keys:** `paid_by` → `profiles`

---

### `transaction_reviews`

*Domain:* Reputation

| Column | Type | Nullable |
|--------|------|----------|
| `comment` | `string | null` | Yes |
| `created_at` | `string` | No |
| `id` | `string` | No |
| `is_public` | `boolean` | No |
| `member_order_id` | `string | null` | Yes |
| `merchant_order_id` | `string | null` | Yes |
| `rating` | `number` | No |
| `reviewee_id` | `string` | No |
| `reviewee_persona` | `review_persona` | No |
| `reviewer_id` | `string` | No |

**Foreign keys:** `reviewee_id` → `profiles`

---

### `user_collections`

*Domain:* User portfolio

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | `string` | No |
| `grading_company` | `string` | No |
| `grading_score` | `string` | No |
| `id` | `string` | No |
| `product_id` | `string` | No |
| `purchase_price` | `number` | No |
| `sold_at` | `string | null` | Yes |
| `sold_listing_id` | `string | null` | Yes |
| `sold_price` | `number | null` | Yes |
| `updated_at` | `string` | No |
| `user_id` | `string` | No |

**Foreign keys:** `user_id` → `profiles`

---

### `user_push_subscriptions`

| Column | Type | Nullable |
|--------|------|----------|
| `created_at` | `string` | No |
| `id` | `string` | No |
| `onesignal_subscription_id` | `string` | No |
| `onesignal_user_id` | `string | null` | Yes |
| `opted_in` | `boolean` | No |
| `updated_at` | `string` | No |
| `user_id` | `string` | No |

---

### `user_rewards`

*Domain:* Rewards

| Column | Type | Nullable |
|--------|------|----------|
| `acknowledged_at` | `string | null` | Yes |
| `calculated_expiry` | `string | null` | Yes |
| `created_at` | `string | null` | Yes |
| `grant_dedup_key` | `string` | No |
| `id` | `string` | No |
| `is_used` | `boolean | null` | Yes |
| `reserved_at` | `string | null` | Yes |
| `reserved_member_order_id` | `string | null` | Yes |
| `reserved_merchant_order_id` | `string | null` | Yes |
| `template_id` | `string` | No |
| `used_at` | `string | null` | Yes |
| `user_id` | `string` | No |

**Foreign keys:** `reserved_member_order_id` → `member_orders`

---

## Table Index

**45 tables**

| Table | Domain |
|-------|--------|
| `account_sanctions` | — |
| `chat_messages` | Messaging |
| `chat_room_reads` | — |
| `chat_rooms` | Messaging |
| `check_in_program` | — |
| `gamification_stats` | Gamification |
| `grading_audit_logs` | — |
| `kyc_applications` | — |
| `kyc_documents` | — |
| `kyc_records` | Merchant KYC |
| `listing_bookmarks` | Marketplace bookmarks |
| `listing_engagement_events` | — |
| `listing_stats` | Marketplace analytics |
| `listings` | Marketplace |
| `member_orders` | P2P orders |
| `merchant_ledgers` | Merchant finance |
| `merchant_orders` | Escrow orders |
| `merchant_shops` | Merchant storefront |
| `moderation_audit_logs` | — |
| `moderation_cases` | — |
| `notification_email_outbox` | — |
| `offers` | Negotiation |
| `payout_batches` | — |
| `payout_requests` | — |
| `platform_announcements` | — |
| `platform_settings` | — |
| `point_ledger` | — |
| `product_catalog` | Catalog |
| `product_grading_market_prices` | — |
| `product_price_snapshots` | Catalog / pricing |
| `product_watchlists` | User watchlist |
| `profiles` | Users & auth |
| `report_attachments` | — |
| `reports` | Moderation |
| `reward_campaign_claims` | — |
| `reward_campaigns` | — |
| `reward_redemption_catalog` | — |
| `reward_redemption_claims` | — |
| `reward_template_audits` | — |
| `reward_templates` | Rewards |
| `seller_receivables` | — |
| `transaction_reviews` | Reputation |
| `user_collections` | User portfolio |
| `user_push_subscriptions` | — |
| `user_rewards` | Rewards |

---

## Notes

- **Single source of truth for code:** import from `types/supabase.ts` only.
- **This markdown file** is a human-readable companion. Regenerate via `bun run supabase:types`.
- **`Json` columns** have flexible structure — document shapes in Server Actions / API handoff docs.
