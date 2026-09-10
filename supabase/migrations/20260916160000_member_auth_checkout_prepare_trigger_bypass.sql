-- Restore buyer payment-prepare updates on member auth orders (lost in moderation trigger migrations).
-- Allows rpc_prepare_member_auth_order_payment checkout columns including coupons.

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

    IF current_setting('moderation.order_refund', true) = 'on' THEN
        RETURN NEW;
    END IF;

    IF current_setting('grading.order_fail', true) = 'on' THEN
        RETURN NEW;
    END IF;

    IF COALESCE(OLD.use_authentication, false) THEN
        IF auth.uid() = OLD.buyer_id THEN
            -- Stripe prepare / coupon attach: pending + payment, checkout columns only
            IF OLD.status = 'pending'
               AND NEW.status = 'pending'
               AND OLD.escrow_status = 'payment'
               AND NEW.escrow_status = 'payment'
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count
               AND NEW.buyer_id = OLD.buyer_id
               AND NEW.seller_id = OLD.seller_id
               AND NEW.final_price = OLD.final_price
               AND COALESCE(NEW.use_authentication, false) = COALESCE(OLD.use_authentication, false)
               AND NEW.inbound_tracking_no IS NOT DISTINCT FROM OLD.inbound_tracking_no
               AND NEW.outbound_tracking_no IS NOT DISTINCT FROM OLD.outbound_tracking_no
               AND (
                   NEW.item_subtotal IS DISTINCT FROM OLD.item_subtotal
                   OR NEW.auth_fee IS DISTINCT FROM OLD.auth_fee
                   OR NEW.inbound_shipping_fee IS DISTINCT FROM OLD.inbound_shipping_fee
                   OR NEW.outbound_shipping_fee IS DISTINCT FROM OLD.outbound_shipping_fee
                   OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
                   OR NEW.buyer_total_amount IS DISTINCT FROM OLD.buyer_total_amount
                   OR NEW.platform_subsidy_amount IS DISTINCT FROM OLD.platform_subsidy_amount
                   OR NEW.coupon_user_reward_id IS DISTINCT FROM OLD.coupon_user_reward_id
                   OR NEW.coupon_type IS DISTINCT FROM OLD.coupon_type
                   OR NEW.escrow_capture_model IS DISTINCT FROM OLD.escrow_capture_model
                   OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
                   OR (
                       NEW.item_subtotal IS NOT DISTINCT FROM OLD.item_subtotal
                       AND NEW.auth_fee IS NOT DISTINCT FROM OLD.auth_fee
                       AND NEW.inbound_shipping_fee IS NOT DISTINCT FROM OLD.inbound_shipping_fee
                       AND NEW.outbound_shipping_fee IS NOT DISTINCT FROM OLD.outbound_shipping_fee
                       AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
                       AND NEW.buyer_total_amount IS NOT DISTINCT FROM OLD.buyer_total_amount
                       AND NEW.platform_subsidy_amount IS NOT DISTINCT FROM OLD.platform_subsidy_amount
                       AND NEW.coupon_user_reward_id IS NOT DISTINCT FROM OLD.coupon_user_reward_id
                       AND NEW.coupon_type IS NOT DISTINCT FROM OLD.coupon_type
                       AND NEW.escrow_capture_model IS NOT DISTINCT FROM OLD.escrow_capture_model
                       AND NEW.stripe_payment_intent_id IS NOT DISTINCT FROM OLD.stripe_payment_intent_id
                       AND OLD.item_subtotal IS NOT NULL
                       AND OLD.total_amount IS NOT NULL
                   )
               ) THEN
                RETURN NEW;
            END IF;

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

        IF auth.uid() IS NOT NULL AND public.is_admin() THEN
            IF OLD.status = 'pending'
               AND NEW.status = 'pending'
               AND OLD.escrow_status = 'grading'
               AND NEW.escrow_status = 'grading'
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count
               AND NEW.buyer_id = OLD.buyer_id
               AND NEW.seller_id = OLD.seller_id
               AND NEW.final_price = OLD.final_price
               AND COALESCE(NEW.use_authentication, false) = COALESCE(OLD.use_authentication, false)
               AND NEW.inbound_tracking_no IS NOT DISTINCT FROM OLD.inbound_tracking_no
               AND NEW.outbound_tracking_no IS NOT DISTINCT FROM OLD.outbound_tracking_no THEN
                RETURN NEW;
            END IF;

            IF OLD.status = 'pending'
               AND NEW.status = 'cancelled'
               AND OLD.escrow_status = 'grading'
               AND NEW.escrow_status = 'cancelled'
               AND NEW.auth_result = 'failed'
               AND NEW.expires_at = OLD.expires_at
               AND NEW.extended_count = OLD.extended_count
               AND NEW.buyer_id = OLD.buyer_id
               AND NEW.seller_id = OLD.seller_id
               AND NEW.final_price = OLD.final_price
               AND COALESCE(NEW.use_authentication, false) = COALESCE(OLD.use_authentication, false)
               AND NEW.inbound_tracking_no IS NOT DISTINCT FROM OLD.inbound_tracking_no
               AND NEW.outbound_tracking_no IS NOT DISTINCT FROM OLD.outbound_tracking_no THEN
                RETURN NEW;
            END IF;
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
               AND NEW.outbound_tracking_no IS NOT DISTINCT FROM OLD.outbound_tracking_no THEN
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
