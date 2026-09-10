-- Idempotent repair: staging transactional wipes may delete check_in_program.
-- Re-seed singleton program row + linked completion reward template.

INSERT INTO public.check_in_program (
    id,
    is_active,
    cycle_length_days,
    daily_rewards,
    completion_enabled,
    completion_type,
    completion_reward_value,
    completion_title,
    completion_description,
    completion_valid_duration_days,
    completion_type_locked
)
VALUES (
    'b1000001-0001-4001-8001-000000000001',
    true,
    7,
    '{"1": 10, "2": 15, "3": 20, "4": 25, "5": 30, "6": 40, "7": 100}'::jsonb,
    true,
    'points'::public.reward_type,
    '{"points": 50}'::jsonb,
    '簽滿 7 日加碼',
    '連續簽到週期第 7 日額外積分獎勵',
    NULL,
    false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.reward_templates (
    id,
    title,
    description,
    type,
    reward_value,
    trigger_conditions,
    is_active,
    is_infinite,
    valid_duration_days,
    status,
    distribution_mode,
    restrictions
)
VALUES (
    'b1000001-0001-4001-8001-000000000020',
    '簽滿 7 日加碼',
    '連續簽到週期第 7 日額外積分獎勵',
    'points',
    '{"points": 50}'::jsonb,
    '{"kind": "check_in_program_internal"}'::jsonb,
    true,
    true,
    NULL,
    'active'::public.reward_template_status,
    'auto_grant'::public.reward_distribution_mode,
    '{"order_kinds": ["merchant"], "requires_authentication": "any", "shipping_methods": ["sf"], "min_item_subtotal_hkd": 0}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
