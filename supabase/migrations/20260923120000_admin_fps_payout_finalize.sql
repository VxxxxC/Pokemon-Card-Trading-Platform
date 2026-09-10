-- Admin FPS payout finalize: atomic payout_requests + member_orders sync.

CREATE OR REPLACE FUNCTION public.fn_fps_payout_blocked_for_complete(
    p_status public.payout_request_status,
    p_fps_id_snapshot TEXT,
    p_fps_name_snapshot TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT
        p_status = 'pending'::public.payout_request_status
        OR COALESCE(btrim(p_fps_id_snapshot), '') = 'PENDING_FPS'
        OR COALESCE(btrim(p_fps_id_snapshot), '') LIKE 'PENDING_FPS%'
        OR COALESCE(btrim(p_fps_name_snapshot), '') = 'PENDING_FPS_NAME';
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_set_fps_payout_request_status(
    p_request_id UUID,
    p_status public.payout_request_status,
    p_admin_id UUID,
    p_admin_fps_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row public.payout_requests%ROWTYPE;
    v_order_number TEXT;
    v_seller_payout_status public.member_seller_payout_status;
    v_reference TEXT;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF p_status NOT IN (
        'completed'::public.payout_request_status,
        'failed'::public.payout_request_status
    ) THEN
        RAISE EXCEPTION '不支援的提現單狀態';
    END IF;

    SELECT pr.*
    INTO v_row
    FROM public.payout_requests pr
    WHERE pr.id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '提現單不存在';
    END IF;

    SELECT mo.order_number, mo.seller_payout_status
    INTO v_order_number, v_seller_payout_status
    FROM public.member_orders mo
    WHERE mo.id = v_row.order_id;

    IF v_row.status IN (
        'completed'::public.payout_request_status,
        'failed'::public.payout_request_status
    ) THEN
        RAISE EXCEPTION '提現單已結案';
    END IF;

    IF v_seller_payout_status = 'frozen'::public.member_seller_payout_status THEN
        RAISE EXCEPTION '訂單撥款已凍結，無法更新提現單';
    END IF;

    IF p_status = 'completed'::public.payout_request_status THEN
        IF v_row.status NOT IN (
            'ready'::public.payout_request_status,
            'processing'::public.payout_request_status
        ) THEN
            RAISE EXCEPTION '提現單狀態不允許銷帳';
        END IF;

        IF public.fn_fps_payout_blocked_for_complete(
            v_row.status,
            v_row.fps_id_snapshot,
            v_row.fps_name_snapshot
        ) THEN
            RAISE EXCEPTION '提現單待賣家補充 FPS，無法銷帳';
        END IF;

        v_reference := NULLIF(btrim(p_admin_fps_reference), '');
        IF v_reference IS NULL THEN
            RAISE EXCEPTION '請填寫 FPS 轉帳參考號';
        END IF;

        UPDATE public.payout_requests
        SET
            status = 'completed'::public.payout_request_status,
            paid_at = v_now,
            paid_by = p_admin_id,
            admin_fps_reference = v_reference,
            updated_at = v_now
        WHERE id = p_request_id;

        UPDATE public.member_orders
        SET
            seller_payout_status = 'paid'::public.member_seller_payout_status,
            updated_at = v_now
        WHERE id = v_row.order_id;
    ELSE
        IF v_row.status NOT IN (
            'pending'::public.payout_request_status,
            'ready'::public.payout_request_status,
            'processing'::public.payout_request_status
        ) THEN
            RAISE EXCEPTION '提現單狀態不允許駁回';
        END IF;

        UPDATE public.payout_requests
        SET
            status = 'failed'::public.payout_request_status,
            updated_at = v_now
        WHERE id = p_request_id;

        UPDATE public.member_orders
        SET
            seller_payout_status = 'failed'::public.member_seller_payout_status,
            updated_at = v_now
        WHERE id = v_row.order_id;
    END IF;

    RETURN jsonb_build_object(
        'request_id', p_request_id,
        'order_id', v_row.order_id,
        'order_number', v_order_number,
        'status', p_status::TEXT
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_batch_complete_fps_payout_requests(
    p_request_ids UUID[],
    p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request_id UUID;
    v_row public.payout_requests%ROWTYPE;
    v_order_number TEXT;
    v_seller_payout_status public.member_seller_payout_status;
    v_now TIMESTAMPTZ := now();
    v_completed_count INTEGER := 0;
    v_order_numbers TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF p_request_ids IS NULL OR cardinality(p_request_ids) = 0 THEN
        RAISE EXCEPTION '請選擇至少一筆提現單';
    END IF;

    FOREACH v_request_id IN ARRAY p_request_ids
    LOOP
        SELECT pr.*
        INTO v_row
        FROM public.payout_requests pr
        WHERE pr.id = v_request_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION '提現單不存在: %', v_request_id;
        END IF;

        SELECT mo.order_number, mo.seller_payout_status
        INTO v_order_number, v_seller_payout_status
        FROM public.member_orders mo
        WHERE mo.id = v_row.order_id;

        IF v_row.status IN (
            'completed'::public.payout_request_status,
            'failed'::public.payout_request_status
        ) THEN
            RAISE EXCEPTION '提現單已結案: %', v_request_id;
        END IF;

        IF v_seller_payout_status = 'frozen'::public.member_seller_payout_status THEN
            RAISE EXCEPTION '訂單撥款已凍結，無法銷帳: %', v_request_id;
        END IF;

        IF v_row.status NOT IN (
            'ready'::public.payout_request_status,
            'processing'::public.payout_request_status
        ) THEN
            RAISE EXCEPTION '提現單狀態不允許銷帳: %', v_request_id;
        END IF;

        IF public.fn_fps_payout_blocked_for_complete(
            v_row.status,
            v_row.fps_id_snapshot,
            v_row.fps_name_snapshot
        ) THEN
            RAISE EXCEPTION '提現單待賣家補充 FPS，無法銷帳: %', v_request_id;
        END IF;
    END LOOP;

    FOREACH v_request_id IN ARRAY p_request_ids
    LOOP
        SELECT pr.*
        INTO v_row
        FROM public.payout_requests pr
        WHERE pr.id = v_request_id
        FOR UPDATE;

        SELECT mo.order_number
        INTO v_order_number
        FROM public.member_orders mo
        WHERE mo.id = v_row.order_id;

        UPDATE public.payout_requests
        SET
            status = 'completed'::public.payout_request_status,
            paid_at = v_now,
            paid_by = p_admin_id,
            updated_at = v_now
        WHERE id = v_request_id;

        UPDATE public.member_orders
        SET
            seller_payout_status = 'paid'::public.member_seller_payout_status,
            updated_at = v_now
        WHERE id = v_row.order_id;

        v_completed_count := v_completed_count + 1;
        v_order_numbers := array_append(v_order_numbers, v_order_number);
    END LOOP;

    RETURN jsonb_build_object(
        'completed_count', v_completed_count,
        'order_numbers', to_jsonb(v_order_numbers)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_fps_payout_blocked_for_complete(
    public.payout_request_status,
    TEXT,
    TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fps_payout_blocked_for_complete(
    public.payout_request_status,
    TEXT,
    TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_admin_set_fps_payout_request_status(
    UUID,
    public.payout_request_status,
    UUID,
    TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_set_fps_payout_request_status(
    UUID,
    public.payout_request_status,
    UUID,
    TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_admin_batch_complete_fps_payout_requests(
    UUID[],
    UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_batch_complete_fps_payout_requests(
    UUID[],
    UUID
) TO service_role;
