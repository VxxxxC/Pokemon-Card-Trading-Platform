-- G1.3: publish validation must include redemption catalog context so kind=none passes

CREATE OR REPLACE FUNCTION public.rpc_admin_set_reward_template_status(
    p_template_id UUID,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_row public.reward_templates%ROWTYPE;
    v_target public.reward_template_status;
    v_action public.reward_template_audit_action;
    v_payload JSONB;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_target := lower(trim(COALESCE(p_status, '')))::public.reward_template_status;

    IF v_target NOT IN ('draft'::public.reward_template_status, 'active'::public.reward_template_status, 'archived'::public.reward_template_status) THEN
        RAISE EXCEPTION '無效的模板狀態';
    END IF;

    SELECT * INTO v_row
    FROM public.reward_templates
    WHERE id = p_template_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到獎勵模板';
    END IF;

    IF v_target = 'active'::public.reward_template_status THEN
        v_payload := public._reward_template_row_to_json(v_row);

        IF EXISTS (
            SELECT 1
            FROM public.reward_redemption_catalog rrc
            WHERE rrc.template_id = p_template_id
        ) THEN
            v_payload := v_payload || jsonb_build_object(
                'redemption_catalog', (
                    SELECT jsonb_build_object(
                        'enabled', true,
                        'points_cost', rrc.points_cost,
                        'stock', rrc.stock,
                        'is_active', rrc.is_active,
                        'display_order', rrc.display_order
                    )
                    FROM public.reward_redemption_catalog rrc
                    WHERE rrc.template_id = p_template_id
                )
            );
        END IF;

        PERFORM public.fn_validate_reward_template(v_payload);
        v_action := 'publish'::public.reward_template_audit_action;
    ELSIF v_target = 'archived'::public.reward_template_status THEN
        v_action := 'archive'::public.reward_template_audit_action;
    ELSE
        v_action := 'update'::public.reward_template_audit_action;
    END IF;

    UPDATE public.reward_templates
    SET
        status = v_target,
        is_active = (v_target = 'active'::public.reward_template_status),
        updated_at = NOW()
    WHERE id = p_template_id
    RETURNING * INTO v_row;

    PERFORM public._reward_template_write_audit(
        v_row.id,
        v_admin_id,
        v_action,
        public._reward_template_row_to_json(v_row)
    );

    RETURN jsonb_build_object(
        'success', true,
        'template_id', v_row.id,
        'status', v_row.status,
        'row', public._reward_template_row_to_json(v_row)
    );
END;
$$;
