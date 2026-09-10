-- Admin grading outbound: GUC bypass + restore shipped outbound_tracking_no rule.

CREATE OR REPLACE FUNCTION public.rpc_admin_submit_grading_outbound(
    p_order_kind TEXT,
    p_order_id UUID,
    p_tracking_no TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_from_status TEXT;
    v_tracking TEXT;
    v_updated RECORD;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_tracking := NULLIF(trim(COALESCE(p_tracking_no, '')), '');
    IF v_tracking IS NULL THEN
        RAISE EXCEPTION '請輸入有效的出庫物流單號。';
    END IF;

    IF p_order_kind = 'member' THEN
        SELECT mo.escrow_status::TEXT
        INTO v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        PERFORM set_config('grading.admin_outbound', 'on', true);

        UPDATE public.member_orders
        SET
            outbound_tracking_no = v_tracking,
            updated_at = now()
        WHERE id = p_order_id
          AND use_authentication = true
          AND escrow_status = 'shipped'
          AND auth_result = 'passed'
        RETURNING * INTO v_updated;

        PERFORM set_config('grading.admin_outbound', 'off', true);

        IF NOT FOUND THEN
            RAISE EXCEPTION '出庫物流更新失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT mo.escrow_status::TEXT
        INTO v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        UPDATE public.merchant_orders
        SET
            outbound_tracking_no = v_tracking,
            updated_at = now()
        WHERE id = p_order_id
          AND requires_authentication = true
          AND escrow_status = 'authenticated'
          AND auth_result = 'passed'
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '出庫物流更新失敗：訂單狀態不合法。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        v_admin_id,
        'submit_outbound',
        v_from_status,
        v_from_status,
        v_tracking
    );

    RETURN jsonb_build_object('order', to_jsonb(v_updated));
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

    IF current_setting('moderation.order_refund', true) = 'on' THEN
        RETURN NEW;
    END IF;

    IF current_setting('grading.order_fail', true) = 'on' THEN
        RETURN NEW;
    END IF;

    IF current_setting('grading.admin_outbound', true) = 'on' THEN
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
