export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_sanctions: {
        Row: {
          case_id: string | null
          created_at: string
          ends_at: string | null
          id: string
          reason: string | null
          revoked_at: string | null
          scope: Database["public"]["Enums"]["sanction_scope"]
          source: string
          starts_at: string
          type: Database["public"]["Enums"]["sanction_type"]
          user_id: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          reason?: string | null
          revoked_at?: string | null
          scope: Database["public"]["Enums"]["sanction_scope"]
          source?: string
          starts_at?: string
          type: Database["public"]["Enums"]["sanction_type"]
          user_id: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          reason?: string | null
          revoked_at?: string | null
          scope?: Database["public"]["Enums"]["sanction_scope"]
          source?: string
          starts_at?: string
          type?: Database["public"]["Enums"]["sanction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_sanctions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_sanctions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_sanctions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_system_warning: boolean | null
          member_order_id: string | null
          merchant_order_id: string | null
          offer_id: string | null
          room_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_system_warning?: boolean | null
          member_order_id?: string | null
          merchant_order_id?: string | null
          offer_id?: string | null
          room_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_system_warning?: boolean | null
          member_order_id?: string | null
          merchant_order_id?: string | null
          offer_id?: string | null
          room_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_member_order_id_fkey"
            columns: ["member_order_id"]
            isOneToOne: false
            referencedRelation: "member_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_merchant_order_id_fkey"
            columns: ["merchant_order_id"]
            isOneToOne: false
            referencedRelation: "merchant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_room_reads: {
        Row: {
          last_read_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          room_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_reads_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          buyer_id: string
          buyer_persona: Database["public"]["Enums"]["seller_persona_type"]
          created_at: string | null
          id: string
          seller_id: string
          seller_persona: Database["public"]["Enums"]["seller_persona_type"]
          updated_at: string | null
        }
        Insert: {
          buyer_id: string
          buyer_persona?: Database["public"]["Enums"]["seller_persona_type"]
          created_at?: string | null
          id?: string
          seller_id: string
          seller_persona?: Database["public"]["Enums"]["seller_persona_type"]
          updated_at?: string | null
        }
        Update: {
          buyer_id?: string
          buyer_persona?: Database["public"]["Enums"]["seller_persona_type"]
          created_at?: string | null
          id?: string
          seller_id?: string
          seller_persona?: Database["public"]["Enums"]["seller_persona_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_chat_rooms_buyer"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_chat_rooms_buyer"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_chat_rooms_seller_id"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_chat_rooms_seller_id"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      check_in_program: {
        Row: {
          completion_description: string | null
          completion_enabled: boolean
          completion_reward_value: Json
          completion_title: string
          completion_type: Database["public"]["Enums"]["reward_type"]
          completion_type_locked: boolean
          completion_valid_duration_days: number | null
          cycle_length_days: number
          daily_rewards: Json
          id: string
          is_active: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          completion_description?: string | null
          completion_enabled?: boolean
          completion_reward_value?: Json
          completion_title?: string
          completion_type?: Database["public"]["Enums"]["reward_type"]
          completion_type_locked?: boolean
          completion_valid_duration_days?: number | null
          cycle_length_days?: number
          daily_rewards: Json
          id: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          completion_description?: string | null
          completion_enabled?: boolean
          completion_reward_value?: Json
          completion_title?: string
          completion_type?: Database["public"]["Enums"]["reward_type"]
          completion_type_locked?: boolean
          completion_valid_duration_days?: number | null
          cycle_length_days?: number
          daily_rewards?: Json
          id?: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      gamification_stats: {
        Row: {
          created_at: string | null
          current_streak: number | null
          last_check_in: string | null
          longest_streak: number | null
          points_balance: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_streak?: number | null
          last_check_in?: string | null
          longest_streak?: number | null
          points_balance?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_streak?: number | null
          last_check_in?: string | null
          longest_streak?: number | null
          points_balance?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_gamification_stats_user_id"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_gamification_stats_user_id"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_audit_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          from_status: string | null
          id: string
          notes: string | null
          order_id: string
          order_kind: string
          to_status: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          order_id: string
          order_kind: string
          to_status?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          order_kind?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grading_audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_applications: {
        Row: {
          bank_account_holder: string | null
          bank_account_masked: string | null
          bank_account_number: string | null
          bank_code: string | null
          bank_name: string | null
          br_number: string
          branch_code: string | null
          company_address: Json
          company_name_en: string
          company_name_zh: string | null
          company_phone: string
          created_at: string
          id: string
          reject_reason: string | null
          rep_address: Json
          rep_dob: string
          rep_email: string
          rep_hkid: string
          rep_name_en: string
          rep_name_zh: string | null
          rep_phone: string
          rep_title: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["kyc_application_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_account_holder?: string | null
          bank_account_masked?: string | null
          bank_account_number?: string | null
          bank_code?: string | null
          bank_name?: string | null
          br_number: string
          branch_code?: string | null
          company_address: Json
          company_name_en: string
          company_name_zh?: string | null
          company_phone: string
          created_at?: string
          id?: string
          reject_reason?: string | null
          rep_address: Json
          rep_dob: string
          rep_email: string
          rep_hkid: string
          rep_name_en: string
          rep_name_zh?: string | null
          rep_phone: string
          rep_title: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["kyc_application_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_account_holder?: string | null
          bank_account_masked?: string | null
          bank_account_number?: string | null
          bank_code?: string | null
          bank_name?: string | null
          br_number?: string
          branch_code?: string | null
          company_address?: Json
          company_name_en?: string
          company_name_zh?: string | null
          company_phone?: string
          created_at?: string
          id?: string
          reject_reason?: string | null
          rep_address?: Json
          rep_dob?: string
          rep_email?: string
          rep_hkid?: string
          rep_name_en?: string
          rep_name_zh?: string | null
          rep_phone?: string
          rep_title?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["kyc_application_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_documents: {
        Row: {
          application_id: string
          content_type: string
          created_at: string
          document_type: string
          id: string
          storage_path: string
          stripe_file_id: string | null
        }
        Insert: {
          application_id: string
          content_type: string
          created_at?: string
          document_type: string
          id?: string
          storage_path: string
          stripe_file_id?: string | null
        }
        Update: {
          application_id?: string
          content_type?: string
          created_at?: string
          document_type?: string
          id?: string
          storage_path?: string
          stripe_file_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "kyc_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_records: {
        Row: {
          created_at: string | null
          kyc_status: Database["public"]["Enums"]["kyc_state"] | null
          merchant_id: string
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_payouts_enabled: boolean
          updated_at: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_state"] | null
          merchant_id: string
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_payouts_enabled?: boolean
          updated_at?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_state"] | null
          merchant_id?: string
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_payouts_enabled?: boolean
          updated_at?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_kyc_records_merchant_id"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_kyc_records_merchant_id"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_bookmarks: {
        Row: {
          created_at: string | null
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_listing_bookmarks_listing_id"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_listing_bookmarks_listing_id"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_product_summaries"
            referencedColumns: ["lowest_listing_id"]
          },
        ]
      }
      listing_engagement_events: {
        Row: {
          actor_id: string | null
          event_type: Database["public"]["Enums"]["listing_engagement_event_type"]
          id: string
          listing_id: string
          occurred_at: string
        }
        Insert: {
          actor_id?: string | null
          event_type: Database["public"]["Enums"]["listing_engagement_event_type"]
          id?: string
          listing_id: string
          occurred_at?: string
        }
        Update: {
          actor_id?: string | null
          event_type?: Database["public"]["Enums"]["listing_engagement_event_type"]
          id?: string
          listing_id?: string
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_engagement_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_engagement_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_engagement_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_engagement_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_product_summaries"
            referencedColumns: ["lowest_listing_id"]
          },
        ]
      }
      listing_stats: {
        Row: {
          listing_id: string
          offers_count: number
          updated_at: string | null
          views: number
        }
        Insert: {
          listing_id: string
          offers_count?: number
          updated_at?: string | null
          views?: number
        }
        Update: {
          listing_id?: string
          offers_count?: number
          updated_at?: string | null
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_stats_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_stats_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "marketplace_product_summaries"
            referencedColumns: ["lowest_listing_id"]
          },
        ]
      }
      listings: {
        Row: {
          created_at: string
          extra_shipping_fee: number
          grading_company: string
          grading_score: string | null
          id: string
          images: Json
          price: number
          product_id: string
          seller_description: string | null
          seller_id: string
          seller_persona: Database["public"]["Enums"]["seller_persona_type"]
          source_collection_id: string | null
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
          use_authentication: boolean
        }
        Insert: {
          created_at?: string
          extra_shipping_fee?: number
          grading_company?: string
          grading_score?: string | null
          id?: string
          images?: Json
          price: number
          product_id: string
          seller_description?: string | null
          seller_id: string
          seller_persona?: Database["public"]["Enums"]["seller_persona_type"]
          source_collection_id?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          use_authentication?: boolean
        }
        Update: {
          created_at?: string
          extra_shipping_fee?: number
          grading_company?: string
          grading_score?: string | null
          id?: string
          images?: Json
          price?: number
          product_id?: string
          seller_description?: string | null
          seller_id?: string
          seller_persona?: Database["public"]["Enums"]["seller_persona_type"]
          source_collection_id?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          use_authentication?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fk_listings_seller_id"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_listings_seller_id"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_source_collection_id_fkey"
            columns: ["source_collection_id"]
            isOneToOne: false
            referencedRelation: "user_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      member_orders: {
        Row: {
          auth_fee: number
          auth_fee_captured_at: string | null
          auth_graded_at: string | null
          auth_graded_by: string | null
          auth_grading_company: string | null
          auth_grading_score: string | null
          auth_notes: string | null
          auth_result: string | null
          buyer_confirmed_at: string | null
          buyer_id: string
          buyer_total_amount: number | null
          coupon_type: Database["public"]["Enums"]["reward_type"] | null
          coupon_user_reward_id: string | null
          created_at: string | null
          escrow_capture_model: string | null
          escrow_status:
            | Database["public"]["Enums"]["member_escrow_status"]
            | null
          expires_at: string
          extended_count: number
          fault_party: Database["public"]["Enums"]["grading_fault_party"] | null
          final_price: number
          id: string
          inbound_courier_name: string | null
          inbound_shipping_fee: number
          inbound_tracking_no: string | null
          item_subtotal: number | null
          listing_id: string
          logistics_proof_path: string | null
          meetup_details: Json | null
          order_number: string | null
          outbound_shipping_fee: number
          outbound_tracking_no: string | null
          payment_capture_status: Database["public"]["Enums"]["payment_capture_status"]
          payment_confirmed_at: string | null
          payout_hold_until: string | null
          platform_received_at: string | null
          platform_subsidy_amount: number
          refund_amount: number | null
          refund_attempted_at: string | null
          refund_error: string | null
          refund_status: string
          refunded_at: string | null
          seller_id: string
          seller_payout_status: Database["public"]["Enums"]["member_seller_payout_status"]
          seller_settlement_status: Database["public"]["Enums"]["seller_settlement_status"]
          status: Database["public"]["Enums"]["member_order_state"] | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          total_amount: number | null
          updated_at: string | null
          use_authentication: boolean
        }
        Insert: {
          auth_fee?: number
          auth_fee_captured_at?: string | null
          auth_graded_at?: string | null
          auth_graded_by?: string | null
          auth_grading_company?: string | null
          auth_grading_score?: string | null
          auth_notes?: string | null
          auth_result?: string | null
          buyer_confirmed_at?: string | null
          buyer_id: string
          buyer_total_amount?: number | null
          coupon_type?: Database["public"]["Enums"]["reward_type"] | null
          coupon_user_reward_id?: string | null
          created_at?: string | null
          escrow_capture_model?: string | null
          escrow_status?:
            | Database["public"]["Enums"]["member_escrow_status"]
            | null
          expires_at?: string
          extended_count?: number
          fault_party?:
            | Database["public"]["Enums"]["grading_fault_party"]
            | null
          final_price: number
          id?: string
          inbound_courier_name?: string | null
          inbound_shipping_fee?: number
          inbound_tracking_no?: string | null
          item_subtotal?: number | null
          listing_id: string
          logistics_proof_path?: string | null
          meetup_details?: Json | null
          order_number?: string | null
          outbound_shipping_fee?: number
          outbound_tracking_no?: string | null
          payment_capture_status?: Database["public"]["Enums"]["payment_capture_status"]
          payment_confirmed_at?: string | null
          payout_hold_until?: string | null
          platform_received_at?: string | null
          platform_subsidy_amount?: number
          refund_amount?: number | null
          refund_attempted_at?: string | null
          refund_error?: string | null
          refund_status?: string
          refunded_at?: string | null
          seller_id: string
          seller_payout_status?: Database["public"]["Enums"]["member_seller_payout_status"]
          seller_settlement_status?: Database["public"]["Enums"]["seller_settlement_status"]
          status?: Database["public"]["Enums"]["member_order_state"] | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
          use_authentication?: boolean
        }
        Update: {
          auth_fee?: number
          auth_fee_captured_at?: string | null
          auth_graded_at?: string | null
          auth_graded_by?: string | null
          auth_grading_company?: string | null
          auth_grading_score?: string | null
          auth_notes?: string | null
          auth_result?: string | null
          buyer_confirmed_at?: string | null
          buyer_id?: string
          buyer_total_amount?: number | null
          coupon_type?: Database["public"]["Enums"]["reward_type"] | null
          coupon_user_reward_id?: string | null
          created_at?: string | null
          escrow_capture_model?: string | null
          escrow_status?:
            | Database["public"]["Enums"]["member_escrow_status"]
            | null
          expires_at?: string
          extended_count?: number
          fault_party?:
            | Database["public"]["Enums"]["grading_fault_party"]
            | null
          final_price?: number
          id?: string
          inbound_courier_name?: string | null
          inbound_shipping_fee?: number
          inbound_tracking_no?: string | null
          item_subtotal?: number | null
          listing_id?: string
          logistics_proof_path?: string | null
          meetup_details?: Json | null
          order_number?: string | null
          outbound_shipping_fee?: number
          outbound_tracking_no?: string | null
          payment_capture_status?: Database["public"]["Enums"]["payment_capture_status"]
          payment_confirmed_at?: string | null
          payout_hold_until?: string | null
          platform_received_at?: string | null
          platform_subsidy_amount?: number
          refund_amount?: number | null
          refund_attempted_at?: string | null
          refund_error?: string | null
          refund_status?: string
          refunded_at?: string | null
          seller_id?: string
          seller_payout_status?: Database["public"]["Enums"]["member_seller_payout_status"]
          seller_settlement_status?: Database["public"]["Enums"]["seller_settlement_status"]
          status?: Database["public"]["Enums"]["member_order_state"] | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
          use_authentication?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fk_member_orders_buyer"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_member_orders_buyer"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_member_orders_listing_id"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_member_orders_listing_id"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_product_summaries"
            referencedColumns: ["lowest_listing_id"]
          },
          {
            foreignKeyName: "fk_member_orders_seller"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_member_orders_seller"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_orders_auth_graded_by_fkey"
            columns: ["auth_graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_orders_auth_graded_by_fkey"
            columns: ["auth_graded_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_orders_coupon_user_reward_id_fkey"
            columns: ["coupon_user_reward_id"]
            isOneToOne: false
            referencedRelation: "user_rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_ledgers: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          merchant_id: string
          order_id: string | null
          stripe_transfer_id: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          merchant_id: string
          order_id?: string | null
          stripe_transfer_id?: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          merchant_id?: string
          order_id?: string | null
          stripe_transfer_id?: string | null
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "fk_merchant_ledgers_merchant_id"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_merchant_ledgers_merchant_id"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_orders: {
        Row: {
          auth_fee: number
          auth_fee_captured_at: string | null
          auth_graded_at: string | null
          auth_graded_by: string | null
          auth_grading_company: string | null
          auth_grading_score: string | null
          auth_notes: string | null
          auth_result: string | null
          buyer_confirmed_at: string | null
          buyer_id: string
          buyer_phone: string | null
          buyer_remark: string | null
          buyer_total_amount: number | null
          commission_amount: number | null
          commission_rate_applied: number | null
          coupon_type: Database["public"]["Enums"]["reward_type"] | null
          coupon_user_reward_id: string | null
          created_at: string | null
          escrow_capture_model: string | null
          escrow_status: Database["public"]["Enums"]["escrow_state"] | null
          fault_party: Database["public"]["Enums"]["grading_fault_party"] | null
          final_price: number
          id: string
          inbound_courier_name: string | null
          inbound_shipping_fee: number
          inbound_tracking_no: string | null
          item_subtotal: number | null
          listing_id: string
          logistics_proof_path: string | null
          meetup_detail: string | null
          merchant_id: string
          merchant_payout_amount: number | null
          merchant_payout_gross: number | null
          order_number: string | null
          outbound_courier_name: string | null
          outbound_shipping_fee: number
          outbound_tracking_no: string | null
          paid_at: string | null
          payment_capture_status: Database["public"]["Enums"]["payment_capture_status"]
          payout_attempted_at: string | null
          payout_error: string | null
          payout_hold_until: string | null
          payout_status: string
          platform_received_at: string | null
          platform_subsidy_amount: number
          refund_amount: number | null
          refund_attempted_at: string | null
          refund_error: string | null
          refund_status: string
          refunded_at: string | null
          requires_authentication: boolean | null
          seller_settlement_status: Database["public"]["Enums"]["seller_settlement_status"]
          sf_address: string | null
          sf_locker_code: string | null
          shipping_fee: number
          shipping_method: string | null
          stripe_destination_account_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          stripe_transfer_id: string | null
          total_amount: number | null
          transferred_at: string | null
          updated_at: string | null
        }
        Insert: {
          auth_fee?: number
          auth_fee_captured_at?: string | null
          auth_graded_at?: string | null
          auth_graded_by?: string | null
          auth_grading_company?: string | null
          auth_grading_score?: string | null
          auth_notes?: string | null
          auth_result?: string | null
          buyer_confirmed_at?: string | null
          buyer_id: string
          buyer_phone?: string | null
          buyer_remark?: string | null
          buyer_total_amount?: number | null
          commission_amount?: number | null
          commission_rate_applied?: number | null
          coupon_type?: Database["public"]["Enums"]["reward_type"] | null
          coupon_user_reward_id?: string | null
          created_at?: string | null
          escrow_capture_model?: string | null
          escrow_status?: Database["public"]["Enums"]["escrow_state"] | null
          fault_party?:
            | Database["public"]["Enums"]["grading_fault_party"]
            | null
          final_price: number
          id?: string
          inbound_courier_name?: string | null
          inbound_shipping_fee?: number
          inbound_tracking_no?: string | null
          item_subtotal?: number | null
          listing_id: string
          logistics_proof_path?: string | null
          meetup_detail?: string | null
          merchant_id: string
          merchant_payout_amount?: number | null
          merchant_payout_gross?: number | null
          order_number?: string | null
          outbound_courier_name?: string | null
          outbound_shipping_fee?: number
          outbound_tracking_no?: string | null
          paid_at?: string | null
          payment_capture_status?: Database["public"]["Enums"]["payment_capture_status"]
          payout_attempted_at?: string | null
          payout_error?: string | null
          payout_hold_until?: string | null
          payout_status?: string
          platform_received_at?: string | null
          platform_subsidy_amount?: number
          refund_amount?: number | null
          refund_attempted_at?: string | null
          refund_error?: string | null
          refund_status?: string
          refunded_at?: string | null
          requires_authentication?: boolean | null
          seller_settlement_status?: Database["public"]["Enums"]["seller_settlement_status"]
          sf_address?: string | null
          sf_locker_code?: string | null
          shipping_fee?: number
          shipping_method?: string | null
          stripe_destination_account_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          stripe_transfer_id?: string | null
          total_amount?: number | null
          transferred_at?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_fee?: number
          auth_fee_captured_at?: string | null
          auth_graded_at?: string | null
          auth_graded_by?: string | null
          auth_grading_company?: string | null
          auth_grading_score?: string | null
          auth_notes?: string | null
          auth_result?: string | null
          buyer_confirmed_at?: string | null
          buyer_id?: string
          buyer_phone?: string | null
          buyer_remark?: string | null
          buyer_total_amount?: number | null
          commission_amount?: number | null
          commission_rate_applied?: number | null
          coupon_type?: Database["public"]["Enums"]["reward_type"] | null
          coupon_user_reward_id?: string | null
          created_at?: string | null
          escrow_capture_model?: string | null
          escrow_status?: Database["public"]["Enums"]["escrow_state"] | null
          fault_party?:
            | Database["public"]["Enums"]["grading_fault_party"]
            | null
          final_price?: number
          id?: string
          inbound_courier_name?: string | null
          inbound_shipping_fee?: number
          inbound_tracking_no?: string | null
          item_subtotal?: number | null
          listing_id?: string
          logistics_proof_path?: string | null
          meetup_detail?: string | null
          merchant_id?: string
          merchant_payout_amount?: number | null
          merchant_payout_gross?: number | null
          order_number?: string | null
          outbound_courier_name?: string | null
          outbound_shipping_fee?: number
          outbound_tracking_no?: string | null
          paid_at?: string | null
          payment_capture_status?: Database["public"]["Enums"]["payment_capture_status"]
          payout_attempted_at?: string | null
          payout_error?: string | null
          payout_hold_until?: string | null
          payout_status?: string
          platform_received_at?: string | null
          platform_subsidy_amount?: number
          refund_amount?: number | null
          refund_attempted_at?: string | null
          refund_error?: string | null
          refund_status?: string
          refunded_at?: string | null
          requires_authentication?: boolean | null
          seller_settlement_status?: Database["public"]["Enums"]["seller_settlement_status"]
          sf_address?: string | null
          sf_locker_code?: string | null
          shipping_fee?: number
          shipping_method?: string | null
          stripe_destination_account_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          stripe_transfer_id?: string | null
          total_amount?: number | null
          transferred_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_merchant_orders_buyer_id"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_merchant_orders_buyer_id"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_merchant_orders_listing_id"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_merchant_orders_listing_id"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_product_summaries"
            referencedColumns: ["lowest_listing_id"]
          },
          {
            foreignKeyName: "fk_merchant_orders_merchant_id"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_merchant_orders_merchant_id"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_orders_auth_graded_by_fkey"
            columns: ["auth_graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_orders_auth_graded_by_fkey"
            columns: ["auth_graded_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_orders_coupon_user_reward_id_fkey"
            columns: ["coupon_user_reward_id"]
            isOneToOne: false
            referencedRelation: "user_rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_shops: {
        Row: {
          base_courier_shipping_fee: number
          business_details: Json | null
          cancelled_trades_count: number
          completed_trades_count: number
          created_at: string | null
          merchant_id: string
          rating_score: number | null
          reputation_tag: Json | null
          shipping_speed_score: number | null
          shop_avatar_path: string | null
          shop_description: string | null
          shop_handle: string | null
          shop_name: string | null
          shop_rating_score: number | null
          top_banner_path: string | null
          updated_at: string | null
        }
        Insert: {
          base_courier_shipping_fee?: number
          business_details?: Json | null
          cancelled_trades_count?: number
          completed_trades_count?: number
          created_at?: string | null
          merchant_id: string
          rating_score?: number | null
          reputation_tag?: Json | null
          shipping_speed_score?: number | null
          shop_avatar_path?: string | null
          shop_description?: string | null
          shop_handle?: string | null
          shop_name?: string | null
          shop_rating_score?: number | null
          top_banner_path?: string | null
          updated_at?: string | null
        }
        Update: {
          base_courier_shipping_fee?: number
          business_details?: Json | null
          cancelled_trades_count?: number
          completed_trades_count?: number
          created_at?: string | null
          merchant_id?: string
          rating_score?: number | null
          reputation_tag?: Json | null
          shipping_speed_score?: number | null
          shop_avatar_path?: string | null
          shop_description?: string | null
          shop_handle?: string | null
          shop_name?: string | null
          shop_rating_score?: number | null
          top_banner_path?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_merchant_shops_profile"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_merchant_shops_profile"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_audit_logs: {
        Row: {
          action: string
          admin_id: string
          case_id: string
          created_at: string
          id: string
          payload: Json
        }
        Insert: {
          action: string
          admin_id: string
          case_id: string
          created_at?: string
          id?: string
          payload?: Json
        }
        Update: {
          action?: string
          admin_id?: string
          case_id?: string
          created_at?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "moderation_audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_audit_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_cases: {
        Row: {
          adjustment_reason: string | null
          admin_adjustment: number
          auto_score: number
          case_number: string
          created_at: string
          final_score: number | null
          id: string
          primary_category:
            | Database["public"]["Enums"]["report_category"]
            | null
          resolution:
            | Database["public"]["Enums"]["moderation_resolution"]
            | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["moderation_case_status"]
          subject_user_id: string
          updated_at: string
          violation_persona:
            | Database["public"]["Enums"]["violation_persona"]
            | null
        }
        Insert: {
          adjustment_reason?: string | null
          admin_adjustment?: number
          auto_score?: number
          case_number: string
          created_at?: string
          final_score?: number | null
          id?: string
          primary_category?:
            | Database["public"]["Enums"]["report_category"]
            | null
          resolution?:
            | Database["public"]["Enums"]["moderation_resolution"]
            | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["moderation_case_status"]
          subject_user_id: string
          updated_at?: string
          violation_persona?:
            | Database["public"]["Enums"]["violation_persona"]
            | null
        }
        Update: {
          adjustment_reason?: string | null
          admin_adjustment?: number
          auto_score?: number
          case_number?: string
          created_at?: string
          final_score?: number | null
          id?: string
          primary_category?:
            | Database["public"]["Enums"]["report_category"]
            | null
          resolution?:
            | Database["public"]["Enums"]["moderation_resolution"]
            | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["moderation_case_status"]
          subject_user_id?: string
          updated_at?: string
          violation_persona?:
            | Database["public"]["Enums"]["violation_persona"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_cases_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_cases_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_cases_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_cases_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_email_outbox: {
        Row: {
          attempts: number
          created_at: string
          event_id: string
          html_body: string
          id: string
          idempotency_key: string
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          resend_message_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_email_status"]
          subject: string
          template_key: string
          text_body: string | null
          to_email: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_id: string
          html_body: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          resend_message_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_email_status"]
          subject: string
          template_key: string
          text_body?: string | null
          to_email: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_id?: string
          html_body?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          resend_message_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_email_status"]
          subject?: string
          template_key?: string
          text_body?: string | null
          to_email?: string
          updated_at?: string
        }
        Relationships: []
      }
      offers: {
        Row: {
          buyer_id: string
          created_at: string | null
          id: string
          listing_id: string | null
          modified_count: number
          offer_price: number
          room_id: string
          status: Database["public"]["Enums"]["offer_status"] | null
          updated_at: string | null
          use_authentication: boolean
        }
        Insert: {
          buyer_id: string
          created_at?: string | null
          id?: string
          listing_id?: string | null
          modified_count?: number
          offer_price: number
          room_id: string
          status?: Database["public"]["Enums"]["offer_status"] | null
          updated_at?: string | null
          use_authentication?: boolean
        }
        Update: {
          buyer_id?: string
          created_at?: string | null
          id?: string
          listing_id?: string | null
          modified_count?: number
          offer_price?: number
          room_id?: string
          status?: Database["public"]["Enums"]["offer_status"] | null
          updated_at?: string | null
          use_authentication?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fk_offers_buyer_id"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_offers_buyer_id"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_product_summaries"
            referencedColumns: ["lowest_listing_id"]
          },
          {
            foreignKeyName: "offers_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_batches: {
        Row: {
          created_at: string
          cutoff_at: string
          id: string
          notes: string | null
          processed_by: string | null
          scheduled_date: string
          status: Database["public"]["Enums"]["payout_batch_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          cutoff_at: string
          id?: string
          notes?: string | null
          processed_by?: string | null
          scheduled_date: string
          status?: Database["public"]["Enums"]["payout_batch_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          cutoff_at?: string
          id?: string
          notes?: string | null
          processed_by?: string | null
          scheduled_date?: string
          status?: Database["public"]["Enums"]["payout_batch_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_batches_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_batches_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          admin_fps_reference: string | null
          amount: number
          batch_id: string | null
          created_at: string
          fps_id_snapshot: string
          fps_name_snapshot: string | null
          fps_transfer_fee_hkd: number
          gross_payout_hkd: number
          id: string
          order_id: string
          paid_at: string | null
          paid_by: string | null
          ready_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["payout_request_status"]
          updated_at: string
        }
        Insert: {
          admin_fps_reference?: string | null
          amount: number
          batch_id?: string | null
          created_at?: string
          fps_id_snapshot: string
          fps_name_snapshot?: string | null
          fps_transfer_fee_hkd?: number
          gross_payout_hkd?: number
          id?: string
          order_id: string
          paid_at?: string | null
          paid_by?: string | null
          ready_at?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["payout_request_status"]
          updated_at?: string
        }
        Update: {
          admin_fps_reference?: string | null
          amount?: number
          batch_id?: string | null
          created_at?: string
          fps_id_snapshot?: string
          fps_name_snapshot?: string | null
          fps_transfer_fee_hkd?: number
          gross_payout_hkd?: number
          id?: string
          order_id?: string
          paid_at?: string | null
          paid_by?: string | null
          ready_at?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["payout_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "member_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_requests_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_requests_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_requests_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_requests_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          image_object_key: string | null
          image_url: string
          is_active: boolean
          link_url: string | null
          priority: number
          show_in_announcements: boolean
          show_on_home_banner: boolean
          start_date: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          image_object_key?: string | null
          image_url: string
          is_active?: boolean
          link_url?: string | null
          priority?: number
          show_in_announcements?: boolean
          show_on_home_banner?: boolean
          start_date: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          image_object_key?: string | null
          image_url?: string
          is_active?: boolean
          link_url?: string | null
          priority?: number
          show_in_announcements?: boolean
          show_on_home_banner?: boolean
          start_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      point_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          source_ref: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description?: string | null
          id?: string
          source_ref?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          source_ref?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_catalog: {
        Row: {
          card_number: string | null
          card_text: Json | null
          created_at: string
          display_id: string | null
          element_type: string | null
          hp: number | null
          id: string
          id_canonical: string | null
          id_compact: string | null
          image_url: string
          jan_code: string | null
          last_synced_at: string | null
          name_en: string | null
          name_ja: string
          name_zh: string | null
          pack_count: number | null
          pokemon_stage: string | null
          rarity: string | null
          set_code: string
          snkr_rank: number | null
          sub_type_ja: string | null
          type: Database["public"]["Enums"]["catalog_type"]
          updated_at: string
        }
        Insert: {
          card_number?: string | null
          card_text?: Json | null
          created_at?: string
          display_id?: string | null
          element_type?: string | null
          hp?: number | null
          id: string
          id_canonical?: string | null
          id_compact?: string | null
          image_url: string
          jan_code?: string | null
          last_synced_at?: string | null
          name_en?: string | null
          name_ja: string
          name_zh?: string | null
          pack_count?: number | null
          pokemon_stage?: string | null
          rarity?: string | null
          set_code: string
          snkr_rank?: number | null
          sub_type_ja?: string | null
          type?: Database["public"]["Enums"]["catalog_type"]
          updated_at?: string
        }
        Update: {
          card_number?: string | null
          card_text?: Json | null
          created_at?: string
          display_id?: string | null
          element_type?: string | null
          hp?: number | null
          id?: string
          id_canonical?: string | null
          id_compact?: string | null
          image_url?: string
          jan_code?: string | null
          last_synced_at?: string | null
          name_en?: string | null
          name_ja?: string
          name_zh?: string | null
          pack_count?: number | null
          pokemon_stage?: string | null
          rarity?: string | null
          set_code?: string
          snkr_rank?: number | null
          sub_type_ja?: string | null
          type?: Database["public"]["Enums"]["catalog_type"]
          updated_at?: string
        }
        Relationships: []
      }
      product_grading_market_prices: {
        Row: {
          grading_company: string
          grading_score: string
          id: string
          market_avg_price: number | null
          market_chart_data: Json | null
          market_data_source: string
          market_trend_30d: number | null
          product_id: string | null
          updated_at: string | null
        }
        Insert: {
          grading_company: string
          grading_score?: string
          id?: string
          market_avg_price?: number | null
          market_chart_data?: Json | null
          market_data_source?: string
          market_trend_30d?: number | null
          product_id?: string | null
          updated_at?: string | null
        }
        Update: {
          grading_company?: string
          grading_score?: string
          id?: string
          market_avg_price?: number | null
          market_chart_data?: Json | null
          market_data_source?: string
          market_trend_30d?: number | null
          product_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_grading_market_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      product_price_snapshots: {
        Row: {
          condition_name_ja: string | null
          condition_type: string
          created_at: string
          grading_company: string | null
          grading_score: string | null
          id: string
          member_order_id: string | null
          price_hkd: number | null
          price_jpy: number
          product_id: string
          snapshot_date: string
          source: string | null
        }
        Insert: {
          condition_name_ja?: string | null
          condition_type: string
          created_at?: string
          grading_company?: string | null
          grading_score?: string | null
          id?: string
          member_order_id?: string | null
          price_hkd?: number | null
          price_jpy: number
          product_id: string
          snapshot_date: string
          source?: string | null
        }
        Update: {
          condition_name_ja?: string | null
          condition_type?: string
          created_at?: string
          grading_company?: string | null
          grading_score?: string | null
          id?: string
          member_order_id?: string | null
          price_hkd?: number | null
          price_jpy?: number
          product_id?: string
          snapshot_date?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_price_snapshots_member_order_id_fkey"
            columns: ["member_order_id"]
            isOneToOne: false
            referencedRelation: "member_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_price_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      product_watchlists: {
        Row: {
          alert_enabled: boolean
          created_at: string
          grading_company: string
          grading_score: string
          last_alerted_at: string | null
          product_id: string
          target_price: number | null
          tracked_price: number | null
          user_id: string
        }
        Insert: {
          alert_enabled?: boolean
          created_at?: string
          grading_company?: string
          grading_score?: string
          last_alerted_at?: string | null
          product_id: string
          target_price?: number | null
          tracked_price?: number | null
          user_id: string
        }
        Update: {
          alert_enabled?: boolean
          created_at?: string
          grading_company?: string
          grading_score?: string
          last_alerted_at?: string | null
          product_id?: string
          target_price?: number | null
          tracked_price?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_product_watchlists_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_product_watchlists_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_watchlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          cancelled_trades_count: number
          completed_trades_count: number
          created_at: string
          display_name: string
          email_market_alerts: boolean
          email_rewards: boolean
          email_transactional: boolean
          fps_id: string | null
          fps_name: string | null
          id: string
          last_active_at: string | null
          last_chat_digest_pushed_at: string | null
          push_chat_digest: boolean
          push_market_alerts: boolean
          push_rewards: boolean
          push_transactional: boolean
          rating_score: number | null
          reputation_tag: Json | null
          role: Database["public"]["Enums"]["user_role"]
          short_description: string | null
          total_trades: number | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_path?: string | null
          cancelled_trades_count?: number
          completed_trades_count?: number
          created_at?: string
          display_name: string
          email_market_alerts?: boolean
          email_rewards?: boolean
          email_transactional?: boolean
          fps_id?: string | null
          fps_name?: string | null
          id: string
          last_active_at?: string | null
          last_chat_digest_pushed_at?: string | null
          push_chat_digest?: boolean
          push_market_alerts?: boolean
          push_rewards?: boolean
          push_transactional?: boolean
          rating_score?: number | null
          reputation_tag?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          short_description?: string | null
          total_trades?: number | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_path?: string | null
          cancelled_trades_count?: number
          completed_trades_count?: number
          created_at?: string
          display_name?: string
          email_market_alerts?: boolean
          email_rewards?: boolean
          email_transactional?: boolean
          fps_id?: string | null
          fps_name?: string | null
          id?: string
          last_active_at?: string | null
          last_chat_digest_pushed_at?: string | null
          push_chat_digest?: boolean
          push_market_alerts?: boolean
          push_rewards?: boolean
          push_transactional?: boolean
          rating_score?: number | null
          reputation_tag?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          short_description?: string | null
          total_trades?: number | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      report_attachments: {
        Row: {
          byte_size: number
          created_at: string
          id: string
          mime_type: string
          report_id: string | null
          reporter_id: string
          storage_path: string
        }
        Insert: {
          byte_size: number
          created_at?: string
          id?: string
          mime_type: string
          report_id?: string | null
          reporter_id: string
          storage_path: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          id?: string
          mime_type?: string
          report_id?: string | null
          reporter_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_attachments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_attachments_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_attachments_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          case_id: string | null
          category: Database["public"]["Enums"]["report_category"] | null
          category_weight_snapshot: number | null
          context_id: string | null
          context_type: string | null
          contribution_score: number | null
          created_at: string | null
          details: string | null
          id: string
          outcome_acknowledged_at: string | null
          reason: string
          reporter_id: string
          source: Database["public"]["Enums"]["report_source"] | null
          status: Database["public"]["Enums"]["report_state"] | null
          target_id: string
          target_type: string
          updated_at: string | null
        }
        Insert: {
          case_id?: string | null
          category?: Database["public"]["Enums"]["report_category"] | null
          category_weight_snapshot?: number | null
          context_id?: string | null
          context_type?: string | null
          contribution_score?: number | null
          created_at?: string | null
          details?: string | null
          id?: string
          outcome_acknowledged_at?: string | null
          reason: string
          reporter_id: string
          source?: Database["public"]["Enums"]["report_source"] | null
          status?: Database["public"]["Enums"]["report_state"] | null
          target_id: string
          target_type: string
          updated_at?: string | null
        }
        Update: {
          case_id?: string | null
          category?: Database["public"]["Enums"]["report_category"] | null
          category_weight_snapshot?: number | null
          context_id?: string | null
          context_type?: string | null
          contribution_score?: number | null
          created_at?: string | null
          details?: string | null
          id?: string
          outcome_acknowledged_at?: string | null
          reason?: string
          reporter_id?: string
          source?: Database["public"]["Enums"]["report_source"] | null
          status?: Database["public"]["Enums"]["report_state"] | null
          target_id?: string
          target_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_reports_reporter_id"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reports_reporter_id"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_campaign_claims: {
        Row: {
          campaign_id: string
          claim_day: string
          claimed_at: string
          id: string
          user_id: string
          user_reward_id: string
        }
        Insert: {
          campaign_id: string
          claim_day: string
          claimed_at?: string
          id?: string
          user_id: string
          user_reward_id: string
        }
        Update: {
          campaign_id?: string
          claim_day?: string
          claimed_at?: string
          id?: string
          user_id?: string
          user_reward_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_campaign_claims_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "reward_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_campaign_claims_user_reward_id_fkey"
            columns: ["user_reward_id"]
            isOneToOne: false
            referencedRelation: "user_rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_campaigns: {
        Row: {
          claimed_count: number
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          max_claims: number
          max_claims_per_user: number
          name: string
          override_valid_days: number | null
          starts_at: string
          status: Database["public"]["Enums"]["reward_campaign_status"]
          template_id: string
          updated_at: string
        }
        Insert: {
          claimed_count?: number
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          max_claims: number
          max_claims_per_user?: number
          name: string
          override_valid_days?: number | null
          starts_at: string
          status?: Database["public"]["Enums"]["reward_campaign_status"]
          template_id: string
          updated_at?: string
        }
        Update: {
          claimed_count?: number
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          max_claims?: number
          max_claims_per_user?: number
          name?: string
          override_valid_days?: number | null
          starts_at?: string
          status?: Database["public"]["Enums"]["reward_campaign_status"]
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "reward_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_redemption_catalog: {
        Row: {
          created_at: string
          display_order: number
          id: string
          initial_stock: number | null
          is_active: boolean
          max_redemptions_per_user: number | null
          points_cost: number
          stock: number
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          initial_stock?: number | null
          is_active?: boolean
          max_redemptions_per_user?: number | null
          points_cost: number
          stock: number
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          initial_stock?: number | null
          is_active?: boolean
          max_redemptions_per_user?: number | null
          points_cost?: number
          stock?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemption_catalog_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: true
            referencedRelation: "reward_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_redemption_claims: {
        Row: {
          catalog_id: string
          created_at: string
          id: string
          points_spent: number
          user_id: string
          user_reward_id: string | null
        }
        Insert: {
          catalog_id: string
          created_at?: string
          id?: string
          points_spent: number
          user_id: string
          user_reward_id?: string | null
        }
        Update: {
          catalog_id?: string
          created_at?: string
          id?: string
          points_spent?: number
          user_id?: string
          user_reward_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemption_claims_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "reward_redemption_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemption_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemption_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemption_claims_user_reward_id_fkey"
            columns: ["user_reward_id"]
            isOneToOne: false
            referencedRelation: "user_rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_template_audits: {
        Row: {
          action: Database["public"]["Enums"]["reward_template_audit_action"]
          admin_id: string
          created_at: string
          id: string
          snapshot: Json
          template_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["reward_template_audit_action"]
          admin_id: string
          created_at?: string
          id?: string
          snapshot: Json
          template_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["reward_template_audit_action"]
          admin_id?: string
          created_at?: string
          id?: string
          snapshot?: Json
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_template_audits_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_template_audits_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_template_audits_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "reward_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_templates: {
        Row: {
          claimed_count: number
          created_at: string | null
          description: string | null
          distribution_mode: Database["public"]["Enums"]["reward_distribution_mode"]
          fixed_expiry_date: string | null
          id: string
          is_active: boolean | null
          is_infinite: boolean | null
          max_claims: number | null
          restrictions: Json
          reward_value: Json
          status: Database["public"]["Enums"]["reward_template_status"]
          title: string
          trigger_conditions: Json
          type: Database["public"]["Enums"]["reward_type"]
          updated_at: string | null
          valid_duration_days: number | null
        }
        Insert: {
          claimed_count?: number
          created_at?: string | null
          description?: string | null
          distribution_mode?: Database["public"]["Enums"]["reward_distribution_mode"]
          fixed_expiry_date?: string | null
          id?: string
          is_active?: boolean | null
          is_infinite?: boolean | null
          max_claims?: number | null
          restrictions?: Json
          reward_value: Json
          status?: Database["public"]["Enums"]["reward_template_status"]
          title: string
          trigger_conditions: Json
          type: Database["public"]["Enums"]["reward_type"]
          updated_at?: string | null
          valid_duration_days?: number | null
        }
        Update: {
          claimed_count?: number
          created_at?: string | null
          description?: string | null
          distribution_mode?: Database["public"]["Enums"]["reward_distribution_mode"]
          fixed_expiry_date?: string | null
          id?: string
          is_active?: boolean | null
          is_infinite?: boolean | null
          max_claims?: number | null
          restrictions?: Json
          reward_value?: Json
          status?: Database["public"]["Enums"]["reward_template_status"]
          title?: string
          trigger_conditions?: Json
          type?: Database["public"]["Enums"]["reward_type"]
          updated_at?: string | null
          valid_duration_days?: number | null
        }
        Relationships: []
      }
      seller_receivables: {
        Row: {
          amount_hkd: number
          created_at: string
          fps_reference: string | null
          id: string
          notes: string | null
          order_id: string
          order_kind: string
          paid_at: string | null
          paid_by: string | null
          seller_id: string
          status: Database["public"]["Enums"]["seller_receivable_status"]
          stripe_fee_hkd: number | null
          updated_at: string
        }
        Insert: {
          amount_hkd: number
          created_at?: string
          fps_reference?: string | null
          id?: string
          notes?: string | null
          order_id: string
          order_kind: string
          paid_at?: string | null
          paid_by?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["seller_receivable_status"]
          stripe_fee_hkd?: number | null
          updated_at?: string
        }
        Update: {
          amount_hkd?: number
          created_at?: string
          fps_reference?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          order_kind?: string
          paid_at?: string | null
          paid_by?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["seller_receivable_status"]
          stripe_fee_hkd?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_receivables_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_receivables_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_receivables_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_receivables_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          is_public: boolean
          member_order_id: string | null
          merchant_order_id: string | null
          rating: number
          reviewee_id: string
          reviewee_persona: Database["public"]["Enums"]["review_persona"]
          reviewer_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          member_order_id?: string | null
          merchant_order_id?: string | null
          rating: number
          reviewee_id: string
          reviewee_persona: Database["public"]["Enums"]["review_persona"]
          reviewer_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          member_order_id?: string | null
          merchant_order_id?: string | null
          rating?: number
          reviewee_id?: string
          reviewee_persona?: Database["public"]["Enums"]["review_persona"]
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_reviews_reviewee"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reviews_reviewee"
            columns: ["reviewee_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reviews_reviewer"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reviews_reviewer"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_member_order_id_fkey"
            columns: ["member_order_id"]
            isOneToOne: false
            referencedRelation: "member_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_reviews_merchant_order_id_fkey"
            columns: ["merchant_order_id"]
            isOneToOne: false
            referencedRelation: "merchant_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_collections: {
        Row: {
          created_at: string
          grading_company: string
          grading_score: string
          id: string
          product_id: string
          purchase_price: number
          sold_at: string | null
          sold_listing_id: string | null
          sold_price: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grading_company?: string
          grading_score?: string
          id?: string
          product_id: string
          purchase_price?: number
          sold_at?: string | null
          sold_listing_id?: string | null
          sold_price?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          grading_company?: string
          grading_score?: string
          id?: string
          product_id?: string
          purchase_price?: number
          sold_at?: string | null
          sold_listing_id?: string | null
          sold_price?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_collections_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_collections_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_collections_sold_listing_id_fkey"
            columns: ["sold_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_collections_sold_listing_id_fkey"
            columns: ["sold_listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_product_summaries"
            referencedColumns: ["lowest_listing_id"]
          },
        ]
      }
      user_push_subscriptions: {
        Row: {
          created_at: string
          id: string
          onesignal_subscription_id: string
          onesignal_user_id: string | null
          opted_in: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          onesignal_subscription_id: string
          onesignal_user_id?: string | null
          opted_in?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          onesignal_subscription_id?: string
          onesignal_user_id?: string | null
          opted_in?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_rewards: {
        Row: {
          acknowledged_at: string | null
          calculated_expiry: string | null
          created_at: string | null
          grant_dedup_key: string
          id: string
          is_used: boolean | null
          reserved_at: string | null
          reserved_member_order_id: string | null
          reserved_merchant_order_id: string | null
          template_id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          calculated_expiry?: string | null
          created_at?: string | null
          grant_dedup_key?: string
          id?: string
          is_used?: boolean | null
          reserved_at?: string | null
          reserved_member_order_id?: string | null
          reserved_merchant_order_id?: string | null
          template_id: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          calculated_expiry?: string | null
          created_at?: string | null
          grant_dedup_key?: string
          id?: string
          is_used?: boolean | null
          reserved_at?: string | null
          reserved_member_order_id?: string | null
          reserved_merchant_order_id?: string | null
          template_id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_rewards_reserved_member_order_id_fkey"
            columns: ["reserved_member_order_id"]
            isOneToOne: false
            referencedRelation: "member_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_rewards_reserved_merchant_order_id_fkey"
            columns: ["reserved_merchant_order_id"]
            isOneToOne: false
            referencedRelation: "merchant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_rewards_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "reward_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_rewards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_rewards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      marketplace_product_summaries: {
        Row: {
          card_number: string | null
          catalog_type: Database["public"]["Enums"]["catalog_type"] | null
          display_id: string | null
          grading_company: string | null
          grading_score: string | null
          highest_price: number | null
          image_url: string | null
          latest_listing_at: string | null
          listing_count: number | null
          lowest_listing_created_at: string | null
          lowest_listing_id: string | null
          lowest_price: number | null
          name_en: string | null
          name_ja: string | null
          name_zh: string | null
          product_id: string | null
          product_name: string | null
          rarity: string | null
          seller_id: string | null
          seller_name: string | null
          seller_persona:
            | Database["public"]["Enums"]["seller_persona_type"]
            | null
          set_code: string | null
          use_authentication: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_listings_seller_id"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_listings_seller_id"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      public_profiles: {
        Row: {
          avatar_path: string | null
          completed_trades_count: number | null
          created_at: string | null
          display_name: string | null
          id: string | null
          is_merchant: boolean | null
          rating_score: number | null
          reputation_tag: Json | null
          short_description: string | null
          username: string | null
        }
        Insert: {
          avatar_path?: string | null
          completed_trades_count?: number | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          is_merchant?: never
          rating_score?: number | null
          reputation_tag?: Json | null
          short_description?: string | null
          username?: string | null
        }
        Update: {
          avatar_path?: string | null
          completed_trades_count?: number | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          is_merchant?: never
          rating_score?: number | null
          reputation_tag?: Json | null
          short_description?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _admin_sync_redemption_catalog: {
        Args: { p_payload: Json; p_template_id: string }
        Returns: undefined
      }
      _check_in_program_row_to_json: {
        Args: { p_row: Database["public"]["Tables"]["check_in_program"]["Row"] }
        Returns: Json
      }
      _find_or_create_moderation_case: {
        Args: { p_subject_user_id: string }
        Returns: string
      }
      _grading_require_admin: { Args: never; Returns: string }
      _grading_write_audit_log: {
        Args: {
          p_action: string
          p_admin_id: string
          p_from_status: string
          p_notes?: string
          p_order_id: string
          p_order_kind: string
          p_to_status: string
        }
        Returns: undefined
      }
      _hk_today: { Args: never; Returns: string }
      _moderation_apply_sanction_side_effects: {
        Args: {
          p_scope: Database["public"]["Enums"]["sanction_scope"]
          p_type: Database["public"]["Enums"]["sanction_type"]
          p_user_id: string
        }
        Returns: undefined
      }
      _moderation_category_label: {
        Args: { p_category: Database["public"]["Enums"]["report_category"] }
        Returns: string
      }
      _moderation_category_weight: {
        Args: { p_category: Database["public"]["Enums"]["report_category"] }
        Returns: number
      }
      _moderation_format_report_reason: {
        Args: {
          p_category: Database["public"]["Enums"]["report_category"]
          p_chat_room_id: string
          p_details: string
          p_source: Database["public"]["Enums"]["report_source"]
        }
        Returns: string
      }
      _moderation_has_active_sanction: {
        Args: {
          p_scope?: Database["public"]["Enums"]["sanction_scope"]
          p_type?: Database["public"]["Enums"]["sanction_type"]
          p_user_id: string
        }
        Returns: boolean
      }
      _moderation_insert_account_sanction: {
        Args: {
          p_admin_id: string
          p_case_id: string
          p_ends_at: string
          p_reason: string
          p_scope: Database["public"]["Enums"]["sanction_scope"]
          p_type: Database["public"]["Enums"]["sanction_type"]
          p_user_id: string
        }
        Returns: string
      }
      _moderation_next_case_number: { Args: never; Returns: string }
      _moderation_resolve_chat_room_for_case: {
        Args: { p_case_id: string }
        Returns: string
      }
      _moderation_write_audit_log: {
        Args: { p_action: string; p_case_id: string; p_payload?: Json }
        Returns: undefined
      }
      _recompute_moderation_case_scores: {
        Args: { p_case_id: string }
        Returns: undefined
      }
      _reward_activity_row_to_json: {
        Args: {
          p_campaign?: Database["public"]["Tables"]["reward_campaigns"]["Row"]
          p_template: Database["public"]["Tables"]["reward_templates"]["Row"]
        }
        Returns: Json
      }
      _reward_campaign_row_to_json: {
        Args: { p_row: Database["public"]["Tables"]["reward_campaigns"]["Row"] }
        Returns: Json
      }
      _reward_template_row_to_json: {
        Args: { p_row: Database["public"]["Tables"]["reward_templates"]["Row"] }
        Returns: Json
      }
      _reward_template_write_audit: {
        Args: {
          p_action: Database["public"]["Enums"]["reward_template_audit_action"]
          p_admin_id: string
          p_snapshot: Json
          p_template_id: string
        }
        Returns: undefined
      }
      _sync_catalog_active_for_template_status: {
        Args: { p_status: string; p_template_id: string }
        Returns: undefined
      }
      acknowledge_report_outcomes: {
        Args: { p_report_ids: string[] }
        Returns: Json
      }
      acknowledge_reward_grants: {
        Args: { p_user_reward_ids: string[] }
        Returns: Json
      }
      admin_get_moderation_case_bundle: {
        Args: { p_case_id: string }
        Returns: Json
      }
      admin_get_moderation_chat_thread: {
        Args: {
          p_before?: string
          p_case_id: string
          p_limit?: number
          p_room_id: string
        }
        Returns: Json
      }
      admin_get_moderation_order_context: {
        Args: { p_case_id: string }
        Returns: Json
      }
      admin_get_subject_moderation_history: {
        Args: {
          p_case_limit?: number
          p_exclude_case_id?: string
          p_sanction_limit?: number
          p_subject_user_id: string
        }
        Returns: Json
      }
      canonical_card_search_key: { Args: { input: string }; Returns: string }
      card_identifier_flexible_match: {
        Args: { p_query: string; p_target: string }
        Returns: boolean
      }
      card_search_tokens_array: { Args: { input: string }; Returns: string[] }
      catalog_card_identifier_matches: {
        Args: {
          p_card_number: string
          p_display_id: string
          p_query: string
          p_set_code: string
        }
        Returns: boolean
      }
      compact_alphanumeric: { Args: { input: string }; Returns: string }
      compute_price_vs_market_pct: {
        Args: { p_listing_price: number; p_market_avg_price: number }
        Returns: number
      }
      escape_ilike_pattern: { Args: { input: string }; Returns: string }
      execute_daily_check_in: { Args: never; Returns: Json }
      fn_apply_point_transaction: {
        Args: {
          p_amount: number
          p_description?: string
          p_source_ref?: string
          p_source_type: string
          p_user_id: string
        }
        Returns: number
      }
      fn_archive_seller_collection_for_listing: {
        Args: {
          p_final_price: number
          p_listing_id: string
          p_seller_id: string
        }
        Returns: undefined
      }
      fn_assert_offer_not_self_dealing: {
        Args: { p_buyer_id: string; p_seller_id: string }
        Returns: undefined
      }
      fn_assert_p2p_offer_aml_limits: {
        Args: {
          p_buyer_id: string
          p_listing_id: string
          p_offer_price: number
          p_use_authentication: boolean
        }
        Returns: undefined
      }
      fn_build_grant_json: {
        Args: {
          p_template: Database["public"]["Tables"]["reward_templates"]["Row"]
          p_user_reward_id: string
        }
        Returns: Json
      }
      fn_bump_listing_offers_count: {
        Args: { p_actor_id?: string; p_listing_id: string }
        Returns: undefined
      }
      fn_chat_party_profile_snippet: {
        Args: {
          p_persona: Database["public"]["Enums"]["seller_persona_type"]
          p_profile_id: string
        }
        Returns: Json
      }
      fn_claim_mission_points: {
        Args: { p_description?: string; p_mission_id: string; p_points: number }
        Returns: Json
      }
      fn_compute_auth_escrow_amounts: {
        Args: { p_item_subtotal: number }
        Returns: {
          auth_fee: number
          buyer_total_amount: number
          inbound_shipping_fee: number
          outbound_shipping_fee: number
          total_amount: number
        }[]
      }
      fn_compute_moderation_order_refund: {
        Args: {
          p_carrier_liability_party?: string
          p_fault_party: Database["public"]["Enums"]["grading_fault_party"]
          p_order_id: string
          p_platform_fault_reason?: string
        }
        Returns: Json
      }
      fn_compute_platform_subsidy: {
        Args: {
          p_buyer_id: string
          p_item_subtotal: number
          p_order_id?: string
          p_order_kind?: string
          p_shipping_fee: number
          p_shipping_method: string
          p_use_auth: boolean
          p_user_reward_id: string
        }
        Returns: {
          coupon_type: Database["public"]["Enums"]["reward_type"]
          subsidy_amount: number
        }[]
      }
      fn_compute_seller_grading_fail_liability: {
        Args: { p_order_id: string; p_order_kind: string }
        Returns: Json
      }
      fn_count_public_reviews_for_persona: {
        Args: {
          p_reviewee_id: string
          p_reviewee_persona: Database["public"]["Enums"]["review_persona"]
        }
        Returns: number
      }
      fn_effective_check_in_streak: {
        Args: { p_user_id: string }
        Returns: number
      }
      fn_fps_payout_blocked_for_complete: {
        Args: {
          p_fps_id_snapshot: string
          p_fps_name_snapshot: string
          p_status: Database["public"]["Enums"]["payout_request_status"]
        }
        Returns: boolean
      }
      fn_get_check_in_daily_points: {
        Args: { p_cycle_day: number }
        Returns: number
      }
      fn_get_merchant_public_verification: {
        Args: { p_merchant_id: string }
        Returns: Json
      }
      fn_grant_points_from_template: {
        Args: { p_template_id: string; p_user_id: string }
        Returns: Json
      }
      fn_issue_reward_from_template: {
        Args: {
          p_grant_dedup_key?: string
          p_template_id: string
          p_user_id: string
        }
        Returns: string
      }
      fn_map_merchant_escrow_to_member_status: {
        Args: { p_escrow_status: Database["public"]["Enums"]["escrow_state"] }
        Returns: Database["public"]["Enums"]["member_order_state"]
      }
      fn_member_order_is_open: {
        Args: {
          p_escrow_status: Database["public"]["Enums"]["member_escrow_status"]
          p_status: Database["public"]["Enums"]["member_order_state"]
          p_use_authentication: boolean
        }
        Returns: boolean
      }
      fn_merchant_checkout_auth_fee: {
        Args: { p_use_auth: boolean }
        Returns: number
      }
      fn_merchant_checkout_shipping_fee: {
        Args: {
          p_listing_id: string
          p_merchant_id: string
          p_shipping_method: string
        }
        Returns: number
      }
      fn_merchant_order_is_auth_in_progress: {
        Args: {
          p_escrow_status: Database["public"]["Enums"]["escrow_state"]
          p_requires_authentication: boolean
        }
        Returns: boolean
      }
      fn_merchant_order_is_open: {
        Args: { p_escrow_status: Database["public"]["Enums"]["escrow_state"] }
        Returns: boolean
      }
      fn_merchant_order_is_payment_stage: {
        Args: { p_escrow_status: Database["public"]["Enums"]["escrow_state"] }
        Returns: boolean
      }
      fn_merchant_order_needs_seller_action:
        | {
            Args: {
              p_escrow_status: Database["public"]["Enums"]["escrow_state"]
              p_requires_authentication: boolean
            }
            Returns: boolean
          }
        | {
            Args: {
              p_escrow_status: Database["public"]["Enums"]["escrow_state"]
              p_inbound_tracking_no?: string
              p_requires_authentication: boolean
            }
            Returns: boolean
          }
      fn_merchant_unsettled_grading_recovery: {
        Args: { p_merchant_id: string }
        Returns: {
          recovery_created_at: string
          recovery_order_id: string
          remaining_hkd: number
        }[]
      }
      fn_moderation_case_links_order: {
        Args: { p_case_id: string; p_order_id: string }
        Returns: boolean
      }
      fn_moderation_derive_order_kind: {
        Args: { p_order_id: string }
        Returns: string
      }
      fn_moderation_order_refund_eligible: {
        Args: { p_order_id: string }
        Returns: Json
      }
      fn_p2p_aml_meetup_max_new_account_hkd: { Args: never; Returns: number }
      fn_p2p_aml_meetup_max_no_market_hkd: { Args: never; Returns: number }
      fn_p2p_aml_new_account_grace_days: { Args: never; Returns: number }
      fn_platform_active_announcements: {
        Args: never
        Returns: {
          content: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          image_object_key: string | null
          image_url: string
          is_active: boolean
          link_url: string | null
          priority: number
          show_in_announcements: boolean
          show_on_home_banner: boolean
          start_date: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "platform_announcements"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fn_platform_auth_escrow_config: { Args: never; Returns: Json }
      fn_platform_auth_fee_hkd: { Args: never; Returns: number }
      fn_platform_auth_sf_leg_fee: { Args: never; Returns: number }
      fn_platform_commission_rate: { Args: never; Returns: number }
      fn_platform_financial_config: { Args: never; Returns: Json }
      fn_platform_fps_manual_transfer_fee_hkd: { Args: never; Returns: number }
      fn_platform_home_banners: {
        Args: never
        Returns: {
          content: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          image_object_key: string | null
          image_url: string
          is_active: boolean
          link_url: string | null
          priority: number
          show_in_announcements: boolean
          show_on_home_banner: boolean
          start_date: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "platform_announcements"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fn_preview_moderation_order_refund_breakdown: {
        Args: {
          p_carrier_liability_party?: string
          p_fault_party: Database["public"]["Enums"]["grading_fault_party"]
          p_order_id: string
          p_platform_fault_reason?: string
        }
        Returns: Json
      }
      fn_recalculate_member_reputation_tags: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      fn_recalculate_merchant_reputation_tags: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      fn_recalculate_reputation_tags: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      fn_redeem_member_points: {
        Args: {
          p_amount: number
          p_description?: string
          p_source_ref?: string
        }
        Returns: Json
      }
      fn_release_member_order_coupon: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      fn_release_merchant_order_coupon: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      fn_reserve_user_reward_for_member_order: {
        Args: {
          p_buyer_id: string
          p_order_id: string
          p_user_reward_id: string
        }
        Returns: string
      }
      fn_reserve_user_reward_for_merchant_order: {
        Args: {
          p_buyer_id: string
          p_order_id: string
          p_user_reward_id: string
        }
        Returns: string
      }
      fn_resolve_member_listing_id: {
        Args: { p_listing_ref: string; p_seller_id: string }
        Returns: string
      }
      fn_restore_member_order_coupon_on_void: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      fn_restore_merchant_order_coupon_on_void: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      fn_reward_auto_grant_in_window: {
        Args: { p_template_id: string }
        Returns: boolean
      }
      fn_reward_template_has_stock: {
        Args: {
          p_template: Database["public"]["Tables"]["reward_templates"]["Row"]
        }
        Returns: boolean
      }
      fn_reward_template_progress_detail: {
        Args: {
          p_template: Database["public"]["Tables"]["reward_templates"]["Row"]
          p_user_id: string
        }
        Returns: Json
      }
      fn_sync_broken_check_in_streak: {
        Args: { p_user_id: string }
        Returns: number
      }
      fn_sync_check_in_program_template: {
        Args: {
          p_program: Database["public"]["Tables"]["check_in_program"]["Row"]
        }
        Returns: undefined
      }
      fn_template_is_eligible: {
        Args: {
          p_template: Database["public"]["Tables"]["reward_templates"]["Row"]
          p_user_id: string
        }
        Returns: {
          eligible: boolean
          grant_dedup_key: string
        }[]
      }
      fn_try_auto_grant_rewards: { Args: { p_user_id: string }; Returns: Json }
      fn_try_reveal_order_reviews: {
        Args: { p_order_id: string; p_order_kind: string }
        Returns: boolean
      }
      fn_validate_check_in_program_payload: {
        Args: { p_payload: Json }
        Returns: undefined
      }
      fn_validate_reward_template: {
        Args: { p_payload: Json }
        Returns: undefined
      }
      generate_merchant_shop_handle: { Args: never; Returns: string }
      generate_profile_username: { Args: never; Returns: string }
      get_admin_grading_audit_history: {
        Args: { p_order_id: string; p_order_kind: string }
        Returns: Json
      }
      get_admin_grading_order: {
        Args: { p_order_id: string; p_order_kind: string }
        Returns: Json
      }
      get_chat_room_thread:
        | { Args: { p_room_id: string }; Returns: Json }
        | {
            Args: {
              p_before_created_at?: string
              p_limit?: number
              p_room_id: string
            }
            Returns: Json
          }
      get_check_in_program_for_member: { Args: never; Returns: Json }
      get_gamification_stats_for_me: { Args: never; Returns: Json }
      get_marketplace_price_bounds: {
        Args: never
        Returns: {
          max_price: number
          min_price: number
        }[]
      }
      get_marketplace_product_listings: {
        Args: {
          p_grade_filters?: Json
          p_only_graded?: boolean
          p_page?: number
          p_page_size?: number
          p_product_id: string
          p_sort?: string
        }
        Returns: {
          created_at: string
          filtered_lowest_price: number
          grading_company: string
          grading_score: string
          listing_id: string
          page: number
          page_size: number
          price: number
          range_end: number
          range_start: number
          seller_id: string
          seller_name: string
          seller_persona: Database["public"]["Enums"]["seller_persona_type"]
          seller_public_review_count: number
          seller_rating: number
          seller_total_trades: number
          total_count: number
          total_pages: number
          use_authentication: boolean
        }[]
      }
      get_marketplace_rarities: {
        Args: never
        Returns: {
          rarity: string
        }[]
      }
      get_merchant_performance_analytics: {
        Args: { p_time_range?: string; p_top_limit?: number }
        Returns: Json
      }
      get_merchant_product_analytics: {
        Args: {
          p_history_page?: number
          p_history_page_size?: number
          p_product_id: string
          p_time_range?: string
        }
        Returns: Json
      }
      get_reward_coupon_center:
        | { Args: never; Returns: Json }
        | { Args: { p_user_id?: string }; Returns: Json }
      get_unacknowledged_report_outcomes_for_me: { Args: never; Returns: Json }
      get_unacknowledged_reward_grants: { Args: never; Returns: Json }
      get_user_chat_inbox: { Args: never; Returns: Json }
      get_user_chat_inbox_lobby: { Args: never; Returns: Json }
      get_user_reward_coupons: { Args: never; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_card_identifier_query: { Args: { p_query: string }; Returns: boolean }
      is_chat_room_member: {
        Args: { p_room_id: string; p_user_id?: string }
        Returns: boolean
      }
      is_display_name_available: { Args: { name: string }; Returns: boolean }
      listing_grade_sort_score: {
        Args: { grading_company: string; grading_score: string }
        Returns: number
      }
      moderation_check_listing_allowed: {
        Args: {
          p_persona: Database["public"]["Enums"]["seller_persona_type"]
          p_user_id: string
        }
        Returns: boolean
      }
      moderation_get_account_access_restriction: {
        Args: { p_user_id: string }
        Returns: Json
      }
      refresh_marketplace_product_summaries: { Args: never; Returns: undefined }
      resolve_listing_market_price_company: {
        Args: { p_grading_company: string }
        Returns: string
      }
      resolve_listing_market_price_score: {
        Args: { p_grading_company: string; p_grading_score: string }
        Returns: string
      }
      rpc_accept_offer: {
        Args: { p_offer_id: string; p_seller_id: string }
        Returns: Json
      }
      rpc_adjust_moderation_case_score: {
        Args: { p_adjustment: number; p_case_id: string; p_reason?: string }
        Returns: Json
      }
      rpc_admin_batch_complete_fps_payout_requests: {
        Args: { p_admin_id: string; p_request_ids: string[] }
        Returns: Json
      }
      rpc_admin_clear_seller_settlement: {
        Args: {
          p_fps_reference?: string
          p_notes?: string
          p_order_id: string
          p_order_kind: string
        }
        Returns: Json
      }
      rpc_admin_confirm_grading_intake: {
        Args: { p_order_id: string; p_order_kind: string }
        Returns: Json
      }
      rpc_admin_get_check_in_program: { Args: never; Returns: Json }
      rpc_admin_get_reward_activity: {
        Args: { p_template_id: string }
        Returns: Json
      }
      rpc_admin_list_reward_activities: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      rpc_admin_list_reward_campaigns: {
        Args: { p_page?: number; p_page_size?: number; p_status?: string }
        Returns: Json
      }
      rpc_admin_list_reward_templates: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_status?: string
          p_type?: string
        }
        Returns: Json
      }
      rpc_admin_pass_grading: {
        Args: { p_notes?: string; p_order_id: string; p_order_kind: string }
        Returns: Json
      }
      rpc_admin_prepare_auth_refund: {
        Args: { p_order_id: string; p_order_kind: string; p_reason?: string }
        Returns: Json
      }
      rpc_admin_reset_merchant_connect_payout_retry: {
        Args: { p_admin_id: string; p_order_id: string }
        Returns: Json
      }
      rpc_admin_reward_activity_status_counts: {
        Args: { p_search?: string }
        Returns: Json
      }
      rpc_admin_set_fps_payout_request_status: {
        Args: {
          p_admin_fps_reference?: string
          p_admin_id: string
          p_request_id: string
          p_status: Database["public"]["Enums"]["payout_request_status"]
        }
        Returns: Json
      }
      rpc_admin_set_reward_activity_status: {
        Args: { p_status: string; p_template_id: string }
        Returns: Json
      }
      rpc_admin_set_reward_campaign_status: {
        Args: { p_campaign_id: string; p_status: string }
        Returns: Json
      }
      rpc_admin_set_reward_template_status: {
        Args: { p_status: string; p_template_id: string }
        Returns: Json
      }
      rpc_admin_submit_grading_outbound: {
        Args: {
          p_order_id: string
          p_order_kind: string
          p_tracking_no: string
        }
        Returns: Json
      }
      rpc_admin_submit_seller_return_tracking: {
        Args: {
          p_order_id: string
          p_order_kind: string
          p_tracking_no: string
        }
        Returns: Json
      }
      rpc_admin_upsert_check_in_program: {
        Args: { p_payload: Json }
        Returns: Json
      }
      rpc_admin_upsert_reward_activity: {
        Args: { p_payload: Json }
        Returns: Json
      }
      rpc_admin_upsert_reward_campaign: {
        Args: { p_payload: Json }
        Returns: Json
      }
      rpc_admin_upsert_reward_template: {
        Args: { p_payload: Json }
        Returns: Json
      }
      rpc_apply_account_sanction: {
        Args: {
          p_case_id: string
          p_ends_at?: string
          p_reason?: string
          p_scope: Database["public"]["Enums"]["sanction_scope"]
          p_type: Database["public"]["Enums"]["sanction_type"]
          p_user_id: string
        }
        Returns: Json
      }
      rpc_attach_member_auth_order_payment_intent: {
        Args: { p_order_id: string; p_payment_intent_id: string }
        Returns: Json
      }
      rpc_attach_merchant_order_payment_intent: {
        Args: { p_order_id: string; p_payment_intent_id: string }
        Returns: Json
      }
      rpc_buy_now_listing: {
        Args: { p_buyer_id: string; p_listing_id: string; p_use_auth?: boolean }
        Returns: Json
      }
      rpc_buy_now_merchant_listing: {
        Args: { p_buyer_id: string; p_listing_id: string; p_use_auth?: boolean }
        Returns: Json
      }
      rpc_cancel_member_order: {
        Args: { p_order_id: string; p_user_id: string }
        Returns: Json
      }
      rpc_cancel_merchant_auth_order: {
        Args: { p_merchant_id: string; p_order_id: string }
        Returns: Json
      }
      rpc_claim_flash_reward: { Args: { p_campaign_id: string }; Returns: Json }
      rpc_complete_member_auth_grading: {
        Args: { p_order_id: string }
        Returns: Json
      }
      rpc_complete_member_order: {
        Args: { p_order_id: string; p_user_id: string }
        Returns: Json
      }
      rpc_complete_merchant_order: {
        Args: { p_order_id: string; p_user_id: string }
        Returns: Json
      }
      rpc_confirm_buyer_received: {
        Args: { p_buyer_id: string; p_order_id: string }
        Returns: Json
      }
      rpc_confirm_merchant_buyer_receipt: {
        Args: { p_order_id: string }
        Returns: Json
      }
      rpc_confirm_platform_received: {
        Args: { p_order_id: string }
        Returns: Json
      }
      rpc_e2e_backdate_coupon_reserve: {
        Args: { p_minutes_ago?: number; p_user_reward_id: string }
        Returns: Json
      }
      rpc_e2e_backdate_merchant_order_created_at: {
        Args: { p_hours_ago?: number; p_order_id: string }
        Returns: undefined
      }
      rpc_e2e_backdate_merchant_payout_hold: {
        Args: { p_order_id: string }
        Returns: Json
      }
      rpc_e2e_clear_unsettled_grading_recovery: {
        Args: { p_merchant_id: string }
        Returns: Json
      }
      rpc_e2e_is_merchant_payout_hold_elapsed: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      rpc_e2e_reset_listing_trading_fixture: {
        Args: { p_buyer_id: string; p_listing_id: string; p_seller_id: string }
        Returns: Json
      }
      rpc_e2e_seed_member_auth_pending_payment_order: {
        Args: { p_buyer_id: string; p_listing_id: string }
        Returns: string
      }
      rpc_e2e_seed_member_auth_refund_eligible_order: {
        Args: {
          p_buyer_id: string
          p_listing_id: string
          p_payment_intent_suffix?: string
        }
        Returns: string
      }
      rpc_e2e_seed_merchant_auth_confirm_guard_order: {
        Args: {
          p_buyer_id: string
          p_listing_id: string
          p_payment_intent_suffix?: string
        }
        Returns: string
      }
      rpc_e2e_seed_merchant_auth_refund_eligible_order: {
        Args: {
          p_buyer_id: string
          p_listing_id: string
          p_payment_intent_suffix?: string
        }
        Returns: string
      }
      rpc_e2e_seed_merchant_direct_refund_eligible_order: {
        Args: {
          p_buyer_id: string
          p_listing_id: string
          p_payment_intent_suffix?: string
        }
        Returns: string
      }
      rpc_e2e_seed_merchant_pending_payment_order: {
        Args: { p_buyer_id: string; p_listing_id: string }
        Returns: string
      }
      rpc_e2e_seed_merchant_shipped_awaiting_confirm: {
        Args: {
          p_buyer_id: string
          p_item_subtotal?: number
          p_listing_id: string
          p_payment_intent_suffix?: string
        }
        Returns: string
      }
      rpc_e2e_set_merchant_order_payout_retry_test_state: {
        Args: { p_order_id: string; p_scenario: string }
        Returns: Json
      }
      rpc_ensure_chat_room: {
        Args: {
          p_partner_id: string
          p_partner_persona?: Database["public"]["Enums"]["seller_persona_type"]
          p_viewer_persona?: Database["public"]["Enums"]["seller_persona_type"]
        }
        Returns: Json
      }
      rpc_fail_member_auth_order: {
        Args: { p_order_id: string }
        Returns: Json
      }
      rpc_finalize_auth_fee_capture: {
        Args: {
          p_admin_id?: string
          p_captured_amount_cents: number
          p_order_id: string
          p_order_kind: string
          p_payment_intent_id: string
        }
        Returns: Json
      }
      rpc_finalize_auth_grading_fail: {
        Args: {
          p_order_id: string
          p_order_kind: string
          p_payment_intent_id: string
        }
        Returns: Json
      }
      rpc_finalize_auth_intake_confirm: {
        Args: {
          p_admin_id?: string
          p_order_id: string
          p_order_kind: string
          p_payment_intent_id: string
        }
        Returns: Json
      }
      rpc_finalize_auth_refund: {
        Args: {
          p_order_id: string
          p_order_kind: string
          p_refund_amount_cents: number
          p_refund_id: string
        }
        Returns: Json
      }
      rpc_finalize_goods_capture: {
        Args: {
          p_admin_id?: string
          p_auth_grading_company?: string
          p_auth_grading_score?: string
          p_captured_amount_cents: number
          p_notes?: string
          p_order_id: string
          p_order_kind: string
          p_payment_intent_id: string
        }
        Returns: Json
      }
      rpc_finalize_member_fps_payout_ready: {
        Args: { p_order_id: string }
        Returns: Json
      }
      rpc_finalize_merchant_order_payout:
        | {
            Args: {
              p_destination_account_id: string
              p_order_id: string
              p_transfer_amount_cents: number
              p_transfer_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_destination_account_id: string
              p_order_id: string
              p_recovery_applications?: Json
              p_transfer_amount_cents: number
              p_transfer_id: string
            }
            Returns: Json
          }
      rpc_finalize_merchant_pending_payment_expiry: {
        Args: { p_order_id: string }
        Returns: Json
      }
      rpc_finalize_moderation_order_refund: {
        Args: {
          p_case_id?: string
          p_order_id: string
          p_payment_intent_id: string
          p_refund_cents: number
          p_refund_id: string
          p_stripe_fee_hkd?: number
        }
        Returns: Json
      }
      rpc_finalize_stale_coupon_reserve: {
        Args: { p_user_reward_id: string }
        Returns: Json
      }
      rpc_get_auth_escrow_capture_model: {
        Args: { p_order_id: string; p_order_kind: string }
        Returns: Json
      }
      rpc_get_user_reviewed_member_order_ids: {
        Args: { p_order_ids: string[] }
        Returns: string[]
      }
      rpc_get_user_reviewed_merchant_order_ids: {
        Args: { p_order_ids: string[] }
        Returns: string[]
      }
      rpc_increment_listing_view: {
        Args: { p_listing_id: string }
        Returns: undefined
      }
      rpc_list_active_flash_campaigns: { Args: never; Returns: Json }
      rpc_list_chat_unread_digest_candidates: {
        Args: { p_limit?: number }
        Returns: {
          unread_count: number
          user_id: string
        }[]
      }
      rpc_list_checkout_eligible_coupons: {
        Args: {
          p_order_id: string
          p_shipping_method?: string
          p_use_auth?: boolean
        }
        Returns: Json
      }
      rpc_list_home_trade_ticker: {
        Args: { p_limit?: number }
        Returns: {
          card_code: string
          completed_at: string
          price_hkd: number
          product_name: string
          trade_id: string
        }[]
      }
      rpc_list_member_fps_payout_ready_candidates: {
        Args: { p_limit?: number }
        Returns: {
          order_id: string
        }[]
      }
      rpc_list_merchant_connect_payout_candidates: {
        Args: { p_limit?: number }
        Returns: {
          order_id: string
        }[]
      }
      rpc_list_merchant_finance_settlements: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort?: string
          p_status_filter?: string
        }
        Returns: Json
      }
      rpc_list_merchant_pending_payment_expiry_candidates: {
        Args: { p_limit?: number }
        Returns: {
          listing_id: string
          order_id: string
          stripe_payment_intent_id: string
        }[]
      }
      rpc_list_points_redemption_catalog: { Args: never; Returns: Json }
      rpc_list_stale_coupon_reserve_candidates: {
        Args: { p_limit?: number }
        Returns: {
          order_id: string
          order_kind: string
          user_reward_id: string
        }[]
      }
      rpc_make_offer:
        | {
            Args: {
              p_buyer_id: string
              p_content: string
              p_listing_id: string
              p_offer_price: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_buyer_id: string
              p_content: string
              p_listing_id: string
              p_offer_price: number
              p_use_authentication?: boolean
            }
            Returns: Json
          }
      rpc_mark_auth_grading_fail_failed: {
        Args: { p_error: string; p_order_id: string; p_order_kind: string }
        Returns: Json
      }
      rpc_mark_auth_order_payment_voided: {
        Args: {
          p_order_id: string
          p_order_kind: string
          p_payment_intent_id: string
        }
        Returns: Json
      }
      rpc_mark_auth_refund_failed: {
        Args: { p_error: string; p_order_id: string; p_order_kind: string }
        Returns: Json
      }
      rpc_mark_chat_room_read: {
        Args: { p_read_at?: string; p_room_id: string }
        Returns: Json
      }
      rpc_mark_member_auth_order_authorized: {
        Args: {
          p_amounts?: Json
          p_order_id: string
          p_payment_intent_id: string
        }
        Returns: Json
      }
      rpc_mark_member_auth_order_paid: {
        Args: {
          p_amounts?: Json
          p_order_id: string
          p_payment_intent_id: string
        }
        Returns: Json
      }
      rpc_mark_merchant_order_authorized: {
        Args: {
          p_amounts?: Json
          p_order_id: string
          p_payment_intent_id: string
        }
        Returns: Json
      }
      rpc_mark_merchant_order_paid: {
        Args: {
          p_amounts?: Json
          p_order_id: string
          p_payment_intent_id: string
        }
        Returns: Json
      }
      rpc_mark_merchant_order_payout_failed: {
        Args: { p_error: string; p_order_id: string }
        Returns: Json
      }
      rpc_mark_moderation_order_refund_failed: {
        Args: { p_case_id?: string; p_error: string; p_order_id: string }
        Returns: Json
      }
      rpc_modify_offer: {
        Args: {
          p_buyer_id: string
          p_content: string
          p_new_price: number
          p_offer_id: string
        }
        Returns: Json
      }
      rpc_prepare_auth_fee_capture: {
        Args: { p_order_id: string; p_order_kind: string }
        Returns: Json
      }
      rpc_prepare_auth_grading_fail: {
        Args: {
          p_carrier_liability_party?: string
          p_fault_party: Database["public"]["Enums"]["grading_fault_party"]
          p_order_id: string
          p_order_kind: string
          p_reason?: string
        }
        Returns: Json
      }
      rpc_prepare_auth_intake_confirm: {
        Args: { p_order_id: string; p_order_kind: string }
        Returns: Json
      }
      rpc_prepare_goods_capture: {
        Args: {
          p_auth_grading_company?: string
          p_auth_grading_score?: string
          p_notes?: string
          p_order_id: string
          p_order_kind: string
        }
        Returns: Json
      }
      rpc_prepare_member_auth_order_payment: {
        Args: { p_order_id: string; p_user_reward_id?: string }
        Returns: Json
      }
      rpc_prepare_merchant_order_payment:
        | {
            Args: {
              p_order_id: string
              p_shipping_method: string
              p_use_auth?: boolean
            }
            Returns: Json
          }
        | {
            Args: {
              p_buyer_phone?: string
              p_buyer_remark?: string
              p_meetup_detail?: string
              p_order_id: string
              p_sf_address?: string
              p_sf_locker_code?: string
              p_shipping_method: string
              p_use_auth?: boolean
            }
            Returns: Json
          }
        | {
            Args: {
              p_buyer_phone?: string
              p_buyer_remark?: string
              p_meetup_detail?: string
              p_order_id: string
              p_sf_address?: string
              p_sf_locker_code?: string
              p_shipping_method: string
              p_use_auth?: boolean
              p_user_reward_id?: string
            }
            Returns: Json
          }
      rpc_prepare_merchant_order_payout: {
        Args: { p_order_id: string }
        Returns: Json
      }
      rpc_prepare_moderation_order_refund: {
        Args: {
          p_carrier_liability_party?: string
          p_case_id: string
          p_fault_party: Database["public"]["Enums"]["grading_fault_party"]
          p_order_id: string
          p_platform_fault_reason?: string
          p_reason?: string
        }
        Returns: Json
      }
      rpc_redeem_points_catalog_item: {
        Args: { p_catalog_id: string }
        Returns: Json
      }
      rpc_refresh_auth_escrow_payment_intent: {
        Args: {
          p_order_id: string
          p_order_kind: string
          p_payment_intent_id: string
        }
        Returns: Json
      }
      rpc_reject_offer: {
        Args: { p_offer_id: string; p_seller_id: string }
        Returns: Json
      }
      rpc_resolve_moderation_case: {
        Args: { p_case_id: string; p_payload: Json }
        Returns: Json
      }
      rpc_retry_moderation_order_refund_prepare: {
        Args: { p_case_id: string; p_order_id: string }
        Returns: Json
      }
      rpc_send_chat_message: {
        Args: { p_content: string; p_room_id: string; p_sender_id: string }
        Returns: Json
      }
      rpc_service_seed_user_points: {
        Args: { p_description?: string; p_points: number; p_user_id: string }
        Returns: Json
      }
      rpc_submit_inbound_tracking:
        | {
            Args: {
              p_order_id: string
              p_seller_id: string
              p_tracking_no: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_courier_name?: string
              p_order_id: string
              p_seller_id: string
              p_tracking_no: string
            }
            Returns: Json
          }
      rpc_submit_merchant_auth_inbound_tracking:
        | {
            Args: {
              p_merchant_id: string
              p_order_id: string
              p_tracking_no: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_courier_name?: string
              p_merchant_id: string
              p_order_id: string
              p_tracking_no: string
            }
            Returns: Json
          }
      rpc_submit_merchant_direct_fulfillment: {
        Args: {
          p_courier_name?: string
          p_merchant_id: string
          p_order_id: string
          p_tracking_no?: string
        }
        Returns: Json
      }
      rpc_submit_merchant_kyc_application: {
        Args: { p_application: Json; p_documents: Json; p_user_id: string }
        Returns: Json
      }
      rpc_submit_outbound_tracking: {
        Args: { p_order_id: string; p_tracking_no: string }
        Returns: Json
      }
      rpc_submit_transaction_review: {
        Args: {
          p_comment?: string
          p_order_id: string
          p_rating: number
          p_reviewee_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      rpc_submit_user_report_v2: {
        Args: {
          p_attachment_ids?: string[]
          p_category: Database["public"]["Enums"]["report_category"]
          p_chat_room_id?: string
          p_details?: string
          p_target_id: string
        }
        Returns: Json
      }
      run_auto_grant_rewards_for_me: { Args: never; Returns: Json }
      search_admin_grading_orders: {
        Args: {
          p_keyword?: string
          p_order_kind?: string
          p_page?: number
          p_page_size?: number
          p_tab: string
        }
        Returns: Json
      }
      search_admin_moderation_cases: {
        Args: {
          p_category?: Database["public"]["Enums"]["report_category"]
          p_min_score?: number
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_status?: string
        }
        Returns: Json
      }
      search_admin_platform_users: {
        Args: {
          p_keyword?: string
          p_kyc_filter?: string
          p_page?: number
          p_page_size?: number
          p_user_types?: string[]
        }
        Returns: Json
      }
      search_marketplace_products: {
        Args: {
          p_card_number?: string
          p_catalog_types?: Database["public"]["Enums"]["catalog_type"][]
          p_grade_filters?: Json
          p_keyword?: string
          p_name_query?: string
          p_page?: number
          p_page_size?: number
          p_price_max?: number
          p_price_min?: number
          p_rarities?: string[]
          p_seller_modes?: string[]
          p_set_code?: string
          p_sort?: string
        }
        Returns: {
          card_number: string
          catalog_type: Database["public"]["Enums"]["catalog_type"]
          display_id: string
          grading_company: string
          grading_score: string
          highest_price: number
          image_url: string
          latest_listing_at: string
          listing_count: number
          lowest_listing_created_at: string
          lowest_listing_id: string
          lowest_price: number
          market_avg_price: number
          market_data_source: string
          name_en: string
          name_ja: string
          name_zh: string
          page: number
          page_size: number
          price_vs_market_pct: number
          product_id: string
          product_name: string
          range_end: number
          range_start: number
          rarity: string
          seller_id: string
          seller_name: string
          seller_persona: Database["public"]["Enums"]["seller_persona_type"]
          set_code: string
          total_count: number
          total_pages: number
          use_authentication: boolean
        }[]
      }
      search_marketplace_products_browse: {
        Args: { p_page?: number; p_page_size?: number; p_sort?: string }
        Returns: {
          card_number: string
          catalog_type: Database["public"]["Enums"]["catalog_type"]
          display_id: string
          grading_company: string
          grading_score: string
          highest_price: number
          image_url: string
          latest_listing_at: string
          listing_count: number
          lowest_listing_created_at: string
          lowest_listing_id: string
          lowest_price: number
          market_avg_price: number
          market_data_source: string
          name_en: string
          name_ja: string
          name_zh: string
          page: number
          page_size: number
          price_vs_market_pct: number
          product_id: string
          product_name: string
          range_end: number
          range_start: number
          rarity: string
          seller_id: string
          seller_name: string
          seller_persona: Database["public"]["Enums"]["seller_persona_type"]
          set_code: string
          total_count: number
          total_pages: number
          use_authentication: boolean
        }[]
      }
      search_marketplace_seller_listings: {
        Args: {
          p_grade_filters?: Json
          p_name_query?: string
          p_page?: number
          p_page_size?: number
          p_price_max?: number
          p_price_min?: number
          p_rarities?: string[]
          p_seller_id: string
          p_sort?: string
        }
        Returns: {
          card_number: string
          created_at: string
          display_id: string
          grading_company: string
          grading_score: string
          image_url: string
          listing_id: string
          market_avg_price: number
          market_data_source: string
          name_en: string
          name_ja: string
          name_zh: string
          page: number
          page_size: number
          price: number
          price_vs_market_pct: number
          product_id: string
          product_name: string
          range_end: number
          range_start: number
          rarity: string
          seller_id: string
          seller_max_price: number
          seller_min_price: number
          seller_name: string
          seller_persona: Database["public"]["Enums"]["seller_persona_type"]
          set_code: string
          total_count: number
          total_pages: number
          use_authentication: boolean
        }[]
      }
      search_merchant_trading_orders: {
        Args: {
          p_include_auth_in_progress?: boolean
          p_include_payment_pending?: boolean
          p_page?: number
          p_page_size?: number
          p_search_query?: string
          p_tab_status?: string
        }
        Returns: {
          buyer_avatar_path: string
          buyer_display_name: string
          buyer_id: string
          buyer_username: string
          card_number: string
          catalog_image_url: string
          count_needs_action: number
          count_pending_auth: number
          count_pending_payment: number
          count_status_all: number
          count_status_cancelled: number
          count_status_completed: number
          count_status_pending: number
          created_at: string
          display_id: string
          escrow_status: Database["public"]["Enums"]["escrow_state"]
          final_price: number
          grading_company: string
          grading_score: string
          has_reviewed_by_me: boolean
          listing_images: Json
          merchant_id: string
          order_id: string
          order_number: string
          page: number
          page_size: number
          product_name_en: string
          product_name_ja: string
          product_name_zh: string
          range_end: number
          range_start: number
          requires_authentication: boolean
          set_code: string
          total_count: number
          total_pages: number
        }[]
      }
      search_product_catalog: {
        Args: { p_item_type?: string; p_query: string }
        Returns: {
          card_number: string
          display_id: string
          id: string
          image_url: string
          jan_code: string
          name_en: string
          name_ja: string
          name_zh: string
          pokemon_stage: string
          rarity: string
          set_code: string
          snkr_rank: number
          total_count: number
          type: Database["public"]["Enums"]["catalog_type"]
        }[]
      }
      search_public_profile_reviews: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_persona: Database["public"]["Enums"]["review_persona"]
          p_profile_id: string
          p_sort?: string
        }
        Returns: {
          aggregate_rating: number
          comment: string
          created_at: string
          is_merchant_tx: boolean
          page: number
          page_size: number
          public_review_count: number
          range_end: number
          range_start: number
          rating: number
          review_id: string
          reviewer_avatar_path: string
          reviewer_display_name: string
          reviewer_id: string
          reviewer_persona: Database["public"]["Enums"]["review_persona"]
          reviewer_username: string
          total_count: number
          total_pages: number
        }[]
      }
      search_user_trading_orders: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_persona?: string
          p_search_query?: string
          p_tab_status?: string
        }
        Returns: {
          buyer_id: string
          card_number: string
          catalog_image_url: string
          count_needs_action: number
          count_persona_all: number
          count_persona_buy: number
          count_persona_sell: number
          count_status_all: number
          count_status_cancelled: number
          count_status_completed: number
          count_status_pending: number
          counterparty_avatar_path: string
          counterparty_display_name: string
          counterparty_id: string
          counterparty_username: string
          created_at: string
          display_id: string
          escrow_status: Database["public"]["Enums"]["member_escrow_status"]
          expires_at: string
          final_price: number
          grading_company: string
          grading_score: string
          has_reviewed_by_me: boolean
          listing_images: Json
          order_id: string
          order_number: string
          page: number
          page_size: number
          persona: string
          product_name_en: string
          product_name_ja: string
          product_name_zh: string
          range_end: number
          range_start: number
          seller_id: string
          set_code: string
          status: Database["public"]["Enums"]["member_order_state"]
          total_count: number
          total_pages: number
          use_authentication: boolean
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      catalog_type:
        | "single_card"
        | "booster_pack"
        | "booster_box"
        | "gift_set"
        | "starter_deck"
        | "accessories"
      escrow_state:
        | "pending_payment"
        | "payment_held"
        | "shipped"
        | "authenticating"
        | "authenticated"
        | "completed_and_transferred"
        | "refunded"
      grading_fault_party:
        | "buyer"
        | "seller"
        | "platform"
        | "carrier"
        | "inconclusive"
      kyc_application_status: "pending" | "approved" | "rejected"
      kyc_state: "pending" | "verified" | "rejected"
      listing_engagement_event_type: "view" | "offer"
      listing_status: "active" | "sold" | "inactive"
      member_escrow_status:
        | "payment"
        | "custody"
        | "grading"
        | "shipped"
        | "released"
        | "cancelled"
      member_order_state:
        | "pending"
        | "meetup_arranged"
        | "completed"
        | "cancelled"
      member_seller_payout_status:
        | "none"
        | "held"
        | "ready"
        | "processing"
        | "paid"
        | "frozen"
        | "failed"
      moderation_case_status: "open" | "reviewing" | "resolved" | "dismissed"
      moderation_resolution: "upheld" | "dismissed" | "insufficient_evidence"
      notification_email_status: "pending" | "sent" | "failed" | "dead"
      offer_status: "pending" | "accepted" | "rejected" | "cancelled"
      payment_capture_status:
        | "none"
        | "authorized"
        | "auth_fee_captured"
        | "fully_captured"
        | "voided"
        | "refunded"
        | "partially_refunded"
      payout_batch_status: "draft" | "processing" | "completed"
      payout_request_status:
        | "pending"
        | "ready"
        | "processing"
        | "completed"
        | "failed"
      report_category: "fraud" | "offline_trade" | "harassment" | "other"
      report_source: "chat_room" | "profile"
      report_state: "pending" | "reviewing" | "resolved" | "dismissed"
      review_persona: "member" | "merchant"
      reward_campaign_status: "draft" | "active" | "paused" | "ended"
      reward_distribution_mode: "auto_grant" | "flash_only"
      reward_template_audit_action: "create" | "update" | "publish" | "archive"
      reward_template_status: "draft" | "active" | "archived"
      reward_type:
        | "discount_coupon"
        | "free_shipping"
        | "lucky_draw_ticket"
        | "points"
      sanction_scope: "account" | "member_persona" | "merchant_persona"
      sanction_type:
        | "warn"
        | "restrict_listing"
        | "restrict_chat"
        | "freeze_payout"
        | "suspend"
        | "ban"
      seller_persona_type: "member" | "merchant"
      seller_receivable_status: "pending" | "paid" | "waived" | "cancelled"
      seller_settlement_status: "none" | "pending" | "cleared" | "waived"
      sync_state: "synced" | "partial" | "needs_review"
      transaction_type:
        | "escrow_payment"
        | "commission_deduction"
        | "shipping_subsidy"
        | "refund"
        | "payout"
        | "grading_fail_recovery"
        | "grading_fail_recovery_applied"
      user_role: "admin" | "merchant" | "member"
      violation_persona: "member" | "merchant" | "both" | "unknown"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      catalog_type: [
        "single_card",
        "booster_pack",
        "booster_box",
        "gift_set",
        "starter_deck",
        "accessories",
      ],
      escrow_state: [
        "pending_payment",
        "payment_held",
        "shipped",
        "authenticating",
        "authenticated",
        "completed_and_transferred",
        "refunded",
      ],
      grading_fault_party: [
        "buyer",
        "seller",
        "platform",
        "carrier",
        "inconclusive",
      ],
      kyc_application_status: ["pending", "approved", "rejected"],
      kyc_state: ["pending", "verified", "rejected"],
      listing_engagement_event_type: ["view", "offer"],
      listing_status: ["active", "sold", "inactive"],
      member_escrow_status: [
        "payment",
        "custody",
        "grading",
        "shipped",
        "released",
        "cancelled",
      ],
      member_order_state: [
        "pending",
        "meetup_arranged",
        "completed",
        "cancelled",
      ],
      member_seller_payout_status: [
        "none",
        "held",
        "ready",
        "processing",
        "paid",
        "frozen",
        "failed",
      ],
      moderation_case_status: ["open", "reviewing", "resolved", "dismissed"],
      moderation_resolution: ["upheld", "dismissed", "insufficient_evidence"],
      notification_email_status: ["pending", "sent", "failed", "dead"],
      offer_status: ["pending", "accepted", "rejected", "cancelled"],
      payment_capture_status: [
        "none",
        "authorized",
        "auth_fee_captured",
        "fully_captured",
        "voided",
        "refunded",
        "partially_refunded",
      ],
      payout_batch_status: ["draft", "processing", "completed"],
      payout_request_status: [
        "pending",
        "ready",
        "processing",
        "completed",
        "failed",
      ],
      report_category: ["fraud", "offline_trade", "harassment", "other"],
      report_source: ["chat_room", "profile"],
      report_state: ["pending", "reviewing", "resolved", "dismissed"],
      review_persona: ["member", "merchant"],
      reward_campaign_status: ["draft", "active", "paused", "ended"],
      reward_distribution_mode: ["auto_grant", "flash_only"],
      reward_template_audit_action: ["create", "update", "publish", "archive"],
      reward_template_status: ["draft", "active", "archived"],
      reward_type: [
        "discount_coupon",
        "free_shipping",
        "lucky_draw_ticket",
        "points",
      ],
      sanction_scope: ["account", "member_persona", "merchant_persona"],
      sanction_type: [
        "warn",
        "restrict_listing",
        "restrict_chat",
        "freeze_payout",
        "suspend",
        "ban",
      ],
      seller_persona_type: ["member", "merchant"],
      seller_receivable_status: ["pending", "paid", "waived", "cancelled"],
      seller_settlement_status: ["none", "pending", "cleared", "waived"],
      sync_state: ["synced", "partial", "needs_review"],
      transaction_type: [
        "escrow_payment",
        "commission_deduction",
        "shipping_subsidy",
        "refund",
        "payout",
        "grading_fail_recovery",
        "grading_fail_recovery_applied",
      ],
      user_role: ["admin", "merchant", "member"],
      violation_persona: ["member", "merchant", "both", "unknown"],
    },
  },
} as const
