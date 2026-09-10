-- P-CHT-01: daily chat unread digest cooldown + cron candidate RPC.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS last_chat_digest_pushed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.profiles.last_chat_digest_pushed_at IS
    'Last time a P-CHT-01 unread chat digest push was sent (max 1 / 24h).';

CREATE OR REPLACE FUNCTION public.rpc_list_chat_unread_digest_candidates(
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    user_id UUID,
    unread_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH room_users AS (
        SELECT cr.id AS room_id, cr.buyer_id AS user_id
        FROM public.chat_rooms cr
        UNION ALL
        SELECT cr.id AS room_id, cr.seller_id AS user_id
        FROM public.chat_rooms cr
    ),
    unread_per_room AS (
        SELECT
            ru.user_id,
            COUNT(*)::INTEGER AS unread_count
        FROM room_users ru
        INNER JOIN public.chat_messages cm ON cm.room_id = ru.room_id
        WHERE cm.sender_id <> ru.user_id
          AND NOT (cm.content LIKE 'SYSTEM\_%' ESCAPE '\')
          AND cm.created_at > COALESCE(
              (
                  SELECT crr.last_read_at
                  FROM public.chat_room_reads crr
                  WHERE crr.user_id = ru.user_id
                    AND crr.room_id = ru.room_id
              ),
              '-infinity'::TIMESTAMPTZ
          )
        GROUP BY ru.user_id, ru.room_id
        HAVING COUNT(*) > 0
    ),
    totals AS (
        SELECT
            upr.user_id,
            SUM(upr.unread_count)::INTEGER AS unread_count
        FROM unread_per_room upr
        GROUP BY upr.user_id
    )
    SELECT
        t.user_id,
        t.unread_count
    FROM totals t
    INNER JOIN public.profiles p ON p.id = t.user_id
    WHERE p.last_chat_digest_pushed_at IS NULL
       OR p.last_chat_digest_pushed_at < (NOW() - INTERVAL '24 hours')
    ORDER BY t.unread_count DESC, t.user_id
    LIMIT GREATEST(LEAST(COALESCE(p_limit, 50), 200), 1);
$$;

REVOKE ALL ON FUNCTION public.rpc_list_chat_unread_digest_candidates(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_list_chat_unread_digest_candidates(INTEGER) TO service_role;
