-- Allow moderation freeze_payout side effects to update member_orders payout status
-- without tripping fn_enforce_member_order_transitions (admin is not buyer/seller).

CREATE OR REPLACE FUNCTION public._moderation_apply_sanction_side_effects(
  p_user_id UUID,
  p_scope public.sanction_scope,
  p_type public.sanction_type
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_type = 'restrict_listing' THEN
    IF p_scope = 'member_persona' THEN
      UPDATE public.listings
      SET status = 'inactive'::public.listing_status,
          updated_at = now()
      WHERE seller_id = p_user_id
        AND seller_persona = 'member'::public.seller_persona_type
        AND status = 'active'::public.listing_status;
    ELSIF p_scope = 'merchant_persona' THEN
      UPDATE public.listings
      SET status = 'inactive'::public.listing_status,
          updated_at = now()
      WHERE seller_id = p_user_id
        AND seller_persona = 'merchant'::public.seller_persona_type
        AND status = 'active'::public.listing_status;
    ELSIF p_scope = 'account' THEN
      UPDATE public.listings
      SET status = 'inactive'::public.listing_status,
          updated_at = now()
      WHERE seller_id = p_user_id
        AND status = 'active'::public.listing_status;
    END IF;
  ELSIF p_type = 'freeze_payout' THEN
    PERFORM set_config('moderation.freeze_payout', 'on', true);

    UPDATE public.member_orders
    SET seller_payout_status = 'frozen'::public.member_seller_payout_status,
        updated_at = now()
    WHERE seller_id = p_user_id
      AND seller_payout_status IN (
        'held'::public.member_seller_payout_status,
        'ready'::public.member_seller_payout_status,
        'processing'::public.member_seller_payout_status
      );

    PERFORM set_config('moderation.freeze_payout', 'off', true);

    UPDATE public.merchant_orders
    SET payout_status = 'frozen',
        updated_at = now()
    WHERE merchant_id = p_user_id
      AND payout_status IN ('pending', 'held', 'processing');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_enforce_member_order_transitions()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF current_setting('moderation.freeze_payout', true) = 'on'
       AND NEW.seller_payout_status = 'frozen'::public.member_seller_payout_status
       AND OLD.seller_payout_status IS DISTINCT FROM NEW.seller_payout_status THEN
        RETURN NEW;
    END IF;

    IF COALESCE(OLD.use_authentication, false) THEN
        IF auth.uid() = OLD.buyer_id THEN
            IF OLD.status = 'pending'
               AND NEW.status = 'pending'
               AND OLD.escrow_status = 'payment'
               AND NEW.escrow_status = 'custody'
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count THEN
                RETURN NEW;
            END IF;

            IF OLD.status = 'pending'
               AND NEW.status = 'completed'
               AND OLD.escrow_status = 'shipped'
               AND NEW.escrow_status = 'released'
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count THEN
                RETURN NEW;
            END IF;

            RAISE EXCEPTION '保安攔截：買家操作不合法。';
        END IF;

        IF auth.uid() = OLD.seller_id THEN
            IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
                RETURN NEW;
            END IF;

            IF OLD.status = 'pending'
               AND NEW.status = 'pending'
               AND OLD.escrow_status = 'custody'
               AND NEW.escrow_status = 'custody'
               AND NEW.inbound_tracking_no IS DISTINCT FROM OLD.inbound_tracking_no
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count THEN
                RETURN NEW;
            END IF;

            IF NEW.extended_count = OLD.extended_count + 1
               AND NEW.expires_at > OLD.expires_at
               AND NEW.status = OLD.status THEN
                RETURN NEW;
            END IF;

            RAISE EXCEPTION '保安攔截：賣家操作不合法。';
        END IF;

        IF OLD.status = 'pending'
           AND NEW.status = 'pending'
           AND NEW.expires_at = OLD.expires_at
           AND NEW.extended_count = OLD.extended_count THEN
            IF OLD.escrow_status = 'custody' AND NEW.escrow_status = 'grading' THEN
                RETURN NEW;
            END IF;

            IF OLD.escrow_status = 'grading' AND NEW.escrow_status = 'shipped' THEN
                RETURN NEW;
            END IF;

            IF OLD.escrow_status = 'shipped'
               AND NEW.escrow_status = 'shipped'
               AND NEW.outbound_tracking_no IS DISTINCT FROM OLD.outbound_tracking_no THEN
                RETURN NEW;
            END IF;
        END IF;

        RAISE EXCEPTION '保安攔截：您不屬於此筆訂單的交易關係人。';
    END IF;

    IF auth.uid() = OLD.buyer_id THEN
        IF NEW.status = 'completed'
           AND OLD.status = 'pending'
           AND NEW.expires_at = OLD.expires_at
           AND NEW.extended_count = OLD.extended_count THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION '保安攔截：買家操作不合法。';
    END IF;

    IF auth.uid() = OLD.seller_id THEN
        IF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
            RETURN NEW;
        END IF;

        IF NEW.extended_count = OLD.extended_count + 1
           AND NEW.expires_at > OLD.expires_at
           AND NEW.status = OLD.status THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION '保安攔截：賣家操作不合法。';
    END IF;

    RAISE EXCEPTION '保安攔截：您不屬於此筆訂單的交易關係人。';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
