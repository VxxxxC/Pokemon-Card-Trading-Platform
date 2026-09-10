-- Ensure a persisted chat room for profile / DM entry (no offer required).

CREATE OR REPLACE FUNCTION public.rpc_ensure_chat_room(
  p_partner_id UUID,
  p_partner_persona public.seller_persona_type DEFAULT 'member',
  p_viewer_persona public.seller_persona_type DEFAULT 'member'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room_id UUID;
  v_room_row public.chat_rooms%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '請先登入後再開啟對話。';
  END IF;

  IF p_partner_id IS NULL OR p_partner_id = v_user_id THEN
    RAISE EXCEPTION '無法與自己開啟對話。';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_partner_id) THEN
    RAISE EXCEPTION '找不到此用戶。';
  END IF;

  IF public._moderation_has_active_sanction(v_user_id, NULL, 'restrict_chat')
     OR public._moderation_has_active_sanction(v_user_id, 'account', 'suspend')
     OR public._moderation_has_active_sanction(v_user_id, 'account', 'ban') THEN
    RAISE EXCEPTION '帳戶已被限制發送訊息';
  END IF;

  SELECT cr.id
  INTO v_room_id
  FROM public.chat_rooms cr
  WHERE (
    cr.buyer_id = v_user_id
    AND cr.buyer_persona = p_viewer_persona
    AND cr.seller_id = p_partner_id
    AND cr.seller_persona = p_partner_persona
  ) OR (
    cr.buyer_id = p_partner_id
    AND cr.buyer_persona = p_partner_persona
    AND cr.seller_id = v_user_id
    AND cr.seller_persona = p_viewer_persona
  )
  ORDER BY COALESCE(cr.updated_at, cr.created_at) DESC NULLS LAST, cr.id DESC
  LIMIT 1;

  IF v_room_id IS NULL THEN
    INSERT INTO public.chat_rooms (
      buyer_id,
      buyer_persona,
      seller_id,
      seller_persona,
      updated_at
    )
    VALUES (
      v_user_id,
      p_viewer_persona,
      p_partner_id,
      p_partner_persona,
      now()
    )
    ON CONFLICT (buyer_id, buyer_persona, seller_id, seller_persona) DO UPDATE
      SET updated_at = EXCLUDED.updated_at
    RETURNING id INTO v_room_id;
  END IF;

  SELECT * INTO v_room_row FROM public.chat_rooms WHERE id = v_room_id;

  RETURN jsonb_build_object(
    'id', v_room_row.id,
    'buyer_id', v_room_row.buyer_id,
    'buyer_persona', v_room_row.buyer_persona,
    'seller_id', v_room_row.seller_id,
    'seller_persona', v_room_row.seller_persona,
    'created_at', v_room_row.created_at,
    'updated_at', v_room_row.updated_at,
    'unread_count', 0,
    'buyer', public.fn_chat_party_profile_snippet(v_room_row.buyer_id, v_room_row.buyer_persona),
    'seller', public.fn_chat_party_profile_snippet(v_room_row.seller_id, v_room_row.seller_persona)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_ensure_chat_room(UUID, public.seller_persona_type, public.seller_persona_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_ensure_chat_room(UUID, public.seller_persona_type, public.seller_persona_type)
  TO authenticated, service_role;
